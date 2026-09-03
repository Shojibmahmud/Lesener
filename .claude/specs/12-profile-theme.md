# Profile Theme

**Status:** Implemented · **Feature:** 12 · **Date:** 2026-08-22

## Problem
The light/dark switcher works, but the answer is remembered only by the browser it was pressed in. A reader who signs in on a second browser, on their phone, in a private window, or after clearing site data is back to light — even though the account already remembers their name, their saved words, their reading progress and which levels they have unlocked.

The theme is the last piece of a reader's state still tied to a machine rather than to a person. The readers who feel it are the ones who read on more than one device: a phone on the commute and a laptop in the evening. Each time they move, the first thing they have to do is set the app back to the way they like reading it, before they can start reading.

Separately, and felt by everyone: loading the app in dark theme shows a white flash before the page appears. This predates the feature but sits on the same path, and it is the one part of the theme a reader sees without touching anything.

## Goals
1. A signed-in reader's light/dark choice is remembered by their account.
2. When a reader signs in, the theme their account remembers is the theme they see, on any browser or device.
3. An account that has never had a theme takes on whatever theme the reader's device is already showing, so no existing reader is reset.
4. A signed-out visitor can still choose a theme, and that choice still survives on that device.
5. Signing out leaves the theme on that device exactly as it was.
6. Loading or reloading the app in dark theme shows no white flash before the page appears.
7. A theme that cannot be saved to the account never interrupts the reader or undoes what they just chose.

## Non-goals
- **Following the operating system's theme.** There are two themes, light and dark. There is no third "match my system" setting, and the app does not react to the device's own appearance setting changing.
- **A per-device override.** A reader cannot keep dark on their laptop and light on their phone. The account's answer is the answer everywhere.
- **Changing how the toggle announces itself.** The toggle's accessible name is unchanged by this feature. It is a real gap and it is deliberately left for a later piece of accessibility work — see Assumptions.
- **Any visual change to the toggle.** Same position, same icons, same screens, same behaviour on click.
- **Telling the reader when a save failed.** No message, no banner, no retry prompt.
- **A shared-computer story.** A device keeps the last theme used on it, whoever used it. Signing out does not hand the next person a fresh default.
- **Ordering rapid toggles.** Two toggles a fraction of a second apart are not guaranteed to leave the account holding the later one.

## User flows

### Choosing a theme while signed in
1. A signed-in reader presses the theme toggle.
2. The screen changes to the other theme immediately — no delay, no spinner, no confirmation.
3. The choice is remembered by their account without them being told anything about it.
4. The next time they open the app anywhere, that is the theme they get.

### Signing in on a second device
1. A reader has chosen dark on their laptop.
2. They open the app on a browser that has never shown that account. It starts in whatever theme that browser was last using — light, say.
3. They sign in.
4. While the app loads their library, they still see light.
5. As the dashboard appears, the app switches to dark — the theme their account remembers.
6. From then on that browser stays dark, including after they close and reopen it.

### First sign-in on an account that has never had a theme
1. A reader has been using the app in dark on this device.
2. They sign in to an account that has never stored a theme — which today is every account.
3. Nothing visibly changes. They stay in dark.
4. Their account now remembers dark, so the next browser they sign in on will open dark too.

### Reading signed out
1. A visitor arrives on the landing page and presses the theme toggle.
2. The screen changes, and the choice survives on that device — closing the browser and coming back later shows the same theme.
3. Nothing about this changes when they later sign in or sign out, except that a signed-in account's own remembered theme takes over on sign-in.

### A save that does not reach the account
1. A signed-in reader toggles the theme while their connection is down.
2. The screen changes to the new theme and stays there.
3. No message appears. Nothing reverts. Nothing is blocked.
4. Their account keeps the older theme, so another device shows the older one until a later toggle succeeds.

**States:** loading (the app is fetching the reader's account and the theme has not yet been reconciled) · error (the theme could not be saved — invisible to the reader) · no theme on the account (the reader's device supplies one) · device and account disagree (the account wins, visibly, as loading finishes)

## Assumptions
1. **Two themes only, light and dark.** Carried over from Feature 5's interview rather than re-opened here. If a "match my system" state is ever wanted, it is a separate feature.
2. **A brand-new device can set a themeless account's theme.** The very first sign-in on a device the reader has never used pushes that device's current theme onto an account that had none, before the reader has expressed any preference on that device. This happens at most once per account. Confirm this is acceptable before building.
3. **Two toggles in quick succession may leave the account holding the earlier one.** Not raised in the interview. Recorded as acceptable — a person toggles at human speed — but flagged here rather than left to be discovered.
4. **The toggle's missing accessible name is deferred, not dismissed.** It was explicitly ruled out of this feature during the interview. It should be picked up alongside the app's three modals, which have the same class of problem, in a piece of accessibility work of its own.
5. **Removing the load flash does not remove the sign-in change.** Goal 6 covers the white flash before the app starts. The change described in *Signing in on a second device* — light while loading, then dark — is a different moment and remains visible by design, because the account's answer cannot arrive before the network does.

## Acceptance criteria
1. Signed in, pressing the toggle changes the theme immediately, with no perceptible delay, no spinner and no confirmation step.
2. After a reader chooses dark in one browser, signing in to the same account in a second browser that has never shown it results in that browser displaying dark.
3. Signing in on an account that has never stored a theme leaves the screen looking exactly as it did a moment before, and a subsequent sign-in on a different browser shows that same theme.
4. Loading and reloading the app in dark theme shows no white flash at any point before the page appears.
5. Signing in on a device set to light, to an account set to dark, shows light while the app is loading and dark once the dashboard appears — never dark first and then light.
6. Toggling the theme with the connection disabled changes the theme and keeps it changed, and shows the reader no error, warning or message of any kind.
7. Signing out while in dark theme leaves the landing page in dark theme.
8. A visitor who is not signed in can toggle the theme, and it is still in effect when they return to the site in that browser later.
9. The toggle is in the same place, shows the same icons and appears on the same screens as it did before this feature.
10. After a reader has signed in once, their account holds a theme — no account is left without one.
