-- One row per level for the calling user: the figures behind Dashboard.jsx's
-- "Level 1: B1 Foundation — 7 of 10 posts completed", the 70% ring, and the
-- "🔒 Level 2 unlocks when all 10 posts are read — 3 to go" line.
--
-- security_invoker is mandatory. Views run as their owner by default, which
-- would hand every caller every user's progress.

create view public.level_progress
with (security_invoker = on) as
select
  l.id       as level_id,
  l.slug,
  l.name,
  l.cefr,
  l.position,
  -- Read from the denormalised counter rather than counting posts, so a locked
  -- level can still report "0 of 10" without exposing its post rows.
  l.post_count as posts_total,
  coalesce(c.completed_count, 0)::int as posts_completed,
  case
    when l.post_count = 0 then 0
    else round(coalesce(c.completed_count, 0)::numeric * 100 / l.post_count)::int
  end as percent_complete,
  (l.post_count > 0 and coalesce(c.completed_count, 0) >= l.post_count) as is_complete,
  private.has_level_access(l.id) as is_unlocked
from public.levels l
left join lateral (
  select count(*) as completed_count
    from public.reading_progress rp
    join public.posts p on p.id = rp.post_id
   where p.level_id = l.id
     and rp.user_id = (select auth.uid())
     and rp.completed_at is not null
) c on true;

revoke all on public.level_progress from anon;
grant select on public.level_progress to authenticated;
