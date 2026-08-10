-- Lesener per-user schema: profiles, reading sessions, rolled-up progress and
-- the vocabulary bank.
--
-- Everything here cascades from auth.users, so deleting the auth user (the
-- "Delete forever" button in DeleteModal.jsx) purges the whole footprint.

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- null means "follow the device"; App.jsx currently keeps this in localStorage.
  theme        text check (theme in ('light', 'dark')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reading sessions -----------------------------------------------------------
-- One row per pass through a post. This is what Reader.jsx's "This session"
-- sidebar and FinishModal's "New words this session" are counting; today that
-- list only exists in React state and dies on refresh.

create table public.reading_sessions (
  id           bigint generated always as identity primary key,
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  post_id      bigint not null references public.posts (id)    on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  percent_read smallint not null default 0 check (percent_read between 0 and 100),
  completed    boolean  not null default false,
  check (ended_at is null or ended_at >= started_at)
);

create index reading_sessions_user_started_idx
  on public.reading_sessions (user_id, started_at desc);
create index reading_sessions_post_id_idx
  on public.reading_sessions (post_id);

-- At most one session open per post, so two tabs can't double-count a read.
create unique index reading_sessions_one_open_idx
  on public.reading_sessions (user_id, post_id)
  where ended_at is null;

-- Reading progress -----------------------------------------------------------
-- Roll-up of the sessions above, one row per (user, post). Maintained solely by
-- the trigger; users get SELECT and nothing else, because this table is what
-- the level gate reads.

create table public.reading_progress (
  user_id           uuid   not null references public.profiles (id) on delete cascade,
  post_id           bigint not null references public.posts (id)    on delete cascade,
  session_count     int      not null default 0,
  best_percent_read smallint not null default 0 check (best_percent_read between 0 and 100),
  completed_at      timestamptz,
  first_read_at     timestamptz not null default now(),
  last_read_at      timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- The composite PK already covers user_id lookups; these two cover the FK
-- cascade and the level-unlock predicate respectively.
create index reading_progress_post_id_idx on public.reading_progress (post_id);
create index reading_progress_completed_idx
  on public.reading_progress (user_id)
  where completed_at is not null;

create or replace function private.sync_reading_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_session int := case when tg_op = 'INSERT' then 1 else 0 end;
begin
  insert into public.reading_progress as rp (
    user_id, post_id, session_count, best_percent_read,
    completed_at, first_read_at, last_read_at
  )
  values (
    new.user_id,
    new.post_id,
    v_new_session,
    new.percent_read,
    case when new.completed then coalesce(new.ended_at, now()) end,
    new.started_at,
    now()
  )
  on conflict (user_id, post_id) do update set
    session_count     = rp.session_count + v_new_session,
    best_percent_read = greatest(rp.best_percent_read, excluded.best_percent_read),
    -- First completion wins; re-reading never moves the date.
    completed_at      = coalesce(rp.completed_at, excluded.completed_at),
    first_read_at     = least(rp.first_read_at, excluded.first_read_at),
    last_read_at      = now();

  return null;
end;
$$;

create trigger reading_sessions_sync_progress
  after insert or update on public.reading_sessions
  for each row execute function private.sync_reading_progress();

-- Vocabulary bank ------------------------------------------------------------
-- Uniqueness is per user and global, not per post: Reader.jsx builds its
-- `savedSet` across every post and refuses to re-save a word already banked, so
-- a term can only ever be kept once. `post_id` records where it was first met,
-- which is what VocabBank.jsx groups by.
--
-- `translation` is nullable because Reader.jsx falls back to an em dash when the
-- dictionary has no entry, and the word stays savable.

create table public.saved_words (
  id                  bigint generated always as identity primary key,
  user_id             uuid   not null references public.profiles (id) on delete cascade,
  post_id             bigint references public.posts (id)              on delete set null,
  session_id          bigint references public.reading_sessions (id)   on delete set null,
  dictionary_entry_id bigint references public.dictionary_entries (id) on delete set null,
  term                text not null check (term = lower(term)),
  translation         text,
  created_at          timestamptz not null default now(),
  unique (user_id, term)
);

create index saved_words_user_created_idx on public.saved_words (user_id, created_at desc);
create index saved_words_post_id_idx      on public.saved_words (post_id);
create index saved_words_session_id_idx   on public.saved_words (session_id);
create index saved_words_entry_id_idx     on public.saved_words (dictionary_entry_id);

alter table public.profiles         enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.reading_progress enable row level security;
alter table public.saved_words      enable row level security;
