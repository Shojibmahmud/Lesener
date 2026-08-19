# Feature 3 Implementation Roadmap: Persist the Vocabulary Bank

> **Agent Goal:** Replace the three hardcoded saved words (`App.jsx:60-64`) and the `useState`-only save/remove handlers (`App.jsx:285-291`) with rows in `public.saved_words` — written when a reader taps **+** in the Reader, deleted when they tap 🗑 in the bank, and read back with the library on every load.

> **Line references** in this document were last refreshed on 2026-08-19, before any of it was built. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

> **Spec:** `.claude/specs/9-vocabulary-bank.md` — spec 9 for roadmap Feature 3; the two numbering sequences diverged at spec 2. The spec is authoritative on observable behaviour; this roadmap is authoritative on how that behaviour gets built.

> **Reconciled with the spec on 2026-08-19.** The spec interview settled two questions this roadmap had already answered differently, and the roadmap was wrong on both. **Orphaned words:** C5 originally herded every word whose post had gone into one bucket headed *"From a post that is no longer available"*, sorted last. The spec keeps each word under its own post's title — which means that title has to be stored on the word, since a post that is gone cannot be looked up. That added `post_label` to A1 and rewrote Decision 2, Trap 5, B1 and C5. **Failed writes:** this roadmap had them fail silently; the spec requires the reader be told. That added the second bullet of Decision 3 and a new C7, moving the human check to C8. Nothing else changed.

---

## 📌 Context & Motivation

* **Goal:** Make the vocabulary bank real. Saving a word writes a `saved_words` row; the trash icon deletes it; the bank, the Reader's `savedSet` and the dashboard's **Saved** count all read the table.
* **Why:** `public.saved_words` has existed since `20260810103010_init_user_schema.sql:136-151` and **holds zero rows** — verified against the live database on 2026-08-19. It is the last table in the schema the app has never touched, and the only one carrying `select, insert, update, delete` for `authenticated` (`rls_policies.sql:29`). Everything on screen today comes from a literal: three words, all attributed to `'Post 1: Der Alltag in Berlin'`, identical for every reader, gone on reload, and keyed to a **display string** rather than to a `post_id`. Feature 1 established `posts.id` as the anchor; Feature 2 proved the per-user write path. Nothing further is needed in the database except one column.
* **Scope, set deliberately:** persistence of save and delete, and nothing more. The bank keeps the shape it has today — grouped by post, term, translation, delete. No new reader-facing capability.

---

## 📐 Architecture & Architectural Decisions

The following are locked and must not be revisited mid-build:

1. **The word is stored as tapped.**
   * A new `saved_words.surface_form` column holds `clean(raw)` exactly as it appeared in the prose; `term` stays the lowercase key that `unique (user_id, term)` and the dictionary lookup depend on. The bank renders `surface_form`, so no capitalisation logic exists anywhere in the client.
   * *Rationale:* German capitalises every noun in running text, so the surface form is already correct for nouns and for any non-noun tapped mid-sentence. It cost nothing and needs no linguistic data.
   * *Consequence, measured and accepted (see Trap 1):* a word tapped as the **first word of a sentence** banks with a capital it should not have.

2. **The post heading is resolved live, with a stored fallback.** *(Rewritten 2026-08-19 to match the spec.)*
   * `saved_words` carries `post_id` **and** `post_label` — the heading as it read when the word was saved. `App` looks the post up in `content.postsByLevel`, already loaded and already holding `position` and `title`, and renders `Post N: Title` from it. Only when that lookup finds nothing does the bank fall back to the word's stored `post_label`.
   * *Why both:* the live lookup keeps the bank current, so correcting a post's title reaches the bank on the next load. The stored copy is the only thing that can still name a post which has been removed or unpublished, because such a post is not in the library to be looked up.
   * **This is not the coupling Features 1 and 2 removed.** The retired literal keyed a saved word to the display string `'Post 1: Der Alltag in Berlin'` — the string *was* the identity, which is why re-titling a post orphaned its words. Here `post_id` remains the identity and drives the grouping; `post_label` is a snapshot read only when that id resolves to nothing.
   * *Rejected:* embedding `posts(position, title)` in the select. The embedded row is filtered by `posts_select_unlocked`, so an unpublished or locked post comes back **null** — which is exactly the case the stored copy exists to answer (Trap 5).

