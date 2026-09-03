# Delete account

**Status:** Implemented · **Feature:** 11 · **Date:** 2026-08-20

> Spec 11, built on branch `feature/11-delete-account`, planned as **Feature 5** in `.claude/roadmaps/5-delete-account-roadmap.md`. The spec and roadmap sequences diverged at spec 2 and have not agreed since. This spec is authoritative on observable behaviour; the roadmap is authoritative on how it gets built, and must be reconciled to anything here it disagrees with.

> **Revised twice on 2026-08-20**, the day it was drafted.
>
> **First**, two things left as assumptions were pulled into scope: **every session ends, not just this one** (goal 9, its own flow) and **repeated wrong passwords are refused**.
>
> **Second**, the attempt limit was **removed again**, because building it proved it could not be had the way it had been planned. It is now a non-goal, and the measurement that settled it is recorded there rather than being quietly dropped. The rest of that revision stands.

## Problem

Lesener tells a reader something untrue and then acts as if it were true.

The account menu offers **Delete account** under a Danger zone. Choosing it opens a modal headed *"Delete your account?"* which states plainly: **"This purges your profile, saved words and reading progress. It cannot be undone."** The reader presses **Delete forever**, and the app signs them out. Nothing is purged. Their name, every word they have saved, every post they have read and all of their progress stay exactly where they were, and their account still exists.

It is not a gap a reader can notice. **The screen after a fake delete is identical to the screen after a real one** — they are signed out and returned to the landing page either way. The only way to discover the truth is to sign back in and find everything waiting, at which point the app has already broken a promise about something irreversible. A reader who deleted their account because they wanted their reading history out of a stranger's database has been told it is gone when it is not.

This is the only place in the app that makes a false statement. Everything else that is unfinished is unfinished visibly: a level with no posts says it has no posts, a failed save tells the reader it failed. This one is silent, and it concerns the one action a reader cannot check and cannot take back.

It has to be true before anybody who is not the author holds an account.

## Goals

1. A signed-in reader can delete their own account from the account menu, without asking anyone.
2. They confirm with their password before anything is erased.
3. Everything belonging to them is erased — their name, their saved words, their reading history and their progress — not merely their ability to sign in.
4. They are told plainly that it has happened, and read that before the screen changes.
5. Signing in afterwards with the deleted account's email and password fails.
6. The email address becomes free again: signing up with it produces a new account with nothing in it, and nothing is kept recording that the address was ever used before.
7. Deleting one account changes nothing whatever about any other account or its data.
8. The warning the reader already agrees to becomes true as written, rather than being softened to match what the app does.
9. **Deleting ends the account's sessions everywhere, not only on the device that did it.** A device signed in elsewhere is returned to the landing page the next time the reader touches it, and by itself within an hour if they do not.

## Non-goals

* **A limit on how many times the password may be guessed.** *This was a goal, and it was removed on 2026-08-20 after being measured rather than assumed.* **140 consecutive wrong passwords** through the finished endpoint were every one refused normally, with no limit reached. The limit exists — the same authentication service refuses a **direct** sign-in attempt at around the thirty-fifth try — but it buckets by the address the request actually arrives from, and every request the app's server-side code makes arrives from the same one. A forwarded address from an untrusted hop is ignored, which is correct of it. What remains would be either a counter of our own, which nothing in the app can store today, or a count kept in the browser that a page reload erases. **The password gate stands on its own without it:** guessing requires a live session belonging to the very account being attacked, so whoever is guessing is already signed in as that reader and gains nothing they could not already do. The modal must therefore say nothing about attempts being limited.
* **A farewell or confirmation email.** No mail is sent when an account is deleted. The project has no mail sender and adding one costs money, so this is out on the same grounds that sign-up confirmation currently is.
* **Exporting anything before leaving.** There is no "download your saved words" step. A reader who wants to keep their vocabulary copies it out by hand first.
* **A grace period, an undo, or a recoverable delete.** Nothing is scheduled for later and nothing can be restored. When the reader confirms, it is done.
* **Deleting from anywhere but the dashboard.** The route stays the Danger zone in the account menu — no delete from the reading screen, the vocabulary bank, or a link in an email.
* **Deleting anyone else's account.** There is no administrative delete, no bulk delete, and no way for one reader to act on another's account.
* **Changing how the account menu or the warning reads.** Both stay exactly as they are today.
* **Telling the other device why it was signed out.** It returns to the landing page like any other sign-out. It does not explain that the account was deleted — the person holding it already knows, because they are the one who deleted it.
* **Anything requiring a paid service, a domain or a subscription.**

