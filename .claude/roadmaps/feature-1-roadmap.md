# Feature 1 Implementation Roadmap: Wire Content Reads to the Database

> **Agent Goal:** Replace static imports from `src/data.js` (`TEXTS`, `DICT`, `POSTS`) with live Supabase database queries against `public.posts`, `public.levels`, and `public.dictionary_entries`.

> **Line references** in this document were last refreshed after Stage B. They shift constantly — the password-reset work moved every `App.jsx` reference by ~40 lines, and Stage B itself moved them again by ~20 within a single session — so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

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
* **Hardcoded Magic Numbers:**
  * The total post count (`10`) is hardcoded in five locations:
    * `App.jsx:280`
    * `Dashboard.jsx:22`
    * `Dashboard.jsx:110`
    * `Dashboard.jsx:121`
    * `FinishModal.jsx:50`
* **Data Seed Artifacts:**
  * Fixing `Reader.jsx:36` fixes the structural lookup, not mismatched post prose. The seed faithfully copied `data.js`'s 2-body alternation pattern for posts 3–10. Correcting prose is Feature 7 (performed via an SQL `UPDATE`, not a code edit).

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
    * `content` = `null` | `{ levels, postsByLevel, dictionary }` — the shape `loadContent()` already returns (`src/lib/content.js:86`). `postsByLevel` is keyed by level id rather than a flat `posts` array so that an empty result can be told apart from a withheld one by comparing its length against `levels.post_count`.
    * `contentStatus` = `'idle'` | `'loading'` | `'ready'` | `'error'`
  * **Lifecycle Behavior:**
    * Trigger fetch when `user` transitions to non-null.
    * Clear content on `SIGNED_OUT`.
  * **Already done in A1:** the fetch effect (`App.jsx:150-180`) triggers on `userId` and clears on sign-out.
  * **Closed gap:** `App.jsx:91` sets `user` for *every* auth event, `PASSWORD_RECOVERY` included, so a recovery link used to fetch the whole library. The effect is now gated on `!userId || recovering`, where `recovering` is seeded from the URL — the session arrives before the `PASSWORD_RECOVERY` event does, so a flag set in that branch (`App.jsx:97`) would be too late.
  * **Done when:** Signing out and back in refetches content, and the `PASSWORD_RECOVERY` branch fetches nothing. *Covered by `tests/content-lifecycle.test.jsx`; the gate was mutation-checked by removing it and confirming both recovery cases fail.*

- [x] **B2. Shape Dictionary Data Structure**
  * **Transformation:** Convert raw dictionary array into a JavaScript `Map` keyed by `term` (`src/lib/content.js:72`). The compiled-in `DICT` is wrapped in a `Map` too (`Reader.jsx:10`) so the fallback path cannot answer for inherited names either.
  * *Rationale for a `Map` over a plain object:* a plain object inherits `Object.prototype`, so a word that cleans to `constructor`, `toString` or `valueOf` looks up to a function — truthy, and rendered as if it were a translation. A `Map` has no inherited keys.
  * **Component Update (`Reader.jsx:43`):**
    * Old: `DICT[c.toLowerCase()] || '-'`
    * New: `dict.get(c.toLowerCase()) ?? '-'`
  * **Fallback while `content` is `null`:** `Reader` keeps the bundled `DICT` as its fallback for the in-flight and failed cases, so Stage B stays visually identical to today. The bundle is retired in E1, not here. (Post *bodies* still come from `TEXTS` until C3 regardless — after this task the reader is deliberately half-wired: bundled prose, database translations.)
  * **Done when:** A one-line unit test asserts `dict.get('herausforderung') === 'challenge'`.

---

### Stage C: Switch Components to Database Data

- [ ] **C1. Update Dashboard to Render Database Posts**
  * **Target Files:** `src/components/Dashboard.jsx` & `src/App.jsx`
  * **Refactor Mappings:**
    * `POSTS.map` → `content.posts.map`
    * `p.n` → `p.position`
    * `openPost(p.n)` → `openPost(p.id)`
  * **App.jsx Refactor:**
    * Rename `active` state variable to `activePostId`.
    * Remove fallback `|| POSTS[0]` at `App.jsx:278` (a missing post is now a real error, not a default fallback).
  * **Done when:** All 10 cards render with correct titles and blurbs, and changing a blurb in the DB updates the dashboard on reload without a rebuild.

