# Stage D — Empty Level State

**Status:** Draft · **Feature:** 6 · **Date:** 2026-08-17

## Problem

When the level a reader is working through hands over no posts, the dashboard fails in two ways at once.

It is **silent**: the post grid simply renders nothing, with no word to the reader about why. An empty page is indistinguishable from a page that has broken.

Worse, it is **wrong**. The progress figures beside the grid are drawn from the level's own record of how many posts it contains, not from the posts actually received. So a reader who has been handed nothing still sees the level claim ten posts exist — "0 of 10 posts completed", a percentage, a progress bar, and a line promising the next level unlocks once all ten are read. The screen asserts a library it cannot show.

Of the two, the false claim is the more serious. Silence is merely unhelpful; a confident, specific, incorrect number invites the reader to believe the content is there and that something is wrong with the app.

This is reachable today. The reader-facing level is never access-restricted, but its posts can be absent or unpublished, and either produces exactly this screen.

## Goals

1. A level that hands over no posts tells the reader so, in place of an empty grid.
2. No progress, percentage, or unlock claim is shown that the visible content cannot substantiate.
3. Everything on the dashboard that does not depend on posts stays available to the reader.
4. A level that does hand over posts behaves exactly as it does today, with its full progress display intact.
5. The empty state is never mistakable for the library still arriving, or for the library having failed to arrive.

## Non-goals

- **Telling a locked level apart from an empty one.** A level whose posts are withheld for access reasons reports a post count while handing over nothing — genuinely different from a level that holds nothing. Only the first level is ever shown and it is never access-restricted, so this cannot arise yet. Whoever makes a second level reachable must handle it rather than inheriting this spec's wording.
- **Navigating between levels.** Nothing in the app moves a reader from one level to another; that remains later work.
- **Changing the dashboard greeting.** The hardcoded personal greeting stays as it is — replacing it with a real profile name is a separate feature.
- **Retiring the bundled fallback content, or broadening the dashboard's test coverage.** Both are the following stage's cleanup work.

## User flows

### A level with posts to read (unchanged — regression guard)

1. The reader signs in.
2. The library loads.
3. The dashboard appears with a card for every post, the level name and completed count, the percentage, the progress bar, and the unlock line — all exactly as before this change.

**States:** loading (the library is still arriving) · error (it did not arrive) — both unchanged.

### A level with no posts to read

1. The reader signs in.
2. The library loads successfully. The level exists and is named, but it hands over no posts.
3. The dashboard appears, keeping its header: the saved-words count, the theme toggle, and the account menu with sign-out.
4. Where the post grid would be, the reader sees a single panel reading **"No posts in this level yet."**
5. The level is still named above it. The completed-count clause, the percentage, the progress bar, and the unlock line are all absent — not zeroed, absent.
6. Nothing in the panel is actionable. There is no reader action that would cause content to appear, so none is offered.
7. The reader can still open their saved words, switch theme, or sign out from the header.

**States:** empty (this flow) · loading · error · a library containing no levels at all

- **loading** — while the library is still arriving, the reader sees the existing loading indication. The empty message must not appear during this window: a library that has not arrived is also one with no posts, and the two must never look alike on screen.
- **error** — if the library cannot be fetched, the existing full-screen failure message with its retry control is shown instead. The empty state is not a failure and offers no retry.
- **a library containing no levels at all** — this remains a failure, not an empty level, and continues to show the error screen with its retry control. "There is no level to name" and "the named level is empty" are different situations with different screens.

## Assumptions

1. **The deferral is being lifted on the strength of a reachability finding.** This state was previously recorded as unreachable, on the grounds that no second level can be navigated to. That much is true, but the first level's posts can be unpublished, which produces the same screen. Confirm that before building — the whole spec rests on it.
2. **One message covers both causes.** A level recorded as holding no posts and a level whose posts are all unpublished show identical wording. They are not distinguished, because the reader can act on neither.
3. **The empty panel reuses the dashboard's existing card treatment** — same surface, border, corner radius and shadow as a post card — rather than introducing a new visual style. It should read as part of the dashboard, not as a new screen.
4. **The wording "yet" is deliberate.** It implies content is expected without promising a date.

## Acceptance criteria

1. With the reader-facing level's posts unpublished, signing in shows a dashboard whose grid area reads "No posts in this level yet."
2. In that same state, the text "10" — or any other post count — appears nowhere on the dashboard. Specifically, there is no completed-count clause after the level name, no percentage, no progress bar, and no line stating what unlocks when all posts are read.
3. In that same state, the level is still named on screen, so the reader knows which level is empty.
4. In that same state, the saved-words count, the theme toggle, and sign-out are all still present and working from the header — the reader is not stranded on a dead screen.
5. In that same state, the screen is visibly distinct from the loading indication and from the load-failure message, and offers no retry control.
6. Republishing the level's posts and reloading restores all ten cards, the completed count, the percentage, the progress bar, and the unlock line, identical to before the change.
7. Signing in with the library slow to arrive shows the loading indication only. The empty message does not appear at any point before the cards do.
8. A successfully loaded library containing no levels at all still shows the load-failure message with a working retry, not the empty-level message.
9. An automated test covers the empty case and fails if the empty-state handling is removed.
10. The existing test suite passes and the production build succeeds.
