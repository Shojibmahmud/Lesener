# Feature 6 Implementation Roadmap: Theme Follows the Account

> **Agent Goal:** Make `profiles.theme` — a column that has existed since `20260810103010_init_user_schema.sql:13` and has never held a value on any row — the thing that decides whether a reader sees light or dark. `localStorage` stays the device's copy and the fast path on load; the account is what carries the answer to the next browser. Along the way, kill the white flash every dark reader gets on every load.

> **Line references** in this document were taken on 2026-08-22, before any of it was built, and every one was confirmed against the file. They still shift — confirm one with `grep` before trusting it, and treat the surrounding quoted code, not the number, as the real identifier.

> **Spec:** `.claude/specs/12-profile-theme.md` — spec 12 for roadmap Feature 6, the first time the two sequences have agreed since spec 1. The spec is authoritative on observable behaviour; this roadmap is authoritative on how that behaviour gets built.

> **Reconciled with the spec on 2026-08-22, hours after this roadmap was drafted without one.** The interview settled two things this document had got wrong, and both changed a stage boundary. **The toggle's accessible name is out of scope.** It was task B1 and Decision 13, argued for on the grounds that *"no test can query it by role"* — which overstated it: a test can reach the control by its glyph, it just asserts on a decoration instead of on what the control says it does. The spec makes it a non-goal and files it with the three modals as accessibility work of its own, so B1 is gone, Decision 13 is struck through, and the tests below find the toggle by its glyph. **The load flash is in scope.** This roadmap had deferred it with an argument for leaving it alone; the interview overruled that, so it is now Stage B and spec goal 6. That is a whole extra stage and commit, and it reaches into `index.html`, which no feature has touched before.

> **Numbering.** Feature 6 in roadmap order, built on branch `feature/12-profile-theme`. The branch and roadmap sequences diverged long ago; the spec sequence rejoined them here by coincidence.

> **All stages complete, 2026-08-23. Every spec criterion has been observed in a browser.** Suite at completion: **241 tests across 23 files**, up from the 217 baseline; `npm run lint` and `npm run build` clean, `rls_checks.sql` at **68 rows all `ok = true`** (up from 61), and `git diff --stat supabase/migrations/` empty as Decision 15 requires. Two new test files: `tests/theme.test.jsx` (13 cases) and `tests/theme-boot.test.js` (4). **The browser half of D6 is outstanding and is not claimed** — every spec criterion that needs a real load or a second browser still needs running by hand.
>
> **Four things did not go to plan, and all four are recorded rather than tidied away.**
>
> 1. **`localStorage` was never available to the test suite at all** — Trap 8 was wrong, and wrong in the direction that mattered. It claimed jsdom provides a working one; the verification behind that claim was of raw jsdom with an explicit URL, not of vitest's environment. In fact Node 26 defines a `localStorage` global of its own, leaves it disabled without `--localstorage-file`, and **shadows jsdom's**: `'localStorage' in window` is `true` while reading it yields `undefined`. That is the `ExperimentalWarning` this project has been printing on every run for months. **So `applyTheme`'s `localStorage.setItem` has been silently swallowed by its own `try/catch` in every test that has ever run**, and no test could set up "this device is already dark". Fixed with an in-memory stand-in in `tests/setup.js` — the one change this roadmap explicitly told itself not to make, made anyway because nothing in Stage D was testable without it. Clearing between tests is still each file's own job, so the reason for that rule survives.
> 2. **D5's design was unreachable.** It called for toggling the theme while the profile request was in flight. There is no toggle on that screen: `App.jsx` renders `ContentLoading` for the whole gap, and it has no header. The stale closure is reachable a different way, which is what the test now does — **toggle while signed out, then sign in.** `reconcileTheme` is a `useCallback` keyed on `applyTheme` alone, so it is not rebuilt when `theme` changes; a version reading `theme` keeps handing back the value from the first render. Verified: swapping `themeRef.current` for `theme` fails that one test and nothing else.
> 3. **Mutation (m) did not bite, and Trap 12 was inherited too confidently.** Feature 5 measured that a missing `.catch()` makes vitest exit 1 under *Unhandled Errors*; here it produced **no reported error and exit 0**. Relying on that was guarding nothing. The tests now assert what the handler *does* — `console.error` with the house-style `[lesener]` line — which bites at **both** call sites, checked separately. Trap 12's rule stands; its mechanism did not.
> 4. **E3's `grep -rn "setTheme" src/` guard was unsatisfiable.** `setThemeState` contains the substring, so it can never reach zero. The real check is `grep -rn "\bsetTheme(" src/`, which returns nothing.
>
> 5. **Stage B did not fix the flash, and the roadmap's Decision 14 was half a plan.** Shojib reloaded in dark and still saw a white blink. Stamping `data-theme` before the first paint is only half the job: **the attribute says which theme, and until `src/index.css` has loaded nothing says what that theme looks like.** `index.css` is imported from `main.jsx`, so in `npm run dev` there is **no stylesheet in the served HTML at all** — Vite injects it from the module — and the browser paints its own white canvas over a correctly-stamped `<html>`. (The built app links a render-blocking stylesheet, so it was probably already fine; that difference is exactly why testing in dev caught it and a build check would not have.) Fixed by inlining the two `--bg` values and `color-scheme` into a `<style>` beside the boot script, so the canvas colour exists before any stylesheet does. That duplicates two colours out of `index.css` the same way the storage key is duplicated, with the same silent-drift risk and the same kind of guard: three more cases in `theme-boot.test.js`, all of which bite.
>
> **Sixteen mutations were run and all sixteen bite** — the thirteen listed in E1 plus (n) and (o) from B2 and the two `.catch()` sites separately.

> **Baseline, measured 2026-08-22:** `npm test` → **217 tests across 21 files**, all passing. `npm run lint` and `npm run build` clean. Two accounts exist and **both have `theme = null`**:
>
> | account | first_name | theme | created |
> |---|---|---|---|
> | `basabodol1430@gmail.com` | Basa | `null` | 2026-08-13 |
> | `ranguy@gmail.com` | Random | `null` | 2026-08-20 |
>
> `grep -rn "theme" supabase/` returns **exactly one line** — the column definition itself. Neither `supabase/README.md` nor `supabase/tests/rls_checks.sql` has ever mentioned it. `grep -ri theme tests/` finds only inert `toggleTheme={vi.fn()}` props in eight files: **theme has zero test coverage.**

---

## 📌 Context & Motivation

* **Goal:** A reader who chooses dark on their laptop finds dark on their phone. The choice belongs to the account, not to the browser that happened to be open when it was made.
* **Why this is a feature at all, given the switcher already works.** It works, and it forgets. `App.jsx:93-101` writes its answer to exactly one place:

  ```js
  const setTheme = useCallback((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); }
    catch { /* localStorage unavailable — theme just won't persist */ }
    setThemeState(t);
  }, []);
  ```

  `localStorage` is scoped to one browser, one OS profile, one origin. A second browser, a phone, a private window or a cleared cache all start again at light. **Theme is now the only piece of reader state still tied to a machine rather than a person** — Features 1 through 5 moved content, reading progress, the vocabulary bank, the reader's name and account deletion into the database one at a time, and this is the leftover.
* **The database half is already built, for the second feature running.** Feature 5 found the cascade waiting for it; this one finds the column. `profiles.theme text check (theme in ('light','dark'))` has been granted and policied for exactly this write since day one: `rls_policies.sql:26` grants `select, insert, update` on `profiles` to `authenticated`, and `:122-125` gives `profiles_update_own` both a `using` and a `with check` on `(select auth.uid()) = id`. **There is no migration in this feature**, and a step that adds one has misread the schema.
* **No Edge Function either.** This is a plain PostgREST update from the browser, structurally identical to `updateProfileName` (`profile.js:36-74`). Feature 5 needed a function because three of the four tables carry no `delete` grant at all; nothing like that is true here.
* **There is a second, older problem on the same path, and the spec put it in scope.** `index.html` carries no script at all before `<script type="module" src="/src/main.jsx">`, and a module script is deferred until the document has been parsed. The app's own theme read then happens later still, in an effect after mount. So **`<html>` carries no `data-theme` at first paint and every dark reader sees a white page flash on every single load**, softened but not hidden by the `transition: background .35s ease` on `body` (`index.css:55`). It is the one part of the theme a reader experiences without touching anything, and Stage B fixes it.
* **The column's own comment describes a design that was rejected.** `init_user_schema.sql:12` reads *"null means 'follow the device'"* — a tri-state, `prefers-color-scheme`, designed and never built. `grep -rn "prefers-color-scheme\|matchMedia\|color-scheme" src/ index.html` returns nothing, so today null simply means light. Spec non-goal 1 settles two states only, so that sentence is not a gap to be filled but a sentence to be superseded (Decision 12).
* **Scope, set by the spec:** persistence, and the load flash. **Not** the toggle's accessible name, which is a real gap the spec explicitly defers to a later accessibility feature covering the app's three modals too. No system-following, no per-device override, no failure message.