- [ ] **C2. De-hardcode Dynamic Post Counts**
  * **Action:** Thread `levels.post_count` through from `content.levels` to:
    * `App.jsx:280`
    * `Dashboard.jsx:22`
    * `Dashboard.jsx:110`
    * `Dashboard.jsx:121`
    * `FinishModal.jsx:50`
  * **Done when:** No hardcoded post count remains in `src/components/`, and setting `post_count` to `9` in the database makes the UI display `9` everywhere consistently.

- [ ] **C3. Refactor Reader to Read Database Post Bodies**
  * **Target File:** `src/components/Reader.jsx`
  * **Refactor:**
    * Delete `TEXTS[post.t]` static lookup (`Reader.jsx:36`).
    * Read `post.body` directly, splitting on `\n\n` as before.
  * **Done when:** Editing a post's body in the database changes what the reader shows after a reload, with no code change.

- [ ] **C4. Refactor Reader Header Metadata**
  * **Target File:** `src/components/Reader.jsx`
  * **Refactor:**
    * Change hardcoded `"B1 - Alltag"` (`Reader.jsx:121`) to `${level.cefr} - ${post.topic}`.
  * **Done when:** Changing `posts.topic` in the database changes the eyebrow text dynamically.

---

### Stage D: Make Network Failure & Loading Visible

- [ ] **D1. Implement UI Network States**
  * **Required States for Content-Dependent Screens:**
    * `loading`: Follow the `authReady` blank-background pattern at `App.jsx:284`. The `contentStatus` machine it needs (`'idle' | 'loading' | 'ready' | 'error'`) already exists from B1 and is currently unread.
    * `error`: Render a user-friendly error message with a working **Retry** button.
    * `empty`: Handle empty levels gracefully (e.g., `"No posts in this level yet"` for locked/empty levels).
  * **Done when:** Killing network connection in DevTools and signing in produces a readable error message with a working Retry button (never a white screen or uncaught crash).

---

### Stage E: Cleanup, Tests, & Documentation Update

- [ ] **E1. Delete Legacy Static Data File**
  * **Action:** Delete `src/data.js`.
  * **Done when:** Running `grep -rn "TEXTS\|DICT\|POSTS" src/` returns zero occurrences and `npm run build` passes.

- [ ] **E2. Implement Tests & Mocks**
  * **Helper:** Create a Supabase query-builder mock in `tests/helpers/` (a thenable supporting `from().select().eq().order()`).
  * **Tests to cover:**
    * Dictionary lookup hit and miss.
    * Dashboard rendering from fetched posts.
    * Error handling on failed fetch.
  * **Done when:** `npm test` passes, and tests fail if field mappings are intentionally broken.

- [ ] **E3. Update Supabase Documentation**
  * **File:** `supabase/README.md`
  * **Action:** Update opening line (`"The React app does not talk to any of this yet"`) to accurately reflect live database reads.
  * **Done when:** `supabase/README.md` accurately describes actual application behavior.

---

## 📦 Suggested Commit Breakdown

Implement changes in 5 atomic, independently working commits:

1. `feat(content): add fetch API in src/lib/content.js and verify RLS policies` (`A1`, `A2`)
2. `feat(state): integrate database content state and dictionary map into App` (`B1`, `B2`)
3. `refactor(dashboard): wire database posts and dynamic post counts` (`C1`, `C2`)
4. `refactor(reader): render post body and topic metadata from database` (`C3`, `C4`)
5. `fix(ui): add loading/error/empty network states and purge src/data.js` (`D1`, `E1`, `E2`, `E3`)

---

## 🔮 Subsequent Roadmap Context

* **Feature 2 — Persist Reading Progress (`reading_sessions` → `reading_progress`):**
  * Retires hardcoded `useState([1,2,3,4,5,6,7])` at `App.jsx:43`. Depends on `posts.id` established in Feature 1.
* **Feature 3 — Persist Vocabulary Bank (`saved_words`):**
  * Retires hardcoded words at `App.jsx:45-49`, which key saved words to the display string `'Post 1: Der Alltag in Berlin'` rather than to a `post_id`.
* **Feature 4 — Real Profile (`display_name`, `theme`):**
  * Retires hardcoded `"Guten Tag, Anna."` at `Dashboard.jsx:108`.