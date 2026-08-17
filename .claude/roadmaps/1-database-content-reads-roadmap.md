# Feature 1 Implementation Roadmap: Wire Content Reads to the Database

> **Agent Goal:** Replace static imports from `src/data.js` (`TEXTS`, `DICT`, `POSTS`) with live Supabase database queries against `public.posts`, `public.levels`, and `public.dictionary_entries`.

> **Line references** in this document were last refreshed after Stage E (2026-08-18). They shift constantly — the password-reset work moved every `App.jsx` reference by ~40 lines, and Stage B moved them again by ~20 within a single session — so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier. References to code Stage E deleted are marked *(gone)* rather than renumbered: there is no line to point at any more, and silently dropping them would hide what the task actually did.

> **Stage C was revised on 2026-08-17**, after `.claude/specs/5-stage-c-content-on-screen.md` was written. Three changes: the loading and error states moved forward from D1 into Stage C, the level's own labels came into scope, and the C1–C4 commit split was found to be unshippable and merged. The behaviour spec is authoritative where it and this roadmap disagree.

---

## 📌 Context & Motivation

* **Goal:** Connect content-reading UI components directly to PostgreSQL / Supabase tables (`public.posts`, `public.levels`, `public.dictionary_entries`).
* **Why:** The database schema, RLS policies, and seeded B1 content already exist in Supabase but are currently unused. Wiring live database reads enables content corrections without application rebuilds and provides foreign key anchors (`posts.id`) for reading progress (Feature 2) and saved vocabulary (Feature 3).

---

## 📐 Architecture & Architectural Decisions

The following architectural decisions are locked and must be strictly followed:

1. **Database-Native Data Shapes:**
   * Adapt UI components to consume raw database row shapes (`id`, `position`, `body`, `topic`, etc.).
   * **Do NOT** map database rows back to the legacy shape `{ n, t }`. (A compatibility shim would need to be unpicked in Feature 2, which needs the real `posts.id` — a `bigint` identity column, not a UUID — as a foreign key anchor).

2. **Single-Fetch Dictionary Strategy:**
   * Fetch the entire dictionary table (`dictionary_entries`) once per session upon user auth restoration.
   * *Rationale:* 117 rows is lightweight and keeps `Reader.jsx` synchronous and fast. Revisit at ~5,000 rows (~40 posts) and switch to `.in('term', tokensInThisPost)`.

3. **Centralized Data Access Layer:**
   * All Supabase content queries must live in `src/lib/content.js`.
   * Application state remains in `App.jsx` (the existing state hub). No new state management dependencies are required.

---

## ⚠️ Known Traps & Edge Cases

* **Unauthenticated Query Failures (RLS):**
  * The `anon` role has **zero SELECT grants** on content tables (`rls_policies.sql:12-20`).
  * Executing a query before the user auth session is restored returns a database **ERROR**, not an empty list.
  * **Rule:** Content fetching **must** depend on `user` / `authReady` state, never on component mount (`useEffect([])`).
* **Level Access Gating:**
  * `posts_select_unlocked` RLS policy requires `published_at IS NOT NULL` AND level access.
  * Level 2 (`b1-momentum`) is seeded as an empty shell, so querying it legitimately returns `[]`.
* **Hardcoded Magic Numbers** *(resolved in C2, 2026-08-17 — kept as a guard):*
  * The total post count (`10`) used to be hardcoded in five places: `App.jsx:280`, `Dashboard.jsx:22`, `:110`, `:121`, and `FinishModal.jsx:50`. C2 replaced all five with `levels.post_count`, threaded from `content.levels` as a `postCount` prop.
  * `grep -rn "of 10\|all 10\|10 - doneCount" src/components/` returns nothing, and `pctLabel` divides by `postCount` rather than a literal.
  * **Rule:** the count belongs to the level row. A new literal `10` in a count, a percentage or an unlock line is a regression — and it will look correct, because the seeded level genuinely holds 10 posts. Change `levels.post_count` in the database and reload to tell the difference.
* **Data Seed Artifacts:**
  * Fixing the body lookup (`Reader.jsx:31`) fixes the structure, not mismatched post prose. The seed faithfully copied `data.js`'s 2-body alternation pattern for posts 3–10. Correcting prose is Feature 7 (performed via an SQL `UPDATE`, not a code edit).
