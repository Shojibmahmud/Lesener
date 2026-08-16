# Auth Tab Color Differentiation

**Status:** Implemented · **Feature:** 4 · **Date:** 2026-08-16

## Problem
On the auth screen, the "Create account" and "Sign in" tabs currently render with the same accent shade whenever either one is active, in both light and dark theme. This makes it easy for a user to mistake which mode they're in. This is primarily a preventive fix based on reviewing the screens, but there have already been a few reports of user confusion.

## Goals
1. When the Create account tab is active, the form box (the card containing the whole form) and its submit button render in a shade that is visibly distinct from Sign in's.
2. The Sign in form box and its submit button render in the same color they do today — no perceptible change.
3. The distinction between the two shades is subtle: a shade variation, not a different hue that would break the app's color palette.
4. The distinction holds consistently in both light theme and dark theme.
5. No other part of the app changes appearance as a result of this change.

## Non-goals
- Changing the shared accent color used elsewhere in the app (e.g. dashboard, reader, landing page, and other non-auth screens keep their current color exactly).
- Changing the color of the "Forgot password?" / "Back to sign in" links.
- Changing the color of the global focus outline shown when navigating by keyboard.
- Any visual change to the password reset, new-password, or change-password screens.
- Redesigning the tab switcher's layout, structure, or interaction — this is a color-only change.
- Introducing new UI states, animations, or transitions beyond what exists today.

## User flows

### Switching between Create account and Sign in
1. User arrives at the auth screen and sees the active tab's form box, rendered in that mode's accent shade.
2. User selects the other tab.
3. The screen switches modes; the form box and its submit button now render in that mode's own accent shade, visibly distinct from the previous mode's shade while still clearly reading as the same app.

**States:** light theme · dark theme · Create account active · Sign in active (all four combinations must render correctly and consistently).

## Acceptance criteria
1. When the Create account tab is active, its form box and submit button are a visibly different shade than when the Sign in tab is active.
2. The Sign in form box and submit button match their current, unchanged color.
3. The two shades are close enough to read as the same app's palette, not two unrelated colors.
4. The distinction is visible and correct in both light theme and dark theme.
5. No visual change is observable on any other screen (e.g. dashboard, reader, landing page, password reset, change password).
6. The "Forgot password?" / "Back to sign in" links and the global keyboard-focus outline are unchanged.
7. The tab switcher itself (the pill controls for "Create account" / "Sign in") carries no color change of its own beyond what the form box's tint naturally shows through — no border or outline was added directly to the tabs.
