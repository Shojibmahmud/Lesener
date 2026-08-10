-- Lesener content schema: levels, posts, dictionary entries.
--
-- These three tables are the shared library. No user owns a row here; they are
-- written by service_role only (content tooling / seeds) and read through RLS
-- policies added in a later migration.

create extension if not exists moddatetime with schema extensions;

-- Levels ---------------------------------------------------------------------
-- A level is a group of posts that unlocks the next one when fully read.
-- Dashboard.jsx renders "B1 · Level 1" and "Level 2 unlocks when all 10 posts
-- are read" from these columns.

create table public.levels (
  id         bigint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  cefr       text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  position   int  not null unique,
  -- Denormalised on purpose: lets a client show "0 of 10" for a level whose
  -- post rows it is not yet allowed to read. Maintained by a trigger below.
  post_count int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function extensions.moddatetime(updated_at);

-- Posts ----------------------------------------------------------------------
-- `position` is the `n` in src/data.js; `body` holds the prose with paragraphs
-- separated by a blank line, which Reader.jsx splits on '\n\n'.

create table public.posts (
  id           bigint generated always as identity primary key,
  level_id     bigint not null references public.levels (id) on delete restrict,
  position     int    not null,
  slug         text   not null unique,
  title        text   not null,
  blurb        text   not null,
  topic        text,
  body         text   not null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (level_id, position)
);

create index posts_level_id_idx on public.posts (level_id);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function extensions.moddatetime(updated_at);

-- Dictionary -----------------------------------------------------------------
-- `term` is a normalised *surface form*, not a lemma: it has to match what the
-- client computes as clean(raw).toLowerCase() (src/utils.js, Reader.jsx). The
-- check constraint stops mixed-case rows that would silently never match.

create table public.dictionary_entries (
  id             bigint generated always as identity primary key,
  term           text not null unique check (term = lower(term)),
  translation    text not null,
  part_of_speech text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger dictionary_entries_set_updated_at
  before update on public.dictionary_entries
  for each row execute function extensions.moddatetime(updated_at);

-- Keep levels.post_count honest ------------------------------------------------

create schema if not exists private;

create or replace function private.sync_level_post_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.levels l
       set post_count = (select count(*) from public.posts p where p.level_id = l.id)
     where l.id = new.level_id;
  end if;

  -- On UPDATE the post may have moved between levels, so refresh the old one too.
  if tg_op in ('UPDATE', 'DELETE') then
    update public.levels l
       set post_count = (select count(*) from public.posts p where p.level_id = l.id)
     where l.id = old.level_id;
  end if;

  return null;
end;
$$;

create trigger posts_sync_level_post_count
  after insert or update of level_id or delete on public.posts
  for each row execute function private.sync_level_post_count();

-- RLS is enabled here so no window exists where these tables are reachable
-- without policies; the policies themselves land in the rls migration.
alter table public.levels             enable row level security;
alter table public.posts              enable row level security;
alter table public.dictionary_entries enable row level security;