* **The Seed Data Hides Wiring Mistakes** (verified against the live database, 2026-08-17):
  * `posts.id` and `posts.position` are **both `1..10`**, so code that confuses the two renders correctly anyway. Neither the screen nor a snapshot test can tell them apart on this data.
  * Every post's `topic` is `'Alltag'`, so C4's `${level.cefr} · ${post.topic}` renders byte-identical to the hardcoded `B1 · Alltag` it replaces.
  * **Rule:** no Stage C task is verified by looking at the screen. Each is verified by changing a value in the database, reloading, watching the screen follow, and reverting. See the acceptance criteria in `.claude/specs/5-stage-c-content-on-screen.md`.
* **A Freshly Issued Token Is Briefly Unusable (`PGRST303`)** *(found after Stage E shipped, 2026-08-18):*
  * PostgREST rejects a token whose `iat` is ahead of its own clock, with `PGRST303` "JWT issued at future". The service that mints the token and the service that validates it do not share a clock to the millisecond, so a token is unusable for a moment after it is issued — which is exactly when the library is requested, because signing in is what triggers the fetch.
  * It presented as the error screen on **every** sign-in, cured by pressing Retry. The edge logs showed the giveaway: two requests sent in the same millisecond, one `200` and one `401`, validated against instances whose clocks differ.
  * `rows()` (`src/lib/content.js:36`) therefore waits `SKEW_WAIT_MS` and asks once more, but **only** for `PGRST303`. It takes a builder-returning function rather than a builder, because a retry has to issue a fresh request.
  * **Rule:** do not generalise that retry to other error codes. A revoked grant or an offline network must still reach the error screen immediately rather than being sat on for a second and a half first. Covered by three cases in `tests/content.test.js`.
  * **Not catchable by the tests:** they stub the database, so no token is ever validated. The cause came from the browser console, forwarded into the `npm run dev` output.
* **`content.postsByLevel`, not `content.posts`:**
  * `loadContent()` returns `{ levels, postsByLevel, dictionary }` — posts keyed by level id, chosen in B1 so an empty level is distinguishable from a withheld one. There is no flat `content.posts`. Select a level first, then read its posts.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: Prove Data Accessibility (Pre-UI Verification)

- [x] **A1. Create Content API Module**
  * **File:** `src/lib/content.js`
  * **Functions to implement:**
    * `fetchLevels()` → Returns `levels`, ordered by `position`.
    * `fetchPosts(levelId)` → Returns `posts` for a level, ordered by `position`.
    * `fetchDictionary()` → Returns all `dictionary_entries`.
  * **Verification:** Invoke these functions inside a temporary `useEffect` in `App.jsx` and log the result counts.
  * **Done when:** Signed in console shows `levels: 2, posts: 10, dictionary: 117`; signed out, no query runs at all.

- [x] **A2. Verify Level Gate Security (RLS Enforcement)**
  * **Action:** Insert one published post into `b1-momentum` (level 2) via Supabase/SQL, reload client, and check if the client can read it.
  * **Expected Result:** Client MUST NOT be able to read it (`fetchPosts(level2Id)` returns `[]`).
  * **Cleanup:** Delete the inserted row.
  * **Done when:** `fetchPosts(level2Id)` returns `[]` while a published row demonstrably exists in the table.
  * **STOP CONDITION:** 🛑 *If A2 fails, STOP immediately. Do not proceed until RLS holds.*

---

### Stage B: Integrate Data into React State Layer

- [x] **B1. Implement Content State & Lifecycle Machine in `App.jsx`**
  * **State Schema:**
    * `content` = `null` | `{ levels, postsByLevel, dictionary }` — the shape `loadContent()` already returns (`src/lib/content.js:112`). `postsByLevel` is keyed by level id rather than a flat `posts` array so that an empty result can be told apart from a withheld one by comparing its length against `levels.post_count`.
    * `contentStatus` = `'idle'` | `'loading'` | `'ready'` | `'error'`
  * **Lifecycle Behavior:**
    * Trigger fetch when `user` transitions to non-null.
    * Clear content on `SIGNED_OUT`.
  * **Already done in A1:** the fetch effect (`App.jsx:155-183`) triggers on `userId` and clears on sign-out.
  * **Closed gap:** `App.jsx:96` sets `user` for *every* auth event, `PASSWORD_RECOVERY` included, so a recovery link used to fetch the whole library. The effect is now gated on `!userId || recovering`, where `recovering` is seeded from the URL — the session arrives before the `PASSWORD_RECOVERY` event does, so a flag set in that branch (`App.jsx:102`) would be too late.
  * **Done when:** Signing out and back in refetches content, and the `PASSWORD_RECOVERY` branch fetches nothing. *Covered by `tests/content-lifecycle.test.jsx`; the gate was mutation-checked by removing it and confirming both recovery cases fail.*

