# Real Profile

**Status:** Implemented · **Feature:** 10 · **Date:** 2026-08-19

> **Numbering.** Spec 10, built on branch `feature/10-real-profile`, planned as **Feature 4** in `.claude/roadmaps/4-real-profile-roadmap.md`. The spec and roadmap sequences diverged at spec 2 and have not agreed since; the branch and spec numbers coinciding here is chance. This spec is authoritative on observable behaviour; the roadmap is authoritative on how it gets built.

## Problem

Every reader who signs in to Lesener is greeted as somebody else. The dashboard heading reads **"Grüß Gott, Anna."** and the account button shows a circled **"A"**, whoever is looking at it — a placeholder left in from the original design, sitting in the largest type on the first screen after sign-in.

It is felt by every signed-in reader on every visit, and it reads as unfinished in a way that undercuts the rest of the app: the reading, the vocabulary bank and the progress tracking are all real and personal, and the first thing on the page is a stranger's name.

The reason is that the app has never had a name to use. The create-account form asks for an email address and a password and nothing else, so nothing is ever recorded about who is reading — even though the account record itself has had a place to keep a name since the day the database was created, and the machinery that would fill it has been in place and verified the whole time. Five accounts exist today; all five are nameless.

## Goals

1. Someone creating an account gives their first and last name as part of signing up.
2. The dashboard greets a reader by their own first name, and the account button shows that name's initial.
3. The account menu shows a reader's name above the email address it already displays.
4. A reader can change their first and last name at any time, and see the change immediately.
5. The five accounts that predate this feature are given a name rather than being left nameless, and their owners can correct it.
6. A reader is never shown a name belonging to somebody else, in any state — including while loading, on failure, and immediately after signing out.

## Non-goals

* **Choosing a display name or nickname** separate from the real first and last name.
* **Light/dark theme following the account.** Theme stays a per-device setting and does not become part of the profile.
* **Showing the reader's name anywhere beyond the dashboard** — the reading screen and the vocabulary bank stay nameless.
* **A profile page, avatar image, photo upload, or any profile field beyond the two names** — no username, handle, bio, language preference or location.
* **Changing the email address** attached to an account.
* **Any email-confirmation step.** Accounts are confirmed automatically today; sign-up sends no mail and this feature does not introduce any. (Whether confirmation is switched on before launch is a separate decision and does not change anything described here.)
* **Changing how accounts are deleted**, which remains unfinished for reasons unrelated to this feature.

## User flows

### Creating an account

1. The reader opens the create-account form and sees four fields: **First name**, **Last name**, **Email address**, **Password**.
2. They fill in all four and submit. All four are required; the form refuses to submit while any is blank.
3. The account is created and they arrive on the dashboard, already greeted by the first name they just typed, with their initial in the account button. No reload, and no intermediate step.
4. Switching to the **Sign in** tab and back does not lose what they had typed.

The name fields appear on the create-account tab only — never on the sign-in tab, and never on the forgot-password form.

Leading and trailing spaces are ignored, so a pasted name arrives clean. A name of only spaces counts as blank and is refused. Each name accepts any characters — accents, ß, apostrophes, hyphens, spaces, and non-Latin scripts — and is capped at a length that cannot break the dashboard heading.

If the email address already belongs to an account, the reader is told so and nothing is created — including no name. This is unchanged from today and must stay unchanged: a failed sign-up must never leave a partial record behind.

**States:** empty (fields blank — submission refused) · loading (the button reads *One moment…* and every field is disabled) · error (the existing message area above the fields explains what went wrong; everything typed is still there) · duplicate account (the reader is told the address is taken)

### Being greeted

1. A returning reader signs in.
2. While their library loads they see the existing loading screen. No name and no greeting are shown yet.
3. The dashboard appears, greeting them by first name — **"Grüß Gott, Shojib."** — with their initial in the account button.
4. Opening the account menu shows their full name above their email address.

A reader with a first name but no last name shows just the first name in the menu, with no trailing space or dangling punctuation.

A reader with no name at all is greeted **"Grüß Gott."** — a complete sentence with no gap where a name should be — and their account button falls back to the first letter of their email address. This state should be unreachable once the feature has shipped, since sign-up requires the names and existing accounts are given one; it exists so that a reader is never shown the word "null", an empty gap, or a name that is not theirs.

Signing out and signing in as somebody else never shows the previous reader's name at any point.

