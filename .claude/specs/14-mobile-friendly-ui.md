# Mobile-friendly UI

**Status:** Draft · **Feature:** 14 · **Date:** 2026-09-03

## Problem

Lesener's layout is built for a desktop window and does not respond to narrower
screens. Every screen is laid out at a fixed width, so on a phone the design does not
reflow — it overflows.

On an Android phone at roughly 590px wide:

- The header row runs off the right edge on every screen, taking the account button
  with it.
- The landing page sets its headline at 62px inside a column about 234px wide, so the
  title breaks to one word per line and the preview card beside it is pushed
  off-screen.
- The reader keeps its fixed-width vocabulary sidebar beside the article at all
  widths. The text column is left with roughly 178px of measure for 21px serif type,
  which renders German prose at about one word per line. This is the only screen where
  the app stops being usable rather than merely looking wrong.

This affects real readers now, not only pre-release testing. A reader on an iPhone hit
it in both Safari and Chrome and went looking for Safari's "Request Desktop Website"
to escape it.

The workaround is worse than it appears. Requesting the desktop site on Android does
produce the correct layout, but scaled to fit a phone screen, so body text lands around
8–10px and every word must be pinch-zoomed to read. On iOS the same option does not
appear to rescue the layout at all, leaving that platform with no workaround.

Lesener is a reading app. A reader who cannot comfortably read a paragraph, or tap a
word to translate it, has nothing left to use.

## Goals

1. No screen scrolls sideways at any viewport width from 320px upward.
2. Body text is legible on a phone at normal zoom, so no reader needs desktop mode or
   pinch-zoom to read a post.
3. A post can be read from start to finish on a phone: the article occupies the full
   width at a natural measure, and the session's saved words remain reachable without
   leaving the text.
4. Tapping a word on a phone shows its translation in full and offers the same save
   action as on a desktop, without the translation being clipped or pushed off-screen.
5. The dashboard, landing page, vocabulary bank, authentication screens and dialogs are
   each usable and unembarrassing on a phone.
6. The iPhone-specific failures are fixed: the page is not taller than the visible
   screen, focusing a form field does not zoom the page, a tapped element does not stay
   visually stuck in its hover state, and primary controls are large enough to tap
   reliably.
7. Everything the app does today still works, on every screen size.

## Non-goals

- A separate mobile application, a PWA, offline reading, or installability.
- Native-app gestures — swiping between posts, pull-to-refresh, drag-to-resize.
- Any change to the German texts, the dictionary, the level structure, or any user-
  facing wording, except where a control is newly introduced by this work.
- Any database, schema or access-rule change. This is a client-side layout change only.
- Any new runtime dependency.
- Bespoke tablet or landscape designs beyond what a fluid layout produces on its own.
- A full accessibility review. Touch target sizes are in scope; screen-reader and
  keyboard-navigation work is not.
- Full fidelity on browsers older than roughly iOS 16. Older browsers should fall back
  to today's behaviour rather than break.

## User flows

### Reading a post on a phone

1. The reader opens a post from the dashboard.
2. The article fills the width of the screen and sets at a comfortable measure — full
   sentences per line, not single words. The post title is sized to fit rather than
   overflowing.
3. A bar is pinned to the bottom of the screen. Before anything is saved it reads as an
   invitation to tap a word for a translation. Once words have been saved it shows the
   running count for this session.
4. The reader taps a word. Its translation appears in full above the bottom bar, with a
   control to save it. Long translations are shown in full rather than clipped, wherever
   the word sits on the line.
5. The translation is dismissed by saving the word, by tapping the same word again, by
   tapping another word, or by tapping anywhere else — the same rules as on a desktop.
6. Saving a word increments the count in the bottom bar, and the bar briefly names the
   word just saved before returning to the count, so the reader gets confirmation
   without losing their place.
7. Tapping the bottom bar expands it into a list of the words saved this session, over
   the text. Tapping it again collapses it.
8. Scrolling the article updates the progress indicator in the header, reaching 100% at
   the end, exactly as it does on a desktop.
9. The reader reaches the end and presses the control to finish reading, which is not
   obscured by the bottom bar.

**States:** empty (nothing saved yet — the bar carries the tap-a-word invitation
instead of a count) · loading · error · save failed (the sheet opens by itself so the
retry message is seen, rather than the reader believing a word was saved when it was
not) · a post short enough not to scroll, which counts as fully read.

### Choosing a post on a phone

1. The reader opens the dashboard.
2. The header fits the screen: nothing is cut off, and the account control is reachable.
3. The level switcher is browsable without consuming most of the screen before any
   content appears.
4. The post cards are stacked so each is wide enough to read its title and summary, and
   its buttons are reachable.
5. Progress, the greeting and the level name are all readable without sideways scrolling.

**States:** empty (a level with no posts) · locked (a level not yet unlocked) · loading
· error. Each keeps its distinct existing wording.

### Arriving on the landing page on a phone

1. A visitor opens the site on a phone.
2. The headline is sized to the screen and reads as a headline, not as one word per line.
3. The sample-text preview sits below the headline rather than being pushed off the
   right edge, and stays within the screen.
4. Both calls to action are visible and tappable without sideways scrolling.
5. The explanatory sections and footer stack legibly.

**States:** signed out (the default) · already signed in, where the calls to action lead
to the dashboard as they do today.

### Reviewing saved words on a phone

