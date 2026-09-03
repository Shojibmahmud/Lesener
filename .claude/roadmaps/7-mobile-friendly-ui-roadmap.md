# Feature 7 Implementation Roadmap: A UI that answers to the width it is given

> **Agent Goal:** Take every screen from a fixed desktop layout that overflows a phone to one that reflows — the reader's article from ~178px of measure to the full width, with its vocabulary sidebar becoming a bottom sheet — without abandoning the inline-style convention or adding a dependency.

> **Line references** in this document were last refreshed on 2026-09-04. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

> **Written after the fact.** This records what shipped in `2f5e31c`, not a forecast. Behaviour is owned by [`.claude/specs/14-mobile-friendly-ui.md`](../specs/14-mobile-friendly-ui.md); where the two disagree, the spec wins. Every task below is ticked because the work is done and verified on both platforms — the value here is the traps section and the commit shape, for whoever changes this next.

---

## 📌 Context & Motivation

* **Goal:** Make Landing, Dashboard, Reader, VocabBank, the auth screens and the four dialogs usable on a phone, and fix the iOS-specific defects that are not about width at all.
* **Why:** Every width, grid and font size lived in an inline `style={{}}` object, which a media query cannot reach, and `src/index.css` held no width query at all. The reader kept `gridTemplateColumns: '1fr 300px'` at every width, leaving the article ~178px of measure — German prose at roughly one word per line. A reader on an iPhone hit this and went looking for Safari's *Request Desktop Website*. On Android that at least renders the desktop layout scaled to illegibility; on iOS the viewport declaration is honoured and there is no escape at all.

---

## 📐 Architecture & Architectural Decisions

1. **Hybrid, not a rewrite.** Intrinsic CSS written *inside* the existing inline objects handles nearly everything: `clamp()` for type and gutters, `repeat(auto-fill, minmax(min(100%, Npx), 1fr))` for card grids, `flexWrap`, `minmax(0, 1fr)` to kill grid `min-width: auto`. No breakpoint, no JavaScript, no re-render on resize. **Locked** because the alternative — lifting layout into CSS classes — is a rewrite of five screens' styling for a problem that mostly does not need it.
2. **`min(100%, …)` inside every `minmax`.** Without it a track minimum can exceed its container and the grid ends up wider than the page — reintroducing the exact bug being fixed. **Locked** as a rule, not a preference.
3. **One breakpoint, `NARROW = 820`** (`src/lib/responsive.js`). Phones and small foldables get the phone layout; a tablet in portrait still fits the 300px sidebar plus ~700px of text. **Locked** because a second breakpoint needs a second thing to be true of every screen and nothing needs that yet.
4. **`useIsNarrow` is only for changes of *shape*.** Three uses: the Reader's sidebar → bottom sheet, the Dashboard's level switcher → scrolling strip and its header dropping the level badge, the VocabBank's rows stacking. **Locked:** reaching for it to change a padding means a `clamp()` was available and was not used.
5. **The guard is `typeof window.matchMedia !== 'function'`** (`src/lib/responsive.js:67`). **Locked, and not stylistic.** jsdom implements no `matchMedia`; vitest then copies the key onto the global carrying that `undefined`. So `'matchMedia' in window` is `true` and throws on the call, and `window.matchMedia?.(q)` returns `undefined` and throws on `.matches`. Both idiomatic alternatives are wrong.
6. **Two variants are a JSX ternary, never one hidden by CSS.** **Locked** — see trap 1.
7. **The Reader keeps an inner scroll container.** `measure()` reads `scrollTop`/`scrollHeight`/`clientHeight` off `scrollRef`. Letting the document scroll instead would report 100% for every post, silently. **Locked.**
8. **Four headers share a recipe, not a component** (`headerRow` in `src/lib/responsive.js`). They carry genuinely different content; a component covering all four needs enough slots to stop being simpler. **Locked** for now, revisit if a fifth screen appears.
9. **Only the `font:` shorthands that must be fluid get split** into longhand — about six. The other ~84 stay. **Locked:** a mechanical 90-site diff would bury the six changes that matter.
10. **No new runtime dependency.** Still `react`, `react-dom`, `@supabase/supabase-js`.

---

## ⚠️ Known Traps & Edge Cases

Every entry below was actually observed during this work.

* **`src/index.css` is never loaded by any test.** `src/main.jsx:3` is its only importer and no test imports `main.jsx`; `tests/theme-boot.test.js` reads it as *text*. Combined with jsdom not evaluating width queries, rendering both the sidebar and the sheet and hiding one with CSS would leave both in the accessibility tree — breaking seven singular queries (`getByRole('button', {name: '+'})`, `getByText('—')`, `getByRole('alert')` and others in `tests/reader-saving.test.jsx` and `tests/reader-dictionary.test.jsx`).
  **Rule:** mutually exclusive UI is a JSX ternary. Never `display: none` by media query.
