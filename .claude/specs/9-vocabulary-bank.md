# Vocabulary bank

**Status:** Draft · **Feature:** 9 · **Date:** 2026-08-19

## Problem

The vocabulary bank is a mock. A reader taps **+** to keep a word, watches it
highlight in the text and appear in the session sidebar and the bank — and it is
gone on the next reload. Deleting a word works the same way: it disappears until
the page reloads, and then it is back.

Worse than losing words, the bank arrives pre-filled. Every reader, on every
account, opens it to find three words they never saved — *Herausforderung*,
*gleichzeitig* and *Zusammenhang* — all attributed to *Post 1: Der Alltag in
Berlin* whether or not they have ever opened that post, and the dashboard reports
**Saved 3** before they have read a word.

It is felt by anyone using Lesener to actually learn German. The one feature
whose entire purpose is to accumulate over time accumulates nothing.

## Goals

1. A word kept while reading stays kept — across reload, sign-out, and signing in
   on a different machine.
2. A word removed from the bank stays removed, under the same conditions.
3. The bank and the dashboard's **Saved** count describe what this reader has
   actually kept, and nobody starts with words they did not save.
4. A word is shown with the spelling it was tapped with, so *Herausforderung*
   keeps its capital and *gleichzeitig* does not gain one.
5. A saved word whose post is no longer available remains in the bank, under a
   sensible heading, and remains removable.
6. A save or a delete that does not take effect tells the reader so, and never
   shows an outcome a later reload contradicts.

## Non-goals

1. **Removing a word from inside the reader.** Tapping an already-saved word in
   the text shows a ✓ and closes the popup. Removing stays the bank's job.
2. **Reviewing or practising the saved words.** No flashcards, quiz, spaced
   repetition or export. The bank lists and prunes; it does not test.
3. **Changing how the bank looks.** Grouped by post, a count per group, term
   beside translation, a trash icon per row, *"Nothing saved yet"* when empty.
   Only what backs it changes. The one addition is the failure message in Goal 6,
   which has nowhere else to appear.
4. **Fixing words the dictionary cannot reach.** A word with an accent — *Café* —
   is mangled before the dictionary is consulted and so saves with no
   translation. Pre-existing, affects reading at least as much as saving, and out.
5. **Correcting the capital on sentence-opening words.** A non-noun tapped as the
   first word of a sentence is kept with that sentence's capital. Accepted; see
   Assumptions.

## User flows

### Keeping a word

1. A signed-in reader opens a post and taps an unfamiliar word.
2. A popup shows its translation, or an em dash when the dictionary has no entry.
3. The reader taps **+**.
4. The popup closes, the word is highlighted in the text, and it appears in the
   *This session* sidebar — once it is genuinely stored, not before.
5. The word is in the bank, and the dashboard's **Saved** count has gone up by
   one, from this moment onward and on every later visit.

**States:** empty (the dictionary has no translation — the word is still savable
and keeps an em dash in its place) · loading (the reader waits briefly between
tapping **+** and the word appearing) · error (the word is not highlighted, does
not enter the sidebar, and a brief message says it could not be saved and to try
again) · already saved (the popup shows ✓ and tapping it only closes the popup)

### Removing a word

1. The reader opens the bank and finds the word under its post heading.
2. They tap the trash icon on its row.
3. The row goes, the group's count drops, and the dashboard's **Saved** count
   drops — once the removal is genuinely stored, not before.
4. If that was the group's last word, the group heading goes with it. If it was
   the reader's last word overall, the bank shows *"Nothing saved yet"*.

**States:** empty (*"Nothing saved yet"* with a way back to the dashboard) ·
error (the row stays, the counts do not move, and a brief message says it could
not be removed and to try again)

### Returning to the bank

1. The reader signs in — on the same browser, a different browser, or after
   signing out and back in.
2. The whole-app loading screen appears while the library, their reading progress
   and their saved words are fetched together.
3. The dashboard appears with the **Saved** count already correct.
4. Opening the bank shows every word they have kept and none they have not,
   grouped by the post each was met in, in the order they were met.

