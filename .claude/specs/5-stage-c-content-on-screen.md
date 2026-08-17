# Content on screen

**Status:** Draft · **Feature:** 5 · **Date:** 2026-08-17

## Problem

The library exists twice over. It is stored in the database, and a second copy
is compiled into the app itself. A reader only ever sees the compiled-in copy:
the ten cards on the dashboard, their titles, blurbs and numbers, the counts of
how many posts a level holds, and the prose of every post. The database copy is
already obtained when someone signs in and is already held by the app, but the
only thing on screen that comes from it is the translation shown when a word is
tapped.

The consequence is that content cannot be corrected. Fixing a typo in a blurb,
rewording a post, or changing how many posts a level contains all require
editing the app and shipping a new build — even though the database already
holds the very values being changed. Today that is felt by the maintainer
alone, who is the only person with an account.

The second consequence is structural and arrives later. Nothing on screen is
tied to a post's real identity in the database. Which posts have been read, and
which words a reader has saved, are both meant to be remembered between
sessions, and both need to point at a real post to do it. While the screens
render the compiled-in copy, there is nothing for them to point at.

## Goals

1. Every post shown on the dashboard — its title, its blurb, its number, and
   which posts exist at all — comes from the database.
2. Every count of how many posts a level holds comes from the database, so that
   changing that number changes every place it is shown and the completion
   percentage calculated from it.
3. The level's own labels — its name, its number, and its proficiency level —
   come from the database.
4. The prose a reader reads comes from the database post they opened.
5. The line above a post's title, naming the proficiency level and the post's
   topic, comes from the database.
6. A change made to any of the above in the database is visible in the app on
   the next reload, with no code change and no rebuild.
7. While the library is being obtained, a reader is shown that something is
   loading rather than an empty or blank screen.
8. If the library cannot be obtained, a reader is told so and can try again
   without reloading the page.
9. Nothing else about reading changes: tapping a word, saving it, the session
   sidebar, the finish modal and the vocabulary bank all behave exactly as they
   do today.

## Non-goals

- **Removing the compiled-in copy of the library.** It stays in the app,
  unread by any screen. Deleting it is separate work.
- **Automated tests covering the new rendering.** The existing tests must keep
  passing, but no new ones are written here.
- **Correcting the prose of posts 3 to 10.** Those posts genuinely hold the
  wrong text in the database — two bodies alternating across eight posts,
  matching neither their titles nor each other. This work makes the app show
  what the database holds; it does not change what the database holds. The
  mismatch will therefore still be visible afterwards, and is corrected by
  editing the database, not the app.
- **An empty level.** A second level exists in the database with no posts in
  it, and nothing in the app navigates to it. What an empty level looks like is
  left for when it becomes reachable.
- **The hardcoded greeting.** The name the dashboard greets a reader by stays
  as it is until there is a real profile to take it from.
- **Remembering progress or saved words between sessions.** Which posts are
  marked read, and the words in the vocabulary bank, remain in-app state that
  resets. This work only makes them able to point at real posts later.
- **Anything shown to a signed-out visitor.** The landing page keeps its own
  copy, including its claim about how many texts there are.

## User flows

### A reader signs in and reads a post

1. The reader signs in.
2. The app shows that the library is loading.
3. The dashboard appears. It lists every post the level holds, each with its
   title, its blurb, its number, and whether it has been read.
4. The dashboard states which level this is and what it is called, how many of
   its posts are done out of how many it holds, and how many remain before the
   next level unlocks. The progress bar and percentage are calculated against
   the same number of posts.
5. The reader opens a post. The reader screen shows that post's number and
   title, a line naming the proficiency level and the post's topic, and the
   post's prose broken into paragraphs.
6. The reader taps a German word and is shown its translation, and saves it.
7. The reader finishes the post. The completion modal reports how many posts
   are done out of the number the level holds.

**States:** loading (on sign-in and on every reload of a stored session) ·
error (the library could not be obtained) · ready

### A returning reader reloads the page

1. The reader reloads with a session already stored.
2. The app shows that the library is loading. This happens on every load, not
   only on sign-in.
3. The dashboard appears as above.

**States:** loading · error · ready

### The library cannot be obtained

1. The reader signs in, or reloads, while offline or while the database is
   refusing requests.