3. **Await the write, then update state — and say so when it fails.**
   * Mirrors Feature 2's Decision 7: a failed write must not claim success. A word enters the sidebar and the bank only once its row is in; a failed delete leaves the word where it is.
   * **And the reader is told.** *(Added 2026-08-19 from the spec.)* Silence leaves a failure indistinguishable from a mis-tap, so a save that does not land shows a brief message in the reader and a delete that does not land shows one in the bank — following the wording already in use for progress at `FinishModal.jsx:53`. Each clears on the next successful write of its kind and when the reader leaves the post or the bank; neither survives a reload, and neither is stored.
   * *Consequence, accepted:* a brief pause on tapping **+**. Preferred over Feature 2's Decision 5 optimism here, because a word that appears and then vanishes is exactly what Decision 7 was written to prevent.

4. **A delete must check what it deleted, not just that it did not error.**
   * `saved_words_delete_own` (`rls_policies.sql:167`) is a `using` clause: a row belonging to someone else is **filtered out**, not rejected. The statement succeeds having removed nothing. So `deleteSavedWord` uses `.delete().eq('id', id).select()` and treats an empty result as a failure. Same reasoning for the insert, which uses `.select().single()` so the new row's `id` comes back for the eventual delete.

5. **All vocabulary queries live in `src/lib/vocab.js`**, mirroring `content.js` and `progress.js`, and go through the shared `rows()` helper (`src/lib/query.js:28`) so the `PGRST303` clock-skew retry covers them too. Application state stays in `App.jsx`. No new state-management dependency.

6. **`saved` holds raw rows, not a display shape.**
   * `App` keeps `{ id, post_id, term, surface_form, translation }`. `Reader` derives its `savedSet` from `term` — already lowercase, so the `.toLowerCase()` at `Reader.jsx:16` goes away. `VocabBank` receives the rows plus a `post_id → heading` map and groups on the id.

7. **A missing translation is stored as `null`, never as `'—'`.**
   * `Reader.jsx:27` substitutes an em dash for display; the column is nullable *for that reason* (`init_user_schema.sql:133`). Storing the dash would make an absent translation indistinguishable from a real one, and would put a character into the database that no dictionary row contains.

8. **`saved` is cleared with the rest of the per-reader state.** It joins `content`, `completed` and `selectedLevelId` in the content effect's reset (`App.jsx:166-171`). Read as part of persisting correctly, not as an addition: without it, one reader's words sit on screen and in the **Saved** count while the next signs in.

---

## ⚠️ Known Traps & Edge Cases

* **1. Eight words in the seeded prose bank with the wrong capital.**
  * Measured over both distinct post bodies on 2026-08-19: of 117 distinct cleaned words, **8 are capitalised only because they open a sentence and never appear lowercase anywhere** — *berlin, jeden, jetzt, man, manchmal, nach, viele, wir*. None is a noun. Tapping one from its sentence-initial occurrence banks *"Jeden"*, *"Wir"*, *"Man"*.
  * Six more (*am, das, der, die, eine, ich*) appear both ways, so tapping them mid-sentence is already correct.
  * **Rule:** this is Decision 1 working as designed, not a bug to patch in the client. Any fix belongs in the dictionary (see Deferred), never in a capitalisation heuristic — `u-bahn` (dictionary id 7) proves mechanical capitalisation wrong, rendering *"U-bahn"* for *"U-Bahn"*.
* **2. `term` must be the lowercase key, never the tapped form.**
  * `check (term = lower(term))` (`init_user_schema.sql:142`). Sending `term: 'Herausforderung'` fails with `23514` every time.
  * **Rule:** `term` and `surface_form` are two different values that happen to coincide for lowercase words. A1 adds a constraint that makes disagreement impossible; B2 proves the refusal.
