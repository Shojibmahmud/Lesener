# Feature 2 Implementation Roadmap: Persist Reading Progress

> **Agent Goal:** Replace the hardcoded completed-post list (`App.jsx:48`) with progress read from `public.reading_progress` and written as one completed row in `public.reading_sessions` when a reader presses Finish — and let the reader move between levels that genuinely unlock.

> **Line references** in this document were last refreshed on 2026-08-18. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

> **No spec exists for this feature yet.** If one is written later in `.claude/specs/`, it is authoritative on observable behaviour and this roadmap is authoritative on how it gets built.

---

## 📌 Context & Motivation

* **Goal:** Persist what a reader has read, so the dashboard's counts, percentage and ✓ Gelesen badges describe the database rather than a literal, and so `private.has_level_access` starts opening Level 2 for a reader who has finished Level 1.
* **Why:** Progress is currently `useState([1, 2, 3, 4, 5, 6, 7])` (`App.jsx:48`) — it does not survive a reload, is identical for every reader, and flatters a brand-new account with *"7 of 10 posts completed"* and a 70% bar. Every level after the first is unreachable because nothing ever writes a completion, so the level gate never opens. Feature 1 established `posts.id` as the anchor these rows hang from; the schema for both tables has existed since `20260810103010_init_user_schema.sql` and has never been written to.

---

## 📐 Architecture & Architectural Decisions

The following are locked and must not be revisited mid-build:

1. **The app writes sessions only; progress is read-only.**
   * `reading_sessions` carries `select, insert, update` for `authenticated` (`rls_policies.sql:27`) and deliberately **no delete**. `reading_progress` carries `select` only (`:28`) and is maintained solely by `private.sync_reading_progress()` (`init_user_schema.sql:89`, trigger at `:123`).
   * Never write `reading_progress` from the client, and never treat a missing row there as an error — it appears only once a session exists.

2. **One completed row, written at Finish.**
   * Nothing is written when a post opens. Pressing Finish inserts a single row with `percent_read` from the reader's scroll position, `completed: true`, and **`ended_at` set** (see Trap 1 — omitting it breaks re-reading).
   * *Consequence, accepted:* a reader who abandons a post leaves no trace, `started_at` and `ended_at` describe the same moment, and `session_count` counts finishes rather than attempts.

3. **All progress queries live in `src/lib/progress.js`**, mirroring `src/lib/content.js`. Application state stays in `App.jsx`. No new state-management dependency.

4. **Both data layers share one query helper.** `rows()` (`src/lib/content.js:36`) carries the `PGRST303` clock-skew retry. It moves to `src/lib/query.js` and both modules import it — a progress layer issuing its own raw queries would reintroduce that bug on the first fetch after sign-in.

5. **The dashboard updates optimistically, and the next load is the authority.** A successful write marks the post complete locally so the badge and percentage move at once; the next `fetchProgress()` overrides whatever local state believed.

6. **Lock state is computed client-side.** `private.has_level_access` is in the `private` schema and unreachable from supabase-js, which can only call functions in exposed schemas. The client re-derives the same rule from data it already holds (see C1), and the database remains the enforcer — the client's copy decides only what to grey out.

7. **A failed write must not claim success.** *(Proposed 2026-08-18 — confirm before building.)* If `recordFinish` fails, do **not** add the post to the completed set: show the finish modal with a brief note that progress could not be saved. The reader may retry by pressing Finish again. Rationale: a badge that appears and then vanishes on reload is worse than one that never appeared.

---

## ⚠️ Known Traps & Edge Cases

* **1. The Finish insert must set `ended_at`.**
  * `reading_sessions_one_open_idx` (`init_user_schema.sql:62`) is unique on `(user_id, post_id)` **where `ended_at is null`**. A row written with `ended_at` null makes the *second* finish on that post fail with a duplicate-key error (`23505`).
  * `ended_at` also feeds the roll-up: the trigger writes `completed_at` as `coalesce(new.ended_at, now())`.
  * **Rule:** every insert this feature makes sets `ended_at`. A1/A2 exist to prove it.