1. The reader opens the vocabulary bank.
2. Each entry shows its German word and translation legibly, including long compound
   nouns, without forcing the page sideways.
3. The delete control for each entry is visible without hovering — which is impossible
   on a touch screen — and is large enough to tap accurately.

**States:** empty (nothing saved yet) · removal failed · loading · error.

### Signing in or creating an account on a phone

1. A visitor opens the sign-in or sign-up screen.
2. The form fits the screen with sensible margins; paired fields stack rather than
   being squeezed side by side.
3. Tapping into a field does not zoom the page in and leave it zoomed.
4. Dialogs — change password, edit name, delete account, finish reading — fit on a
   short screen, and can be scrolled if their content is taller than the screen rather
   than having their top or bottom cut off unreachably.

**States:** empty · submitting · error · expired or invalid reset link. All keep their
existing wording.

## Assumptions

These are answers proposed rather than given, or inferences not yet confirmed. Each
should be checked before or during implementation.

1. **The iPhone reader's difficulty is the same layout problem as the Android
   screenshots.** Only a single frame of the iPhone recording could be read — it shows
   the Safari page menu open at "Request Desktop Website" — so the specific breakage
   that reader experienced was inferred from the Android evidence, not observed.
2. **Desktop mode helps on Android but not on iOS because the two browsers treat the
   page's viewport declaration differently.** Checked 2026-09-03, and the two halves
   rest on different quality of evidence.

   The Android half is **confirmed at source**. Chromium landed a change in April 2016
   (commit `5252baa9`) described as: *"Ignore viewport meta tags when Request Desktop
   Site is enabled. This matches desktop Chrome, and it applies the default
   `min-width: 980px` in viewportAndroid.css — putting responsive pages into their
   desktop/tablet layout."* Brave is Chromium-based and inherits this, which is why the
   Android desktop-mode screenshots show the full 1180px design scaled down.

   The iOS half is **supported but not confirmed at primary source**. Apple's own
   viewport documentation states that an orientation change *"is the only situation
   where a user action might resize the viewport, changing the layout on iOS"* — but
   that page is archived and was last updated in December 2016, before Request Desktop
   Website reached the iPhone in iOS 13. Independent secondary sources consistently
   report that the iPhone feature changes the User-Agent while layout width stays at
   device width, so a responsive-by-declaration page keeps its narrow layout. That
   matches what was observed on the actual devices.

   The practical consequence, which is what matters here: **iOS readers have no
   workaround at all.** Lesener declares itself responsive but is not laid out
   responsively, so iOS honours the declaration and serves the broken narrow view with
   no escape hatch. If this is ever written into `docs/`, carry the qualifier about the
   iOS half rather than stating it flatly.
3. **The specific iOS defects listed in goal 6 are contributors to what that reader
   saw.** They are known properties of iOS browsers and are worth fixing regardless, but
   none has been confirmed against the actual device.
4. **The layout switches to the phone arrangement below about 820px.** Chosen so that
   phones and small foldables get the single-column reading layout while a tablet in
   portrait still has room for the sidebar.
5. **A tap target of about 44px is the size to aim for.** Taken from common platform
   guidance rather than from any measurement of what the group's devices need.
6. **Desktop appearance may change where the change is an improvement.** It is not
   required to be pixel-identical, so incidental desktop defects found along the way may
   be corrected.

## Acceptance criteria

1. At viewport widths of 320, 390, 590, 820 and 1280px, no screen — landing, dashboard,
   reader, vocabulary bank, authentication — scrolls horizontally.
2. On a phone at normal zoom, a post's body text can be read without pinch-zooming and
   without switching the browser to desktop mode.
3. On a phone, a paragraph in the reader reads as continuous prose — typically several
   words to a line — rather than a narrow column of stacked single words. An unusually
   long compound noun taking a line to itself is acceptable; a paragraph in which most
   lines hold a single word is not.
4. On a phone, tapping a word in the reader shows its full translation on screen,
   including for a word at the very start or end of a line and including a translation
   several words long.
5. Saving a word from a phone increases the session count shown at the bottom of the
   reader, and the word appears in the expanded session list.
6. With nothing yet saved, the reader's bottom bar tells the reader to tap a word; after
   the first save it shows the count instead.
7. If saving a word fails, the retry message is visible on a phone without the reader
   having to open anything first.
8. Scrolling a post to the end on a phone shows 100% read, and finishing the post
   records that figure — the same as on a desktop.
9. The finish-reading control is fully visible and tappable on a phone and is not
   covered by the session bar.
10. On the dashboard on a phone, the header is entirely on screen including the account
    control, and every post card's title, summary and buttons are legible and tappable.
11. On the landing page on a phone, the headline fits the screen and the sample preview
    is fully on screen below it.
12. In the vocabulary bank on a phone, a long German compound noun and its translation
    are both readable without the page scrolling sideways, and each entry's delete
    control is visible without hovering.
13. Tapping into any form field on an iPhone does not leave the page zoomed in.
14. After tapping a word, a post card or a button on a touch screen, no element remains
    stuck in a hover appearance.
15. On an iPhone, no screen is taller than the visible area in a way that hides content
    behind the browser's own chrome.
16. Above 1180px every screen still renders correctly, and any deliberate desktop change
    is an improvement rather than a regression.
17. The existing test suite passes, with added coverage for the phone layout.
18. A reader in the group can read a post end to end on their own phone without
    resorting to "Request Desktop Website".