* **3. Uniqueness is global per reader, not per post.**
  * `unique (user_id, term)` (`:145`), matching `Reader.jsx:16`'s `savedSet`, which spans every post and refuses to bank a word twice. So the UI already agrees with the constraint and `23505` is only reachable from two tabs racing.
  * **The first spelling wins.** *(Added 2026-08-19 — spec Assumption 1.)* The row is written once and never updated, so whichever `surface_form` landed first is what the bank shows forever. Tapping *Herausforderung* at the start of a sentence and then *herausforderung* mid-sentence banks the capitalised one; the second tap shows ✓ and changes nothing. This interacts with Trap 1: a sentence-opening non-noun saved first keeps its wrong capital even after the reader meets it lowercase.
  * **Rule:** do not "fix" this by scoping uniqueness to the post, and do not add an update-on-resave to "correct" the spelling. The refusal is the intended behaviour and the sidebar's ✓ depends on it.
* **4. A cross-reader delete succeeds and deletes nothing.**
  * `saved_words_delete_own` filters rather than raises (`rls_policies.sql:167-169`). This is why Decision 4 exists, and why B4 reads the row count back rather than checking for an error.
  * **Rule:** never treat "no error" as "deleted".
* **5. A word can outlive the post it was met in.**
  * `post_id ... on delete set null` (`init_user_schema.sql:139`), so a deleted post leaves the word with a null `post_id`. Separately, an **unpublished** post vanishes from `postsByLevel` — Feature 1's D1 did exactly this to reach the empty-level state — so a perfectly valid word can have a `post_id` that resolves to nothing.
  * **Rule:** *(rewritten 2026-08-19)* neither is an error state and neither costs the word its heading — the stored `post_label` (Decision 2) answers for both. What must **not** happen is the word vanishing from the bank, or being herded into a separate "unavailable" section: an earlier draft of this roadmap specified exactly that, and the spec rejected it. Such a group renders like any other.
* **6. `saved_words.session_id` cannot be filled.**
  * The column references `reading_sessions` (`:140`), but Feature 2's Decision 2 writes a session row only at **Finish** — and words are saved before that. There is no session id to record.
  * **Rule:** leave it null. Filling it would require reversing Feature 2's Decision 2, which is a change to how progress is recorded, not to how words are saved.
* **7. `clean()` strips accents, so some words can never match the dictionary.**
  * `src/utils.js:2` keeps only `A-Za-zÄÖÜäöüß-`. *"Café"* cleans to `"Caf"`, so dictionary id 29 `café` is unreachable and the word banks as `caf` with a null translation.
  * **Rule:** pre-existing and out of scope (see Deferred), but it means **a word with no translation is a normal, reachable case** in the seeded prose — not a hypothetical. Decision 7 has to hold in practice, not just in principle.
* **8. A fresh account will look like a regression.**
  * The dashboard shows **Saved 3** for everyone today. Afterwards a new reader correctly sees **Saved 0** and *"Nothing saved yet"*.
  * **Rule:** that is the feature working. Verify with an account that has saved something. Same shape as Feature 2's Trap 5.
* **9. The seeded ids still hide mistakes.** *(Inherited from Features 1 and 2, re-verified 2026-08-19.)*
  * `posts.id` and `posts.position` are both `1..10`, and posts 1–10 hold only **two distinct bodies alternating**. A word saved from post 3 is indistinguishable on screen from the same word saved from post 1.
  * **Rule:** every fixture uses post ids that are not positions.
