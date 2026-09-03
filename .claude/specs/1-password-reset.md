# Password reset

**Status:** Implemented · **Feature:** 1 · **Date:** 2026-08-13

## Problem

A reader who forgets their password has no way back into their account. The
sign-in form asks for an email address and a password, and a reader who cannot
supply the password is simply stuck — there is no recovery path anywhere in the
app.

What they lose is not the password but everything behind it: their progress
through the ten B1 posts and every word they have saved to their vocabulary
bank. That work becomes permanently unreachable. The only remaining option is to
register again under a different address and begin from nothing.

This hurts the lapsed returner most — someone who read a few posts, drifted away
for weeks or months, and is now coming back. Their password is forgotten
precisely *because* they have been away, and what they came back for is to
resume where they left off, not to start an empty account.

## Goals

1. A locked-out reader can regain access to their existing account unaided,
   with reading progress and saved vocabulary intact.
2. Recovery starts from the sign-in screen and completes without the reader
   contacting anyone.
3. A reader who still knows their password can change it while signed in.
4. Reset mail reaches ordinary inboxes, not only addresses belonging to the
   project's own team.
5. Neither flow reveals whether a given address has an account.
6. Every failure state explains itself in plain language and offers a next step
   — with one deliberate exception. When the hourly send cap is reached the app
   stays silent, because a cap message can only appear for an address that
   really exists and would therefore betray it. Goal 5 outranks Goal 6 at that
   one point, and the cost is accepted knowingly: a capped reader waits for mail
   that never arrives.
7. Completing a reset ends the account's sessions everywhere else, so recovering
   an account that somebody else reached also removes them.

## Non-goals

- **A resend button or cooldown timer.** Asking again means using the same form
  again. Because a capped request is deliberately indistinguishable from a
  successful one, there is no cap-specific message or countdown to build either.
- **Social sign-in.** "Continue with Google" would remove the password, and the
  need to reset it, for readers who use it. Worth doing, separately.
- **Phone or SMS recovery, and backup recovery codes.** Email is the only
  recovery channel in scope.
- **Changing the email address on an account.**
- **Account deletion**, which is already unfinished work of its own.
- **Verifying email addresses at sign-up.** Addresses are currently trusted at
  registration; changing that is a separate decision.

## User flows

### Flow A — Forgot password (signed out)

1. The reader opens the auth card and selects the **Sign in** tab.
2. Below the password field there is a **Forgot password?** link. It appears on
   the Sign in tab only, never on Create account.
3. Selecting it replaces the form with a request view that asks for an email
   address and nothing else.
4. The reader submits their address.
5. The app confirms that *if* an account exists for that address, a link has
   been sent — worded identically whether or not the account exists, and
   identically when the hourly cap has swallowed the request.
6. The reader opens the mail, which may be on a different device from the one
   that made the request, and follows the link.
7. The link returns them to the app, which asks them to choose a new password of
   at least six characters — the same minimum the sign-up form uses. It is a
   single field with a control to reveal what has been typed, because a silent
   typo here would lock them straight back out of the account they are in the
   middle of recovering.
8. If they were signed in as somebody else when they opened the link, that
   session ends first and the app makes plain which address the link belongs to,
   so nobody is left acting as an account they do not recognise.
9. On success the reader is signed out — here and on every other device where
   the account was signed in — and returned to the Sign in tab with a notice
   that the password was updated.
10. They sign in with the new password and arrive at their dashboard, with
    progress and saved vocabulary exactly as they left them.

**States:** empty · loading · error · unknown address (identical confirmation) ·
expired or already-used link (explained, with the request form offered right
there) · hourly send cap reached (**deliberately indistinguishable from
success** — same confirmation, no mail)

### Flow B — Change password (signed in)

1. The reader opens the account menu in the dashboard header, alongside the
   existing entries.
2. They select **Change password**, placed above the danger zone.
3. The form asks for the current password and the new one. The new-password
   field carries the same reveal control as Flow A.
4. If the current password is wrong, the change is refused and nothing is
   altered.
5. If it is correct, the password is updated, the change is confirmed, and the
   account's sessions on other devices end.

**States:** empty · loading · error · wrong current password · new password too
short

## Assumptions

These were not settled during the interview and should be confirmed before
building:

- **The reader stays signed in on the device where they complete Flow B**, while
  other devices are signed out. Only Flow A was decided to end in a full
  sign-out.
- **A reset link stops working after about an hour**, following the auth
  service's own default rather than a lifetime chosen deliberately here.

## Acceptance criteria

1. A **Forgot password?** link is visible below the password field on the Sign
   in tab, and absent from the Create account tab.
2. Requesting a reset for a registered address shows a confirmation that does
   not state whether an account exists.
3. Requesting one for an unregistered address shows the identical confirmation —
   checked by performing both and comparing the result.
4. Reset mail arrives at an ordinary inbox that is not a member of the project's
   team, sent through the Gmail account configured as the project's sender.
5. A link requested on one device and opened on another lets the reader set a
   new password on the second device.
6. A new password of at least six characters is accepted; a shorter one is
   refused with an explanation of the minimum.
7. The new-password field has a control that reveals what has been typed, in
   both flows.
8. After a successful reset the reader is returned to the Sign in tab with a
   confirmation notice, and is not signed in.
9. Signing in with the new password succeeds, and the old password is refused.
10. Reading progress and saved vocabulary are unchanged after a reset.
11. Opening an expired or already-used link explains that it is no longer valid
    and offers a form to request a fresh one without navigating elsewhere.
12. With the hourly cap exhausted, requesting a reset for a **registered**
    address produces a response indistinguishable from criterion 2 — same
    wording, same appearance, no error. Verified by exhausting the cap and
    comparing the two side by side.
13. An account signed in on a second device is signed out once a reset
    completes, confirmed by reloading that second device.
14. Opening a reset link while signed in as a different account ends that
    session and shows which address the link belongs to.
15. The dashboard account menu contains a **Change password** entry, above the
    danger zone.
16. Submitting Flow B with the wrong current password refuses the change and
    leaves the password working — confirmed by signing in with the old one.
17. Submitting Flow B with the correct current password succeeds; the new
    password then works and the old one is refused.