**States:** empty (no name stored — nameless greeting, email initial) · loading (existing loading screen; no greeting) · error (the profile is part of the same load as the library, so a failure shows the existing full-page **"We couldn't load your library."** with **Try again**, and one retry brings back everything together) · partial (first name only)

### Changing your name

1. The reader opens the account menu and chooses to edit their name.
2. A dialog opens with their current first and last name already filled in.
3. They change either or both and save.
4. The dialog closes and the dashboard behind it immediately shows the new name and initial. No reload.
5. The new name is still there after a reload, and after signing out and back in.

The same rules apply as at sign-up: surrounding spaces are ignored, the same length cap applies, and any characters are accepted. A first name may not be cleared to blank. A last name may be cleared, which returns the reader to the first-name-only state described above.

If saving fails, the dialog **stays open** and says the name could not be saved, in the manner the app already uses when a word cannot be saved or removed. The dashboard behind it still shows the old name. Nothing reports success that did not happen, and trying again after the problem clears succeeds and dismisses the message.

**States:** loading (saving; the dialog's fields and buttons are disabled) · error (dialog stays open, message shown, old name still on screen) · cancelled (dialog closes, nothing changes)

### A reader who predates the feature

1. One of the five existing readers signs in for the first time after this ships.
2. They are greeted by a name derived from their email address — the part before the `@`, with its first letter capitalised.
3. That name may not be one they would have chosen. They can change it through the flow above.

**States:** derived name shown until the reader edits it

## Assumptions

These were proposed rather than stated, and are worth confirming before or during the build:

1. **The length cap is 60 characters per field.** Chosen as generous enough that no real name is refused while still short enough that the dashboard heading cannot be broken by a pasted paragraph. If a real name is ever rejected by it, the cap is wrong, not the name.
2. **Names derived from email addresses will read acceptably.** With the five addresses that exist, this produces values like *Basabodol1430* and *Shojibmahmud108* — recognisably machine-made rather than chosen. This was accepted knowingly on the basis that the reader can correct it, and it is why the editing flow is part of this feature rather than a later one. **Confirm by eye against the five real accounts before considering the feature done.**
3. **A reader with no last name is a normal state, not an error.** It arises for every derived account and for anyone who clears the field, and nothing anywhere should present it as incomplete.
4. **Failure wording follows the app's existing voice** rather than any specific text given here — matching *"That word couldn't be saved. Tap + again to try once more."* in tone and structure.
5. **The name fields survive a tab switch** on the auth screen, matching how the email and password fields already behave. This is deliberate consistency, not an oversight.

## Acceptance criteria

Each of these is checkable by a person against a running build.

1. The create-account form shows **First name** and **Last name** fields above the email field; the sign-in tab and the forgot-password form show neither.
2. Submitting the create-account form with any of the four fields blank is refused, and refused likewise when a name contains only spaces.
3. Creating an account lands on a dashboard already reading **"Grüß Gott, «first name»."** with that name's initial in the account button, on first sight and without a reload.
4. A name typed with leading or trailing spaces is stored and displayed without them.
5. A name containing accented, ß, apostrophe, hyphen or non-Latin characters is accepted and displayed exactly as entered.
6. Typing a name, switching to the **Sign in** tab, and switching back leaves what was typed still in place.
7. Attempting to create a second account with an existing email address is refused, and no name is recorded for it.
8. Opening the account menu shows the reader's full name above their email address; for a reader with no last name it shows the first name alone, with no trailing space or stray punctuation.
9. Editing the name updates the dashboard greeting and the account button initial immediately, with the dialog closed and no reload.
10. The edited name is still shown after a full page reload, and after signing out and signing back in.
11. Clearing the last name and saving leaves the reader greeted normally, with the first name alone in the account menu.
12. Clearing the first name and saving is refused.
13. With the network disabled, saving a name leaves the dialog open with a message saying it could not be saved, and the dashboard behind it still showing the old name. Restoring the network and saving again succeeds and clears the message.
14. With the network disabled during sign-in, the reader sees **"We couldn't load your library."** with **Try again**; restoring it and retrying brings back the library and the greeting together.
15. Signing in as each of the five pre-existing accounts shows a name derived from that account's email address, and that name can be changed through the editing flow.
16. The word **Anna** appears nowhere in the running app.
17. Signing out and signing in as a different reader never shows the previous reader's name — not on the dashboard, not in the account menu, and not during loading.
18. Reading a post, saving and removing vocabulary, finishing a post, and switching levels all behave exactly as they did before.