---

## 📐 Architecture & Architectural Decisions

Locked. Do not revisit mid-build.

1. **Two states, `'light'` and `'dark'`. No tri-state, no `prefers-color-scheme`.** Spec non-goal 1.
   * *Rejected:* honouring the OS setting when the column is null, which is what the column's comment describes. It makes "what theme am I on?" unanswerable without knowing a setting the app cannot see, it needs a live `matchMedia` subscription so the app follows an OS theme that changes under it, and it makes the null state permanent and meaningful — the opposite of Decision 4.
   * Consequence: **null is a migration state, not a value.** After one sign-in, no account should hold it (spec criterion 10).
   * **If a future session wants the tri-state, this decision and the CHECK constraint are what it has to revoke** — do not widen the constraint quietly.

2. **No migration.** The column, its check constraint, the `update` grant and `profiles_update_own` all exist and are all correct. Stage A proves them rather than building them.

3. **`localStorage` remains the device's store and the fast path.** `THEME_KEY = 'lesener-theme'`, read at mount, written on every apply.
   * It is the only store a signed-out reader has — the landing page carries a toggle of its own at `Landing.jsx:40` — and the only one available before the network answers. Spec goals 4 and 5 depend on it.
   * *Rejected:* making the account the only store. Every load would paint light and then flip, for everybody, including readers who never sign in.

4. **The account wins on sign-in. A null account adopts the device's theme and is written up immediately.** Spec goals 2 and 3.
   * Winning is the feature. If the device's value won, nothing would follow anybody anywhere.
   * Adopting-and-writing is what stops the null being permanent: a reader who has never toggled anything still leaves a value behind on their first sign-in, so their *second* device gets a real answer rather than another null.
   * *Rejected: writing `'light'` up to a null account.* Same number of writes, and it is a lie about half the readers — somebody sitting in dark would be told their account preference is light. Every account in existence is null today (baseline), so this would take the choice away from every dark reader exactly once, in exchange for nothing.
   * *Rejected: leaving null alone until the reader next toggles.* Then the feature does nothing for anyone already happy with their theme, which is most people, and the null branch lives forever — the least-tested path belonging to the readers least likely to report it.
   * *Consequence, and spec Assumption 2:* the first sign-in on a **new** device can push that device's theme up to an account that had none, before the reader has expressed a preference on it. Once per account, ever, and only when the account has no opinion to lose. **The spec flags this for confirmation before building.**

5. **`setTheme` splits into two named functions. There is no flag argument.**
   * `applyTheme(t)` — sets the attribute, writes `localStorage`, writes the ref, sets state. **Never touches the account.** Called by the mount effect and by the reconciliation.
   * `chooseTheme(t)` — calls `applyTheme(t)`, then writes the account. Called by `toggleTheme` and by nothing else, ever.
   * *Rejected: `setTheme(t, { persist })`.* A forgotten flag fails **silently and invisibly** — the screen still changes, `localStorage` still updates, and the only symptom appears on a different device tomorrow. Writing the account's own value back to itself is idempotent, so the mistake produces no error, no wrong pixel, and nothing anywhere reports the redundant round trip. Two names cannot be got wrong that way: a missing account write is a missing `chooseTheme`, which is greppable.
   * *Why rename rather than keep `setTheme` for one of them:* whichever kept the name would inherit its call sites unread.

6. **The reconciliation lives in the existing `Promise.all().then()` and reads the device's theme from a ref.**
   * *Why there:* the reconciliation is "the profile has just arrived for this reader", and that `.then` **is** that moment. It also means React batches the theme change into the same render that sets `contentStatus: 'ready'` — so a reader whose account disagrees with their device sees the change happen **on the loading screen**, not as a repaint under a settled dashboard. It must therefore run **before** `setContent(loaded)`. This is exactly what spec criterion 5 describes.
   * *Why a ref and not `theme`:* the effect's deps are `[userId, recovering, contentAttempt]` (`:257`) and `theme` is not among them, so a closure over `theme` reads whatever it was when the effect last ran.
     * *Rejected: adding `theme` to the deps.* It would re-issue `loadContent()`, `fetchProgress()`, `fetchSavedWords()` and `fetchProfile()` — four requests — on **every toggle**, with a visible content reload each time.
     * *Rejected: re-reading `localStorage` at that moment.* A second read of a store already read at mount, and wrong in exactly the case the existing `try/catch` exists for: where `localStorage` throws, the read yields nothing, the code adopts `'light'`, and a reader sitting in dark has light written up to their account. **React state is the truth about what the reader is looking at; `localStorage` is a best-effort mirror of it.**
   * `themeRef.current` is written **inside `applyTheme`**, synchronously, and nowhere else. That is what keeps it and `theme` from drifting.

7. **The account write is fire-and-forget with a `console.error`. It is never awaited and never surfaced to the reader.** Spec goal 7 and criterion 6.
   * By the time it runs the local half has already succeeded: the attribute is set, `localStorage` is written, the reader has what they asked for on the device in front of them. A failure costs only propagation to a device that is not in the room.
   * *Contrast with `saveWord` and `finish` (`App.jsx:371-424`), which are awaited and set `saveWordFailed` / `saveFailed`.* Those create data the reader would otherwise believe exists — a word in their bank, a post marked done. A theme is not a thing the reader keeps; it is a setting whose visible effect is already correct.
   * *Rejected: awaiting and reverting.* The theme would flick back under the reader's cursor because a request timed out.
   * *Rejected: telling the reader.* Spec non-goal. There is no toast or banner system, and building one to report a failed colour preference is out of all proportion.
   * **But not silent.** `console.error('[lesener] theme could not be saved to your account.', error)`, matching the house style at `:250`, `:388`, `:401` and `:420`. **The `.catch()` is mandatory** — its absence is Trap 12.
   * *Consequence, accepted:* a toggle made offline sticks on the device and never reaches the account, so the next sign-in elsewhere shows the older value. Do not "fix" this by making the write blocking.

8. **Signing out does nothing to the theme.** Spec goal 5 and criterion 7.
   * `localStorage` is the device store, and the reader is looking at the same screen through the same eyes. Flipping them to light on the way to Landing would be a visible, unrequested flash, and it would throw away the signed-out preference the moment they sign out.
   * The `SIGNED_OUT` branch (`:134-156`) already clears everything that belongs to an account. The theme does not belong to the account **on this device**; it belongs to the device.
   * **D4 asserts this**, so a future session tidying that branch cannot quietly add a reset to it.
   * A shared computer is explicitly not a case this handles (spec non-goal).

9. **A recovery session neither reads nor writes a theme.**
   * The read half is already correct and free: the profile effect bails at `:218` on `recovering`, so `fetchProfile` never runs and there is no profile to reconcile against. **Confirmed by inspection 2026-08-22, recorded so nobody re-checks it.**
   * The write half is **not** free and needs an explicit guard. A recovery session carries a real `user.id`, and the reset screen still receives `dark` and `toggleTheme` (`App.jsx:529-532`, confirmed). Without a guard, a toggle there would write a preference into an account this app instance has never loaded a profile for.
   * `chooseTheme` therefore returns early on `!userId || recovering`. *Why symmetry rather than "it is their own account anyway":* everywhere else a recovery session is deliberately not an ordinary session — no library, no progress, no words, no profile. A theme write would be the single exception, for no gain.

