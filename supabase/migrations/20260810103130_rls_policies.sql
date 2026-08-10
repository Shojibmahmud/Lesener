-- Row level security for every table in public.
--
-- Policies always name the role with `to authenticated` rather than testing
-- auth.role(), which is deprecated and passes for anonymous sign-ins. Every
-- auth.uid() call is wrapped in a scalar subquery so it is evaluated once per
-- statement instead of once per row.

-- Table privileges -----------------------------------------------------------
-- anon gets nothing: there is no signed-out surface in the app (the landing
-- page preview in Landing.jsx is hardcoded markup, not a query).

revoke all on
  public.levels,
  public.posts,
  public.dictionary_entries,
  public.profiles,
  public.reading_sessions,
  public.reading_progress,
  public.saved_words
from anon;

grant select on public.levels             to authenticated;
grant select on public.posts              to authenticated;
grant select on public.dictionary_entries to authenticated;

grant select, insert, update         on public.profiles         to authenticated;
grant select, insert, update         on public.reading_sessions to authenticated;
grant select                         on public.reading_progress to authenticated;
grant select, insert, update, delete on public.saved_words      to authenticated;

-- Identity columns own their sequences, so no sequence grants are required.

-- The level gate -------------------------------------------------------------
-- security definer so it can read reading_progress past that table's own RLS.
-- It is safe because it lives in `private` (not exposed to PostgREST, so it
-- cannot be called as an RPC), and it derives the user from auth.uid() inside
-- the body rather than trusting an argument.

create or replace function private.has_level_access(p_level_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_position int;
begin
  if v_uid is null then
    return false;
  end if;

  select l.position into v_position
    from public.levels l
   where l.id = p_level_id;

  if v_position is null then
    return false;
  end if;

  if v_position <= 1 then
    return true;
  end if;

  -- Unlocked once every published post in the preceding level is completed.
  -- A preceding level with no published posts does not trap the user: the
  -- NOT EXISTS is vacuously true and the next level opens.
  return not exists (
    select 1
      from public.posts p
      join public.levels l on l.id = p.level_id
     where l.position = v_position - 1
       and p.published_at is not null
       and not exists (
         select 1
           from public.reading_progress rp
          where rp.post_id = p.id
            and rp.user_id = v_uid
            and rp.completed_at is not null
       )
  );
end;
$$;

-- RLS policy expressions are evaluated as the querying role, so authenticated
-- needs EXECUTE for the posts policy to work at all. Everyone else is cut off.
revoke all on function private.has_level_access(bigint) from public, anon;
grant execute on function private.has_level_access(bigint) to authenticated;

-- Content policies -----------------------------------------------------------
-- Level rows are readable in full: the dashboard has to name the level it is
-- working towards ("to Level 2") even while that level's posts are locked.

create policy levels_select_all on public.levels
  for select to authenticated
  using (true);

create policy dictionary_entries_select_all on public.dictionary_entries
  for select to authenticated
  using (true);

create policy posts_select_unlocked on public.posts
  for select to authenticated
  using (
    published_at is not null
    and private.has_level_access(level_id)
  );

-- Profile policies -----------------------------------------------------------
-- No delete policy: account removal goes through the auth admin API, which
-- cascades from auth.users through every table below.

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Reading policies -----------------------------------------------------------
-- Sessions are insert/update only. Deleting one would leave the reading_progress
-- roll-up overstated, since the sync trigger has nothing to recompute from.

create policy reading_sessions_select_own on public.reading_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy reading_sessions_insert_own on public.reading_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy reading_sessions_update_own on public.reading_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Read-only by design: this table feeds the level gate, so it is written only
-- by private.sync_reading_progress().
create policy reading_progress_select_own on public.reading_progress
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Vocabulary policies --------------------------------------------------------
-- Every update policy carries both USING and WITH CHECK; without WITH CHECK a
-- client could reassign a row's user_id to somebody else.

create policy saved_words_select_own on public.saved_words
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy saved_words_insert_own on public.saved_words
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy saved_words_update_own on public.saved_words
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy saved_words_delete_own on public.saved_words
  for delete to authenticated
  using ((select auth.uid()) = user_id);
