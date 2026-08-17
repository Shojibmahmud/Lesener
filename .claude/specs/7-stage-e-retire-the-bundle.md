# Stage E — Retire the Bundle

**Status:** Draft · **Feature:** 7 · **Date:** 2026-08-18

## Problem

Every piece of content a reader sees — posts, blurbs, bodies, counts, level
labels, translations — now comes from the database. The old compiled-in content
file does not. It is still shipped in the application, and the reader still
reaches for it as a fallback dictionary whenever the database dictionary is
absent.

Today that fallback never answers: the app refuses to show the dashboard or the
reader until the library has arrived, so there is no moment at which the reader
has no dictionary. That is exactly what makes it dangerous. Nothing on screen
would change if it started answering again — a loosened loading gate, a future
level-switching feature, an error path that renders the reader anyway — and it
would answer with translations that look entirely plausible while being frozen
at whatever the file said months ago. A stale translation is invisible in a way
a missing one is not.

The second half of the problem is that nothing would catch it. The suite covers
the fetch layer and the lifecycle around it, but nothing exercises the join
between them, and nothing covers word lookup at all. The seeded content actively
conceals wiring mistakes: a post's identity and its position are the same numbers
(1–10), and every post carries the same topic word, so code that confuses one for
the other renders correctly on real data and on any fixture that imitates it.

This is felt by exactly one person — the maintainer — and not now but later: the
next time content code is changed and the app keeps looking right while being
wrong. It also blocks the clean close of the content feature, which reading
progress and saved vocabulary both build on.

## Goals

1. The compiled-in content file is gone, and the database is the only source of
   translations as well as prose.
2. Word lookup behaves exactly as it does today: a known word shows its
   translation, an unknown word shows a dash — and the dash is now the only
   possible answer for an unknown word, because nothing else can answer.
3. The suite fails when content is wired to the wrong field, specifically when a
   post's identity is confused with its position, or a level's declared post
   count with the number of posts actually handed over.
4. A failure originating at the database — not a simulated one — is shown to
   reach the error screen, and retry is shown to recover from it.
5. The application is visibly unchanged in every state.

## Non-goals

- Correcting the mismatched post prose the content seed copied over. That is a
  separate feature, performed by editing the database rather than the code.
- Level switching, reading-progress persistence, saved-vocabulary persistence.
- Handling a content failure that happens part-way through reading. The library
  is fetched once, before anything renders, and is never re-requested while a
  post is open.
- Any visible change to the application. This is a hard line, not a preference.
- Updating the implementation roadmap. That is a separate pass afterwards.

## User flows

### Reading a post (must be unchanged)

1. The reader signs in.
2. The library loads; until it arrives the reader sees the loading indication
   ("Loading your library…"), never a bare or half-filled dashboard.
3. The dashboard lists the level's posts, with its progress header and unlock
   line.
4. The reader opens a post and reads its body.
5. The reader taps a word and is shown its translation.
6. The reader taps a word that has no translation and is shown a dash.
7. The reader saves a word, or dismisses the popover, and finishes the post.

**States:** empty (a level holding no posts says "No posts in this level yet."
and makes no progress claims) · loading (the indication, shown on sign-in and on
every reload of a stored session) · error ("We couldn't load your library." with
a working "Try again" that needs no page reload) · recovery link (a genuine
session that fetches nothing and shows only the reset screen, with no loading
indication) · unknown word (a dash, with no bundled copy able to answer instead)

### Verifying the wiring (maintainer)

1. The maintainer runs the test suite and it passes.
2. The maintainer deliberately breaks one wiring — a post's identity swapped for
   its position, the declared post count swapped for the number of posts present,
   the field a post's body is read from, or the answer given for an unknown word.
3. At least one test fails, and its failure names what broke rather than merely
   reporting a mismatch.
4. The maintainer reverts the break and the suite passes again.
5. Repeated for each of the four wirings.

**States:** suite passing on correct code · suite failing on each of the four
deliberate breaks · suite passing again after revert

## Assumptions

- **No new dependencies.** Any database stand-in used by the tests is written by
  hand against the tooling already installed. Confirmed during the interview.
- **Automated checks are sufficient** for proving the database is the only source
  of translations; a manual check against the live database is not required to
  call this done. Confirmed during the interview.
- **The four wirings named above are the complete bar** for "the suite actually
  bites". Other mistakes may go uncaught, and that is accepted for this stage.
- **The audience is the sole maintainer.** No other person reads this codebase,
  so nothing here needs to be legible to a newcomer beyond the maintainer's own
  future self.

## Acceptance criteria

1. The compiled-in content file no longer exists in the codebase, and no part of
   the application refers to it.
2. The application builds and lints clean with it gone.
3. Signed in, the dashboard, reader, loading indication, error screen with retry,
   empty level and recovery link all look and behave exactly as they did before
   this stage. No reader-visible difference exists in any state.
4. Tapping a word that has a translation in the database shows that translation.
5. Tapping a word that has no translation in the database shows a dash — including
   a word that the deleted file did have a translation for, which now shows a
   dash rather than the old answer.
6. Changing a translation in the database changes what the reader shows, with no
   code change.
7. The full test suite passes.
8. Breaking each of these four wirings, one at a time, fails at least one test;
   reverting it makes the suite pass again:
   a. a post's identity replaced by its position where a post is opened,
   b. the level's declared post count replaced by the number of posts present,
   c. the field a post's body is read from,
   d. the answer given for a word with no translation.
9. A failure raised by the database layer itself — not a substituted failure —
   results in the error screen, and pressing "Try again" afterwards loads the
   library and shows the dashboard without a page reload.
10. A level that hands over no posts still shows "No posts in this level yet."
    and still makes no claim about how many posts it holds.