- [x] **B2. Shape Dictionary Data Structure**
  * **Transformation:** Convert raw dictionary array into a JavaScript `Map` keyed by `term` (`src/lib/content.js:104`). The compiled-in `DICT` was wrapped in a `Map` too (`Reader.jsx:10`, *gone* — deleted in E1) so the fallback path cannot answer for inherited names either.
  * *Rationale for a `Map` over a plain object:* a plain object inherits `Object.prototype`, so a word that cleans to `constructor`, `toString` or `valueOf` looks up to a function — truthy, and rendered as if it were a translation. A `Map` has no inherited keys.
  * **Component Update (`Reader.jsx:27`):**
    * Old: `DICT[c.toLowerCase()] || '-'`
    * New: `dict.get(c.toLowerCase()) ?? '-'`
  * **Fallback while `content` is `null`:** `Reader` keeps the bundled `DICT` as its fallback for the in-flight and failed cases, so Stage B stays visually identical to today. The bundle is retired in E1, not here. (Post *bodies* still come from `TEXTS` until C3 regardless — after this task the reader is deliberately half-wired: bundled prose, database translations.)
  * **Done when:** A one-line unit test asserts `dict.get('herausforderung') === 'challenge'`.

---

### Stage C: Switch Components to Database Data

> **Ships as one commit.** C1–C6 are listed separately for review, not for landing separately. The original split (C1+C2, then C3+C4) does not work: C1 hands `Reader` a database row while `Reader` still does `TEXTS[post.t]`, and a database row has no `.t` — `TEXTS[undefined]` crashes the reader. There is no intermediate state in which the app works.

