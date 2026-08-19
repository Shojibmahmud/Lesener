# Feature 4 Implementation Roadmap: Give the Reader a Real Name

> **Agent Goal:** Replace the two literals that stand in for a reader's identity — `Guten Tag, Anna.` (`Dashboard.jsx:175`) and the avatar's bare `A` (`Dashboard.jsx:77-82`) — with `profiles.first_name` and `profiles.last_name`, collected by two new fields on the create-account form, carried into the database by the auth trigger that has been waiting for them since day one, and editable afterwards from the account menu.

> **Line references** in this document were last refreshed on 2026-08-19, before any of it was built. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

> **All stages complete, 2026-08-19.** The line references above and throughout describe the code **as it stood before this feature landed**, and they have deliberately not been repointed: the Agent Goal's `Dashboard.jsx:175` names the literal that was retired, not the greeting that replaced it, and rewriting it to the new line would make the document wrong about its own history. Only the forward-looking references in *Subsequent Roadmap Context* were refreshed, because the next roadmap starts from those. Suite at completion: **190 tests across 19 files**, up from the 146 baseline; `npm run lint` and `npm run build` clean.

> **Spec:** `.claude/specs/10-real-profile.md` — spec 10 for roadmap Feature 4; the two numbering sequences diverged at spec 2. The spec is authoritative on observable behaviour; this roadmap is authoritative on how that behaviour gets built.