10. **No client-side validation of the value inside `updateProfileTheme`.**
    * `check (theme in ('light','dark'))` has been on the column since `init_user_schema.sql:13`, and a value only ever reaches the function from a two-branch ternary inside `toggleTheme`.
    * This is the deliberate mirror of `profile.js:40-45`, whose comment calls the empty-first-name refusal *"the only rule in the feature the schema cannot enforce."* Rules the schema **can** enforce are left to it; a guard here would make that sentence untrue by example.
    * **The one place validation does go in is the stored-theme read**, and for a different reason — see Trap 7. That is about not trusting a store outside the app's control, not about second-guessing the schema.

11. **`fetchProfile` and `updateProfileName` widen their column lists together. The profile row has exactly one shape.**
    * `fetchProfile` must ask for `theme` or there is nothing to reconcile against.
    * `updateProfileName` must ask for it **too**, because `App.jsx:606` passes `onSaved={setProfile}` and `EditNameModal.jsx:25` calls `onSaved(saved)` with the row the update returned. That row therefore **replaces** the loaded profile in state. Widen one list and not the other and `profile.theme` becomes `undefined` the moment somebody edits their name.
    * Nothing reads `profile.theme` after reconciliation (Decision 12a), so this is a landmine rather than a live bug — and it is disarmed in the same commit that would otherwise plant it. Both lists get a pinned assertion so they stay in step.

12. **`profile.theme` in App state is a load-time snapshot and is deliberately never kept current.**
    * It is read exactly once, by the reconciliation, and never again. Keeping it in step would mean threading `setProfile` into the fire-and-forget path, where a failed write would leave state asserting something the database does not hold.
    * *Consequence, accepted:* pressing Retry after a content error re-runs the effect and re-reconciles from a fresh `fetchProfile`. If a toggle's write had failed, the retry re-applies the account's value and undoes the toggle. **That is correct** — the account wins, and the reader has just asked the app to reload itself.

13. **~~`ThemeToggle` gets an action-shaped `aria-label` and a `type="button"`.~~ RETIRED 2026-08-22 during spec reconciliation — it is out of scope.**
    * **Struck through rather than deleted**, because the gap is real and the reasoning for fixing it was sound. What was wrong was the claim that it was a *prerequisite*: this roadmap argued *"no test can query it by role"*, and concluded the feature could not be tested without it. A test can reach the control by its glyph. It is a worse test — it asserts on a decoration rather than on what the control says it does, and it verifies nothing a screen-reader user experiences — but it is not an impossible one.
    * **The spec makes it a non-goal** (spec non-goal 3, spec Assumption 4) and files it with `DeleteModal`, `ChangePasswordModal` and `EditNameModal`, which have the same class of problem. It belongs in accessibility work of its own.
    * **What this costs, stated plainly so nobody has to rediscover it:** every test below finds the toggle by `☀`/`☾`. If somebody later changes the glyphs, those tests break for a reason that has nothing to do with what they are testing. That is the price of the deferral and it is recorded, not hidden.

14. **The flash is fixed before the app starts, and the storage key moves somewhere both halves can see it.** *(Added 2026-08-22 from spec goal 6.)*
    * A synchronous inline `<script>` in `index.html`'s `<head>` reads the stored theme and stamps `data-theme` on `<html>` **before the first paint**. Nothing React does can be early enough: `main.jsx` is a module, so it is deferred until the document is parsed, and the app's own read runs later still, in an effect after mount.
    * *Rejected: `<script src>` or `type="module"`.* Both are deferred. The script must be inline and bare, and it is the one place in this project where that is correct.
    * **`THEME_KEY` moves to `src/utils.js`** so the app and the test have one source for it. The literal in `index.html` cannot import anything, so the key is genuinely duplicated across the two — see Trap 6, and B2's test, which is the only thing that will ever notice them drifting.
    * **React's initial state must be seeded from the same read**, not from `'light'`. Otherwise the first painted frame shows a correctly dark page with the toggle's *light* glyph on it, because the effect that corrects the state runs after paint. A flash fix that leaves the wrong icon on screen has moved the bug rather than fixed it.
    * *This fixes the load flash and nothing else.* The change a reader sees when their device and their account disagree (spec criterion 5) is a different moment, happens later, and stays — spec Assumption 5 says so explicitly.

15. **The stale SQL comment is superseded in `supabase/README.md`. The migration file is not touched.**
    * *(a) Editing `init_user_schema.sql:12` in place — rejected.* `supabase/README.md:58-67` states the rule: *"every applied migration gets a matching file here, under the same name."* The file is the record of what was applied. A `--` comment changes no schema, so the edit would be harmless in effect — **and that is exactly the problem.** Weakening a written rule for something harmless teaches that the file is editable, and the next edit will not be a comment.
    * *(b) A new migration issuing `comment on column public.profiles.theme is '…'` — rejected for now, named as the fallback.* Real, applied, zero-risk DDL that puts the truth where `\d+` and the table editor show it. But `grep -rn "comment on" supabase/` returns nothing: it would introduce a convention for one line of prose, plus a deploy step and another file to keep in sync. **Do this instead if the database's own metadata ever becomes a working surface.**
    * *(c) Chosen: the README.* Every other schema explanation lives in its Model section. The new bullet says outright that `init_user_schema.sql:12` describes a tri-state that was never built and is superseded here — turning the stale comment from a trap into a dated footnote, without pretending it was never written.

---

## ⚠️ Known Traps & Edge Cases

* **1. For once the test stub needs no teaching — do not "add theme support" to it.**
  * Features 3, 4 and 5 each opened by teaching `tests/helpers/supabase.js` a new verb (`delete()`, `update()`, `functions.invoke`), each recording that an untaught stub makes every assertion pass while proving nothing. **This feature is the exception.** `stubSupabase` already records `calls.update` as `[table, payload]`, `calls.eq` as `[column, value]` and `calls.select`, and already lets a table answer as a function of `(filters, op)`. Feature 4 taught it all of this.
  * **Rule:** if you find yourself editing that helper, stop and work out what you are actually missing.

* **2. FIVE test files break, not one.** `grep -rn "lib/profile'" tests/` finds `vi.doMock('../src/lib/profile', …)` in **five** App-mounting harnesses, confirmed 2026-08-22:

  | file | mock | fixture |
  |---|---|---|
  | `tests/delete-account.test.jsx` | `:50` | `READER`, `:13` |
  | `tests/edit-name.test.jsx` | `:50` | `READER`, `:13` |
  | `tests/level-switching.test.jsx` | `:62` | `READER`, `:24` |
  | `tests/reading-progress.test.jsx` | `:65` | `READER`, `:30` |
  | `tests/content-lifecycle.test.jsx` | `:81` | `READER`, `:35` |

  A `vi.doMock` factory is a **complete replacement** of the module — a missing export is `undefined`, and calling it throws. Every fixture is `{ id, first_name, last_name }` with **no `theme` key**, so every one takes the null-adopt path and calls `updateProfileTheme`. All five go red at once.
  * **Worse, the failure names nothing about themes.** The throw lands inside the `Promise.all().then()` at `:235-247`, which the effect's own `.catch` at `:246` swallows into `setContentStatus('error')` — so the symptom is a **content-error screen** in five unrelated suites.
  * **Rule:** C3 adds `updateProfileTheme: vi.fn(() => Promise.resolve())` to all five factories **before** anything in App calls it.

* **3. `tests/profile.test.js:35` pins the column list with `toBe`.**
  ```js
  expect(calls.select[0]).toBe('id, first_name, last_name');
  ```
  Not `toContain`. Widening the select fails it immediately — the trap working as designed. Update the string and the `ROW` fixture at `:22`. **Do not soften the matcher** — the exact column list *is* the assertion.

* **4. `updateProfileName`'s select would silently shrink the profile.** Decision 11. `App.jsx:606` is `onSaved={setProfile}` and `EditNameModal.jsx:25` calls `onSaved(saved)`.

* **5. The stale closure compiles clean, lints clean, and is wrong.** `.oxlintrc.json` enables `react/rules-of-hooks` and `react/only-export-components` — **not `react-hooks/exhaustive-deps`** (confirmed 2026-08-22). Reading `theme` inside the profile effect passes lint. The only thing between the codebase and that bug is Decision 6 and the test at D5.