**States:** empty (a new account sees **Saved 0** and *"Nothing saved yet"*) ·
loading (the existing whole-app loading screen — the bank is never painted before
its words are in, so *"Nothing saved yet"* never flashes for a reader who has
words) · error (the existing whole-app error screen with **Retry**, the same one
a failed library fetch already shows) · different reader (signing out and in as
somebody else shows their words, never the previous reader's, and never a stale
**Saved** count in between)

### A word whose post is no longer available

1. A reader returns after some weeks. One of the posts they saved words from has
   since been removed, unpublished, or is otherwise no longer readable.
2. They open the bank.
3. The words from that post are still listed, grouped under the post's title as
   it was when they saved them, and they look no different from any other group.
4. Those words can be removed exactly like any others.

**States:** post renamed (the bank shows the post's *current* title, so a
corrected title reaches the bank on the next load) · post unavailable (the bank
falls back to the title stored with the word) · error (removing one of these
words behaves exactly as in *Removing a word*)

## Assumptions

These are answers proposed rather than given. Confirm before building.

1. **Which spelling wins when the same word is met twice.** A word can be kept
   only once, so tapping *Herausforderung* at the start of a sentence and
   *herausforderung* mid-sentence are the same word. The bank shows whichever
   spelling was saved **first**; the second tap shows ✓ and changes nothing.
2. **The eight sentence-opening words.** In the current prose, eight words appear
   capitalised only because they begin a sentence and never appear lowercase
   anywhere — *berlin, jeden, jetzt, man, manchmal, nach, viele, wir*. None is a
   noun. Tapped from that position they are kept as *Jeden*, *Wir*, *Man*. This
   is accepted as the cost of showing the word as tapped; the alternative needs
   the correct German form authored once per dictionary entry, which is separate
   work.
3. **When the failure messages clear.** A save-failure message clears on the next
   successful save or when the reader leaves the post; a delete-failure message
   clears on the next successful removal or when the reader leaves the bank.
   Neither message persists across a reload.
4. **Account deletion is a schema guarantee, not an observable one.** Removing an
   account is specified to take its saved words with it, but account deletion is
   not implemented today — the *Delete forever* button only signs the reader out.
   So this cannot be checked against a running build and is deliberately absent
   from the acceptance criteria below.
5. **A word is always saved from a post.** There is no way to add a word to the
   bank other than by tapping it in a post, so every saved word begins life with
   a post to be grouped under.

## Acceptance criteria

1. Signing in on a brand-new account shows **Saved 0** on the dashboard and
   *"Nothing saved yet"* in the bank. The words *Herausforderung*, *gleichzeitig*
   and *Zusammenhang* appear nowhere unless that reader saved them.
2. Tapping **+** on a word, then reloading the page, leaves the word in the bank,
   still highlighted in the post, with the **Saved** count unchanged by the
   reload.
3. Removing a word with the trash icon, then reloading, leaves it absent from the
   bank and no longer highlighted in the post.
4. Signing in as the same reader in a different browser shows the same words in
   the same groups.
5. Signing out and signing in as a second reader shows only the second reader's
   words, and the **Saved** count never displays the first reader's total at any
   point during the transition.
6. A word saved from the middle of a sentence keeps its original spelling in the
   bank — *Herausforderung* with its capital, *gleichzeitig* without.
7. A word whose dictionary lookup finds nothing can still be saved, and shows an
   em dash where its translation would be — in the popup, the session sidebar,
   the finish modal and the bank alike.
8. Tapping a word that is already in the bank shows ✓ and closes the popup; it is
   not saved twice and no second row appears anywhere.
9. With the network disabled, tapping **+** leaves the word unhighlighted and out
   of the session sidebar, and shows a message saying it could not be saved.
   Restoring the network and tapping **+** again saves it.
10. With the network disabled, tapping the trash icon leaves the row in place and
    the counts unmoved, and shows a message saying it could not be removed.
    Restoring the network and tapping again removes it.
11. Unpublishing a post the reader has saved words from leaves those words in the
    bank, grouped under that post's title, and still removable.
12. Renaming a post the reader has saved words from changes that group's heading
    in the bank on the next load.
13. A bank holding the same words looks the same as it does today — same
    grouping, same per-group counts, same layout, same empty state.
14. Signing in shows the existing whole-app loading screen until posts, progress
    and saved words are all in; the bank never shows *"Nothing saved yet"* to a
    reader who has words, not even briefly.
