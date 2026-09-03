# Content reachability

**Status:** Implemented · **Feature:** 2 · **Date:** 2026-08-14

## Problem

Every post, every word of German prose, and all 117 dictionary translations are
compiled into the application bundle. The database holds the same content —
structured, secured per user, and gated so a level stays locked until the one
before it is finished — but the app has never asked it for anything. The two
copies have sat side by side since the schema was written, and only the bundled
one is ever read.

Two consequences follow. Correcting content means changing code and shipping a
new build rather than editing a row, which is why eight of the ten posts still
carry prose that does not match their titles. And the rule that locks a level
until the previous one is complete has never once been exercised by the app, so
nobody knows whether it holds when a real signed-in reader asks.

Neither consequence is what makes this urgent. What makes it urgent is that
everything downstream is blocked behind it: per-reader progress and a per-reader
vocabulary bank both need to refer to posts as the database knows them, and
today the app has no way to name a post except by a label it prints on screen.
Until content comes from the database, progress and saved words cannot be stored
against it — which is why, today, every reader sees the same seven posts marked
complete and the same three saved words.

Only the maintainer feels this now; there are no other readers yet.

## Goals

1. When a reader is signed in, the app obtains the levels, posts and dictionary
   entries the database holds for them.
2. When nobody is signed in, the app requests no content at all.
3. The obtained content is confirmed to match the database — in quantity and in
   substance, not merely in shape.
4. Content belonging to a locked level is confirmed to be withheld from the app,
   even when that content is published.
5. A failure to obtain content is impossible to overlook, and leaves the app
   still usable.
6. The app looks and behaves exactly as it does today throughout.
7. A person returning to this work months later can re-run every check here and
   understand why each one exists.

## Non-goals

- **Displaying the obtained content.** The dashboard and the reader continue to
  render the bundled copy. Switching them over is separate work.
- **Removing the bundled content.** It stays until the screens no longer read it.
- **User-facing loading, error and empty states.** A failure here is reported to
  the maintainer, not designed for a reader. Designing what a reader sees when
  content cannot be loaded is separate work.
- **Reading progress and saved vocabulary.** Both are blocked by this feature and
  neither is part of it.
- **Correcting the mismatched prose on posts 3–10.** This feature makes that
  correction possible without a code change; it does not perform it.
- **Introducing a data-fetching library or any other new dependency.**
- **Changing who may read what.** The existing permissions and the level gate are
  verified here, not revised.

## User flows

### Flow 1 — The maintainer confirms content is reachable

1. The maintainer signs in to the app as an ordinary reader.
2. The app requests the levels, the posts of the reader's current level, and the
   dictionary.
3. The maintainer observes what came back and compares it against the database:
   2 levels, 10 posts, 117 dictionary entries.
4. The maintainer spot-checks substance, not just counts — the first post is
   titled "Der Alltag in Berlin" and carries the topic "Alltag", and the term
   *Herausforderung* translates to "challenge".
5. The screen looks exactly as it did before signing in changed nothing about it.

**States:** loading (invisible — nothing on screen waits) · error (loud, app
carries on) · empty (see Flow 3, where it is the correct answer)

### Flow 2 — Nobody is signed in

1. A visitor opens the app without signing in.
2. No content is requested.
3. The landing page behaves exactly as it does today.

This flow exists because signed-out visitors hold no access to content at all. A
request made on their behalf does not return an empty result — it fails. "Ask
only once there is a reader" is therefore a correctness requirement, not an
optimisation.

**States:** no request is made, so there is no loading, error or empty state

### Flow 3 — The maintainer confirms a locked level withholds its content

1. A published post is added to the second level in the database.
2. The maintainer signs in with their existing account, which has completed no
   posts as far as the database is concerned.
3. The app requests the second level's posts.
4. Nothing comes back. The post is withheld because the level is locked, even
   though it is published and really exists.
5. The maintainer removes the added post, returning the database to its prior
   state.

An empty result here is the correct outcome, not a failure. Telling the two
apart is the whole point of the flow: an empty list means the gate held, whereas
an error means something else went wrong.

**States:** empty (expected, and the pass condition) · error (would indicate a
problem with access rather than with the gate)

## Assumptions

These were proposed during the interview and agreed to, rather than volunteered.
Worth a second look before building.

1. **The two checks belong in one document.** Reaching content and confirming
   the gate withholds it are halves of a single question — can the app reach
   what it is allowed to reach, and only that? Specifying them separately would
   split one problem statement across two files.

2. **The counts are pinned to today's seed.** 2 levels, 10 posts and 117
   dictionary entries describe the content as it stands. Real prose for posts
   3–10 will change the dictionary count substantially. The criteria below are a
   snapshot to check against now, not a permanent invariant.

3. **Loading is invisible.** Content is obtained in the background and no part of
   the screen waits for it, because nothing on screen depends on it yet.

4. **The reporting used to observe all this is scaffolding.** It is removed
   before the work merges; the checks are performed once, by hand, not left
   running.

5. **The maintainer's existing account is sufficient for Flow 3.** No account has
   any recorded progress in the database — the seven completed posts visible in
   the app today exist only in the browser and were never stored — so the second
   level is locked for every account, including this one.

6. **Verification runs against the live project.** There is no local database and
   no sandbox copy, so Flow 3's added post is created and removed in the real
   project. It is a row that does not otherwise exist, and removing it restores
   the prior state exactly.

## Acceptance criteria

1. Signed in, the app obtains 2 levels, 10 posts and 117 dictionary entries.
2. Signed in, the obtained content is correct in substance: the first post is
   titled "Der Alltag in Berlin" with topic "Alltag", and *Herausforderung*
   translates to "challenge".
3. Signed out, no content request is made at all.
4. A published post belonging to the locked second level is not among the
   content the app obtains, while that post is simultaneously demonstrably
   present in the database.
5. The post added for criterion 4 no longer exists once the check is finished,
   and the database matches its prior state.
6. When content cannot be obtained, the failure is impossible to overlook, and
   the app continues to run and render its bundled content rather than crashing
   or showing a blank screen.
7. Every screen of the app is visually and behaviourally identical to the
   version before this work, signed in and signed out alike.
8. No new dependency has been added.
9. The temporary reporting used to observe criteria 1 through 4 is absent from
   the merged result.
