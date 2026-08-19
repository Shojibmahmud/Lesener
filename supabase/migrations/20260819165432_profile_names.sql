-- Give the reader a real name.
--
-- profiles has carried display_name since the schema was created, and
-- handle_new_user has been reading it out of sign-up metadata for just as long.
-- Neither has ever held anything: the client calls signUp with no options, so
-- raw_user_meta_data is {} for every account the app has made. This adds the
-- two columns the dashboard actually wants, teaches the trigger to read them,
-- and gives the accounts that predate all of it something to be called.

-- Columns --------------------------------------------------------------------

-- Nullable on purpose, and it must stay that way. A not-null column here would
-- make the trigger below raise on any sign-up that carried no metadata — and a
-- trigger that raises on an auth.users insert does not produce a bad profile,
-- it fails account creation outright. These columns describe a reader; they
-- must never be able to stop one existing.
alter table public.profiles
  add column first_name text,
  add column last_name  text,
  -- char_length, not octet_length. Lesener's readers write Bengali, where a
  -- 25-character name is already over 60 bytes in UTF-8. Counting bytes would
  -- refuse real names in one script while waving through a 60-character name in
  -- another, which is the opposite of a fair rule. A check passes on null, which
  -- is what makes both of these safe to add to rows that have no names yet.
  add constraint profiles_first_name_clean
    check (first_name = btrim(first_name)
           and first_name <> ''
           and char_length(first_name) <= 60),
  add constraint profiles_last_name_clean
    check (last_name = btrim(last_name)
           and last_name <> ''
           and char_length(last_name) <= 60);

-- Trigger --------------------------------------------------------------------

-- Replaced in place; on_auth_user_created keeps pointing at it. display_name
-- stays in the insert untouched, so supabase/tests/rls_checks.sql goes on
-- proving the metadata path it has always proved.
--
-- btrim and left() here are deliberate, and they are why the check constraints
-- above are not the whole story. The constraints police the update path, where
-- the client owns the statement and can tell the reader it was refused. This
-- trigger has no such luxury: raising here destroys the account rather than the
-- value, so it cleans its input instead of judging it. left() counts characters,
-- matching char_length rather than fighting it.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(left(btrim(new.raw_user_meta_data ->> 'first_name'), 60), ''),
    nullif(left(btrim(new.raw_user_meta_data ->> 'last_name'), 60), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Re-issued rather than assumed. create or replace preserves an ACL, but the
-- reason this revoke exists — a security definer function in a reachable schema
-- is callable as /rest/v1/rpc/<name> — belongs in the file that last touched it.
revoke all on function private.handle_new_user() from public, anon, authenticated;

-- Backfill -------------------------------------------------------------------

-- The accounts that existed before any of the above. There is no surname in an
-- email address, so last_name is left null rather than invented; that is a
-- normal state everywhere it is read, not an incomplete one.
--
-- The first_name is null guard makes this idempotent and means a re-run can
-- never overwrite a name a reader has since typed. The btrim guard keeps the
-- statement from violating the constraint added above.
update public.profiles p
   set first_name = initcap(split_part(u.email, '@', 1))
  from auth.users u
 where u.id = p.id
   and p.first_name is null
   and btrim(split_part(u.email, '@', 1)) <> '';
