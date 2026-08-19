-- RLS and trigger behaviour checks for the Lesener schema.
--
-- Self-contained: creates its own users and level-2 content, asserts, then rolls
-- everything back. Safe to run against the live project. Run the whole file as a
-- single statement batch (MCP execute_sql, `supabase db query`, or psql -f) and
-- read the `ok` column -- every row must be true.
--
-- Impersonation works by setting `request.jwt.claims`, which is where auth.uid()
-- reads the subject from, and switching to the `authenticated` role so RLS
-- actually applies (as postgres it would be bypassed).

begin;

-- ---------- fixtures (as postgres) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','a@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{"display_name":"Anna"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','b@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb);

-- give level 2 content so the gate has something to hide
insert into public.posts (level_id, position, slug, title, blurb, topic, body, published_at)
select (select id from public.levels where slug = 'b1-momentum'),
       g, 'l2-test-'||g, 'L2 Test '||g, 'blurb', 'Alltag', 'Testtext', now()
from generate_series(1,3) g;

create temp table results (n serial, name text, expected text, actual text);
grant all on results to authenticated, anon;
grant all on sequence results_n_seq to authenticated, anon;

-- ---------- as user A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into results (name, expected, actual)
  select 'auth.uid resolves', '11111111-1111-1111-1111-111111111111', coalesce((select auth.uid())::text,'NULL');
insert into results (name, expected, actual)
  select 'A: profile auto-created', '1', count(*)::text from public.profiles;
insert into results (name, expected, actual)
  select 'A: display_name from metadata', 'Anna', coalesce(max(display_name),'NULL') from public.profiles;
insert into results (name, expected, actual)
  select 'A: levels visible', '2', count(*)::text from public.levels;
insert into results (name, expected, actual)
  select 'A: dictionary visible', '117', count(*)::text from public.dictionary_entries;
insert into results (name, expected, actual)
  select 'A: posts visible (L1 only)', '10', count(*)::text from public.posts;
insert into results (name, expected, actual)
  select 'A: L2 posts hidden', '0', count(*)::text
  from public.posts p join public.levels l on l.id = p.level_id where l.slug = 'b1-momentum';
insert into results (name, expected, actual)
  select 'A: L2 posts_total via counter', '3', coalesce(max(posts_total)::text,'NULL')
  from public.level_progress where slug = 'b1-momentum';
insert into results (name, expected, actual)
  select 'A: L2 locked before reading', 'false', coalesce(bool_or(is_unlocked)::text,'NULL')
  from public.level_progress where slug = 'b1-momentum';

-- reading_progress is trigger-maintained; a client must not be able to forge it,
-- or the level gate would be one INSERT away from open.
do $$
begin
  insert into public.reading_progress (user_id, post_id)
    values ((select auth.uid()), (select id from public.posts order by position limit 1));
  insert into results (name, expected, actual) values ('A: direct reading_progress write blocked','blocked','NOT BLOCKED');
exception when others then
  insert into results (name, expected, actual) values ('A: direct reading_progress write blocked','blocked','blocked');
end $$;

-- read all ten level-1 posts
insert into public.reading_sessions (user_id, post_id, percent_read, completed, ended_at)
select (select auth.uid()), p.id, 100, true, now() from public.posts p;

insert into results (name, expected, actual)
  select 'A: progress rows after 10 sessions', '10', count(*)::text from public.reading_progress;
insert into results (name, expected, actual)
  select 'A: all 10 marked completed', '10', count(*)::text from public.reading_progress where completed_at is not null;
insert into results (name, expected, actual)
  select 'A: L1 percent_complete', '100', coalesce(max(percent_complete)::text,'NULL')
  from public.level_progress where slug = 'b1-foundation';
insert into results (name, expected, actual)
  select 'A: L2 unlocked after L1 done', 'true', coalesce(bool_or(is_unlocked)::text,'NULL')
  from public.level_progress where slug = 'b1-momentum';