## User flows

### Deleting an account

1. A signed-in reader opens the account menu from the dashboard and, under **Danger zone**, chooses **Delete account**.
2. The modal opens with the warning it shows today, and asks for their password. Nothing can be erased until it is given.
3. They enter their password and confirm.
4. While the app works, the modal shows that it is busy, and neither confirming again nor cancelling does anything — the reader cannot dismiss the modal out from under a delete that is already running.
5. The account is erased, along with the reader's name, their saved words, their reading history and their progress.
6. The modal replaces the warning with a short note saying goodbye: that it is done, and that they are welcome to start again whenever they like.
7. They dismiss the note and arrive at the landing page, signed out.
8. Signing in with that email and password now fails. Signing up again with the same address succeeds and gives them a new account holding nothing — no saved words, no reading history, no name from before.

### Getting the password wrong

1. As above, to the point of confirming.
2. The password is wrong. The account is untouched.
3. The modal stays open and says that is not their password.
4. They may try again, as many times as they like. Each wrong attempt behaves the same way, and nothing is said or implied about a limit.
5. Cancelling, or dismissing the modal, at any point before a successful confirmation leaves the account exactly as it was.

### When the delete fails

1. As above, to the point of confirming with the correct password.
2. Something goes wrong — the connection drops, or the service errors.
3. The account is untouched.
4. The modal stays open and says it did not work.
5. Confirming again retries. The reader is never left unsure whether their account was deleted.

### Signed in on another device

1. The reader is signed in to Lesener on a second device — another browser, a phone — and deletes their account from the first.
2. The second device is no longer signed in to anything, whether or not it is awake at the time.
3. The next time the reader brings it to the front, it returns to the landing page rather than continuing to show a dashboard.
4. If they never touch it, it returns to the landing page by itself within an hour.
5. At no point does it show a dashboard belonging to an account that no longer exists — not a nameless one, not an empty one.

**States:** loading (the modal is visibly busy and cannot be dismissed) · error (wrong password; failed delete — both keep the modal open with the account intact) · confirmed (the goodbye note, shown before the screen changes) · signed out (the landing page, with no account to return to, on every device).

*There is no empty state.* The flow lists nothing and counts nothing; the modal shows the same warning to a reader with a full vocabulary bank and to one who signed up an hour ago.

## Assumptions

1. **The goodbye note's exact wording is not fixed here.** What it must do is confirm the deletion happened and leave the door open. It must not argue, offer an alternative to leaving, or ask why they are going — a retention nudge at the moment somebody has chosen to leave would undo the honesty this whole feature is about.
2. **"Within an hour" is a ceiling, not a promise of an hour's grace.** It is how long a device that is never touched might keep showing a signed-in screen before giving up. Any interaction cuts it short. Nothing depends on the exact figure, and if it changes, goal 9's first sentence is still the requirement.

## Acceptance criteria

Each is checkable by a person against a running build, except where noted.

1. From a signed-in dashboard, the account menu's Danger zone offers **Delete account**, and choosing it asks for a password before anything can be erased.
2. Confirming with the wrong password leaves the account intact and shows a message inside the modal; the reader can try again immediately, and nothing on screen mentions a limit on attempts.
3. Cancelling the modal, or dismissing it, before a successful confirmation leaves the account intact.
4. While a delete is running, the modal cannot be dismissed and cannot be submitted a second time.
5. Confirming with the correct password erases the account and shows a note saying so, before the screen changes.
6. Dismissing that note lands the reader on the landing page, signed out.
7. Signing in afterwards with the deleted account's email and password fails.
8. Signing up afterwards with the same email address succeeds and produces an account with no saved words, no reading history and no name carried over from before.
9. Nothing belonging to the deleted reader remains stored — not their name, their saved words, their reading history or their progress. *(Confirming this means looking at the stored data, not at a screen.)*
10. Every other account, and everything belonging to it, is exactly as it was before the deletion. *(Same — this cannot be seen from the app.)*
11. A delete that fails leaves the account intact, the modal open, and a message explaining that it did not work; confirming again retries successfully once the cause is gone.
12. A second device signed in to the deleted account shows the landing page the next time it is brought to the front, and never shows a dashboard for the deleted account.
13. A second device left untouched reaches the landing page by itself, without the reader doing anything to it.
14. The warning the reader agrees to reads exactly as it does today, and is now true in full.
