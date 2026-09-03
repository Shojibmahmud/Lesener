# Persist Reading Progress

**Status:** Implemented · **Feature:** 8 · **Date:** 2026-08-18

## Problem

Nothing a reader does is remembered. The list of completed posts is a hardcoded
literal, so it is identical for every account and vanishes on reload — a
brand-new reader is congratulated with "7 of 10 posts completed" and a 70% bar
they never earned. And because no completion is ever recorded, the level gate
never opens: Level 2 is permanently unreachable for everyone, no matter how much
they read.

This is felt by every signed-in reader. The dashboard's counts, its percentage,
its progress bar and its ✓ Gelesen badges are all decoration. A reader has no
way to tell what they have actually finished, and no reason to believe that
finishing anything matters.

## Goals

1. A post a reader finishes stays finished — through a reload, a sign-out, and a
   sign-in on a different device.
2. Every figure on the dashboard — the completed count, the percentage, the
   progress bar, the "to go" line and each card's badge — describes that
   reader's real history and nobody else's.
3. Finishing a post records how far that reader actually read, not a fixed
   value.
4. A level opens only when its predecessor has genuinely been completed, and the
   decision about what a reader may read is enforced by the server rather than
   by the browser.
5. A reader can move between levels, sees which are still locked, and is told
   what unlocks them.
6. A locked level and an empty level are visibly different things, each
   explaining itself in its own words.

## Non-goals

1. **Recording abandoned reads.** Only finishing a post records anything. A
   reader who reads most of a post and leaves has no trace, and the app offers
   no "resume where you left off".
2. **Undoing a completion.** There is no "mark as unread". Once a post is
   finished it stays finished.
3. **Persisting the vocabulary bank.** Saved words remain as they are today and
   are handled by a later feature.
4. **Replacing the hardcoded greeting.** The dashboard continues to greet every
   reader by the same name; the real profile is a later feature.
5. **Writing Level 2's posts.** Level 2 holds no content, and this feature adds
   none. It makes the level *reachable*; filling it is separate content work.
   The consequence is accepted deliberately: see the note under "Moving between
   levels".

## User flows

### Finishing a post

1. The reader opens a post from the dashboard.
2. As they scroll, the reader header tracks how far through they are.
3. They press **Finish reading**.
4. The finish modal appears, and the dashboard behind it updates at once: the
   post's card gains its ✓ Gelesen badge, the completed count rises by one, and
   the percentage and bar move to match.
5. Returning to the dashboard, the change is still there.

**States:** loading — the library and the reader's progress arrive together, and
the dashboard is not shown until both have · error — if either fails, the reader
gets the existing error screen with a working Retry, and no partial dashboard ·
**save failed** — if the completion cannot be stored (offline, or a session that
expired while they were reading), the finish modal still appears but carries a
brief line saying the progress could not be saved, and the post is **not**
marked complete. Pressing Finish again retries. A badge that appears and then
disappears on the next visit is worse than one that never appeared.

### Returning later, or on another device

1. The reader signs in — on the same browser after a reload, or on a different
   device entirely.
2. The dashboard shows exactly the posts they had finished, with the same count
   and percentage.

**States:** loading · error, as above · a reader who has finished nothing sees
0 of 10 and an empty bar, which is correct rather than a regression.

### Re-reading a finished post

1. The reader opens a post already carrying its badge and reads it again.
2. They press Finish.
3. Nothing breaks and nothing is lost: the post stays complete, and the date it
   was first completed does not move.

### Moving between levels

1. The dashboard lists every level, with the reader's current one shown.
2. A level the reader has unlocked can be selected, and shows its posts and that
   level's own count and percentage.
3. A locked level is listed but greyed and cannot be selected. It says what
   would unlock it — that all the posts of the preceding level must be read.
4. When the reader finishes the last post of Level 1, Level 2 becomes
   selectable.

**Note — the reward is currently an empty level.** Level 2 holds no posts, so a
reader who earns the unlock is shown the empty-level message. This is the
feature working correctly and it will read as unfinished. It is not a defect to
be worked around in code; it resolves when Level 2 is written.

**States:** locked — visible, not selectable, explains what unlocks it · empty —
a level that holds no posts says so plainly, and must never be confused with a
locked one · the highest level makes no promise about a level above it, because
there is none.

## Assumptions

These were proposed rather than stated, and are worth confirming before
building:

1. **The five existing accounts will visibly lose progress.** Their current
   "7 of 10" is fake; afterwards each honestly shows 0 of 10 until they read
   something. No migration invents history for them.
2. **How often a post has been read counts finishes, not attempts.** Because
   abandoned reads are not recorded, any figure describing repeat reading counts
   the number of times Finish was pressed. Nothing should present it as "times
   opened".
3. **The empty-level message stays as it is.** Unlocking Level 2 makes that
   message load-bearing rather than hypothetical, but it is not reworded into a
   congratulation here — that would be designing around missing content.
4. **Unlocking is checked when the dashboard loads and after a post is
   finished**, not continuously. A level unlocked by a reader's own action
   becomes selectable immediately; nothing polls for changes made elsewhere.

## Acceptance criteria

1. Finish a post, reload the page: the ✓ Gelesen badge is still on that card and
   the completed count is one higher than before.
2. Finish a post, then sign in to the same account in a different browser or
   device: the same badge and count are there.
3. Sign in with an account that has never finished anything: the dashboard reads
   0 of 10, the bar is empty, and no card carries a badge.
4. Finish a post at roughly two-thirds scroll rather than the very end: the
   completion is recorded at the percentage the reader header was showing, not
   at 100%.
5. Press Finish on a post that already has its badge: no error appears, the post
   stays complete, and the completed count does not change.
6. Sign in as a second reader: the first reader's completions are absent, and
   nothing either reader does alters the other's dashboard.
7. With Level 1 unfinished, Level 2 is listed, greyed, and cannot be selected;
   its control states that Level 1 must be completed first.
8. Finish the tenth Level 1 post: Level 2 becomes selectable without a reload.
9. Select Level 2 once unlocked: it shows the empty-level message, and does
   **not** show the locked explanation.
10. Turn off the network, then press Finish: the finish modal appears with a note
    that progress could not be saved, the card gains no badge, and after
    reconnecting a second press of Finish records it.
11. On the highest level, no line promises a level above it.
12. Compare criteria 7 and 9 side by side: the locked wording and the empty
    wording are different sentences, and neither level is ever described in the
    other's terms.