> **Reconciled with the spec on 2026-08-19.** The spec interview settled two rules this roadmap had not covered, and it was under-specified on both. **A length cap:** names are capped at 60 characters, which nothing here previously bounded — a pasted paragraph would have reached a 40px heading. That added the `char_length` clause to A1, the `left(...)` truncation to A2 (Decision 2's trigger half must absorb an over-long name, not raise on it), `maxLength` to C1, and mutation (h) to F1. **Clearing is asymmetric:** a reader may clear their last name but not their first, because the nameless greeting is a safety net rather than a state anyone should be able to choose. This roadmap had E2 treating both fields alike. That rewrote E2 and added mutation (i). Nothing else changed.

> **Numbering.** Feature 4 in roadmap order, built on branch `feature/10-real-profile`. The branch and roadmap sequences diverged long ago, exactly as the spec sequence did (see roadmap 3's header). Both earlier roadmaps already reserve this number: `2-reading-progress-roadmap.md:217` and `3-vocabulary-bank-roadmap.md:263` both name *"Feature 4 — Real Profile"* as the thing that retires `Dashboard.jsx:175`.

> **Baseline, measured 2026-08-19:** 146 tests across 15 files pass; `npm run lint` is clean.

---

## 📌 Context & Motivation

* **Goal:** The app learns who is reading. Sign-up collects a first and last name, the dashboard greets by first name and shows their initial, and the account menu names them above their email. A reader who dislikes what is stored can change it.
* **Why:** This is the widest gap between what the database offers and what the client uses. `public.profiles` has existed since `20260810103010_init_user_schema.sql:9-16`. RLS grants `authenticated` **select, insert and update** of their own row (`20260810103130_rls_policies.sql:114-125`). The auth trigger `private.handle_new_user()` (`20260810103513_move_handle_new_user_to_private.sql:13-25`) already reads sign-up metadata:

  ```sql
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  ```

  and `supabase/tests/rls_checks.sql:44-45` already **proves that path works**. The entire server side is built, tested and unused, for one reason: `AuthScreen.jsx:87` calls `supabase.auth.signUp(credentials)` with no `options` object, so `raw_user_meta_data` is `{}` for every account the UI has ever made.
* **Verified against the live database, 2026-08-19:** `public.profiles` holds **5 rows**, one per account, every one with `display_name = null` and `theme = null`. The trigger is doing its job; nobody has ever given it anything to store.
* **`profiles` is the last unreached table.** It is the only table in the schema with no bullet in `supabase/README.md:77-108`, and `README.md:35-36` currently claims *"Every table in the schema is now reached by the app"* — which is false today and becomes true when this lands.
* **Scope, set deliberately:** names only. Collect them, show them, let them be changed. `theme` stays in localStorage and `display_name` stays unwritten (see Deferred).

---

## 📐 Architecture & Architectural Decisions

The following are locked and must not be revisited mid-build:

1. **`first_name` and `last_name` are their own nullable columns.**
   * Not a single composed `display_name`. The greeting needs the first name alone, and welding the two into one string means splitting on a space forever — a rule that is wrong for every double-barrelled surname the app will eventually meet.
   * **Nullable, and it must stay that way.** `not null` would force the trigger to raise on any sign-up that omitted metadata, and a trigger that raises on `auth.users` insert does not produce a bad profile — it **fails account creation outright**. The columns describe a reader; they must never be able to stop one existing.
   * `display_name` is left alone and the trigger goes on reading it, so `rls_checks.sql:44-45` keeps passing unchanged.

2. **The database polices trimming; the trigger absorbs it.** *(Two halves of one decision — do not implement half.)*
   * A1 adds `check (x = btrim(x) and x <> '' and char_length(x) <= 60)` to each column. A2's trigger applies `nullif(left(btrim(...), 60), '')` before inserting.
   * **`char_length`, never `length` of bytes or `octet_length`.** The spec requires non-Latin scripts to be accepted, and a Bengali name of 25 characters is well over 60 bytes in UTF-8. A byte-counting cap would refuse real names in the alphabet half the app's readers write in, while letting a 60-character Latin name through — the exact opposite of a fair rule.
   * *This is deliberate, and the apparent contradiction is the point.* The constraint guards the **update** path (Stage E), where the client owns the statement and can show the reader a message when it is refused. The trigger's `btrim` guards the **sign-up** path, where a refusal would destroy the account instead of the value.
   * *Consequence, accepted:* the "client forgot to trim" mutation is only catchable at the edit modal, never at sign-up. F1 lists it there and nowhere else.

3. **The greeting changes wording as well as name.** `Guten Tag, Anna.` becomes `Grüß Gott, {first_name}.`
   * *Why the German changes:* `Guten Tag` is time-of-day marked, and the dashboard is the first screen a reader sees at any hour.
   * *Raised and overruled, recorded here so it is not re-litigated:* `Grüß Gott` is Bavarian, Austrian and South Tyrolean rather than neutral, which sits oddly beside content set in Berlin (`Der Alltag in Berlin`). Shojib chose it knowingly over `Hallo` on 2026-08-19. **The wording is settled.** The cost of the change is Trap 1, not the register.

4. **The avatar shows the first name's initial**, falling back to the email's first letter. Both literals go together: a correct name beside a permanent `A` looks more broken than either alone.

5. **`fetchProfile()` joins the existing `Promise.all`.**
   * Added at `App.jsx:186` beside `loadContent()` / `fetchProgress()` / `fetchSavedWords()`, so one `contentStatus` covers all four — for the reason already written above that block and applied by Feature 3's C2: a dashboard drawn before its profile arrives greets nobody and then corrects itself, which reads as a bug.
   * *Rejected:* reading `user.user_metadata.first_name` off the session App already holds. It costs no query, but it is a frozen copy of the sign-up metadata that **Stage E could never update**, and it is null for all 5 existing accounts.

6. **All profile queries live in `src/lib/profile.js`**, mirroring `content.js`, `progress.js` and `vocab.js`. The read goes through the shared `rows()` helper (`src/lib/query.js:28`) so the `PGRST303` clock-skew retry covers it; the write takes the user id from `supabase.auth.getSession()` exactly as `vocab.js:41-50` does. Application state stays in `App.jsx`. No new dependency.

7. **An update must check what it updated, not just that it did not error.**
   * `profiles_update_own` is a `using` clause (`rls_policies.sql:122-125`): somebody else's row is **filtered out**, not rejected, so the statement succeeds having changed nothing. `updateProfileName` therefore uses `.update(...).eq('id', userId).select()` and treats an empty result as a failure. This is Feature 3's Decision 4, applied to the one other table that now takes a client write.

8. **`profile` is cleared with the rest of the per-reader state**, joining `content`, `completed`, `saved` and `selectedLevelId` in the content effect's reset (`App.jsx:172-180`). Without it, one reader's name greets the next.

9. **The 5 existing rows are backfilled from their email**, as `initcap(split_part(email,'@',1))`, with `last_name` left null.
   * *Consequence, stated rather than softened:* `basabodol1430@gmail.com` becomes **Basabodol1430**, which is not a name and does not become one by being capitalised. This was chosen over a nameless fallback on 2026-08-19.
   * **Stage E is what makes this defensible.** A machine-made name the reader can correct in two clicks is a different thing from one they are stuck with. Do not ship the backfill without the edit screen.

---

## ⚠️ Known Traps & Edge Cases

* **1. `Guten Tag` is a load-bearing test marker, and this feature deletes it.**
  * Eight assertions use it to decide whether the dashboard rendered: `tests/content-lifecycle.test.jsx:111,117,196,249,284,346,362` and `tests/dashboard-content.test.jsx:184`. They match the regex `/Guten Tag/`, not the full string.
  * **Four of them are negative** — `queryByText(/Guten Tag/).not.toBeInTheDocument()` at `:111`, `:249`, `:346` and `dashboard-content:184` — asserting the dashboard is *absent* during loading, error and reader screens. Those four are the danger. Once the string exists nowhere in the app, they pass permanently while testing nothing at all, and a stale `not.toBeInTheDocument()` never goes red to tell you.
  * **Rule:** all eight change to the new marker **in the same commit as the greeting** — not one commit earlier, not one later. And prove the four negatives still bite (D4).
* **2. The test stub cannot update.**
  * `tests/helpers/supabase.js:44-58` supports `select / insert / delete / single / eq / order`. There is no `update()`. An untaught stub falls through to `{ data: [], error: null }` (`:65`), so a test of the edit modal would pass while asserting nothing — the exact shape of Feature 3's Trap 10, and the reason `delete()` had to be added there.
  * **Rule:** E1 teaches the stub before any test of Stage E is written, not after.
* **3. The suite has no auth surface, so nothing in it can prove the trigger runs.**
  * `supabase.auth.signUp` is mocked per test file (`tests/forgot-password.test.jsx:5-13`); `getSession` is stubbed with `vi.spyOn` in individual files. A test can prove the `options.data` object was **passed**. Nothing can prove the trigger **read** it, that the check constraints exist, or that any RLS policy holds.
  * **Rule:** Stage B is verified against the real database and nowhere else. Do not substitute a test for it, and do not treat Stage B as done because a test resembling it passes.
* **4. The trigger never updates an existing row.**
  * `on conflict (id) do nothing` (`20260810103513:22`). If a profile row somehow predates its auth user, the names are dropped in silence and no error reaches anybody.
  * **Rule:** leave the clause — removing it to "fix" this would let a re-fired trigger overwrite a name the reader edited in Stage E, which is strictly worse. This is a note for whoever debugs a nameless new account, not a change to make.
* **5. A duplicate sign-up stores nothing, and must not claim otherwise.**
  * With email-enumeration protection on, signing up an existing address returns a decoy user carrying no identities and creates no row — the branch at `AuthScreen.jsx:100-104` exists for exactly this. No trigger fires, so no name is stored.
  * **Rule:** the names ride along in `options.data` and are subject to that branch like everything else. Do not add a separate "save the name" call that could succeed while the sign-up did not.
* **6. A null first name should be unreachable, which is why the fallback matters.**
  * After this feature the form requires both fields and the backfill covers all 5 existing rows, so nothing should ever render without a name. The fallback is therefore **defensive, not decorative**: it is the only thing standing between a null and a dashboard reading *"Grüß Gott, null."* Reachable in practice by an account created between Stage A and Stage C shipping, or by any sign-up made outside the form.
  * **Rule:** the fallback is required and must be tested, even though the path that reaches it is not supposed to exist. And it must stay unreachable *by choice* — E2 refuses a blank first name for this reason. A guard the reader can walk into deliberately has stopped being a guard.
* **7. Nobody has ever tested that reader B cannot update reader A's profile.**
  * `rls_checks.sql` covers profile auto-creation (`:42-43`), metadata (`:44-45`) and select isolation (`:158-159`). It tests **no** profile update at all. That was harmless while no client wrote to the table; it becomes load-bearing the moment Stage E ships a write path.
  * **Rule:** B3 closes it, and the assertion must run after `reset role`, as `postgres` — Feature 3's Trap 11 records what happens otherwise: an assertion about somebody else's rows written from their neighbour's seat passes forever while testing nothing, because RLS hides the row either way.
* **8. `initcap` lowercases everything it does not capitalise.**
  * `initcap('McDonald')` returns `'Mcdonald'`, and `initcap('first.last')` returns `'First.Last'` because a dot is a word separator.
  * Harmless here — all 5 live local-parts are lowercase and none contains a dot, verified 2026-08-19 — and the backfill runs once, `where first_name is null`, so it can never touch a name a reader typed.
  * **Rule:** do not generalise the backfill into a helper or reuse `initcap` on anything a human entered.
* **9. A fresh account will look like a regression, again.**
  * Same shape as Feature 2's Trap 5 and Feature 3's Trap 8: after Stage D the dashboard stops saying *Anna* for everybody, and an account created before Stage C shipped has no name to show.
  * **Rule:** that is the feature working. Verify with an account created through the finished form.
* **11. Clearing `profile` on sign-out cannot be observed, and therefore cannot be tested.** *(Found running F1's mutations, 2026-08-19 — the same shape as Feature 3's Trap 12, and confirmed the same way.)*
  * Removing `setProfile(null)` from the content effect's reset breaks **no test**, mutation (c) included. The reason is a fact about the screens in front of it, not about the suite being lazy: `SIGNED_OUT` routes to Landing in the same event, and the next reader sees `ContentLoading` until all four fetches resolve — by which point `setProfile` has run with their own row. The failure path lands on `ContentError`. The dashboard is unreachable from all three, so there is no moment at which one reader's name could be seen by the next.
  * The test named *"greets whoever is signed in, not whoever was before"* asserts the greeting follows the session. It does **not** prove the reset, and its comment now says so rather than implying otherwise.
  * **Rule:** keep the clearing. It is free, it matches how `content`, `completed` and `saved` are already handled, and it is the guard that holds the day somebody makes the dashboard reachable before the library arrives. But do not add a test claiming to cover it, and do not delete it on the grounds that nothing fails.
* **10. What the tests cannot catch — read this before trusting a green suite.**
  * Invisible to the entire suite: the auth trigger reading metadata, both check constraints, every RLS policy on `profiles`, and whether the backfill produced anything a human would accept as a name.
  * This is the same blind spot that let `PGRST303` reach the running app with 62 tests green, and that Features 2 and 3 each recorded as their Trap 10.
  * **Rule:** Stages B and F's human checks are the only guard. Nothing else in this document covers them.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: Make the Database Hold a Name

> One migration file, `supabase/migrations/20260819160000_profile_names.sql`, carrying all three tasks in order — the backfill cannot run before the columns exist. Applied via MCP `apply_migration`; there is no local CLI (`supabase/README.md:56-60`).
>
> The app is untouched by this stage. Nothing reads the new columns until Stage D.

- [x] **A1. Add `first_name` and `last_name` to `profiles`**
  * **File:** `supabase/migrations/20260819160000_profile_names.sql` (new)
  * **Action:**
    ```sql
    alter table public.profiles
      add column first_name text,
      add column last_name  text,
      add constraint profiles_first_name_clean
        check (first_name = btrim(first_name)
               and first_name <> ''
               and char_length(first_name) <= 60),
      add constraint profiles_last_name_clean
        check (last_name = btrim(last_name)
               and last_name <> ''
               and char_length(last_name) <= 60);
    ```
  * Nullable is a decision, not an oversight (Decision 1): a `not null` column here would let a missing name abort account creation.
  * Both checks pass on `null`, which is what makes them safe to add to a table of 5 rows that have no names yet.
  * **Done when:** `select column_name, is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('first_name','last_name')` returns **two** rows, both reading `YES`; `update public.profiles set first_name = ' Shojib '` is refused with `23514`; `update ... set first_name = repeat('a', 61)` is refused with `23514`; and `update ... set first_name = repeat('অ', 60)` **succeeds** — 60 characters, 180 bytes, which is the whole reason the constraint counts characters (Decision 2).

- [x] **A2. Teach the trigger to read both names**
  * **File:** same migration
  * **Action:**
    ```sql
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

    revoke all on function private.handle_new_user() from public, anon, authenticated;
    ```
  * `display_name` stays in the insert untouched (Decision 1) so `rls_checks.sql:44-45` goes on passing.
  * `btrim` and `left(..., 60)` here are the sign-up half of Decision 2 — neither may raise, because raising fails the `auth.users` insert and therefore the whole account. `left()` counts characters, matching A1's `char_length` rather than fighting it.
  * The form caps input at 60 (C1), so truncation here should be unreachable from the UI. It exists for metadata arriving from anywhere else, and losing the tail of an absurd name is strictly better than refusing to create the account.
  * The `revoke` is re-issued rather than assumed. `create or replace` preserves an ACL, but the original migration (`20260810103513:27`) states the reason it exists — a `security definer` function reachable as `/rest/v1/rpc/<name>` — and that reason is worth keeping visible in the file that last touched it.
  * The trigger itself is **not** recreated: `create or replace` swaps the body under the existing `on_auth_user_created`.
  * **Done when:** `select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='handle_new_user'` contains all three of `display_name`, `first_name` and `last_name`, and `select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal` still returns `on_auth_user_created`.

- [x] **A3. Backfill the five existing readers**
  * **File:** same migration
  * **Action:**
    ```sql
    update public.profiles p
       set first_name = initcap(split_part(u.email, '@', 1))
      from auth.users u
     where u.id = p.id
       and p.first_name is null
       and btrim(split_part(u.email, '@', 1)) <> '';
    ```
  * `last_name` is deliberately left null — an email local-part carries no surname, and inventing one would be worse than the gap.
  * The `first_name is null` guard makes this idempotent and means a re-run can never overwrite a name a reader typed (Trap 8).
  * The empty-local-part guard exists so the statement cannot violate A1's own check.
  * **⚠️ This is the only irreversible step in the feature.** It writes to five real accounts and the original nulls are gone afterwards. Re-running is safe; undoing is not.
  * **Done when:** `select count(*) from public.profiles where first_name is null` returns **0**.
  * *Amended 2026-08-19, after the fact.* This line originally also required `count(*) where last_name is not null` to return **0**. That was true the moment the migration ran and false from the first real use onwards — the clause counted every profile, so any sign-up through the finished form, or any reader adding a surname, falsifies it. It asserted "the backfill invented no surnames", which is worth recording but cannot be expressed as a count over a live table. It is recorded here in prose instead: **the backfill set `first_name` only, and wrote no `last_name` for any of the five accounts.**
  * *Footnote, same date:* four of those five accounts (`hridoy`, `monir`, `power`, `shojibmahmud108`) were made-up test addresses holding no sessions, progress or saved words, and were deleted once the feature was verified. Only `basabodol1430` remains of the original five, and its name has since been edited through Stage E — so there is no longer any row against which the backfill's output could be re-checked.

---

### Stage B: Prove It Against the Real Database

> **No application code.** These extend `supabase/tests/rls_checks.sql`, which already exists for exactly this purpose — self-contained, impersonating readers via `set local request.jwt.claims` (`:37-38`), rolled back at the end (`:259`). Following Feature 3's Stage B precedent this **does** produce a commit, because the file must be touched regardless: its fixtures are what fire the trigger.
>
> Trap 3 is why this stage exists at all. Nothing here is reachable from the suite.

- [x] **B1. Prove both names arrive from sign-up metadata**
  * **File:** `supabase/tests/rls_checks.sql:15-24` (fixtures), `:42-45` (assertions)
  * **Action:** Extend reader A's `raw_user_meta_data` from `'{"display_name":"Anna"}'` to also carry `"first_name":"Anna"` and `"last_name":"Schneider"`. Add two assertions beside the existing `display_name` one. Leave reader B's `'{}'` alone — it is now the only proof that a metadata-less sign-up still produces a profile rather than failing.
  * **Done when:** the new rows read `A: first_name from metadata` = `Anna` and `A: last_name from metadata` = `Schneider`, the existing `A: display_name from metadata` row still reads `Anna`, and `B: sees only own profile` (`:158-159`) is unchanged — B having no metadata must still yield exactly one profile row.

- [x] **B2. Prove the trigger absorbs bad input instead of raising**
  * **Action:** Add a third fixture user whose metadata is `'{"first_name":"  Shojib  ","last_name":""}'`, and a fourth whose `first_name` is 80 characters long.
  * This is the half of Decision 2 that no test can reach and that matters most: a raising trigger would mean a reader with a stray space — or an over-long name — cannot make an account at all.
  * **Done when:** five assertions pass — the third user exists, its `first_name` = `Shojib` with no padding, its `last_name` is null; the fourth user exists, and its `first_name` is exactly 60 characters.
  * **STOP CONDITION:** 🛑 if the fixture insert itself errors, the trigger is raising on `auth.users`. Stop and fix A2 before writing any client code — every sign-up in the app depends on this never happening.

- [x] **B3. Prove the check constraint refuses a padded update**
  * **Action:** As reader A, `update public.profiles set first_name = ' Anna '` on their own row.
  * **Done when:** it is refused with `23514`, and A's `first_name` still reads `Anna`.
  * **STOP CONDITION:** 🛑 if it succeeds, A1's constraint is not in force and Stage E has nothing keeping its input honest.

- [x] **B4. Prove a reader cannot rename anybody else**
  * **Action:** As reader B, `update public.profiles set first_name = 'Stolen' where id = <A>`, reading back the affected count. Then `reset role` and, **as `postgres`**, read A's row.
  * The second half is the whole test. Asserting from B's seat proves nothing — RLS hides A's row from B either way, so the check would pass forever while testing nothing (Trap 7).
  * **Done when:** B's update reports **zero rows affected and no error**, and the `postgres` read shows A's `first_name` unchanged.
  * **STOP CONDITION:** 🛑 if A's name changed, the profile is unsafe to expose a write path to. No client code fixes it.

- [x] **B5. Read the backfilled names back and judge them.** 🧑 **Human only** — `/roadmap-updater` cannot settle this.
  * **Action:** `select p.first_name, p.last_name, u.email from public.profiles p join auth.users u on u.id = p.id order by p.created_at` against the live database, and decide whether each value is something you are willing to greet that person with.
  * There is no machine check here on purpose. `initcap` either produced something name-shaped or it did not, and only a person can say which.
  * **Done when:** you have looked at all five rows and either accepted them or corrected them by hand.

> **Whole stage done when:** every row of the final `select ..., (expected = actual) as ok` (`rls_checks.sql:258`) reads `ok = true`, as `supabase/README.md:141-146` requires.

---

### Stage C: Collect the Names at Sign-Up

> Ships alone and leaves the app working: new accounts start storing names, and nothing on screen changes yet. That gap is deliberate — it means Stage D can be judged on a real account that already has a real name.

- [x] **C1. Two fields on the create-account form**
  * **File:** `src/components/AuthScreen.jsx` — state at `:43-51`, markup beside `emailInput` at `:156-173`
  * **Action:** Add `firstName` / `lastName` state and a `nameInputs` fragment rendered **only when `isUp`**, above `{emailInput}` at `:252`. Copy the email block's shape exactly: matching `id`/`htmlFor`, `required`, `disabled={busy}`, controlled `value`/`onChange`, `autoComplete="given-name"` / `"family-name"`, and spacing supplied at the call site as `{ ...inputStyle, marginBottom: 16 }` from `src/lib/authUi.js`.
  * `maxLength={60}` on both, matching A1's constraint. Native `maxLength` stops the typing rather than refusing the submit, which is the right shape here — nobody is misled about why they cannot continue. It counts UTF-16 code units rather than characters, so it diverges from `char_length` on astral-plane input (emoji, some rarer scripts); that divergence only ever makes the form *stricter* than the database, so it cannot produce a value the constraint then rejects.
  * No new component. `PasswordField.jsx` exists because the reveal toggle is *behaviour*; these two share only styling, which the style objects already carry.
  * **Do not add these to `switchTab`.** It clears messages and flags (`:58-65`) but deliberately leaves `email` and `password` alone, so a mistyped tab costs nobody their typing. The names follow that existing behaviour and persist across a tab switch too — consistency here is the decision, not an oversight to correct.
  * **Done when:** a test renders `authTab="up"` and finds both fields, renders `authTab="in"` and finds neither, and renders the forgot-password view and finds neither.

- [x] **C2. Send them as sign-up metadata**
  * **File:** `src/components/AuthScreen.jsx:85-88`
  * **Action:**
    ```js
    const credentials = { email: email.trim(), password };
    const { data, error: authError } = isUp
      ? await supabase.auth.signUp({
          ...credentials,
          options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
        })
      : await supabase.auth.signInWithPassword(credentials);
    ```
  * Trimmed at the call site, matching how `email` is already handled at `:85`. The trigger trims again (Decision 2); doing it here as well is what keeps the metadata itself clean for anything that later reads it.
  * `signInWithPassword` keeps the bare `credentials` object — the options belong to sign-up alone.
  * The duplicate-account branch at `:100-104` and the confirm-email branch at `:109-113` are untouched (Trap 5).
  * **Done when:** a test fills all four fields with padded names, submits, and asserts `signUp` was called with `options.data` equal to `{ first_name: 'Shojib', last_name: 'Mahmud' }`; and a second test asserts `signInWithPassword` was called with **no** `options` key.

---

### Stage D: Greet the Reader by Name

> **Indivisible — ships as one commit.** Splitting it means either a dashboard that reads a profile it does not display, or a greeting reading `Grüß Gott, undefined.` while the fetch is added in a later commit. And Trap 1 forbids separating the greeting from its eight assertions.

- [x] **D1. Add the profile data layer**
  * **File:** `src/lib/profile.js` (new)
  * **Action:** `fetchProfile()` → `rows(() => supabase.from('profiles').select('id, first_name, last_name'), 'your profile')`, returning the first row or `null`. RLS scopes it to the signed-in reader, so it filters by nothing — the same reasoning written at `vocab.js:8-10`.
  * **Done when:** `npm test` passes with a test asserting the select names all three columns, that a failing query throws through `rows()`, and that an empty result yields `null` rather than throwing.

- [x] **D2. Load it with the library, and clear it with it**
  * **File:** `src/App.jsx` — reset block `:172-180`, `Promise.all` `:186`
  * **Action:** Add `fetchProfile()` as the fourth promise and `profile` to the destructured result; add `setProfile(null)` to the reset block beside `setSaved([])` (Decision 8).
  * **Done when:** a test shows a profile-fetch failure landing on `ContentError` with a working Retry, and no profile request being made while signed out. *Amended 2026-08-19:* this line originally also demanded a mutation-check — delete `setProfile(null)`, sign out and back in, and watch the previous reader's name fail a test. It was run and **it does not fail**, for a structural reason rather than a lazy suite. See **Trap 11**, which records the evidence and why the clearing is kept regardless. Do not reinstate the requirement; do not delete the clearing.

- [x] **D3. Retire both literals**
  * **File:** `src/components/Dashboard.jsx:175` (greeting), `:77-82` (avatar), `:99-101` (account menu)
  * **Action:** `Guten Tag, Anna.` → `Grüß Gott, {firstName}.` (Decision 3); the avatar's literal `A` → the first name's initial; and the full name above the existing `{email}` in the "Signed in as" block. New props off the `profile` App now holds.
  * **The fallback is required** (Trap 6): with no first name the greeting drops the name entirely rather than rendering an empty gap or the word `null`, and the avatar falls back to the email's first letter.
  * **Done when:** `grep -rn "Guten Tag\|Anna" src/` returns nothing, and three tests — the greeting and initial for a reader with a name; the fallback greeting and email-initial for a reader whose profile has `first_name: null`; and the full name rendered above the email in the account menu.

- [x] **D4. Move the eight assertions to the new marker, and prove they still bite**
  * **Files:** `tests/content-lifecycle.test.jsx:111,117,196,249,284,346,362`, `tests/dashboard-content.test.jsx:184`
  * **Action:** `/Guten Tag/` → `/Grüß Gott/` in all eight. **This commit and no other** (Trap 1).
  * **Done when:** `grep -rn "Guten Tag" tests/` returns nothing, `npm test` passes, and — because four of the eight are `not.toBeInTheDocument()` and would pass on a string that no longer exists anywhere — mutating the loading gate at `App.jsx:427-429` to fall through to the dashboard **fails at least one negative assertion**. Apply, watch it fail, revert.

---

### Stage E: Let the Reader Change It

> Required, not optional, and not separable from A3: Decision 9 backfills five people with machine-made names, and this is the difference between a name they can fix and one they are stuck with.

- [x] **E1. Teach the test stub to update**
  * **File:** `tests/helpers/supabase.js:44-58`
  * **Action:** Add `update: (payload) => ((op = 'update'), calls.update.push([table, payload]), builder)` alongside the existing `insert` at `:50`, and `update: []` to the `calls` object at `:34`. The `(filters, op)` callback shape already at `:64` then lets a `profiles` fixture answer differently for select and update.
  * **This comes first.** Written after E2 or E3, every assertion below would pass against the fall-through at `:65` while proving nothing (Trap 2).
  * **Done when:** `npm test` passes with all 15 existing test files unmodified, plus a case asserting `calls.update` saw `['profiles', { first_name: 'X', last_name: 'Y' }]` with `calls.eq` holding `['id', <userId>]`.

- [x] **E2. Add the update to the data layer**
  * **File:** `src/lib/profile.js`
  * **Action:** `updateProfileName({ firstName, lastName })` — takes the user id from `supabase.auth.getSession()` exactly as `vocab.js:41-50` does, then `.update({ first_name, last_name }).eq('id', userId).select('id, first_name, last_name')`, throwing when the result is empty (Decision 7) and appending the PostgREST code to the message as `vocab.js:68-71` does.
  * Values are trimmed here, and the check constraint refuses both a padded and an empty string.
  * **The two fields are not treated alike** *(rewritten 2026-08-19 to match the spec).* A blank **last** name is sent as `null` — clearing a surname is a legitimate thing to do, and it returns the reader to the first-name-only state the bank and menu already handle. A blank **first** name is refused before any request is made, with the modal saying so. The nameless greeting exists as a safety net against a null that should be unreachable (Trap 6); it is not a state a reader should be able to select, and letting them clear their way into it would turn a guard into a feature.
  * **Done when:** `npm test` passes with tests asserting the trimmed payload; that an empty last name is sent as `null`; that an empty **or whitespace-only** first name is rejected **without any request being made** — assert `calls.update` is empty, not merely that it threw; and that the function **throws** when the stub returns `{ data: [], error: null }`.

- [x] **E3. Add the modal and wire it up**
  * **Files:** `src/components/EditNameModal.jsx` (new), `src/App.jsx:75,289-293,536`, `src/components/Dashboard.jsx:102-110`
  * **Action:** Follow `ChangePasswordModal.jsx` throughout — same overlay and card, same `error` / `done` / `busy` state, same Cancel-plus-submit button pair, same `errorMessageStyle`. Two fields pre-filled from the current profile. In `App`, a `showEditName` state beside `showChangePassword` (`:75`), an `askEditName` beside `askChangePassword` (`:289-293`) that closes the menu, cleared on `SIGNED_OUT` alongside its sibling at `:123,134`, and mounted beside `:536`. In `Dashboard`, a menu item beside "Change password".
  * On success the modal hands the returned row back to `App`, which sets it into `profile` — so the greeting changes behind the modal without a reload.
  * **Done when:** three tests — a rename updates the dashboard greeting and avatar initial with no reload and no refetch; a rename that throws leaves the old name on screen, keeps the modal **open** and shows a message in it; and clearing the last name alone saves successfully, while clearing the first name is refused in the modal with the dashboard untouched behind it.

- [x] **E4. Confirm the profile on a running build.** 🧑 **Human only** — none of this is reproducible from the suite.
  * **Action:** Against `npm run dev` and the live database: create an account through the finished form and confirm the greeting, the initial and the menu; sign in as one of the five backfilled accounts and confirm what it shows; rename yourself and confirm the greeting changes immediately **and** survives a reload; confirm `updated_at` moved on that row (`profiles_set_updated_at`, `init_user_schema.sql:18-20`); and with `window.fetch` rejecting, confirm a failed rename leaves the old name on screen with the modal still open and a message in it.
  * **Also confirm on screen, because only a person can judge these:** a name in Bengali script and one with an umlaut both render correctly in the 40px serif heading and in the avatar circle; and a 60-character name does not break the dashboard layout — this is the check that decides whether 60 is the right number (spec Assumption 1).
  * **Cleanup:** delete any account created for this check.
  * **Done when:** every check above has been run and its result recorded in this file, as Feature 3's C8 did.

---

### Stage F: Cover It and Retire What It Replaced

- [x] **F1. Make the suite bite**
  * **Done when:** `npm test` passes, and each of these mutations fails at least one test — apply, watch it fail, revert:
    a. `signUp` sending the names untrimmed,
    b. the name fields rendered on the sign-in tab as well as sign-up,
    d. the greeting's fallback removed, so a null first name renders `Grüß Gott, null.`,
    e. `updateProfileName` resolving instead of throwing on zero returned rows,
    f. `updateProfileName` dropping its `.eq('id', userId)`,
    h. `maxLength` removed from the sign-up name fields,
    i. `updateProfileName` sending a blank first name as `null` instead of refusing it,
    g. the loading gate at `App.jsx:427-429` falling through (this is D4's negative-assertion check, kept here as the standing guard).
  * **Run 2026-08-19: all eight bite.** A ninth was on this list and was removed — *`profile` left out of the content effect's reset*. It was applied, and no test failed. That is a fact about the screens in front of the dashboard, not about the suite; **Trap 11** records it in full. The clearing stays.
  * **Deliberately absent, because no test can catch them** (Trap 3): the auth trigger, both check constraints, and every RLS policy. Stage B is their only guard. Note in particular that Decision 2's "client forgot to trim" is caught at (a) on the **update** path only — sign-up cannot be made to fail on it by design.

- [x] **F2. Retire what the feature replaced**
  * **Done when:** `grep -rn "Guten Tag\|Anna" src/ tests/` returns nothing — it matches exactly one line today, `Dashboard.jsx:175`, so it is a guard that can genuinely go from one to zero — and `npm run lint`, `npm test` and `npm run build` all pass.
  * The lowercase `anna@example.de` placeholder at `AuthScreen.jsx:166` deliberately does **not** match this pattern and stays.

- [x] **F3. Update the Supabase documentation**
  * **File:** `supabase/README.md:35-36`, `:74`, `:77-108`
  * **Action:** Give `profiles` the bullet it has never had — `first_name`, `last_name`, the nullability decision, the trigger that fills them from sign-up metadata, and the trim constraints. The claim at `:35-36` that every table is reached by the app finally becomes true; say so, and move `level_progress` (`:109-112`) into the "still unread" position it now holds alone.
  * **Done when:** the `profiles` bullet exists and names both columns and the trigger, and `grep -n "level_progress" supabase/README.md` shows it described as the last unread object.

---

## 📦 Suggested Commit Breakdown

Six commits, each independently working.

1. `feat(profile): store a reader's first and last name` (`A1`–`A3`) — the migration alone. The app is unaffected; two new columns and five backfilled rows nothing reads yet.
2. `test(profile): prove names arrive from sign-up and stay private` (`B1`–`B5`) — `rls_checks.sql` only. Unlike Features 1 and 2, this stage does commit, because the fixtures are what fire the trigger.
3. `feat(auth): collect a name when an account is created` (`C1`–`C2`) — new accounts start storing names; nothing on screen changes.
4. `feat(profile): greet the reader by name` (`D1`–`D4`) — indivisible, and carries the eight test-marker changes with it.
5. `feat(profile): let a reader change their name` (`E1`–`E4`).
6. `chore(profile): cover the profile and document it` (`F1`–`F3`).

---

## 🔮 Subsequent Roadmap Context

* **`profiles.theme` is still unwritten.** The column exists with its `check (theme in ('light','dark'))` (`init_user_schema.sql:13`) and the comment at `:12` states the gap outright: *"null means 'follow the device'; App.jsx currently keeps this in localStorage."* Wiring it retires `THEME_KEY = 'lesener-theme'` (`App.jsx:22`) and its read/write at `:96` and `:106`, and means a reader's theme follows them between devices. Deliberately deferred here.
* **`display_name` as a chosen nickname.** The column and the trigger's read of it survive this feature untouched, but nothing sends or shows it. Whoever picks it up decides whether it overrides the first name in the greeting, and inherits `rls_checks.sql:44-45` as a working proof of the metadata path.
* **`level_progress` is now the last unread object.** F3 landed, so it is the only thing in the schema the app never asks for; the dashboard's counts come from `levels.post_count` instead (`supabase/README.md:137`).
* **Erasing an account still deletes nothing.** `App.jsx:561` documents it: `auth.admin.deleteUser` is not callable with the publishable key, so `DeleteModal` only signs out. Everything below `auth.users` cascades (`init_user_schema.sql:5-9`) the moment an Edge Function exists to call it — and `profiles` now carries a name, which makes that gap more pointed than it was.
* **Content authoring for Level 2:** `b1-momentum` holds no posts — re-verified against the live database on 2026-08-19, `post_count = 0` and zero rows — so Feature 2's Trap 2 stands until posts are seeded by SQL. Not a code change.
* **Before launch, unrelated to any feature:** the Supabase project runs with `mailer_autoconfirm = true` and no SMTP sender, which must be reverted before real accounts exist.