* **A CSS comment broke a test.** A comment added to `src/index.css` warning that the dark-theme selector must not appear above `--bg` *contained that selector as a literal string*. `tests/theme-boot.test.js:29` finds the dark colour by slicing the file from the first occurrence of that literal and taking the next `--bg` — so it sliced from the comment and read the light hex. `matches --bg for the dark theme` failed.
  **Rule:** in `src/index.css`, the `:root` block holding `--bg` stays first, and nothing above it may contain the dark selector — including prose describing it.
* **`tests/reading-progress.test.jsx:151` takes the *first* `[style*="overflow-y: auto"]` in document order.**
  **Rule:** in `src/components/Reader.jsx`, no element above the `scrollRef` div may carry any `overflow*: auto`. Also never write `overflow: 'hidden auto'` on the pane — it serialises without the substring and the selector returns `null`.
* **Three tests compare the word span's class with `===`, not `.includes()`** (`reader-dictionary:41`, `reader-saving:45`, `dashboard-content:95`).
  **Rule:** the span at `Reader.jsx` keeps `className="w"` exactly. Touch and hover treatment goes in `index.css` on `.w`, or in the inline style object — never in the class list.
* **A grid's implicit row is `auto`, and an auto track sizes to its items' max-content contribution** — for a scroll container, that is its *content's* height. The first draft of the Reader's flex column had `flex: 1; minHeight: 0` but no row track, so the row grew past the container and nothing scrolled.
  **Rule:** `gridTemplateRows: 'minmax(0, 1fr)'` (`Reader.jsx:238`) is load-bearing, not decoration.