* **2. Unlocking Level 2 reveals an empty level.**
  * `b1-momentum` holds **0 posts** (verified against the live database, 2026-08-18). Finishing Level 1 therefore opens a switcher entry onto *"No posts in this level yet."*
  * **Rule:** correct behaviour, and it will read as broken. Do not "fix" it in code — seeding Level 2 is content work, listed under deferred.
* **3. Locked and empty are the same shape.**
  * A locked level hands over zero posts because RLS withholds them; an empty level hands over zero because it has none. `Dashboard.jsx:33` derives `isEmpty = posts.length === 0` and its comment already warns that this only means "empty" while the shown level is never access-gated — which stops being true the moment a switcher exists.
  * **Rule:** C4 must tell them apart before C3 makes a second level selectable.
* **4. The unlock line can promise a level that does not exist.**
  * `Dashboard.jsx:160` renders `🔒 Level {level.position + 1} unlocks when all {postCount} posts are read`. There is no Level 3.
  * **Rule:** guard on whether a next level exists, not on the number.
* **5. A fresh account will look like a regression.**
  * Today's placeholder shows 7 of 10 complete for everyone. Afterwards a new reader correctly sees 0 of 10 and an empty bar.
  * **Rule:** that is the feature working. Verify with an account that has finished something, not with a new one.
* **6. First completion wins.**
  * The trigger does `completed_at = coalesce(rp.completed_at, excluded.completed_at)` (`init_user_schema.sql:115`), so re-reading never moves the date, while `last_read_at` does move.
  * **Rule:** never assert that finishing again advances `completed_at`.
* **7. `session_count` counts inserts only.**
  * `session_count = rp.session_count + v_new_session` (`:112`), where `v_new_session` is 1 only on `INSERT`. With Decision 2 it counts finishes.
  * **Rule:** do not present it as "times read".
* **8. Completion cannot be undone from the client.**
  * No DELETE grant on `reading_sessions`, by design: deleting a row would leave the roll-up overstated, since the trigger has nothing to recompute from.
  * **Rule:** any "mark as unread" needs a schema change. Out of scope.