insert into results (name, expected, actual)
  select 'A: L2 posts now visible', '3', count(*)::text
  from public.posts p join public.levels l on l.id = p.level_id where l.slug = 'b1-momentum';

-- re-reading a post at a lower percentage must not erode the roll-up
insert into public.reading_sessions (user_id, post_id, percent_read, completed, ended_at)
  values ((select auth.uid()), (select id from public.posts where slug='beim-arzt'), 50, false, now());

insert into results (name, expected, actual)
  select 'A: session_count increments on re-read', '2', rp.session_count::text
  from public.reading_progress rp join public.posts p on p.id = rp.post_id where p.slug = 'beim-arzt';
insert into results (name, expected, actual)
  select 'A: best_percent_read keeps the max', '100', rp.best_percent_read::text
  from public.reading_progress rp join public.posts p on p.id = rp.post_id where p.slug = 'beim-arzt';
insert into results (name, expected, actual)
  select 'A: completed_at survives re-read', 'set', case when rp.completed_at is null then 'NULL' else 'set' end
  from public.reading_progress rp join public.posts p on p.id = rp.post_id where p.slug = 'beim-arzt';

-- vocabulary
insert into public.saved_words (user_id, post_id, term, surface_form, post_label, translation)
  values ((select auth.uid()), (select id from public.posts where slug='der-alltag-in-berlin'),
          'herausforderung', 'Herausforderung', 'Post 1: Der Alltag in Berlin', 'challenge');
insert into results (name, expected, actual)
  select 'A: saved word visible to owner', '1', count(*)::text from public.saved_words;

-- The bank renders surface_form, not term: the reader met a capitalised noun and
-- must get it back capitalised.
insert into results (name, expected, actual)
  select 'A: surface_form round-trips', 'Herausforderung', coalesce(max(surface_form),'NULL')
  from public.saved_words where term = 'herausforderung';
insert into results (name, expected, actual)
  select 'A: post_label round-trips', 'Post 1: Der Alltag in Berlin', coalesce(max(post_label),'NULL')
  from public.saved_words where term = 'herausforderung';

-- surface_form must lower() to term, or the bank could show one word while the
-- dictionary and the uniqueness constraint key on another.
do $$
begin
  insert into public.saved_words (user_id, term, surface_form, post_label)
    values ((select auth.uid()), 'haus', 'Baum', 'Post 1: x');
  insert into results (name, expected, actual) values ('A: surface_form/term mismatch rejected','rejected','NOT REJECTED');
exception when others then
  insert into results (name, expected, actual) values ('A: surface_form/term mismatch rejected','rejected','rejected');
end $$;

do $$
begin
  insert into public.saved_words (user_id, term, surface_form, post_label, translation)
    values ((select auth.uid()), 'herausforderung', 'Herausforderung', 'Post 1: x', 'challenge again');
  insert into results (name, expected, actual) values ('A: duplicate term rejected','rejected','NOT REJECTED');
exception when others then
  insert into results (name, expected, actual) values ('A: duplicate term rejected','rejected','rejected');
end $$;

-- terms are normalised surface forms; a mixed-case row would never match a lookup
do $$
begin
  insert into public.saved_words (user_id, term, surface_form, post_label, translation)
    values ((select auth.uid()), 'GROSS', 'GROSS', 'Post 1: x', 'big');
  insert into results (name, expected, actual) values ('A: uppercase term rejected','rejected','NOT REJECTED');
exception when others then
  insert into results (name, expected, actual) values ('A: uppercase term rejected','rejected','rejected');
end $$;

-- ---------- as user B ----------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into results (name, expected, actual)
  select 'B: sees none of A saved words', '0', count(*)::text from public.saved_words;
insert into results (name, expected, actual)
  select 'B: sees no progress rows', '0', count(*)::text from public.reading_progress;
insert into results (name, expected, actual)
  select 'B: sees only own profile', '1', count(*)::text from public.profiles;