2. The loading indication resolves into a message saying the library could not
   be loaded. The message is generic — it does not attempt to distinguish being
   offline from any other cause.
3. The reader presses Retry. The app tries again, showing the loading
   indication once more.
4. If the retry succeeds, the dashboard appears. If it fails, the same message
   is shown again and Retry remains available.

**States:** error · retrying · recovered

### The maintainer corrects content

1. The maintainer changes a value in the database — a post's blurb, title, body
   or topic, or how many posts a level holds.
2. The maintainer reloads the app.
3. The change is on screen. No code was edited and nothing was rebuilt.

**States:** ready

### Someone arrives on a password reset link

1. Someone opens a password reset link and lands on the screen for choosing a
   new password.
2. No attempt is made to obtain the library, and no loading indication is
   shown, because the library will never be displayed to them.
3. After they choose a new password and sign in normally, the library is
   obtained as it is for any other reader.

**States:** unchanged from today

## Assumptions

These were proposed and agreed during the interview rather than stated
outright. They should be confirmed before building.

1. **The level shown is the first one.** The dashboard shows a single level,
   and it is the first level by order. There is no way to move to another
   level, and progression between levels is not part of this work. This matches
   what the dashboard already claims by naming Level 1 outright.
2. **A successful outcome is invisible to a reader, apart from the two new
   states.** Every title, blurb and body currently in the database is identical
   to the compiled-in copy, so nothing on screen should change except that a
   loading indication now appears, and an error can now be shown. Any other
   visible difference is a defect.
3. **Correctness can only be established by changing the database.** The
   seeded data cannot distinguish correct wiring from incorrect: every post's
   identity happens to equal its position, so confusing the two still looks
   right, and every post shares the same topic, so the line above a post's
   title reads the same whether it is wired up or not. The acceptance criteria
   below therefore require changing a value and observing the screen follow it.
4. **Verification changes are reverted.** Each database value changed to prove
   a criterion is returned to its seeded value once the check passes, so the
   library is left as it was found.
5. **The error state is only reachable at sign-in or reload.** A failure part
   way through reading is not handled, on the basis that the library is
   obtained once, before anything is displayed, and is not requested again
   while a reader is reading.
6. **Nothing prompted this now beyond the roadmap.** There is no specific
   correction waiting to be made and no deadline. This is the next stage of
   planned work.

## Acceptance criteria

Content is live:

1. Changing a post's blurb in the database and reloading changes that card's
   blurb on the dashboard, with no code change and no rebuild.
2. Changing a post's title in the database and reloading changes it both on its
   dashboard card and at the top of the reader.
3. Changing a post's body in the database and reloading changes the prose
   shown when that post is opened, and paragraph breaks are preserved.
4. Changing a post's topic in the database and reloading changes the line above
   that post's title in the reader.
5. Setting the level's post count to 9 in the database and reloading makes the
   dashboard's completion line, its unlock line, and the finish modal all read
   9, and recalculates the percentage and progress bar against 9.
6. The dashboard states the level's name, number and proficiency level as the
   database holds them.
7. Opening the eighth card opens the eighth post — the one the database orders
   eighth — and not some other post.

The two new states:

8. Signing in shows an indication that the library is loading before the
   dashboard appears; the dashboard is never shown empty or without its posts.
9. Reloading with a session already stored shows the same loading indication.
10. Signing in with the network disabled shows a generic message that the
    library could not be loaded — never a blank screen, an empty dashboard, or
    an uncaught crash.
11. That message carries a Retry control which, once the network is restored,
    loads the library and shows the dashboard without the page being reloaded.
12. Opening a password reset link shows the new-password screen with no loading
    indication and no attempt to obtain the library.

Nothing else changed:

13. Tapping a German word in a post shows its translation, and pressing the add
    control saves it to the session sidebar and the vocabulary bank, as before.
14. A saved word appears in the vocabulary bank grouped under the post it was
    saved from, labelled with that post's number and title.
15. Finishing a post marks it read on the dashboard and shows the completion
    modal with the session's new words.
16. Signing out returns to the landing page, and signing back in obtains the
    library again and returns to a working dashboard.
17. The landing page is unchanged for a signed-out visitor, and no request for
    content is made before anyone is signed in.

Kept healthy:

18. The app builds successfully.
19. The existing test suite passes.
20. The linter reports no new problems.
