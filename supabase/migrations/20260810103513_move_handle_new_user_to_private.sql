-- Move the auth.users trigger function out of the exposed schema.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so a SECURITY
-- DEFINER function sitting in `public` is reachable as /rest/v1/rpc/<name> by
-- anon and authenticated alike. Supabase's security linter flags exactly this
-- (lints 0028 / 0029). Calling a trigger function directly would error out, but
-- the exposure is needless: `private` is not in the API's exposed schemas, which
-- is where the other two trigger functions already live.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function private.handle_new_user()
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

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