* **6. The storage key is duplicated across `index.html` and `src/`, and drift is silent.** *(Added 2026-08-22 with Decision 14.)* The inline script cannot import, so the literal `'lesener-theme'` exists in two files with nothing linking them.
  * **The failure mode is the worst kind: nothing breaks.** Change the key in `src/utils.js` and the app still works perfectly — it just reads and writes a key the inline script does not know about, so the flash comes back and no test, no lint and no build says a word.
  * **Rule:** B2's test reads `index.html` from disk and asserts it contains the exported key. It is a file-content test rather than a behaviour test, and it is the only guard that exists. A comment in each file points at the other.

* **7. `getItem(THEME_KEY) || 'light'` accepts any string.** `:106` coerces an empty string to light but hands **anything else** straight to `setAttribute('data-theme', …)`. A stored `'blue'` renders the `:root` palette while `theme === 'blue'`, so `dark` is false and the toggle shows the wrong glyph.
  * Pre-existing and reachable only by editing storage by hand. It matters now because the same string would be adopted up into a CHECK-constrained column, turning a cosmetic oddity into a rejected request and a console line — and because the inline script must make the same judgement independently.
  * **Rule:** both readers validate against the two legal values. This is not a contradiction of Decision 10 — that is about not second-guessing the schema on a value the app produced; this is about not trusting a store outside the app's control.

* **8. jsdom's `localStorage` and the `<html>` attribute both leak between tests in a file.** `tests/setup.js` runs `afterEach(cleanup)` and nothing else. `cleanup()` unmounts React trees; it does not reset the window, and `data-theme` is written imperatively **outside React entirely**, so it survives every unmount. Verified 2026-08-22: jsdom 30.0.1 provides a working `localStorage`, and vitest gives one jsdom per test **file**, so a test that stores `dark` hands it to every test after it in the same file.
  * **Rule:** the theme test file's own `beforeEach` clears both. Do **not** fix this in `tests/setup.js`; a global clear would silently change what eight existing files run under, for the benefit of one.
  * *(Node prints `ExperimentalWarning: localStorage is not available` once per worker on every run. That is Node's own global, not jsdom's, and it is pre-existing noise — it appears in the baseline run.)*

* **9. There are two flashes. Stage B fixes one of them, and the other is required to remain.**
  * *(a) The load flash — fixed by Stage B.* No `data-theme` at first paint, so every dark reader gets a white page on every load.
  * *(b) The reconciliation change — required by spec criterion 5 and must NOT be "fixed".* A device saying light, signing in to an account saying dark, shows light and then dark once the profile arrives. The account cannot win before the account's answer exists. Decision 6's ordering is what keeps it cheap: it lands as the loading screen gives way to the dashboard.
  * **Rule:** do not conflate them. Stage B does not touch (b), and spec Assumption 5 says so explicitly. Do not "fix" (b) by holding the first paint until the profile arrives; that puts a network round trip in front of every screen for every reader, and it is spec-forbidden by criterion 5, which requires light-then-dark rather than a blank wait.

* **10. The adopt-on-null write is completely invisible.** Decision 4's null branch changes no pixel — spec criterion 3 says so. A reader signs in, the screen looks identical, and either the row was written or it was not. **Rule:** D6's SQL read is the only direct evidence, and E1's mutation (g) the only automated guard.

* **11. The toggle can only be found by its glyph.** Consequence of Decision 13's retirement. Every test below queries `☀`/`☾`. **Rule:** if a test cannot find the toggle, check whether somebody changed the glyph before assuming the toggle broke.

* **12. A missing `.catch()` fails the build while reporting every test green.** Feature 5's C5 measured this exactly: an unhandled rejection makes vitest print `Errors 1` under *Unhandled Errors* and exit **1**, while the summary line still reads all-passed. Both fire-and-forget call sites need one. **Rule:** judge mutation (m) by the exit code, not the test count.

* **13. `profiles_update_own` filters rather than raises.** The trap `profile.js:29-32` already documents: it is a `using` clause, so an update aimed at somebody else's row resolves having changed **nothing**, with no error. Reading back what was updated is the only way to tell "saved" from "silently ignored". Under Decision 7 that throw only ever reaches `console.error` — which is precisely why it has to be an accurate sentence.

* **14. The `SIGNED_IN` re-fire does not re-reconcile, and that is correct.** `SIGNED_IN` re-fires whenever the tab regains focus (`:158-163`), but the profile effect depends on `userId` — a string — not on the user object, deliberately; the comment at `:210-214` says so. The same reader focusing the tab is **not** flipped back to the account's value after toggling on this device. **Rule:** do not "fix" this by depending on `user`.

* **15. Two toggles in quick succession can leave the account holding the earlier value.** Two `PATCH`es in flight, nothing ordering them and nothing reading the responses. Local state is correct either way, so the symptom is delayed and remote. **Accepted** — spec non-goal 7 and spec Assumption 3. The cheap fix if it ever bites is a monotonic sequence number in `chooseTheme`; do not add it speculatively.

* **16. Nothing in the JS suite can prove the database half, and nothing can load `index.html`.** `supabase` is `vi.mock`'d in every file that touches it, so invisible to all 217 tests: the CHECK constraint, the `update` grant, `profiles_update_own`, and whether a real `PATCH` ever leaves the browser. And vitest renders into a jsdom document the test environment created — **`index.html` is never parsed**, so no test can observe the inline script running or the flash being gone.
  * **Rule:** Stage A, B2's file-content test and D6's browser check are the only guard. **Do not add a test that appears to prove the flash is fixed** — only a human watching a real load can say that.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step carries a checkable **"Done when"** line.

### Stage A: Prove the Column Takes a Write

> **No application code.** These extend `supabase/tests/rls_checks.sql`: self-contained, impersonating via `set local request.jwt.claims` (`:8-10`), asserting into a temp `results` table, rolled back at the end.
>
> Trap 16 is why this stage exists. Following Features 3, 4 and 5, it produces its own commit.

- [x] **A1. Prove a reader can set their own theme**
  * **File:** `supabase/tests/rls_checks.sql` — inside the *as user A* block, beside the rename control at `:132-137`
  * **Action:** As A, assert the starting state is null, write `'dark'`, read it back:
    ```sql
    -- theme has been on this column since init_user_schema.sql:13 and nothing has
    -- ever written it. This is the first proof that anything can.
    insert into results (name, expected, actual)
      select 'A: theme starts null', 'NULL', coalesce(theme,'NULL')
      from public.profiles where id = (select auth.uid());

    update public.profiles set theme = 'dark' where id = (select auth.uid());
    insert into results (name, expected, actual)
      select 'A: can set own theme', 'dark', coalesce(theme,'NULL')
      from public.profiles where id = (select auth.uid());
    ```
  * The starting-null assertion is a positive control and earns its place exactly as the rename control at `:132-133` does: without it, "can set own theme" would pass just as happily against a column that already read `'dark'`.
  * **Done when:** two new result rows read `A: theme starts null` = `NULL` and `A: can set own theme` = `dark`.

- [x] **A2. Prove the check constraint refuses anything else**
  * **File:** same, immediately after A1, following the `do $$ … exception when check_violation` pattern the over-long name already uses at `:149-157` — it records `sqlstate` against an expected `23514`, so a statement that *succeeds* records the literal `accepted` and fails the run
  * **Action:**
    ```sql
    -- Decision 10: the client sends no validation of its own, because this is
    -- here. If this row ever reads 'accepted', profile.js needs a guard.
    do $$
    begin
      update public.profiles set theme = 'system' where id = (select auth.uid());
      insert into results (name, expected, actual)
        values ('A: unknown theme refused', '23514', 'accepted');
    exception when check_violation then
      insert into results (name, expected, actual)
        values ('A: unknown theme refused', '23514', sqlstate);
    end $$;
    ```
    Then the same again for `'Dark'` — a capitalisation bug in the client is far likelier than an invented third state, and the constraint is case-sensitive. Finish by restoring `theme = null` and asserting the restore landed.
  * **Done when:** `A: unknown theme refused` = `23514`, `A: theme is case-sensitive` = `23514`, and `A: theme restored to null` = `NULL`.
  * **STOP CONDITION:** 🛑 if either reads `accepted`, the constraint is not what `init_user_schema.sql:13` says it is. Decision 10 is then wrong and `updateProfileTheme` needs a client-side guard before Stage C proceeds.