* **12. Clearing `saved` on sign-out cannot be observed, and therefore cannot be tested.** *(Found running D2's mutations, 2026-08-19.)*
  * Removing `setSaved([])` from the content effect's reset breaks **no test**, and an afternoon of trying to write one established why rather than that the suite is lazy. Every moment in which one reader's words could be seen by the next is already covered by another screen: `SIGNED_OUT` sets the screen to Landing in the same event, and the next reader sees `ContentLoading` until all three fetches resolve — at which point `setSaved` has run with their own words. The failure path lands on `ContentError`. The bank is unreachable from all three.
  * **Rule:** keep the clearing. It is free, it matches how `content`, `completed` and `selectedLevelId` are already handled, and it is the guard that holds the day somebody makes the dashboard reachable before the library arrives. But do not add a test claiming to cover it, and do not delete it on the grounds that nothing fails — nothing failing is a fact about the screens in front of it, not about whether it is needed.
* **11. An RLS assertion written from the wrong seat proves nothing.** *(Found running Stage B, 2026-08-19.)*
  * The check *"A's saved word survived B's delete"* was first written inside the section impersonating **B**. It returned `0` and failed — not because the row was gone, but because RLS hides A's rows from B either way. Had it been written with `expected = '0'` it would have passed forever while testing nothing at all.
  * **Rule:** an assertion about somebody else's rows must run after `reset role`, as `postgres`. Only the unrestricted seat can tell "the row is gone" apart from "you were never allowed to see it".
* **10. What the tests cannot catch — read this before trusting a green suite.**
  * `tests/helpers/supabase.js:35-48` stubs the database and supports only `select / insert / eq / order`. It has **no `delete()`**, and the lowercase check, the unique index, the `surface_form` constraint and every RLS policy are invisible to it.
  * This is the same blind spot that let `PGRST303` reach the running app with 62 tests green, and that Feature 2's Trap 10 records.
  * **Rule:** Stage B is verified against the real database and nowhere else. Do not substitute a test for it, and do not treat Stage B as done because a test resembling it passes.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: Record What the Bank Must Show

- [x] **A1. Add `surface_form` and `post_label` to `saved_words`**
  * **File:** `supabase/migrations/20260819141500_saved_words_display_fields.sql` (new)
  * **Action:**
    ```sql
    alter table public.saved_words
      add column surface_form text not null,
      add column post_label   text not null,
      add constraint saved_words_surface_form_matches
        check (term = lower(surface_form));
    ```
  * `surface_form` holds `clean(raw)` as it was tapped (Decision 1). `post_label` holds the heading as it read at save time — `Post 1: Der Alltag in Berlin` — and is read only when `post_id` no longer resolves (Decision 2).
  * `not null` on `post_label` is honest rather than merely convenient: a word can only ever be created by tapping it inside a post (spec Assumption 5), so there is no path that produces one without a heading.
  * `post_label` deliberately carries **no** constraint tying it to `post_id`. A post may be renamed or deleted afterwards, and the entire purpose of the column is to go on saying what it said then.
  * `not null` with no default is safe on both **only because the table is empty** — confirmed 0 rows on 2026-08-19. Re-confirm with `select count(*) from public.saved_words` before applying; if it is not zero, the migration needs a backfill instead.
  * The check makes Decision 1's two columns impossible to disagree. It is safe because `clean()` emits a closed alphabet (`A-Za-zÄÖÜäöüß-`) on which Postgres `lower()` and JavaScript `toLowerCase()` agree character for character.
  * **Done when:** `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'saved_words' and column_name in ('surface_form', 'post_label')` returns **two** rows, both reading `NO`, and `insert into public.saved_words (user_id, term, surface_form, post_label) values (<reader>, 'haus', 'Baum', 'Post 1: x')` is refused with `23514`.

---

### Stage B: Prove the Write Path Against the Real Database

> **Landed 2026-08-19, with one deviation.** These were not run as a throwaway probe. `supabase/tests/rls_checks.sql` already existed for exactly this purpose — self-contained, impersonating readers via `request.jwt.claims`, rolled back at the end — so the four proofs were added there instead and are now re-runnable rather than one-off. That file also *had* to be touched: its `saved_words` inserts predate A1's two `not null` columns and would otherwise fail. Stage B therefore does produce a commit, contrary to the plan below; the reasoning that it changes no *application* code still holds.
>
> **All 15 checks pass**, including the four that matter here: the insert round-trips `surface_form` and `post_label`; a mismatched `surface_form` is refused; a duplicate `term` is refused; and B's delete of A's rows removes nothing, raises nothing, and leaves A's row intact.

> **No application code.** Run these as a signed-in test reader — through a temporary `useEffect` probe in `App.jsx` as Features 1 and 2 did, or the Supabase SQL editor — and read results back with SQL, because the client cannot see what RLS hid from it. Trap 10 is why this stage exists at all.

- [x] **B1. Prove an insert with both columns lands**
  * **Action:** Insert one row for a level-1 `post_id` with `term: 'herausforderung'`, `surface_form: 'Herausforderung'`, `translation: 'challenge'`, `post_label: 'Post 1: Der Alltag in Berlin'`.
  * **Done when:** `select term, surface_form, post_label, translation, post_id, session_id, dictionary_entry_id from public.saved_words where user_id = <reader>` returns exactly one row reading `herausforderung` / `Herausforderung` / `Post 1: Der Alltag in Berlin` / `challenge`, with `session_id` and `dictionary_entry_id` both null.

- [x] **B2. Prove the lowercase check refuses the tapped form**
  * **Action:** Attempt an insert with `term: 'Herausforderung'` and `surface_form: 'Herausforderung'`.
  * **Done when:** the insert is refused with `23514` and `select count(*) from public.saved_words where user_id = <reader>` is unchanged from B1.
  * **STOP CONDITION:** 🛑 if it succeeds, the check constraint is not in force — A1 did not apply. Fix that before writing any client code, because every insert this feature makes depends on the two columns being kept honest by the database rather than by the caller.

- [x] **B3. Prove uniqueness is global, not per post**
  * **Action:** Repeat B1's insert with the same `term` but a **different** `post_id`.
  * **Done when:** the insert is refused with `23505`, confirming Trap 3, and the reader still holds exactly one row for that term.

- [x] **B4. Prove a reader can delete their own row and nobody else's**
  * **Action:** As the test reader, delete their B1 row by `id` and read the returned rows. Then attempt to delete a row belonging to a second reader, again reading the returned rows.
  * **Done when:** the first delete returns **one** row and leaves `select count(*) from public.saved_words where user_id = <reader>` at zero; the second returns **zero rows and no error**, and the other reader's row is still present.
  * **STOP CONDITION:** 🛑 if the second delete removes the other reader's row, stop — the bank is unsafe and no client code fixes it.
  * **Cleanup:** delete every row this stage created, and remove the probe before Stage C begins.

---

### Stage C: Wire the Bank to the Database *(indivisible — ships as one commit)*

> **Landed 2026-08-19.** One change of shape along the way: `term` moved from a parameter of `saveWord` into the function itself (see C1). The suite went from 109 tests to 146 across 15 files, with `npm run lint` and `npm run build` clean.

> **Why there is no split here.** Reading saved words from the database while saves still go to `useState` ships a reader who banks a word, reloads, and finds it gone; persisting saves while deletes stay local ships a word that comes back from the dead on the next load. Both are the failure Feature 1's Stage C and Feature 2's Stage B were merged to avoid — a stage must leave the app working, and silently discarding a reader's word does not qualify.

- [x] **C1. Add the vocabulary data layer**
  * **File:** `src/lib/vocab.js` (new)
  * **Action:** Three functions over the shared `rows()` helper (Decision 5):
    * `fetchSavedWords()` → `id, post_id, post_label, term, surface_form, translation`, ordered `created_at` ascending so the bank lists words in the order they were met, matching today's append order.
    * `saveWord({ postId, postLabel, surfaceForm, translation })` → insert with `user_id` from `supabase.auth.getSession()` exactly as `recordFinish` does (`progress.js:34-39`), `.select().single()` to return the new row (Decision 4). `translation` is passed through as `null` when absent (Decision 7).
    * `deleteSavedWord(id)` → `.delete().eq('id', id).select()`, throwing when the result is empty (Decision 4).
  * **Changed during the build, 2026-08-19:** `term` is **derived inside `saveWord`** from `surfaceForm` rather than passed in. As a parameter it was a caller obligation that no test could see — the layer's own tests supply whatever they assert, so an `App` that stopped lowercasing would have gone unnoticed. Derived, mutation (a) is caught.
  * **Done when:** `npm test` passes with a test asserting `saveWord` derives `term` as the lowercase of `surface_form` and sends both, `post_label` as given, `translation: null` when none was passed, and that `deleteSavedWord` **throws** when the stub returns `{ data: [], error: null }`.

- [x] **C2. Fetch saved words with the library, and clear them with it**
  * **File:** `src/App.jsx` — the content effect (`:165-201`)
  * **Action:** Add `fetchSavedWords()` to the `Promise.all` at `:181` so one `contentStatus` covers all three requests, for the reason already written above it: a bank drawn before its words arrive shows *"Nothing saved yet"* and then corrects itself, which looks exactly like words being lost. Add `setSaved([])` to the reset block at `:166-171` (Decision 8).
  * **Done when:** a test shows a saved-words fetch failure landing on `ContentError` with a working Retry; no saved-words request being made while signed out; and a test that signs out and back in as a reader whose fixture holds **no** saved words showing *"Nothing saved yet"* and `Saved 0` — mutation-checked by deleting `setSaved([])` from the reset block and confirming it fails with the previous reader's words still on screen. Signing out alone cannot settle this: the dashboard is not rendered on the landing screen, so the stale count is only observable once somebody signs back in.

- [x] **C3. Persist saving a word**
  * **Files:** `src/components/Reader.jsx:27,38,63`, `src/App.jsx:285-288`
  * **Action:**
    * `translate` (`Reader.jsx:27`) stops folding the missing case into `'—'` and returns the raw lookup; the display sites apply `?? '—'` instead. The save path needs to know the difference (Decision 7, and Trap 7 makes it a real case in the seeded prose).
    * `Reader.jsx:63` stops building the heading string and calls `onSaveWord({ surfaceForm: c, translation })`. `App` holds both `activePostId` and the post itself, so it composes the label — the Reader no longer needs to know how a heading is spelled.
    * `App.saveWord` becomes async: it builds `postLabel` as `Post ${post.position}: ${post.title}` from the post already in scope (`App.jsx:350`), awaits `saveWord({ postId: activePostId, postLabel, term: surfaceForm.toLowerCase(), surfaceForm, translation })`, then appends the **returned row** to both `saved` and `session` (Decision 3). This is the *snapshot*, written once and never refreshed — Decision 2 explains why that is not the coupling Feature 1 removed.
  * `savedSet` (`Reader.jsx:16`) reads `w.term` and drops its `.toLowerCase()` (Decision 6).
  * **Done when:** `grep -n "'Post ' + post.position" src/components/Reader.jsx` returns nothing, and a test taps a word whose dictionary lookup misses, asserting the insert carried `translation: null` and a `post_label` matching the open post, and that the sidebar shows the word only after the write resolved.

- [x] **C4. Persist deleting a word**
  * **Files:** `src/components/VocabBank.jsx:80,88`, `src/App.jsx:289-291`
  * **Action:** `key={it.de}` → `key={it.id}`; `onRemove(it.de, g.title)` → `onRemove(it.id)`. `App.removeWord(id)` awaits `deleteSavedWord(id)` and removes the row from `saved` only on success (Decision 3).
  * **Done when:** `grep -n "onRemove(it.de" src/components/VocabBank.jsx` returns nothing, and a test asserts the row is still on screen after a delete that resolved with zero rows.

- [x] **C5. Group by `post_id`, falling back to the stored heading** *(rewritten 2026-08-19 to match the spec)*
  * **File:** `src/components/VocabBank.jsx:5-16`, `src/App.jsx`
  * **Action:** `App` builds a `post_id → 'Post N: Title'` map from `content.postsByLevel` and passes it down. `VocabBank` groups on `w.post_id` and takes each group's heading from that map, falling back to the group's stored `post_label` when the id is not in it (Decision 2). A group whose post is unavailable renders **exactly like any other** — no marker, no separate section, no reordering.
  * **Done when:** three tests — a word whose `post_id` is absent from the library renders under its stored `post_label` and is still deletable from there; the same word, once its post *is* in the library under a different title, renders under that live title instead of the stored one; and a bank holding one available and one unavailable group renders the same elements for each (heading, per-group count, one row per word). Mutation-checked by making the fallback return a fixed placeholder, which must fail the first.

- [x] **C6. Render the stored word wherever the literal shape was rendered**
  * **Files:** `src/components/Reader.jsx:220-222`, `src/components/FinishModal.jsx:66-69`, `src/components/VocabBank.jsx:84-85`
  * **Action:** `s.de` → `s.surface_form`, `s.en` → `s.translation ?? '—'`, and `key={s.de + i}` → `key={s.id}` at both session sites.
  * **Done when:** `grep -rnE "\b(s|it|w)\.(de|en)\b" src/components/` returns nothing (it matches 11 lines across three files today; the looser `\.de\b` also catches the `anna@example.de` placeholder at `AuthScreen.jsx:166` and could never come back empty), and a test finishing a post with one untranslated word saved shows an em dash in the modal rather than the word `null`.

- [x] **C7. Tell the reader when a write does not take effect** *(added 2026-08-19 from the spec)*
  * **Files:** `src/App.jsx`, `src/components/Reader.jsx`, `src/components/VocabBank.jsx`
  * **Action:** A save that throws shows a brief message in the reader saying the word could not be saved and to try again; a delete that throws shows one in the bank. Follow the wording already in use for progress at `FinishModal.jsx:53`. Clear each on the next successful write of its kind and when the reader leaves the post or the bank — `openPost` already does exactly this for `saveFailed` (`App.jsx:265`), so the pattern is in the file.
  * Neither message is stored and neither survives a reload.
  * **Done when:** two tests — a failed save renders the message with the word absent from the session sidebar, and a following successful save clears it; a failed delete renders its message with the row still present, and a following successful delete clears it.

- [x] **C8. Confirm the bank on a running build** — *run 2026-08-19 against `npm run dev` and the live database, signed in as an existing test reader.*
  * **Every check passed.** Recorded here because none of it is reproducible from the suite:
    * **Casing, all three cases at once.** `Herausforderung` mid-sentence kept its capital, `gleichzeitig` stayed lowercase, and `Jeden` — a sentence-opening non-noun — was banked capitalised. The database rows read `herausforderung`/`Herausforderung`, `gleichzeitig`/`gleichzeitig`, `jeden`/`Jeden`: the check constraint held and Trap 1 behaved exactly as documented.
    * **Persistence.** `Saved 0` → save three → reload → `Saved 3`, with the saved words still highlighted green in the prose. Deleting one dropped both the header badge and the per-group count to 2, and survived a reload.
    * **Unpublished post (the fallback).** Setting `posts.published_at = null` for post 1 made the dashboard start at Post 2 — the post was genuinely withheld — while the bank went on heading those words *"Post 1: Der Alltag in Berlin"* from the stored `post_label`. This is the only proof that the fallback is load-bearing rather than incidentally shadowed by the live lookup.
    * **Rename.** Republishing post 1 as *"Ein ganz neuer Titel"* changed the bank's heading on the next load, so the live title wins while the post is there.
    * **Both failure paths.** With `window.fetch` rejecting: tapping **+** left the word unhighlighted, the sidebar at *0 words*, and showed *"That word couldn't be saved."*; tapping 🗑 left the row and both counts untouched and showed *"That word couldn't be removed."* Restoring the network and retrying each one succeeded **and cleared its note**, which is the only run-time confirmation of Assumption 3's clearing rule.
  * **A detail worth keeping:** a word saved *after* the rename stored the new heading while an older word kept the old one. Both still render under the single live heading, because `post_id` groups them and `post_label` is only ever a fallback — the divergence is invisible until the post disappears, which is the intended design and not a bug to normalise away.
  * **Cleanup:** the two remaining `saved_words` rows were deleted and post 1's title and `published_at` restored. `saved_words` is back to 0 rows and all 10 posts are published.

---

### Stage D: Cover It

- [x] **D1. Teach the stub to delete**
  * **File:** `tests/helpers/supabase.js:35-48`
  * **Action:** Add `delete()` and `select()`-after-write to the builder, recording into `calls` as `insert` already does at `:40`, so a case can assert what a delete actually filtered on.
  * **Done when:** `npm test` passes with every existing test file unmodified, and a case asserting `calls.delete` saw `['saved_words']` with `calls.eq` holding `['id', <id>]`.

- [x] **D2. Make the suite bite**
  * **File:** `tests/vocab.test.js`, `tests/vocab-bank.test.jsx` (new)
  * **Done when:** `npm test` passes, and each of these mutations fails at least one test — apply, watch it fail, revert:
    a. `saveWord` sending the tapped form as `term` instead of the lowercase key,
    b. `translation` stored as `'—'` instead of `null`,
    c. `saved` left out of the content effect's reset,
    d. `VocabBank` grouping on a heading string instead of `post_id`,
    e. `deleteSavedWord` resolving instead of throwing on zero returned rows,
    f. `VocabBank` preferring the stored `post_label` over the live title when the post *is* available,
    g. either failure message suppressed, so a failed save or delete passes silently.
  * **Run 2026-08-19: seven of the eight are caught** (g splits into the reader's note and the bank's; both bite). **(c) is not — see Trap 12.** It is kept anyway, and the reason is recorded there rather than papered over with a test that does not really test it.
  * **Note:** the lowercase check constraint, the global unique index and the RLS delete filter are deliberately **absent** from this list — no test can catch them (Trap 10). Stage B is their only guard.

- [x] **D3. Retire what the feature replaced**
  * **Done when:** `grep -n "Herausforderung" src/App.jsx` returns nothing, `grep -rn "post: 'Post " src/` returns nothing, and `npm run lint`, `npm test` and `npm run build` all pass.

- [x] **D4. Update the Supabase documentation**
  * **File:** `supabase/README.md:33`
  * **Action:** Replace *"`saved_words` is still `useState` and reaches no table — that is Feature 3"* with what the app now does, and record `surface_form` and `post_label` alongside the existing `term` note at `:77-79`.
  * **Done when:** `grep -n "still \`useState\`\|reaches no table" supabase/README.md` returns nothing, and the `saved_words` bullet describes `term`, `surface_form` and `post_label`, and why the heading is stored as well as looked up.

---

## 📦 Suggested Commit Breakdown

Three commits, each independently working. Stage B makes none.

1. `feat(vocab): record the tapped form and post heading of a saved word` (`A1`) — the migration alone. Leaves `main` with two unused columns on an empty table; the app is unaffected.
2. *(no commit)* — **Stage B** changes no application code. Its evidence lives in the Done when lines above, and any probe is reverted before Stage C begins.
3. `feat(vocab): persist the vocabulary bank to the database` (`C1`–`C8`) — large because Stage C is indivisible; see the note under it before proposing a split.
4. `chore(vocab): cover saving and deleting with tests` (`D1`–`D4`)

---

## 🔮 Subsequent Roadmap Context

* **Correct display forms in the dictionary.** The measured cost of Decision 1 is Trap 1's eight words. The way out is to author the correct German form once per dictionary entry — either `dictionary_entries.display_form` seeded directly, or `part_of_speech` populated across all 117 rows (it exists at `init_content_schema.sql:65`, is selected already at `content.js:49`, and is **null on every row**). Prefer the former: `u-bahn` proves a capitalise-the-first-letter rule wrong. Deliberately deferred, not forgotten.
* **`clean()` and accented words** (Trap 7). `src/utils.js:2` strips `é`, so `dictionary_entries` id 29 `café` can never be looked up and the word banks as `caf`. Fixing it changes how every word in every post is tokenised, so it affects reading at least as much as saving.
* **`saved_words.dictionary_entry_id` stays null.** Filling it means `fetchDictionary` (`content.js:49`) must select `id` and `toDictionaryMap` (`:62`) must carry it, changing the map's value shape and touching `Reader.jsx:27,38` and `tests/reader-dictionary.test.jsx`. The translation text is already on the row, so nothing on screen needs the link.
* **Unsaving from the Reader popup.** `Reader.jsx:59-62` shows ✓ for an already-saved word and tapping it only closes the popup. Deleting stays the bank's job.
* **Feature 4 — Real Profile (`display_name`, `theme`):** retires `"Guten Tag, Anna."` at `Dashboard.jsx:175`.
* **Content authoring for Level 2:** `b1-momentum` holds no posts, so Feature 2's Trap 2 stands until posts are seeded by SQL. Not a code change.
* **Before launch, unrelated to any feature:** the Supabase project runs with `mailer_autoconfirm = true` and no SMTP sender, which must be reverted before real accounts exist.