insert into results (name, expected, actual)
  select 'B: L2 still locked (A unlocking is not shared)', '0', count(*)::text
  from public.posts p join public.levels l on l.id = p.level_id where l.slug = 'b1-momentum';

do $$
begin
  insert into public.saved_words (user_id, term, surface_form, post_label, translation)
    values ('11111111-1111-1111-1111-111111111111', 'geduld', 'Geduld', 'Post 2: x', 'patience');
  insert into results (name, expected, actual) values ('B: cannot write a row owned by A','blocked','NOT BLOCKED');
exception when others then
  insert into results (name, expected, actual) values ('B: cannot write a row owned by A','blocked','blocked');
end $$;

-- the WITH CHECK half of the update policy: owning a row must not let you
-- hand it to somebody else
insert into public.saved_words (user_id, term, surface_form, post_label, translation)
  values ((select auth.uid()), 'geduld', 'Geduld', 'Post 2: x', 'patience');
do $$
begin
  update public.saved_words set user_id = '11111111-1111-1111-1111-111111111111' where term = 'geduld';
  insert into results (name, expected, actual) values ('B: cannot reassign own row to A','blocked','NOT BLOCKED');
exception when others then
  insert into results (name, expected, actual) values ('B: cannot reassign own row to A','blocked','blocked');
end $$;

-- Deleting is the only destructive grant a reader holds, and the policy is a
-- USING clause: somebody else's row is filtered out, not rejected. So a delete
-- that touches nothing still succeeds, and the client cannot tell the two apart
-- without counting what came back.
do $$
declare v_deleted int;
begin
  with d as (
    delete from public.saved_words
     where user_id = '11111111-1111-1111-1111-111111111111'
     returning 1
  ) select count(*) into v_deleted from d;
  insert into results (name, expected, actual)
    values ('B: deleting A rows removes nothing', '0', v_deleted::text);
  insert into results (name, expected, actual)
    values ('B: that delete raised no error', 'no error', 'no error');
exception when others then
  insert into results (name, expected, actual)
    values ('B: that delete raised no error', 'no error', 'RAISED ' || sqlstate);
end $$;


do $$
declare v_deleted int;
begin
  with d as (
    delete from public.saved_words where term = 'geduld' returning 1
  ) select count(*) into v_deleted from d;
  insert into results (name, expected, actual)
    values ('B: deleting own row removes it', '1', v_deleted::text);
end $$;

-- ---------- as anon ----------
-- reset first: once you are `authenticated` you no longer hold the membership
-- needed to SET ROLE to anon.
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  insert into results (name, expected, actual)
    select 'anon: posts unreachable', 'no access', count(*)::text from public.posts;
exception when others then
  insert into results (name, expected, actual) values ('anon: posts unreachable','no access','no access');
end $$;

do $$
begin
  insert into results (name, expected, actual)
    select 'anon: dictionary unreachable', 'no access', count(*)::text from public.dictionary_entries;
exception when others then
  insert into results (name, expected, actual) values ('anon: dictionary unreachable','no access','no access');
end $$;

do $$
begin
  insert into results (name, expected, actual)
    select 'anon: level gate function unreachable', 'no access',
           coalesce(private.has_level_access((select 1))::text,'NULL');
exception when others then
  insert into results (name, expected, actual) values ('anon: level gate function unreachable','no access','no access');
end $$;

reset role;

-- Checked as postgres, deliberately. The same count run as user B is vacuously
-- zero -- RLS hides A's rows from B whether or not B's delete removed them --
-- so asserting it there would prove nothing and pass forever.
insert into results (name, expected, actual)
  select 'A saved word survived B''s delete (as postgres)', '1', count(*)::text
  from public.saved_words where user_id = '11111111-1111-1111-1111-111111111111';

select n, name, expected, actual, (expected = actual) as ok from results order by n;
rollback;