- [x] **A3. Prove a reader cannot set anybody else's theme**
  * **File:** same, in the *as user B* block beside the existing "B cannot rename A" attempt at `:287-296`
  * **Action:** As B, `update public.profiles set theme = 'dark' where id = '11111111-…-111111111111';`. Because `profiles_update_own` is a `using` clause this **succeeds having changed nothing** — the comment at `:287-290` already explains it. Assert as `postgres`, after the second `reset role`, where A's row is actually visible.
  * Read as `postgres` deliberately, for Feature 3's Trap 11 reason: run as B the check is vacuous, because RLS hides A's row from B either way.
  * **Done when:** `B could not set A's theme` = `NULL`.
  * **STOP CONDITION:** 🛑 if it reads `dark`, `profiles_update_own` is not scoping the update and this is a cross-account write primitive, not a theme bug. Stop and fix the policy.

> **Whole stage done when:** every row of `rls_checks.sql`'s final `select …, (expected = actual) as ok` reads `ok = true` — **61 rows today, 68 after this stage** *(the roadmap first said 67; seven assertions were added, not six)* — as `supabase/README.md:168-180` requires, and `get_advisors(type: "security")` is unchanged.

---

### Stage B: Paint the Theme Before the App Starts

> **Spec goal 6 and criterion 4.** Independent of everything else in this feature — it touches no account, no database and no network — which is why it is its own stage and its own commit, and why it goes first: Stage D rewrites the same read, and doing it in this order means nothing gets written twice.
>
> This is the first time any feature has touched `index.html`.

- [x] **B1. Move the storage key and paint before first paint**
  * **Files:** `src/utils.js`, `index.html`, `src/App.jsx:22` and `:25` and `:103-111`
  * **Action:** Three changes that only work together.
    1. Move the key into `src/utils.js` beside `clean()`, with a comment saying that `index.html` carries a copy it cannot import and that they must agree:
       ```js
       // Also hard-coded in index.html's pre-paint script, which cannot import
       // anything. If this changes, change it there too -- nothing at runtime will
       // notice if they drift, only tests/theme-boot.test.js.
       export const THEME_KEY = 'lesener-theme';
       ```
    2. Add an inline `<style>` giving the root a background for each theme, **and** `color-scheme` so the browser's own canvas, scrollbars and form controls match:
       ```html
       <style>
         :root { color-scheme: light; background-color: #FDFBF7; }
         :root[data-theme="dark"] { color-scheme: dark; background-color: #0F172A; }
       </style>
       ```
       *This was added on 2026-08-23, after the first attempt still flashed.* The script below sets the attribute; without these two rules nothing defines what the attribute **means** until `src/index.css` arrives, and in dev it never arrives before first paint because Vite injects it from `main.jsx`. The colours are copied from `--bg` and cannot reference it, so B2 checks they still agree.
    3. Add a bare, synchronous, **non-module** script as the last thing in `index.html`'s `<head>`:
       ```html
       <script>
         // Stamps the theme before the first paint. Nothing in React can be this
         // early: main.jsx is a module and so is deferred until the document is
         // parsed, and the app's own read runs later still, after mount. Anything
         // later than this is a white flash a dark reader sees on every load.
         // The key is duplicated from src/utils.js -- see the comment there.
         try {
           var t = localStorage.getItem('lesener-theme');
           if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
         } catch (e) { /* localStorage unavailable -- the app falls back to light */ }
       </script>
       ```
    4. **Seed React's state from the same read** rather than from `'light'` (Decision 14), so the first painted frame does not show the light glyph over an already-dark page:
       ```js
       const readStoredTheme = () => {
         try {
           const stored = localStorage.getItem(THEME_KEY);
           return stored === 'light' || stored === 'dark' ? stored : 'light';
         } catch {
           return 'light';
         }
       };

       const [theme, setThemeState] = useState(readStoredTheme);
       ```
       The mount effect at `:103-111` stops being a read and becomes a re-apply, so the attribute is still correct if the inline script is ever removed and so `localStorage` is written on a device that had nothing stored.
  * **Done when:** `grep -n "lesener-theme" index.html src/utils.js` returns one line each and `grep -n "lesener-theme" src/App.jsx` returns nothing; `grep -n "type=\"module\"" index.html` returns only the `main.jsx` line; and `npm run build` followed by `grep -c "lesener-theme" dist/index.html` returns **1** — proving Vite left the inline script in the built HTML rather than bundling it away.

- [x] **B2. Guard the duplicated key** *(Trap 6)*
  * **File:** `tests/theme-boot.test.js` (new)
  * **Action:** Read `index.html` off disk and assert it contains the exact key exported from `src/utils.js`, and that the script carrying it is inline — no `src=`, no `type="module"`, no `defer`. Say in a comment that this is a file-content test rather than a behaviour test, that it exists because the two copies of the key cannot reference each other, and that **the drift it catches is silent**: the app keeps working, the flash just comes back.
  * **Done when:** the test passes; changing the key in `src/utils.js` alone fails it; and adding `type="module"` to that script tag fails it.
  * **This is the only automated guard the flash will ever have** (Trap 16). No test can parse `index.html` into a running document, so nobody can assert the flash is gone — only D6 can.

> **Whole stage done when:** `npm test` passes, `npm run build` is clean, and a human has confirmed on a real load that a dark reader sees no white flash (this is also re-checked at D6 as spec criterion 4).

---

### Stage C: The Data Layer

> Nothing here changes what a reader sees. `updateProfileTheme` exists and is called by nobody — deliberately, so that Stage D's diff is only the reconciliation.
>
> **C3 is not optional cleanup.** It is what stops Stage D turning five unrelated test files red at once (Trap 2).

- [x] **C1. Widen both profile column lists together**
  * **File:** `src/lib/profile.js:21` (`fetchProfile`) and `:62` (`updateProfileName`)
  * **Action:** Both become `'id, first_name, last_name, theme'`. Put a comment on the `updateProfileName` one saying **why** it widens even though a name edit cannot change a theme: `App.jsx:606` passes `onSaved={setProfile}` and `EditNameModal.jsx:25` hands it the returned row, so a narrower list here would drop `theme` out of application state (Decision 11, Trap 4).
  * **Done when:** `grep -c "id, first_name, last_name, theme" src/lib/profile.js` returns **2**, and `grep -n "'id, first_name, last_name'" src/lib/profile.js` returns nothing.