* **9. The seeded ids still hide mistakes.**
  * `posts.id` and `posts.position` are both `1..10`, so a completed set keyed by position renders identically to one keyed by id. Inherited from Feature 1 and still true.
  * **Rule:** every progress fixture uses ids that are not positions (Feature 1's tests use `101..104`).
* **10. What the tests cannot catch — read this before trusting a green suite.**
  * The suite stubs the database, so **RLS, the trigger, the unique index and Trap 1 are all invisible to it**. A completed-session insert that would be refused in production passes every test.
  * This is exactly how `PGRST303` reached the running app with 62 tests green.
  * **Rule:** Stage A is verified against the real database and nowhere else. Do not substitute a test for it, and do not treat Stage A as done because a test resembling it passes.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: Prove the Write Path Against the Real Database

> No application code changes and no commit. Use a temporary probe (a `useEffect` in `App.jsx`, as Feature 1's A1 did) or the Supabase SQL editor as the signed-in reader, and read results back with SQL rather than from the client — the client cannot see what RLS hid from it.

- [ ] **A1. Prove a completed session rolls up into progress**
  * **Action:** As a signed-in test reader, insert into `public.reading_sessions`: a level-1 `post_id`, `percent_read: 100`, `completed: true`, `ended_at: now()`.
  * **Done when:** `select session_count, best_percent_read, completed_at from public.reading_progress where user_id = <reader> and post_id = <post>` returns exactly one row with `session_count = 1`, `best_percent_read = 100` and a non-null `completed_at`.

- [ ] **A2. Prove re-reading the same post does not fail**
  * **Action:** Repeat A1's insert verbatim for the same post.
  * **Done when:** the second insert returns no error, and the progress row reads back `session_count = 2` with `completed_at` **unchanged** from A1.
  * **STOP CONDITION:** 🛑 a `23505` duplicate-key error means `ended_at` was omitted (Trap 1). Fix the insert before going further — this failure would otherwise only appear the second time a reader re-reads anything.

- [ ] **A3. Prove a reader cannot record progress for anyone else**
  * **Action:** Attempt an insert with a `user_id` that is not the signed-in reader's.
  * **Done when:** the insert is refused by RLS, and `select count(*) from public.reading_sessions where user_id = <other reader>` is unchanged.
  * **STOP CONDITION:** 🛑 if it succeeds, stop — the write path is unsafe and no amount of client code fixes it.

- [ ] **A4. Prove the level gate actually flips**
  * **Action:** Insert one published post into `b1-momentum` (level 2) so there is something to withhold. With Level 1 **incomplete**, read level 2's posts as the client. Then complete all ten level-1 posts for the test reader and read again.
  * **Done when:** the client gets `[]` before, and that one post after — with no code change in between.
  * **Cleanup:** delete the inserted post, and delete the test reader's `reading_sessions` rows via SQL (the client cannot).
  * **STOP CONDITION:** 🛑 if access does not change, the gate does not work and Stage C's switcher would grey levels on a rule the database does not share.

---

### Stage B: Read Progress and Persist Finishing *(indivisible — ships as one commit)*

> **Why B and C from the original sketch are merged:** an intermediate stage that reads progress but does not yet write it ships a reader who finishes a post, sees the badge appear, reloads, and finds it gone. Feature 1 learned this the expensive way when its Stage C split had to be undone — the rule is that a stage leaves the app working, and silently forgetting a completed read does not qualify.

- [ ] **B1. Extract the shared query helper**
  * **Files:** `src/lib/query.js` (new), `src/lib/content.js`
  * **Action:** Move `rows()` and the `PGRST303` retry (`content.js:36`) into `src/lib/query.js`; import it in `content.js`.
  * **Done when:** `grep -rn "PGRST303" src/lib/` shows it defined in exactly one file, and `npm test` passes with `tests/content.test.js` unmodified.

- [ ] **B2. Add the progress data layer**
  * **File:** `src/lib/progress.js` (new)
  * **Action:** `fetchProgress()` → rows of `{ post_id, best_percent_read, completed_at }` for the signed-in reader, via the shared `rows()`. `recordFinish({ postId, percentRead })` → one insert per Decision 2, with `ended_at`.
  * **Done when:** a test asserts `recordFinish` sends `completed: true`, a non-null `ended_at` and the given `percentRead`; and that a failed insert throws rather than resolving (the same rule `rows()` enforces for reads).

- [ ] **B3. Fetch progress with the library**
  * **File:** `src/App.jsx` (the content effect, `:155-183`)
  * **Action:** Fetch progress alongside `loadContent()` so one `contentStatus` covers both, and clear it on sign-out exactly as content is cleared.
  * **Done when:** a test shows a progress-fetch failure landing on `ContentError` with a working Retry, and no progress request being made while signed out.

- [ ] **B4. Replace the placeholder completed set**
  * **File:** `src/App.jsx:48`
  * **Action:** Derive the completed set from fetched progress (`completed_at is not null`), keyed by `post_id`.
  * **Done when:** `grep -n "useState(\[1, 2, 3, 4, 5, 6, 7\])" src/App.jsx` returns nothing, and a test with one completed post in the fixture renders exactly one ✓ Gelesen badge on the matching card.

- [ ] **B5. Report the reader's percentage upward**
  * **File:** `src/components/Reader.jsx` (`progress` at `:7`, updated `:76`; Finish at `:189`)
  * **Action:** Pass the scroll percentage to `onFinish`.
  * **Done when:** a test scrolls the reader, reads the `N% read` header figure, clicks Finish, and asserts the handler received that same number — not `0` and not a hardcoded `100`.

- [ ] **B6. Persist the finish, optimistically**
  * **File:** `src/App.jsx:272` (`finish`)
  * **Action:** Call `recordFinish`, then add the post to the completed set on success. On failure follow Decision 7 — do not mark it complete.
  * **Done when:** a test asserts the badge appears after a successful write with no refetch, and that a failed write leaves the post unmarked while the modal still opens.

---

### Stage C: Let the Reader Move Between Levels

- [ ] **C1. Derive lock state client-side**
  * **File:** `src/lib/levels.js` (new)
  * **Action:** `isLevelUnlocked(level, levels, postsByLevel, completedIds)` reproducing `private.has_level_access` (`rls_policies.sql:39-86`): `position <= 1` is always open; otherwise every published post of the preceding level must be completed.
  * **Done when:** unit tests cover four cases — level 1 always unlocked; one incomplete post in the preceding level locks; completing it unlocks; and a preceding level with **zero** published posts unlocks vacuously, matching the `not exists` in the migration.

- [ ] **C2. Hold the selected level in state**
  * **File:** `src/App.jsx:285`
  * **Action:** Replace `content?.levels?.[0]` with a selected level id, defaulting to the first level by position.
  * **Done when:** `grep -n "levels?.\[0\]" src/App.jsx` returns nothing, and a test selecting the second level renders its name in the dashboard header.

- [ ] **C3. Add the switcher**
  * **File:** `src/components/Dashboard.jsx`
  * **Action:** List every level, marking locked ones and refusing selection.
  * **Done when:** a test shows the locked level's control carrying `disabled`, clicking it leaving the shown level unchanged, and the same control enabled once the fixture completes the preceding level.

- [ ] **C4. Tell locked apart from empty**
  * **File:** `src/components/Dashboard.jsx:33`
  * **Action:** Split `isEmpty` into "no posts here" and "not unlocked yet", each with its own message.
  * **Done when:** two tests — a locked level with zero posts shows the locked explanation and **not** *"No posts in this level yet."*; an unlocked level with zero posts still shows the empty panel (Feature 1's D1 behaviour, unbroken).

- [ ] **C5. Stop promising a level that does not exist**
  * **File:** `src/components/Dashboard.jsx:160`
  * **Action:** Render the unlock line only when a level with `position + 1` exists.
  * **Done when:** a test on the highest level asserts no `unlocks when all` text is present, while a lower level still shows it.

---

### Stage D: Cleanup, Tests & Documentation

- [ ] **D1. Retire what the feature replaced**
  * **Done when:** `grep -rn "Placeholder progress\|setCompleted" src/` shows no path that writes progress without going through `recordFinish`, and `npm run lint`, `npm test` and `npm run build` all pass.

- [ ] **D2. Make the suite bite**
  * **Action:** Cover progress rendering, the write payload, lock derivation, and the locked/empty split.
  * **Done when:** `npm test` passes, and each of these mutations fails at least one test — apply, watch it fail, revert:
    a. the completed set keyed by `position` instead of `post_id`,
    b. `isLevelUnlocked` treating a locked level as unlocked,
    c. `recordFinish` sending a hardcoded `percent_read: 100`,
    d. the locked message replaced by the empty one.
  * **Note:** omitting `ended_at` is deliberately **absent** from this list — no test can catch it (Trap 10). A2 is its only guard.

- [ ] **D3. Update the Supabase documentation**
  * **File:** `supabase/README.md`
  * **Action:** Record that the app now writes `reading_sessions` and reads `reading_progress`, and that the level gate is live.
  * **Done when:** the README describes the write path, and `grep -n "never written\|not written" supabase/README.md` returns nothing that is now false.

---

## 📦 Suggested Commit Breakdown

1. *(no commit)* — **Stage A** changes no application code. Its evidence lives in the Done when lines above; any temporary probe is reverted before Stage B begins.
2. `feat(progress): read progress from the database and persist finishing a post` (`B1`–`B6`)
3. `feat(levels): let the reader move between levels that have unlocked` (`C1`–`C5`)
4. `chore(progress): cover progress and unlocking with tests` (`D1`–`D3`)

Commit 2 is large because Stage B is indivisible; see the note under Stage B before proposing a split.

---

## 🔮 Subsequent Roadmap Context

* **Feature 3 — Persist Vocabulary Bank (`saved_words`):** retires the hardcoded words at `App.jsx:50-54`, which key saved words to the display string `'Post 1: Der Alltag in Berlin'` rather than to a `post_id`. `saved_words` already carries `select, insert, update, delete` for `authenticated` (`rls_policies.sql:29`) — the only content table where the reader may delete.
* **Feature 4 — Real Profile (`display_name`, `theme`):** retires `"Guten Tag, Anna."` at `Dashboard.jsx:120`.
* **Content authoring for Level 2:** `b1-momentum` holds no posts, so Trap 2 stands until posts are seeded by SQL. Not a code change.
* **Before launch, unrelated to this feature:** the Supabase project runs with `mailer_autoconfirm = true` and no SMTP sender, which must be reverted before real accounts exist.