- [x] **C1. Update Dashboard to Render Database Posts**
  * **Target Files:** `src/components/Dashboard.jsx` & `src/App.jsx`
  * **Select the level first.** There is no `content.posts` (see Known Traps). In `App.jsx`, derive `level = content?.levels?.[0] ?? null` and `posts = level ? content.postsByLevel[level.id] ?? [] : []`, and pass both down. The first level by position is the only level the dashboard shows; real progression is Feature 2.
  * **Refactor Mappings:**
    * `POSTS.map` → `posts.map` (prop, not import)
    * `key={p.n}` → `key={p.id}`
    * `completed.includes(p.n)` → `completed.includes(p.id)`
    * `Post {p.n}` → `Post {p.position}`
    * `openPost(p.n)` → `openPost(p.id)`
  * **App.jsx Refactor:**
    * Rename `active` → `activePostId` (and `setActive` → `setActivePostId`); change its initial value from `8` to `null` — it holds a `posts.id` now, and nothing is open until a card is clicked.
    * Remove fallback `|| POSTS[0]` at `App.jsx:278` (*gone*; the unfallback'd lookup is now `App.jsx:294`) (a missing post is now a real error, not a default fallback).
  * **Done when:** All 10 cards render with correct titles and blurbs; changing a blurb in the DB updates the dashboard on reload without a rebuild; and opening the 8th card opens *Die Wohnungssuche* (proving an id, not a position, was passed — the two coincide in the seed).

- [x] **C2. De-hardcode Dynamic Post Counts**
  * **Action:** Thread `levels.post_count` through from `content.levels` to:
    * `App.jsx:280`
    * `Dashboard.jsx:22`
    * `Dashboard.jsx:110`
    * `Dashboard.jsx:121`
    * `FinishModal.jsx:50`
  * Guard the division: `post_count` is `0` for a level with no posts, so `pctLabel` must not divide by zero.
  * **Done when:** No hardcoded post count remains in `src/components/`, and setting `post_count` to `9` in the database makes the UI display `9` everywhere consistently — including the recalculated percentage and progress bar.

- [x] **C2b. De-hardcode Level Labels**
  * **Added 2026-08-17** (spec Goal 3). Not in the original roadmap, but the same class of content as the counts beside it, and it would otherwise survive E1 unnoticed.
  * **Target File:** `src/components/Dashboard.jsx`
  * `B1 · Level 1` (`Dashboard.jsx:61`) → `${level.cefr} · Level ${level.position}`
  * `Level 1: B1 Foundation` (`Dashboard.jsx:122`) → `Level ${level.position}: ${level.name}`
  * `"Guten Tag, Anna."` stays — that is Feature 4.
  * **Done when:** Renaming the level in the database changes both labels on reload.

- [x] **C3. Refactor Reader to Read Database Post Bodies**
  * **Target File:** `src/components/Reader.jsx`
  * **Refactor:**
    * Delete `TEXTS[post.t]` static lookup (`Reader.jsx:36`, *gone*; the body is read at `Reader.jsx:31`).
    * Read `post.body` directly, splitting on `\n\n` as before. (`supabase/README.md` confirms `posts.body` stores paragraphs blank-line separated.)
    * `post.n` → `post.position` at `Reader.jsx:96` and `:120`. Keeping the saved-word label as `'Post ' + post.position + ': ' + post.title` preserves `VocabBank`'s grouping.
  * The bundled `DICT` fallback (`Reader.jsx:10`, *gone*) **stayed** until E1, per B2. Note it becomes unreachable once C5 gates rendering on a loaded library, so E1 is then a pure deletion.
  * **Done when:** Editing a post's body in the database changes what the reader shows after a reload, with no code change.

- [x] **C4. Refactor Reader Header Metadata**
  * **Target File:** `src/components/Reader.jsx`
  * **Refactor:**
    * Change hardcoded `"B1 · Alltag"` (`Reader.jsx:117`) to `${level.cefr} · ${post.topic}`. Requires threading `level` into `Reader`.
  * **Done when:** Changing `posts.topic` in the database changes the eyebrow text dynamically. *This cannot be verified any other way* — every seeded topic is `Alltag`, so the output is identical before and after.

- [x] **C5. Loading Indication** *(moved forward from D1, 2026-08-17)*
  * **Why here:** once the bundled fallback stops being rendered, a signed-in reader has no posts between sign-in and the library arriving. Leaving that gap unhandled means shipping a visibly empty dashboard.
  * **Action:** while a signed-in, non-recovering reader has `contentStatus` of `'idle'` or `'loading'`, show a loading indication instead of the dashboard. `contentStatus` already exists from B1 and is currently unread — this is its first reader, so drop its `eslint-disable-next-line no-unused-vars`.
  * Shows on sign-in **and** on every reload of a stored session; that is accepted.
  * Must not fire for `PASSWORD_RECOVERY` — the existing `recovering` gate already prevents the fetch, and the indication must not appear either.
  * **Done when:** Signing in shows a loading indication before the dashboard, the dashboard is never painted without its posts, and a recovery link shows the reset screen with no indication at all.

- [x] **C6. Error State with Retry** *(moved forward from D1, 2026-08-17)*
  * **Action:** when `contentStatus` is `'error'`, render a **generic** message that the library could not be loaded, plus a working **Retry** control that re-attempts the fetch without a page reload.
  * Generic by decision — it does not distinguish offline from any other cause.
  * Only reachable at sign-in or reload; a mid-reading failure is out of scope, since the library is fetched once before anything renders and never re-requested while reading.
  * Do **not** gate the blank/loading screen on `contentStatus !== 'ready'` — that turns a failure into a permanently dead screen. Gate loading on `'idle' | 'loading'` and give `'error'` its own screen.
  * **Done when:** Signing in with the network disabled shows the generic message and never a blank screen, empty dashboard, or uncaught crash; and Retry, once the network is restored, loads the library and shows the dashboard with no page reload.

---

### Stage D: Empty States *(complete — mostly absorbed into Stage C)*

> **Mostly absorbed into Stage C on 2026-08-17.** `loading` and `error` moved to C5 and C6, because removing the bundled fallback in Stage C creates the gap they cover — shipping C without them means shipping a visibly empty dashboard. The empty case stayed here and shipped separately; the stage is now closed.

- [x] **D1. Empty Level State** *(deferral lifted and shipped, 2026-08-17)*
  * **State:** `empty` — a level that holds no posts should say so (e.g. `"No posts in this level yet"`) rather than showing an empty grid.
  * **Behaviour shipped:** `Dashboard.jsx` derives `isEmpty = posts.length === 0` and, when set, replaces the grid with a card-styled panel reading *"No posts in this level yet."* It also **drops the progress claims** — the `— N of M posts completed` clause, the percentage, the progress bar and the unlock line — rather than rendering them as zero. See `.claude/specs/6-stage-d-empty-states.md`.
  * **Why the deferral was lifted:** the original note said the state was unreachable because nothing navigates to level 2. The first half holds — `App.jsx:285` still hardcodes `content.levels[0]` and level switching does not exist. But level 1's *posts* can be unpublished: `private.has_level_access` returns true unconditionally for `position <= 1` (`20260810103130_rls_policies.sql:62`), while `posts_select_unlocked` also demands `published_at is not null` (`:106`). Setting them null withholds every post from a level that still reports `post_count: 10`, which is exactly this state — reachable and revertible with one `UPDATE`.
  * **Why it mattered more than an empty grid:** `postCount` comes from `level.post_count`, not `posts.length` (`App.jsx:289`), so the unfixed screen asserted ten posts existed while showing none.
  * **Trap for level switching:** `posts.length === 0` means *absent or unpublished* only because the shown level is never access-gated. A **locked** level reports a post count while handing over nothing, and "none yet" would be a lie about it. Whichever feature makes a second level reachable must tell the two apart — see the comment above `isEmpty` in `Dashboard.jsx`.
  * **Done when:** A reachable level holding no posts shows the empty message instead of an empty grid. *Met: six cases in `tests/content-lifecycle.test.jsx` (`emptyLevel()` fixture, `post_count: 10` against zero posts), mutation-checked by forcing `isEmpty = false` — three fail. Confirmed in a running build: with level 1 unpublished, `<main>` held only the greeting, `Level 1: B1 Foundation`, and the message; republishing restored all ten cards and the full progress header.*

---

### Stage E: Cleanup, Tests, & Documentation Update

- [x] **E1. Delete Legacy Static Data File**
  * **Action:** Delete `src/data.js`.
  * **Done when:** Running `grep -rn "TEXTS\|DICT\|POSTS" src/` returns zero occurrences and `npm run build` passes.

- [x] **E2. Implement Tests & Mocks**
  * **Helper:** Create a Supabase query-builder mock in `tests/helpers/` (a thenable supporting `from().select().eq().order()`).
  * **Tests to cover:**
    * Dictionary lookup hit and miss.
    * Dashboard rendering from fetched posts.
    * Error handling on failed fetch.
  * **Done when:** `npm test` passes, and tests fail if field mappings are intentionally broken.

- [x] **E3. Update Supabase Documentation** *(landed with commit `a6986aa`, not the cleanup commit)*
  * **File:** `supabase/README.md`
  * **Action:** Update opening line (`"The React app does not talk to any of this yet"`) to accurately reflect live database reads.
  * **Done when:** `supabase/README.md` accurately describes actual application behavior. *Met: the opening now describes the live reads, and `grep -n "does not talk" supabase/README.md` is empty. One further inaccuracy was found and corrected during the D1 pass — the `level_progress` bullet claimed the dashboard renders from that view, but `grep -rn "level_progress" src/` returns nothing; counts come from `levels.post_count` and local `useState`.*

---

## 📦 Suggested Commit Breakdown

Implement changes in 5 atomic, independently working commits:

1. `feat(content): add fetch API in src/lib/content.js and verify RLS policies` (`A1`, `A2`) ✅
2. `feat(state): integrate database content state and dictionary map into App` (`B1`, `B2`) ✅
3. `refactor(content): render dashboard and reader from the database` (`C1`, `C2`, `C2b`, `C3`, `C4`, `C5`, `C6`) ✅
4. `feat(content): tell the reader when a level has no posts` (`D1`) — *on `feature/6-stage-d-empty-states`, not yet committed*
5. `chore(content): purge src/data.js and cover database rendering with tests` (`E1`, `E2`)

**Revised 2026-08-17.** The original plan split Stage C across two commits — dashboard first, reader second. That does not work: after the dashboard commit, `App` hands `Reader` a database row while `Reader` still looks up prose as `TEXTS[post.t]`, and a database row has no `.t`. The reader would crash on every post. Since the roadmap promises independently *working* commits, Stage C is indivisible and lands as one.

**Revised again 2026-08-17, after D1 shipped.** `loading` and `error` went into commit 3 as planned. `D1` gained its own commit rather than being dropped: the deferral was lifted once the empty state turned out to be reachable on level 1 (see Stage D). `E3` left commit 5 — commit `a6986aa` already brought `supabase/README.md` up to date, so the documentation task was satisfied there rather than in the cleanup commit.

---

## 🔮 Subsequent Roadmap Context

* **Feature 2 — Persist Reading Progress (`reading_sessions` → `reading_progress`):**
  * Retires hardcoded `useState([1, 2, 3, 4, 5, 6, 7])` at `App.jsx:48`. Depends on `posts.id` established in Feature 1.
* **Feature 3 — Persist Vocabulary Bank (`saved_words`):**
  * Retires hardcoded words at `App.jsx:50-54`, which key saved words to the display string `'Post 1: Der Alltag in Berlin'` rather than to a `post_id`.
* **Feature 4 — Real Profile (`display_name`, `theme`):**
  * Retires hardcoded `"Guten Tag, Anna."` at `Dashboard.jsx:120`.