- [x] **C2. Add `updateProfileTheme`**
  * **File:** `src/lib/profile.js`, after `updateProfileName`
  * **Action:** Mirror `updateProfileName` structurally, minus its validation:
    ```js
    // The reader's chosen appearance, kept on the account so it follows them
    // between browsers. localStorage is still the device's own copy and still
    // what paints the first frame (index.html); this is what makes the two agree
    // on the next device.
    //
    // No value check here, and the asymmetry with updateProfileName is the point:
    // check (theme in ('light','dark')) has been on the column since
    // init_user_schema.sql:13, so the schema already refuses anything else. The
    // empty-first-name rule lives in this file only because the schema cannot
    // express it.
    export async function updateProfileTheme(theme) {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      if (sessionError || !userId) {
        throw new Error('Could not save your theme: no signed-in reader.');
      }

      // profiles_update_own is a USING clause, so somebody else's row is filtered
      // out rather than rejected and the statement succeeds having changed
      // nothing. Reading back what was updated is the only way to tell the two
      // apart -- the same reasoning as updateProfileName.
      const { data, error } = await supabase
        .from('profiles')
        .update({ theme })
        .eq('id', userId)
        .select('id, theme');

      if (error) {
        const code = error.code ? ` [${error.code}]` : '';
        throw new Error(`Could not save your theme${code}: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error('Could not save your theme: nothing was updated.');
      }

      return data[0];
    }
    ```
  * No stub change is needed (Trap 1).
  * **Done when:** `npm test` passes with `tests/profile.test.js` extended by six cases — the payload is exactly `{ theme: 'dark' }` and the filter exactly `[['id','reader-1']]`; the select-back is `'id, theme'`; it throws *"no signed-in reader"* without touching `calls.update` when `getSession` returns no session; it throws with the code appended on a database error; it throws *"nothing was updated"* on an empty result; and **it does not validate the value** — `updateProfileTheme('system')` reaches the database rather than being refused locally (Decision 10, which A2 is what makes safe).

- [x] **C3. Teach all five App harnesses about the new export** *(Trap 2)*
  * **Files:** `tests/delete-account.test.jsx:50`, `tests/edit-name.test.jsx:50`, `tests/level-switching.test.jsx:62`, `tests/reading-progress.test.jsx:65`, `tests/content-lifecycle.test.jsx:81`
  * **Action:** Add `updateProfileTheme: vi.fn(() => Promise.resolve())` to each `vi.doMock('../src/lib/profile', …)` factory. **Do not** add a `theme` key to any of the five `READER` fixtures — leaving them null-themed keeps all five exercising the adopt-and-write path incidentally, which is free coverage of the commonest state in the database.
  * Also in `tests/profile.test.js`: `ROW` at `:22` gains `theme: 'dark'`, and the pinned assertion at `:35` becomes `toBe('id, first_name, last_name, theme')`. Keep `toBe` (Trap 3).
  * **This comes before Stage D.** Written afterwards, all five files would be red for a reason that has nothing to do with what Stage D changed, and the screen they fail on says *content could not be loaded*.
  * **Done when:** `grep -rl "updateProfileTheme" tests/` lists all five harnesses plus `profile.test.js`, and `npm test` passes with no existing assertion's *meaning* changed.

---

### Stage D: Make the Account Own It

> **Indivisible — ships as one commit.** A `chooseTheme` nothing calls, or a reconciliation with no write behind it, leaves the app in a state no check can settle.
>
> D6 is the human confirmation, and the only place spec goal 2 — the whole point of the feature — can be observed.

- [x] **D1. Stand up the theme harness and prove it isolates**
  * **File:** `tests/theme.test.jsx` (new). Copy `tests/delete-account.test.jsx`'s `mountApp()` (`:19-61`) — `vi.resetModules()`, the five `vi.doMock`s, `await import('../src/App.jsx')`, render, fire the listeners. Add two knobs: `profileTheme` (default `null`, feeding `fetchProfile`'s resolved row) and a captured `updateProfileTheme` spy returned alongside.
  * **Action:** Add the `beforeEach` from Trap 8 — `localStorage.clear()` and `document.documentElement.removeAttribute('data-theme')` — with a comment saying why (`cleanup()` unmounts React; it does not reset the window, and the attribute is written outside React entirely). Add a `toggle()` helper that finds the control **by its glyph** (`getByText('☾')` / `getByText('☀')`), with a comment pointing at Trap 11 and Decision 13 so the next reader knows this is a deferral rather than an oversight. Then write **one** case: a signed-out reader on Landing clicks the toggle, and `data-theme` becomes `'dark'` while `localStorage.getItem(THEME_KEY)` becomes `'dark'`.
  * **This comes first, and it is a measurement as much as a test.** It establishes that jsdom's `localStorage` round-trips through App's bare global, that the glyph query actually finds the control on the Landing screen, and that the `beforeEach` genuinely isolates.
  * **Done when:** that case passes, and passes again when a throwaway case is temporarily inserted **before** it that sets `data-theme="dark"`, writes `localStorage`, and does nothing else. If the first case then fails, the isolation is not working.

- [x] **D2. Split `setTheme` into `applyTheme` and `chooseTheme`**
  * **File:** `src/App.jsx:93-101`, `:259-260`
  * **Action:** Add `const themeRef = useRef(theme);` beside the state (Stage B already seeded `theme` correctly, so the ref starts right). Rename `setTheme` → `applyTheme` and write the ref inside it:
    ```js
    // Applies a theme without telling the account. The mount effect and the
    // reconciliation in the profile effect both use this: neither is a choice the
    // reader just made, and writing the account's own value back to it would be a
    // round trip that can only confirm what is already there.
    const applyTheme = useCallback((t) => {
      document.documentElement.setAttribute('data-theme', t);
      try {
        localStorage.setItem(THEME_KEY, t);
      } catch {
        /* localStorage unavailable — theme just won't persist on this device */
      }
      // Read by the profile effect, which must not depend on `theme` -- four
      // network requests would re-fire on every toggle -- and would otherwise
      // close over a stale one. Written here, synchronously, so it is never
      // behind the attribute the reader is looking at. Nothing else writes it.
      themeRef.current = t;
      setThemeState(t);
    }, []);
    ```
    Then at `:259`, where `userId` (`:215`) and `recovering` are already in scope:
    ```js
    const dark = theme === 'dark';

    // The reader's own choice, and the only thing in the app that writes the
    // account. Not awaited: the toggle must feel instant, the local half has
    // already happened, and a failure costs the reader nothing they can see on
    // this device (Decision 7, spec criterion 6).
    const chooseTheme = (t) => {
      applyTheme(t);

      // A recovery session holds a user id but is not an ordinary session -- no
      // library, no progress, no words and no profile are loaded for it -- so it
      // does not get to write a preference into an account this app instance has
      // never read (Decision 9).
      if (!userId || recovering) return;

      updateProfileTheme(t).catch((error) => {
        console.error('[lesener] theme could not be saved to your account.', error);
      });
    };
    const toggleTheme = () => chooseTheme(dark ? 'light' : 'dark');
    ```
    Import `updateProfileTheme` alongside `fetchProfile` at `:6`.
  * **Done when:** `grep -n "setTheme" src/App.jsx` returns nothing; `grep -c "setThemeState" src/App.jsx` returns **2**; `grep -c "themeRef.current = " src/App.jsx` returns **1**; `grep -n "updateProfileTheme" src/App.jsx` returns two lines. Tests: a signed-in toggle calls `updateProfileTheme('dark')` **and** flips the attribute; a signed-out toggle flips the attribute and calls it **not at all**; a toggle on the reset screen (after `PASSWORD_RECOVERY`) flips the attribute and calls it not at all.

- [x] **D3. Reconcile when the profile arrives**
  * **File:** `src/App.jsx` — a new `reconcileTheme` beside `applyTheme`, called from the `Promise.all().then()` at `:235-247`
  * **Action:**
    ```js
    // The account's answer wins where it has one -- that is the whole feature. It
    // is null on every account made before this existed, and adopting the device's
    // current theme up to it is what makes sure no account stays null after one
    // sign-in (Decision 4, spec criteria 3 and 10).
    //
    // The device's answer comes from a ref rather than from `theme`, because this
    // runs inside an effect keyed on [userId, recovering, contentAttempt] and a
    // closure over `theme` would be stale. Adding `theme` to those deps is not the
    // fix: it would re-fetch the library, the progress, the saved words and the
    // profile on every toggle. Nothing lints for this -- see the roadmap's Trap 5.
    const reconcileTheme = useCallback((readerProfile) => {
      // No row means nothing to reconcile with and nothing to write to -- an
      // update would reach the database and come back "nothing was updated".
      if (!readerProfile) return;

      const device = themeRef.current;

      if (readerProfile.theme) {
        if (readerProfile.theme !== device) applyTheme(readerProfile.theme);
        return;
      }

      updateProfileTheme(device).catch((error) => {
        console.error('[lesener] theme could not be saved to your account.', error);
      });
    }, [applyTheme]);
    ```
    Call it as the **first** line after the `if (cancelled) return;` guard in the `.then`, before `setContent(loaded)`. **That ordering is load-bearing:** React batches it into the same render that sets `contentStatus: 'ready'`, so the change happens on the loading screen rather than under a settled dashboard — which is exactly what spec criterion 5 requires. Add `reconcileTheme` to the effect's dep array; it is stable, so this changes no behaviour and keeps the array honest, which matters more than usual because nothing lints it.
  * The `SIGNED_OUT` branch (`:134-156`) and the effect's reset block (`:218-226`) are **not** touched (Decision 8).
  * **Done when:** `grep -n "reconcileTheme(readerProfile)" src/App.jsx` returns exactly one line, sitting **above** `setContent(loaded)`; `grep -c "themeRef" src/App.jsx` returns **3**; and six tests pass:
    * account `'dark'`, device light → attribute `dark`, localStorage `dark`, `updateProfileTheme` **not** called;
    * account `'light'`, device dark → attribute `light`, not called;
    * account `'dark'`, device dark → attribute `dark`, not called;
    * account `null`, device dark → attribute stays `dark` **and** called with `'dark'`;
    * account `null`, device light → called with `'light'`;
    * `fetchProfile` resolves `null` → not called, nothing thrown, dashboard renders.

- [x] **D4. Prove sign-out leaves the theme alone**
  * **File:** `tests/theme.test.jsx`
  * **Action:** Mount signed in with a dark account, fire `('SIGNED_OUT', null)` through the captured listeners, and assert Landing is showing **while** `data-theme` is still `'dark'` and localStorage still holds `'dark'` (spec criterion 7).
  * This test's whole job is to stop somebody adding a theme reset to the `SIGNED_OUT` branch while tidying it (Decision 8). Say so in a comment above it.
  * **Done when:** the case passes, and adding `applyTheme('light')` to the `SIGNED_OUT` branch fails it.

- [x] **D5. Prove the reconciliation does not read a stale theme** *(Trap 5)*
  * **File:** `tests/theme.test.jsx`
  * **Action:** The one test that catches Decision 6 being undone. Mount with a `fetchProfile` returning a promise held open by a `release` handle (the pattern `tests/delete-account.test.jsx` already uses for `deleteImpl`). While it is pending, click the toggle to flip the device to dark. Then release with a profile whose `theme` is `null`. Assert `updateProfileTheme` was called with **`'dark'`** — the value the reader chose while the request was in flight — and not `'light'`.
  * **How it bites, and why it is worth the setup:** replace `themeRef.current` with `theme` inside `reconcileTheme` and the closure hands back `'light'`, the value at the moment the effect ran. Every other test in the file still passes, because in all of them nothing changes between mount and resolution. This is the only case that distinguishes the two, and nothing lints for it.
  * **Done when:** the case passes, and swapping `themeRef.current` for `theme` fails it and nothing else.

- [x] **D6. Confirm every spec criterion a browser can reach.** 🧑 **Human only** — none of this is reproducible from the suite (Trap 16).
  * **Action:** Against `npm run dev` and the live database, walking the spec's criteria in order:
    * **Criterion 4, and Stage B's whole justification.** Load and reload in dark. **No white flash at any point.** Do this before anything else — it is the one check that would be masked by a warm cache and a fast machine, so throttle if in doubt.
    * **Criterion 1.** Signed in, toggling changes the theme immediately: no delay, no spinner, no confirmation.
    * **Criterion 3 and 10, on a real account that has never stored a theme.** Both accounts are `theme = null` today. Set the device to dark while signed out, sign in, and confirm **nothing visibly changes** — then read the row with `execute_sql` and confirm it now holds `'dark'` (Trap 10).
    * **Criterion 2, the whole point of the feature.** Sign the same account in on a second browser that has never shown it, whose device store says light. It must open **dark**.
    * **Criterion 5.** On that second browser, confirm the order: light while loading, dark as the dashboard appears — never dark first and then light.
    * **Criterion 8.** Toggle in browser two, confirm the row followed, reload browser one and confirm it arrives with the new theme.
    * **Criterion 7.** Sign out of browser one while dark; the landing page must be dark.
    * **Criterion 8 (signed out).** Toggle while signed out, close the browser, come back: the choice is still there.
    * **Criterion 6.** With devtools offline, toggle. The theme changes and stays, **no message of any kind reaches the reader**, and the console carries exactly one `[lesener] theme could not be saved to your account.` line with **no unhandled rejection** beside it (Trap 12).
    * **Criterion 9.** The toggle is in the same place, shows the same icons, on the same screens as before.
  * **Done when:** every criterion above has been run and its result recorded in this file, naming which two browsers were used and the `profiles.theme` value read after each step.
  * **STOP CONDITION:** 🛑 if the row is still null after the first sign-in, Decision 4's write half is not firing and the feature does nothing for anyone who does not toggle.
  * **Partly done, 2026-08-22 — the half that needs no browser was run and passed; the visual half is outstanding and is NOT claimed.** The Chrome extension was not connected, so the UI could not be driven. Everything reachable over HTTP and SQL was done instead, against the live project, on a throwaway (`theme-probe-…@lesener.test`) that was deleted through the `delete-account` function afterwards:
    * **the widened select works against the real API** — `GET /rest/v1/profiles?select=id,first_name,last_name,theme` as a genuine signed-in reader returned the row with `theme: null`, which is both `fetchProfile`'s new column list and the starting state Decision 4's adopt branch exists for;
    * **`PATCH {"theme":"dark"}` → 200** with the row echoed back, so the `update` grant and `profiles_update_own` hold **through PostgREST with the publishable key** — the path the app actually uses. Stage A proved this via `set role authenticated`, which simulates the role but not the API;
    * **`PATCH {"theme":"system"}` → 400 `23514 profiles_theme_check`** — Decision 10's whole premise, confirmed on the real path: the schema refuses it, and the error carries exactly the code `updateProfileTheme` formats into its message;
    * both real accounts untouched throughout, still `1 / null` each.
  * **The browser half was then run by Shojib, 2026-08-22, across three browsers, and the account half passed.**
    * **Criterion 1** — toggling in Edge from dark to light was instant, and the row followed: `ranguy@gmail.com` read `theme = 'light'`, `updated_at` 20:23:52. The write path works from a real browser, which no shell call could show.
    * **Criteria 2 and 5, on Safari, cleanly** — signed out it was **dark**; signing in it became **light**, the account's value, in that order. This is the whole feature observed working: a browser that had never shown the account took the account's answer over its own.
    * **Criterion 9** — the toggle is unchanged in position, icon and behaviour, visible in screenshots of Edge, Brave and Safari.
    * **Criterion 3 / 10 are implicitly confirmed** — the account had been null and now holds a value, so the adopt path ran at some point during the session.
    * **One anomaly, explained but not proven.** Brave, signing in fresh, came up **dark** while the account said `light`; reloading made it light. Safari, opened fresh, behaved correctly on the first try. **The most likely cause is a stale bundle:** Brave's tab had been open across the edits that added the reconciliation, so it signed in on code that had none, and the reload picked up the current build. *The evidence is consistent but circumstantial* — the deciding test is to sign out of Brave now that it is on current code, set the device dark, and sign in again. **Until somebody runs that, treat criterion 2 as confirmed on Safari and unconfirmed on Brave.**
    * **Worth knowing regardless (Trap 14):** a tab that was *already* signed in when another device changed the theme will not pick it up until it reloads, because the profile is only re-read when the user id changes. That is by design, is not what Brave hit, and is the same shape as Feature 5's criterion 13.
  * **Criterion 4 confirmed by Shojib, 2026-08-23, after the second attempt.** Repeated reloads in dark show no white blink. The first attempt did flash — see point 5 in this file's header — and the fix was the inline `<style>`, not the boot script, which had been correct all along.
  * **The remaining four were run in Chrome by Claude, 2026-08-23, and all four passed.** Driven through the Chrome extension against `npm run dev` and the live database, on a throwaway (`ui-probe-…@lesener.test`) deleted through the `delete-account` function afterwards. **No password was ever typed into the sign-in form**: the throwaway was created through the auth API and its session handed to the page through a temporary file the dev server served, which was removed afterwards.
    * **Criterion 8, signed-out half** — toggled to dark while signed out, navigated away and back: attribute `dark`, stored `dark`, and `html` background `rgb(15, 23, 42)`, which is `--bg` for dark and therefore proof the inline `<style>` is what paints rather than `index.css`.
    * **Criterion 2, the Brave re-test in another browser** — device store `dark`, account `light`, fresh load: the page came up **`light`** and wrote `light` to the device. A fresh sign-in *does* take the account's value, which is what the Brave anomaly above failed to do — so the stale-bundle explanation stands, on a second browser's evidence rather than on reasoning alone.
    * **Criterion 7** — toggled to dark while signed in, then Log out from the account menu: landed on Landing, session cleared, and the page **stayed dark** (`rgb(15, 23, 42)`), confirmed by screenshot.
    * **Criterion 6, the offline case** — with the profile `PATCH` made to fail the way an offline fetch does: the theme changed to light and **stayed**, `[role=alert]` count **0**, no failure text anywhere on the page, the reader left on the dashboard, **no unhandled rejection**, and exactly **one** console line: `[lesener] theme could not be saved to your account. Error: Could not save your theme: TypeError: Failed to fetch`. *An injected fault rather than a real disconnection* — it fails precisely the one request, which is what the criterion is about, but it is not the same as pulling the cable.
    * **Criterion 1 confirmed twice more in passing**, and its write checked at the source: after a signed-in toggle the throwaway's row read `theme = 'dark'`.
  * **Everything the spec asks for has now been observed.** Criteria 1–10, across Edge, Brave, Safari and Chrome.
  * **The one thing nobody has watched, and it is not a spec criterion:** a device left *untouched* while another deletes or changes something — Trap 14's case, the same shape as Feature 5's criterion 13. A tab that was already signed in does not re-read the profile until it reloads.

---

### Stage E: Cover It, Document It, Close It Out

- [x] **E1. Make the suite bite**
  * **Done when:** `npm test` passes, and each of these fails at least one test — apply, watch it fail, revert:
    a. `updateProfileTheme` sending a constant (`{ theme: 'light' }`) instead of its argument;
    b. `updateProfileTheme` dropping `.eq('id', userId)`, so the update is unfiltered;
    c. `updateProfileTheme` resolving instead of throwing on an empty result (Trap 13);
    d. `applyTheme` not setting `data-theme` on `<html>`;
    e. `applyTheme` not writing `localStorage`;
    f. the reconciliation adopting `'light'` for a null account instead of the device's theme — a reader in dark must not have light written up;
    g. the reconciliation **not** writing up when the account is null, so the account stays null forever;
    h. the reconciliation writing up when the account **already has** a value, so every sign-in issues a pointless `PATCH`;
    i. the device winning over the account — invert the comparison so `applyTheme(device)` runs instead;
    j. `reconcileTheme` reading `theme` instead of `themeRef.current` (D5 — the one only D5 catches);
    k. `toggleTheme` calling `applyTheme` instead of `chooseTheme`, so a signed-in toggle never reaches the account;
    l. the `SIGNED_OUT` branch resetting the theme to light (D4);
    m. the `.catch()` removed from either fire-and-forget call. **Judge this one by the exit code**, not the summary line (Trap 12);
    n. the key in `src/utils.js` changed without changing `index.html` (B2);
    o. `type="module"` added to the pre-paint script (B2).
  * **Deliberately absent, because no test can catch them** (Trap 16): the CHECK constraint, the `update` grant, `profiles_update_own`, whether a real `PATCH` ever leaves the browser, and **whether the flash is actually gone**. Stage A, B2 and D6 are their only guard. **Do not add a mutation that appears to cover one** — in particular, do not write anything claiming to prove criterion 4.
  * **Expected NOT to bite, recorded rather than papered over:**
    * **The `!==` guard in `reconcileTheme`** — `applyTheme` is idempotent, so removing it changes nothing observable, only an extra attribute and storage write. It is there for legibility. Keep it, do not test it.
    * **Adding `theme` to the profile effect's dep array** — fails nothing. It is a correctness and performance hazard (four requests per toggle) the suite cannot see, because every fixture resolves instantly. Decision 6 and the comment above `reconcileTheme` are the only guard.
    * **Seeding `useState` with `'light'` instead of `readStoredTheme`** — this reintroduces the wrong-glyph-on-first-frame bug from Decision 14 and the suite will very likely **not** notice, because tests assert after effects have flushed. If it does not bite, do not manufacture a test for it; note it here and rely on D6.

- [x] **E2. Document the column and supersede the stale comment** *(Decision 15)*
  * **File:** `supabase/README.md`, the `profiles` bullet in the Model section (~`:127-141`)
  * **Action:** Add a `theme` paragraph: two values only; the column has carried its check constraint since the schema was created and was unwritten until Feature 6; `localStorage` remains the device's own copy and paints the first frame, and the account's value wins on sign-in; null is a **migration state, not a value**, and the client adopts the device's theme into it on first sign-in so no account stays null. Then, explicitly: **the column comment at `init_user_schema.sql:12` describes a tri-state that was never built and is superseded by this paragraph** — the migration file is an append-only record of what was applied and is not edited (`supabase/README.md:58-67`).
  * **Done when:** `grep -n "theme" supabase/README.md` returns lines inside the `profiles` bullet, one of which names `init_user_schema.sql` and says the comment there is superseded; and `git diff --stat supabase/migrations/` is **empty**.

- [x] **E3. Close it out**
  * **Done when:** `grep -rn "setTheme" src/` returns nothing; `grep -rn "'id, first_name, last_name'" src/` returns nothing; `grep -rn "lesener-theme" src/App.jsx` returns nothing; `npm run lint`, `npm test` and `npm run build` all pass; and the final test count is recorded in this file's header against the **217 across 21 files** baseline.

---

## 📦 Suggested Commit Breakdown

Five commits, each independently working.

1. `test(profile): prove the theme column takes a reader's own write` (`A1`–`A3`) — `rls_checks.sql` only. No application code, no schema change; the constraint, the grant and the policy are proven before anything is built on them.
2. `fix(theme): stop the white flash on load` (`B1`–`B2`) — `index.html`, the moved key and its guard. Spec goal 6, and independent of everything else here: it could ship on its own.
3. `feat(profile): add updateProfileTheme` (`C1`–`C3`) — the data layer and the five harnesses taught about the new export. Behaviour is unchanged.
4. `feat(theme): make the account own the theme` (`D1`–`D6`) — indivisible; the split, the ref, the reconciliation and the tests land together.
5. `chore(theme): cover the theme path and document the column` (`E1`–`E3`).

