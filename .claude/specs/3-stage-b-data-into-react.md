# Content in the app's hands

**Status:** Draft · **Feature:** 3 · **Date:** 2026-08-16

## Problem

The app asks the database for its library — every level, every post, all 117
dictionary entries — the moment a reader signs in, and the answer comes back
correct. Then it is dropped. The library sits where nothing can read it, behind
a note explaining that it will be used once the screens are switched over.

So the app pays for the request and gets nothing back for it. That is not
wasteful so much as blocking: the dashboard cannot render database posts, and
neither reading progress nor a vocabulary bank can be stored against a post,
until the library is held somewhere the rest of the app can reach.

Two narrower faults sit inside the same gap.

The app cannot describe its own request. It knows only whether it holds a
library or does not, which collapses three different situations into one
answer — never asked, still arriving, and asked and failed. Every screen a
reader might eventually see about waiting or failing needs those three told
apart before it can exist at all.

And the request is made for people who will never use it. A password-recovery
link carries a real session, so somebody arriving to choose a new password —
who will see one screen and then be signed out again — pulls the entire library
on the way in.

Only the maintainer feels any of this. There are no other readers yet.

## Goals

1. The library obtained from the database is held where the rest of the app can
   read it, and an empty level can be told apart from a withheld one.
2. The app can distinguish, at any moment, between never having asked for the
   library, waiting for it, holding it, and having failed to obtain it.
3. Somebody arriving on a password-recovery link causes no request for the
   library.
4. Returning to the app in a tab that was left open causes no repeat request.
5. Signing out discards the held library; signing in again obtains it afresh.
6. A reader tapping a German word is given its translation from the database
   once the library has arrived, and is never left without one before then.
7. A reader cannot tell that any of this happened.

## Non-goals

- **Showing database content on screen.** The dashboard's posts, blurbs, counts
  and level names, and the reader's prose, all continue to come from the copy
  compiled into the app. Switching them over is separate work.
- **Anything a reader sees about waiting, failing or emptiness.** No spinner, no
  retry, no message. This feature makes those buildable; it does not build them.
- **Removing the compiled-in copy.** It stays, and it is still what a reader
  reads.
- **Reading progress and the vocabulary bank.** Both are unblocked by this work
  and neither is part of it.
- **Correcting the mismatched prose on posts 3–10.**
- **Introducing any new dependency.**
- **Changing who may read what.** The permissions and the level gate are relied
  on here, not revised.

## User flows

### Flow 1 — A reader signs in and reads a post

1. A reader signs in.
2. The app obtains the library in the background. Nothing on screen waits for
   it, and nothing on screen changes when it arrives.
3. The reader opens a post and taps a German word.
4. The translation shown is the one the database holds for that word.
5. Correcting that translation in the database, and signing in again, changes
   what the reader is shown — without the app being rebuilt.

**States:** loading (invisible — nothing waits) · error (see Flow 3) · empty
(a level with no posts is held as present-and-empty, not missing)

### Flow 2 — Somebody opens a password-recovery link

1. Somebody follows a recovery link from their email.
2. They are given the screen for choosing a new password.
3. No library is requested, at any point, even though the session they arrived
   with is genuine and would be permitted to read it.
4. They choose a new password, which signs them out everywhere.
5. They sign in with the new password. Now the library is requested, exactly as
   it would be for any other sign-in.

The hold has to be in place before the session arrives, not after. The session
lands first and the app learns it is a recovery only afterwards — by which time
an unheld request would already be away.

**States:** no request is made, so there is no loading, error or empty state
until step 5

### Flow 3 — The library cannot be obtained

1. A reader signs in while the database is unreachable, or the request fails.
2. The app carries on. No screen is blank and nothing crashes.
3. The reader opens a post and taps a German word, and is still given a
   translation — from the copy compiled into the app.
4. The failure is impossible for the maintainer to overlook.

A reader is not told anything, because there is nothing yet that they would
need to do about it. Designing what they see is the next stage of this work.

**States:** error (recorded, and invisible to the reader by design)

### Flow 4 — A tab left open is returned to

1. A reader signs in and leaves the app open in a background tab.
2. They return to it, possibly many times.
3. The app announces the same session again on each return.
4. No further request for the library is made. The one already held stands.

**States:** none — the point of the flow is that nothing happens

### Flow 5 — Signing out and back in

1. A signed-in reader signs out.
2. The held library is discarded.
3. The same or another reader signs in.
4. The library is obtained again, from scratch.

Discarding matters because the library is read subject to who is asking: a level
one reader has unlocked may be closed to the next, so a library held across a
change of reader could show somebody content they have not opened.

**States:** loading (invisible) · error (see Flow 3)

## Assumptions

These were proposed rather than volunteered, and confirmed by instruction once
the work was already built. Worth a second look.

1. **The recovery-link fault belongs in this feature.** It could be read as a
   defect in the password-reset work, which this stage merely uncovered. It is
   recorded here instead because it concerns *when the library is requested*,
   which is what this feature is about — the reset flow itself is unchanged.

2. **Not repeating the request on return to a tab is a requirement, not an
   incidental.** It is stated as a goal because the app is told about the same
   session repeatedly and re-obtaining the whole library each time would be
   both wasteful and, once screens render from it, visible.

3. **The compiled-in dictionary remains the fallback.** Agreed explicitly: it
   keeps this stage invisible to a reader, at the cost of the compiled-in copy
   staying in use slightly longer than it otherwise would. It is retired when
   the screens stop reading it, not here.

4. **This spec was written after the work was built.** It describes what the
   feature should do, and the criteria below were checked against a running
   build rather than written ahead of one. A criterion that only passes because
   of how the work happened to be done is a fault in this document.

5. **The dictionary is small enough to obtain in full.** All of it is requested
   at once rather than a post's words at a time. This holds at B1 and stops
   holding somewhere past a few thousand entries.

## Acceptance criteria

1. Signed in, a reader can tap any German word in a post and is shown a
   translation.
2. Changing a translation in the database and signing in again changes what the
   reader is shown, with no rebuild of the app.
3. Opening a password-recovery link results in no request for the library,
   while the session it grants is demonstrably real.
4. Completing a password reset and signing in with the new password results in
   the library being requested.
5. Leaving the app in a background tab and returning to it results in no
   further request for the library.
6. Signing out and signing back in results in exactly one further request.
7. With the library unobtainable, a reader can still open a post, tap words and
   be shown translations, and no screen is blank or broken.
8. With the library unobtainable, the failure is impossible for the maintainer
   to overlook.
9. A word matching the name of a built-in property — such as *constructor* —
   is never shown a translation that is not a translation.
10. Every screen is visually and behaviourally identical to the version before
    this work, signed in and signed out alike.
11. No new dependency has been added.