* **`@keyframes pop` has two consumers**, `Reader.jsx` and `Landing.jsx` (the marketing hero's decorative popover). It bakes `translate(-50%, …)` into both frames for a popover centred on its word.
  **Rule:** do not edit `pop` to suit one caller. The phone translation bar reuses `slideup`.
* **`calc(100vh - 57px)` had always been 7px wrong.** The Reader's header is 64px — 26px padding, a 34px button, a 3px progress track, a 1px border — so both panes had overhung the viewport at every width since they were written.
  **Rule:** prefer a flex column that derives the height over a hand-computed offset. The number cannot be kept correct by inspection.
* **`@media (prefers-reduced-motion)`'s `.lift:hover { transform: none }` had never applied.** It sat above the `.lift:hover` that sets the transform, at identical specificity — a media query contributes none — so source order won. Only the `!important` half of the block worked.
  **Rule:** that block stays last in `src/index.css` (`:222`).
* **`14.5px` appears twelve times but only one is an input.** iOS zooms on a focused control under 16px; the other eleven are body paragraphs and zoom nothing.
  **Rule:** only `src/lib/authUi.js` needed the bump. Changing all twelve would have been a gratuitous visual change.
* **`.trash` was not invisible on touch, it was dim.** `opacity: .35` with the reveal on `.rowh:hover`, which a phone never fires. The real defects were contrast and a 32px hit area.
  **Rule:** state what was observed. Declaring the dimming inside `@media (hover: hover)` (`index.css:178`) gives touch the initial `1`.
* **`overflow-x: clip`, never `hidden`** (`index.css:68`). `hidden` on one axis makes the other compute from `visible` to `auto`, creating a scroll container and silently breaking all four sticky headers. `clip` creates none. Safari only understands it from 16; older Safari drops the line and gets the previous behaviour.
* **Absolutely positioned corners collide with a growing centred card.** The auth screens placed the logo and toggle at fixed offsets over a vertically centred card; the sign-up form is tall enough on a phone that its top corners reached up behind them. Found on a real device, not in a test.
  **Rule:** a real header row plus `margin: auto` on the card.
* **Structural selectors that constrain unrelated edits:** `.lift` must stay on post cards and no button may be inserted before "Read post" inside one (`reading-progress:92,96`, `level-switching:95,98`); the DeleteModal backdrop must stay exactly two levels above its heading (`delete-account:254`); the dashboard's level line must stay a `<p>` inside `<main>` whose text starts `Level N:`, so leave the 🔒 on the locked and empty paragraphs (`level-switching:113`); VocabBank must have no `<section>` but one per word group (`vocab-bank:40`).

### What the tests cannot catch

The suite runs in jsdom, which has **no layout engine and no stylesheet**. It cannot see an overflow, a font size, a `clamp()`, a grid track, or anything in `src/index.css`. Every visual claim in the spec's acceptance criteria was settled by measuring `documentElement.scrollWidth - clientWidth` and computed styles in a real browser at 320/390/590px, and then on physical devices. A whole class of regression — the layout silently going back to overflowing — would leave all 262 tests green. There is no CI, so nothing will notice on your behalf.

---

## 📋 Execution Roadmap & Tasks

### Stage A: Prove the mechanism is safe before touching a component
STOP condition: if A1–A2 leave the existing suite anything other than fully green, the breakpoint approach is wrong and nothing below should proceed.

- [x] **A1. Add the breakpoint hook**
  * **File(s):** `src/lib/responsive.js` (new)
  * **Action:** `NARROW`, `gutter`, `headerRow`, `useIsNarrow()` over `useSyncExternalStore`.
  * **Done when:** the existing suite still reports 252 passing with the module present.
- [x] **A2. Teach the test environment about width**
  * **File(s):** `tests/setup.js`
  * **Action:** shim `matchMedia` to evaluate `(max-width: Npx)` against `window.innerWidth`, with `matches` as a live getter.
  * **Done when:** `npm test` is 252 passing, and a probe rendering `useIsNarrow()` with `matchMedia` removed returns `false`.

### Stage B: Foundations that are global
- [x] **B1. Stylesheet groundwork**
  * **File(s):** `src/index.css`
  * **Action:** `-webkit-text-size-adjust`, `overflow-x: clip` on `html`, `#root` to `100dvh` with the `100vh` fallback line kept first.
  * **Done when:** `grep -c "100dvh" src/index.css` returns non-zero and `npm test` is green.
- [x] **B2. Gate every hover rule on a pointer**
  * **File(s):** `src/index.css:178`
  * **Action:** move `a:hover`, `.lift:hover`, `.w:hover`, `.btnp:hover`, `.btng:hover`, `.rowh:hover`, `.rowh:hover .trash` and `.trash`'s dimming into `@media (hover: hover)`; keep `.btnp:active` and all `transition`s outside.
  * **Done when:** `grep -n ":hover" src/index.css` shows no hover rule outside the block except inside `prefers-reduced-motion`.
- [x] **B3. Move the reduced-motion block to the end of the file**
  * **Done when:** its line number exceeds every `.lift:hover` line number.
- [x] **B4. 16px form inputs**
  * **File(s):** `src/lib/authUi.js`
  * **Done when:** `grep "font:" src/lib/authUi.js` shows `16px` on `inputStyle` and the other eleven `14.5px` occurrences are untouched.
- [x] **B5. `100dvh` on the full-height screens**
  * **File(s):** `src/App.jsx`, `ContentError.jsx`, `ContentLoading.jsx`, `AuthScreen.jsx`, `NewPassword.jsx`
  * **Done when:** `grep -rn "minHeight: '100vh'" src/` returns nothing.

### Stage C: The four headers
- [x] **C1. Apply `headerRow` at all four sites**
  * **File(s):** `Landing.jsx`, `Dashboard.jsx`, `Reader.jsx`, `VocabBank.jsx`
  * **Done when:** `grep -rn "padding: '1[348]px \(32\|40\)px'" src/components/` returns nothing.
- [x] **C2. Stop the Dashboard header overflowing**
  * **Action:** `flexShrink: 0` on the control cluster; drop the level badge when `narrow` — it duplicates the line under the greeting.
  * **Done when:** measured in a browser at 390px, the header is one row and `scrollWidth - clientWidth` is 0.
- [x] **C3. Bound the Reader's post title** with `minWidth: 0` + ellipsis.
  * **Done when:** at 320px the title truncates rather than pushing the percentage off the row.

### Stage D: Landing
- [x] **D1.** Hero to `repeat(auto-fit, minmax(min(100%, 380px), 1fr))`, fluid gap and padding.
- [x] **D2.** Split the 62px headline to longhand with `clamp(34px, 8.5vw, 62px)`.
- [x] **D3.** Wrap the CTA row, the stats row and the footer; pull the glow's `inset` in from `-26px -18px`.
- [x] **D4.** Features grid to `auto-fit`.
- [x] **D5.** Tighten the two header buttons' horizontal padding.
  * **Done when:** measured at 390px the header is 61px (one row), and headline `font-size` is 34px at 390 / 62px at ≥730.

### Stage E: Dashboard
- [x] **E1.** `main` padding to `gutter`; greeting row wraps; greeting `clamp(28px, 7vw, 40px)`.
- [x] **E2.** Level switcher becomes a snapping horizontal strip when `narrow`, bled to the gutters.
  * **Done when:** measured at 390px the pill row is 37px tall and `scrollWidth > clientWidth`.
- [x] **E3.** Post grid to `repeat(auto-fill, minmax(min(100%, 240px), 1fr))`.
  * **Done when:** measured, cards occupy 1 row-per-card at 390px and 2 per row at 590px.

### Stage F: Reader — indivisible
These cannot be split. Removing the fixed height without the flex column leaves panes with no height; adding the sheet without collapsing the grid renders it over a still-narrow column; changing the grid without `gridTemplateRows` stops all scrolling. Any intermediate state is a broken reader.

- [x] **F1.** Flex column at `100dvh`; grid gets `gridTemplateColumns: narrow ? '1fr' : '1fr 300px'` **and** `gridTemplateRows: 'minmax(0, 1fr)'`; both `calc(100vh - 57px)` deleted; fluid padding.
- [x] **F2.** Title and body to `clamp()`; `overflowWrap: 'break-word'` on the word span's style object (**not** its class list).
- [x] **F3.** The bottom sheet: collapsed bar carrying the tap-a-word hint until something is saved, then the count; expands on tap; opens itself on `saveWordFailed`; peeks the just-saved word for 1.6s.
- [x] **F4.** Translation as a fixed bar above the sheet when `narrow`, reusing `slideup`; the desktop popover gains `maxWidth: 'min(280px, 60vw)'` and wraps.
  * **Done when:** measured at 390px the paragraph column is ~348px (was ~178px), `scrollWidth - clientWidth` is 0, and `tests/responsive.test.jsx` passes including the assertion that the sheet and the `<aside>` are never both present.

### Stage G: VocabBank, auth screens, dialogs
- [x] **G1.** Word rows to `minmax(0, 1fr)`, stacking under `narrow` by grid placement — **not** by reordering the DOM — with a 44px trash target.
- [x] **G2.** Auth screens: fluid padding; name fields `flex: '1 1 150px'` and wrap.
- [x] **G3.** Dialogs scroll when taller than a short viewport: `overflowY: 'auto'` on the **existing** backdrop plus `margin: 'auto'` on the card, keeping `display: flex`. **No new wrapper element** — `delete-account.test.jsx:254` walks exactly two parents.
- [x] **G4.** Auth logo and toggle become a real header row instead of absolute corners.
  * **Done when:** measured at 320/390/590 the logo's bottom edge is above the card's top edge at every width.

### Stage H: Verify
- [x] **H1.** `tests/responsive.test.jsx` covering the breakpoint, the sheet, mutual exclusivity, and the guard's fallback. **Done when:** 262 tests pass.
- [x] **H2.** Measure in a browser at 320/390/590px. **Done when:** `documentElement.scrollWidth - clientWidth === 0` on every screen at every width.
- [x] **H3. Human only — a real Android device.** Verified on a Galaxy S24 Ultra in Brave: reader, sheet, save, finish, vocab bank, all four dialogs, both themes.
- [x] **H4. Human only — a real iPhone.** Verified on iOS Safari against production: the session bar sits above Safari's chrome (`100dvh`), a focused field leaves the page unzoomed (16px inputs), and the vocab bank's trash icons are visible (touch has no hover).

---

## 📦 Suggested Commit Breakdown

What actually shipped, squashed to one commit on `main` (`2f5e31c`, 21 files, +1,173/−141). Had it been split, the seam is:

1. **Stages A–B** — `responsive.js`, the `matchMedia` shim, the stylesheet groundwork, hover gating, 16px inputs, `100dvh`. Working app, no visible change on a desktop.
2. **Stages C–E** — headers, Landing, Dashboard. Working app, phones improve.
3. **Stage F** — the Reader, whole. Indivisible for the reasons above.
4. **Stage G** — VocabBank, auth, dialogs.
5. **Stage H** — `tests/responsive.test.jsx`, plus `docs/architecture.md` and the `CLAUDE.md` trap list.

The auth header-row fix (G4) landed as a separate commit on the branch after device testing, and was squashed with the rest.

---

## 🔮 Subsequent Roadmap Context

No feature is waiting on this one; it was shipped because a real reader hit it. For whoever comes next:

* **`src/lib/responsive.js` is deliberately small.** If a future screen needs a second breakpoint, that is a decision to make explicitly (decision 3), not to drift into.
* **Nothing retires as a result of this.** No hardcoded value was left behind for a later feature to remove, and no database object was touched — the schema, the RLS policies and `public.level_progress` are all exactly as they were.
* **The `.claude/specs/14-mobile-friendly-ui.md` assumptions are now stale in a good way.** Assumptions 1 and 3 hedge that the iPhone breakage and its causes were inferred rather than observed; both have since been confirmed on the device. Assumption 2's iOS half remains supported only by secondary sources — Apple's own viewport documentation is archived and predates the feature — so keep the qualifier if it is ever written into `docs/`.
* **The real maintenance hazard this adds** is that jsdom cannot see layout. A future change can undo every measurement in Stage H with the suite still fully green.
