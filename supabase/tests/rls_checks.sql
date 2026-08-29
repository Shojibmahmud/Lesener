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
-- A carries a full set of names; B carries none, and is the only proof that a
-- metadata-less sign-up still produces a profile rather than failing. C and D
-- exist for the trigger's cleaning behaviour: C's name is padded and its
-- surname empty, D's name is 80 characters. Neither may cost its owner an
-- account -- see the block below the grants.
--
-- E exists to be deleted. Nothing else reads it, and no assertion about anybody
-- else depends on it, so the delete at the end of this file cannot disturb the
-- rest of the run. It is given a row in every per-user table because the whole
-- question is whether removing one auth user removes all four.
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','a@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb,
   '{"display_name":"Anna","first_name":"Anna","last_name":"Schneider"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','b@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','c@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{"first_name":"  Shojib  ","last_name":""}'::jsonb),
  ('00000000-0000-0000-0000-000000000000','44444444-4444-4444-4444-444444444444',
   'authenticated','authenticated','d@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb, jsonb_build_object('first_name', repeat('a', 80))),
  ('00000000-0000-0000-0000-000000000000','55555555-5555-5555-5555-555555555555',
   'authenticated','authenticated','e@lesener.test','x', now(), now(), now(),
   '{"provider":"email"}'::jsonb,
   '{"first_name":"Erika","last_name":"Falk"}'::jsonb);

-- Give level 2 content so the gate has something to hide.
--
-- Positions 9001+, not 1-3. posts has `unique (level_id, position)`, so the
-- moment a level is really seeded these rows collide with it and the whole
-- batch aborts on a constraint violation -- a failure that says nothing about
-- RLS. A position no authored level will ever reach keeps this test independent
-- of how much content exists. Every assertion below counts only these rows, by
-- slug, for the same reason.
insert into public.posts (level_id, position, slug, title, blurb, topic, body, published_at)
select (select id from public.levels where slug = 'b1-momentum'),
       9000 + g, 'l2-test-'||g, 'L2 Test '||g, 'blurb', 'Alltag', 'Testtext', now()
from generate_series(1,3) g;

create temp table results (n serial, name text, expected text, actual text);
grant all on results to authenticated, anon;
grant all on sequence results_n_seq to authenticated, anon;

-- ---------- E's footprint, for the cascade check (as postgres) ----------
-- Only two rows are written. E's profile comes from the sign-up trigger and E's
-- reading_progress row from reading_sessions_sync_progress, and both are left to
-- arrive on their own: a fixture that inserted them by hand would be building a
-- footprint the app could never produce.
insert into public.reading_sessions (user_id, post_id, percent_read, completed, ended_at)
select '55555555-5555-5555-5555-555555555555',
       (select id from public.posts order by id limit 1), 100, true, now();

insert into public.saved_words (user_id, post_id, post_label, term, surface_form, translation)
select '55555555-5555-5555-5555-555555555555',
       (select id from public.posts order by id limit 1),
       'Post 1: fixture', 'wohnung', 'Wohnung', 'flat';

-- A positive control, and it earns its place for the same reason the rename
-- control below does: without it, the four zeroes at the end of this file would
-- pass just as happily against rows that were never created.
insert into results (name, expected, actual)
  select 'E: profile before delete', '1', count(*)::text
  from public.profiles where id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: session before delete', '1', count(*)::text
  from public.reading_sessions where user_id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: progress before delete', '1', count(*)::text
  from public.reading_progress where user_id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: saved word before delete', '1', count(*)::text
  from public.saved_words where user_id = '55555555-5555-5555-5555-555555555555';

-- ---------- the sign-up trigger (as postgres) ----------
-- Read as postgres deliberately: these are four different people's profiles and
-- no single reader could see them all.
--
-- The trigger cleans its input rather than judging it. Raising inside it would
-- abort the auth.users insert and therefore the whole account, so a padded or
-- over-long name has to be absorbed. The check constraints police the update
-- path instead, where a client owns the statement and can say it was refused.
-- Nothing in the JS suite can reach any of this.
insert into results (name, expected, actual)
  select 'C: padded first_name trimmed by trigger', 'Shojib', coalesce(first_name,'NULL')
  from public.profiles where id = '33333333-3333-3333-3333-333333333333';
insert into results (name, expected, actual)
  select 'C: empty last_name stored as null', 'NULL', coalesce(last_name,'NULL')
  from public.profiles where id = '33333333-3333-3333-3333-333333333333';
insert into results (name, expected, actual)
  select 'D: account created despite an 80-char name', '1', count(*)::text
  from public.profiles where id = '44444444-4444-4444-4444-444444444444';
insert into results (name, expected, actual)
  select 'D: over-long first_name truncated to 60', '60', coalesce(char_length(first_name)::text,'NULL')
  from public.profiles where id = '44444444-4444-4444-4444-444444444444';
insert into results (name, expected, actual)
  select 'B: metadata-less sign-up still makes a profile', '1', count(*)::text
  from public.profiles where id = '22222222-2222-2222-2222-222222222222';
insert into results (name, expected, actual)
  select 'B: metadata-less profile has no names', 'NULL/NULL',
         coalesce(first_name,'NULL')||'/'||coalesce(last_name,'NULL')
  from public.profiles where id = '22222222-2222-2222-2222-222222222222';

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
  select 'A: first_name from metadata', 'Anna', coalesce(max(first_name),'NULL') from public.profiles;
insert into results (name, expected, actual)
  select 'A: last_name from metadata', 'Schneider', coalesce(max(last_name),'NULL') from public.profiles;

-- A positive control, and it earns its place: without it, "B cannot rename A"
-- at the end would pass just as happily if the update policy let nobody rename
-- anybody. Renamed back afterwards so the later assertion still expects 'Anna'.
update public.profiles set first_name = 'Annalena' where id = (select auth.uid());
insert into results (name, expected, actual)
  select 'A: can rename self', 'Annalena', coalesce(max(first_name),'NULL') from public.profiles;
update public.profiles set first_name = 'Anna' where id = (select auth.uid());

do $$
begin
  update public.profiles set first_name = ' Anna ' where id = (select auth.uid());
  insert into results (name, expected, actual)
    values ('A: padded rename refused', '23514', 'accepted');
exception when check_violation then
  insert into results (name, expected, actual)
    values ('A: padded rename refused', '23514', sqlstate);
end $$;

do $$
begin
  update public.profiles set first_name = repeat('a', 61) where id = (select auth.uid());
  insert into results (name, expected, actual)
    values ('A: over-long rename refused', '23514', 'accepted');
exception when check_violation then
  insert into results (name, expected, actual)
    values ('A: over-long rename refused', '23514', sqlstate);
end $$;

-- 60 characters, 180 bytes. This is the whole reason the constraint counts
-- characters rather than bytes: a byte cap would refuse a Bengali name at a
-- third of the length it allows a Latin one.
do $$
begin
  update public.profiles set first_name = repeat('অ', 60) where id = (select auth.uid());
  insert into results (name, expected, actual)
    values ('A: 60-char Bengali name accepted', 'accepted', 'accepted');
exception when check_violation then
  insert into results (name, expected, actual)
    values ('A: 60-char Bengali name accepted', 'accepted', sqlstate);
end $$;
update public.profiles set first_name = 'Anna' where id = (select auth.uid());

-- ---------- theme (as user A) ----------
-- theme has carried its check constraint since init_user_schema.sql:13 and
-- nothing has ever written it: every profiles row in the live project reads
-- null. These are the first proof that anything can write it, that the
-- constraint refuses everything else, and -- with B's attempt further down --
-- that one reader cannot set another's.
--
-- The starting-null assertion is a positive control and earns its place the
-- same way the rename control above does: without it, "can set own theme" would
-- pass just as happily against a column that already read 'dark'.
insert into results (name, expected, actual)
  select 'A: theme starts null', 'NULL', coalesce(theme,'NULL')
  from public.profiles where id = (select auth.uid());

update public.profiles set theme = 'dark' where id = (select auth.uid());
insert into results (name, expected, actual)
  select 'A: can set own theme', 'dark', coalesce(theme,'NULL')
  from public.profiles where id = (select auth.uid());

-- The client sends no validation of its own, deliberately: this constraint is
-- what refuses a bad value, exactly as the schema refuses a padded name above.
-- If either of these two rows ever reads 'accepted', profile.js needs a guard.
do $$
begin
  update public.profiles set theme = 'system' where id = (select auth.uid());
  insert into results (name, expected, actual)
    values ('A: unknown theme refused', '23514', 'accepted');
exception when check_violation then
  insert into results (name, expected, actual)
    values ('A: unknown theme refused', '23514', sqlstate);
end $$;

-- Case matters, and a capitalisation bug in the client is far likelier than an
-- invented third state.
do $$
begin
  update public.profiles set theme = 'Dark' where id = (select auth.uid());
  insert into results (name, expected, actual)
    values ('A: theme is case-sensitive', '23514', 'accepted');
exception when check_violation then
  insert into results (name, expected, actual)
    values ('A: theme is case-sensitive', '23514', sqlstate);
end $$;

-- Restored, so B's attempt further down is measured against null rather than
-- against a value this block happened to leave behind.
update public.profiles set theme = null where id = (select auth.uid());
insert into results (name, expected, actual)
  select 'A: theme restored to null', 'NULL', coalesce(theme,'NULL')
  from public.profiles where id = (select auth.uid());

-- A floor, not a census, for the same reason the dictionary check below is a
-- shape: levels are added as their content is written, and this check exists to
-- prove `authenticated` can read the table at all.
insert into results (name, expected, actual)
  select 'A: levels visible', 'at least 2',
         case when count(*) >= 2 then 'at least 2' else count(*)::text end
  from public.levels;
-- A shape, not a census. This check exists to prove `authenticated` can read
-- the dictionary at all; the row count is a property of whatever content has
-- been seeded and changes every time a level is written, which would fail this
-- check for a reason that has nothing to do with RLS.
insert into results (name, expected, actual)
  select 'A: dictionary visible', 'reachable',
         case when count(*) > 0 then 'reachable' else 'empty' end
  from public.dictionary_entries;
insert into results (name, expected, actual)
  select 'A: posts visible (L1 only)', '10', count(*)::text from public.posts;
insert into results (name, expected, actual)
  select 'A: L2 posts hidden', '0', count(*)::text
  from public.posts p join public.levels l on l.id = p.level_id
  where l.slug = 'b1-momentum' and p.slug like 'l2-test-%';
-- levels.post_count counts every post in the level, this test's three included,
-- so the figure moves with whatever content has been seeded. What matters here
-- is that a locked level still reports a count at all -- that is what lets the
-- client tell "withheld" from "empty" (src/lib/levels.js).
insert into results (name, expected, actual)
  select 'A: L2 posts_total counted despite lock', 'at least 3',
         case when coalesce(max(posts_total), 0) >= 3 then 'at least 3'
              else coalesce(max(posts_total)::text, 'NULL') end
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
  from public.posts p join public.levels l on l.id = p.level_id
  where l.slug = 'b1-momentum' and p.slug like 'l2-test-%';

-- re-reading a post at a lower percentage must not erode the roll-up.
--
-- Identified by position, not slug. Slugs belong to whatever content happens to
-- be seeded and change whenever a post is retitled; position is the level's own
-- structure. Keying on a slug here once broke this whole batch, because a
-- missing one makes the subselect null and reading_sessions.post_id is not null.
insert into public.reading_sessions (user_id, post_id, percent_read, completed, ended_at)
  values ((select auth.uid()),
          (select p.id from public.posts p join public.levels l on l.id = p.level_id
            where l.slug = 'b1-foundation' and p.position = 3), 50, false, now());

insert into results (name, expected, actual)
  select 'A: session_count increments on re-read', '2', rp.session_count::text
  from public.reading_progress rp
       join public.posts p on p.id = rp.post_id
       join public.levels l on l.id = p.level_id
 where l.slug = 'b1-foundation' and p.position = 3;
insert into results (name, expected, actual)
  select 'A: best_percent_read keeps the max', '100', rp.best_percent_read::text
  from public.reading_progress rp
       join public.posts p on p.id = rp.post_id
       join public.levels l on l.id = p.level_id
 where l.slug = 'b1-foundation' and p.position = 3;
insert into results (name, expected, actual)
  select 'A: completed_at survives re-read', 'set', case when rp.completed_at is null then 'NULL' else 'set' end
  from public.reading_progress rp
       join public.posts p on p.id = rp.post_id
       join public.levels l on l.id = p.level_id
 where l.slug = 'b1-foundation' and p.position = 3;

-- vocabulary
insert into public.saved_words (user_id, post_id, term, surface_form, post_label, translation)
  values ((select auth.uid()),
          (select p.id from public.posts p join public.levels l on l.id = p.level_id
            where l.slug = 'b1-foundation' and p.position = 1),
          'herausforderung', 'Herausforderung', 'Post 1: fixture', 'challenge');
insert into results (name, expected, actual)
  select 'A: saved word visible to owner', '1', count(*)::text from public.saved_words;

-- The bank renders surface_form, not term: the reader met a capitalised noun and
-- must get it back capitalised.
insert into results (name, expected, actual)
  select 'A: surface_form round-trips', 'Herausforderung', coalesce(max(surface_form),'NULL')
  from public.saved_words where term = 'herausforderung';
insert into results (name, expected, actual)
  select 'A: post_label round-trips', 'Post 1: fixture', coalesce(max(post_label),'NULL')
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

-- profiles_update_own is a USING clause, so A's row is filtered out rather than
-- rejected: this succeeds having changed nothing. Whether it really changed
-- nothing is asserted as postgres at the end -- from here the check would be
-- vacuous, because RLS hides A's row from B either way.
do $$
declare affected int;
begin
  update public.profiles set theme = 'dark'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics affected = row_count;
  insert into results (name, expected, actual)
    values ('B: theme write on A changes no rows, raises nothing', '0', affected::text);
exception when others then
  insert into results (name, expected, actual)
    values ('B: theme write on A changes no rows, raises nothing', '0', 'raised ' || sqlstate);
end $$;

do $$
declare affected int;
begin
  update public.profiles set first_name = 'Stolen'
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics affected = row_count;
  insert into results (name, expected, actual)
    values ('B: rename of A changes no rows, raises nothing', '0', affected::text);
exception when others then
  insert into results (name, expected, actual)
    values ('B: rename of A changes no rows, raises nothing', '0', 'error '||sqlstate);
end $$;
insert into results (name, expected, actual)
  select 'B: L2 still locked (A unlocking is not shared)', '0', count(*)::text
  from public.posts p join public.levels l on l.id = p.level_id
  where l.slug = 'b1-momentum' and p.slug like 'l2-test-%';

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
insert into results (name, expected, actual)
  select 'A''s name survived B''s rename (as postgres)', 'Anna', coalesce(first_name,'NULL')
  from public.profiles where id = '11111111-1111-1111-1111-111111111111';
insert into results (name, expected, actual)
  select 'A''s theme survived B''s write (as postgres)', 'NULL', coalesce(theme,'NULL')
  from public.profiles where id = '11111111-1111-1111-1111-111111111111';

-- ---------- the cascade (as postgres) ----------
-- One statement. Nothing below auth.users is deleted by hand, because a check
-- that removed the child rows itself would pass against a schema with no
-- cascade at all -- which is the one thing this block exists to rule out.
--
-- Counted as postgres for the reason above: the same counts run as another
-- reader are vacuously zero, since RLS hides E's rows from them either way.
--
-- Note also what does NOT happen here. reading_sessions_sync_progress is an
-- `after insert or update` trigger, so removing E's sessions cannot re-insert
-- E's progress row; if it ever gained a delete branch, this delete would abort
-- on the foreign key and these four rows are what would catch it.
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';

insert into results (name, expected, actual)
  select 'E: profile after delete', '0', count(*)::text
  from public.profiles where id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: session after delete', '0', count(*)::text
  from public.reading_sessions where user_id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: progress after delete', '0', count(*)::text
  from public.reading_progress where user_id = '55555555-5555-5555-5555-555555555555';
insert into results (name, expected, actual)
  select 'E: saved word after delete', '0', count(*)::text
  from public.saved_words where user_id = '55555555-5555-5555-5555-555555555555';

-- The other half of the promise: erasing one reader erases nobody else.
insert into results (name, expected, actual)
  select 'A''s profile survived E''s deletion', 'Anna', coalesce(first_name,'NULL')
  from public.profiles where id = '11111111-1111-1111-1111-111111111111';
insert into results (name, expected, actual)
  select 'A''s saved word survived E''s deletion', '1', count(*)::text
  from public.saved_words where user_id = '11111111-1111-1111-1111-111111111111';

select n, name, expected, actual, (expected = actual) as ok from results order by n;
rollback;