---

## 🚫 Deferred

* **Following the operating system's theme.** Spec non-goal 1, Decision 1. A third legal value in the CHECK, a `prefers-color-scheme` read, and a live `matchMedia` subscription. A separate feature, and a migration.
* **The toggle's accessible name.** Spec non-goal 3 and spec Assumption 4; Decision 13 records what was planned and why it was dropped. It should be picked up with the three modals, which share the problem.
* **A per-device override.** Spec non-goal 2. Nobody has asked, and "the account wins" is the simpler promise.
* **Ordering concurrent writes.** Spec non-goal 7, Trap 15.
* **Telling the reader a save failed.** Spec non-goal 5, Decision 7.

---

## 🔮 Subsequent Roadmap Context

* **Accessibility, as one feature rather than four.** `DeleteModal`, `ChangePasswordModal` and `EditNameModal` each render a bare `div` overlay with no `role="dialog"`, no `aria-modal="true"`, no focus trap and no autofocus — and `ThemeToggle` renders a bare glyph with no accessible name and no `type="button"`. Feature 5 recorded the first three; Feature 6 deliberately left the fourth alone rather than fixing one control in isolation. **All four together are a well-sized feature**, and Decision 13 already contains the design for the toggle's share of it.
* **`display_name` as a chosen nickname.** Still unsent and unshown; `rls_checks.sql:125` remains a working proof of the metadata path. With `theme` written, `display_name` becomes the last unused column on `profiles`.
* **`level_progress` is still the only unread object** in the schema (`supabase/README.md:137`).
* **Content authoring for Level 2:** `b1-momentum` still holds no posts, so Feature 2's Trap 2 stands until posts are seeded by SQL. Not a code change.
* **`supabase/README.md:9-11` is stale** — it still refers to `src/data.js`, which Feature 1's Stage E deleted. A one-paragraph fix nobody has picked up; E2 is in the same file and could take it along.
* **Posts 3–10 carry placeholder prose** (`supabase/README.md:184-186`).
* **Before launch, unrelated to any feature:** the Supabase project runs with `mailer_autoconfirm = true` and no SMTP sender, which must be reverted before real accounts exist. `get_advisors(type: "security")` also reports leaked-password protection disabled.
