# 0007 — Account deletion goes through a password-gated Edge Function

- **Status:** Accepted
- **Date:** 2026-08-20

## Context

"Delete my account" has to erase the `auth.users` row, because that is what the
`on delete cascade` chain hangs off. Deleting only the profile would leave a live
login with no data behind it.

The browser cannot do this. `auth.admin.deleteUser` needs the service-role key,
which must never reach the bundle — and there is no client-side fallback either:
`authenticated` holds no `delete` grant on `profiles`, `reading_sessions` or
`reading_progress`, so three of the four tables refuse before RLS is consulted.

## Decision

One Edge Function, `delete-account`, holding the service-role key. It takes
`{ password }` and nothing else, and passes three gates: `verify_jwt` at the
gateway, `auth.getUser()` inside, and `signInWithPassword` to prove the caller knows
the password. **The user id comes from the token, never from the body.**

## Consequences

- One admin call erases the entire footprint through the cascade. `rls_checks.sql`
  proves it, with before-counts as positive controls.
- **`verify_jwt` is weaker than it sounds** (measured 2026-08-20): a request bearing
  the *publishable key* passes the gateway, because that key is a token this project
  issued — and it ships in the bundle. `auth.getUser()` is what actually establishes
  a signed-in reader and may not be removed.
- **There is no password-attempt limit** (measured 2026-08-20): 140 consecutive wrong
  passwords, zero refusals, against about thirty-five for a direct sign-in. The auth
  rate limiter buckets by originating address and rightly ignores an
  `x-forwarded-for` from an untrusted hop. A real limit needs a per-account counter
  this schema does not have. The client maps a `too_many_attempts` code the server
  cannot currently produce.
- `deleteUser` must take no second argument: `shouldSoftDelete: true` leaves the
  `auth.users` row in place, so the cascade fires on nothing while returning success.
- Gate 3 needs its own client, because `signInWithPassword` replaces the session on
  whatever client it is called against.
- An explicit CORS object and `OPTIONS` handler are required: `functions.invoke`
  sends a JSON body, which is outside the CORS safelist and triggers a preflight. A
  POST-only function works from curl and fails from the app.
- `src/lib/account.js` deliberately bypasses the shared `rows()` helper, because that
  helper's error wrapping would flatten the one distinction the UI depends on: a
  wrong password is fixable, everything else is not.
- Nothing reconciles the deployed function with the file in this repo. Edit here,
  then redeploy — never the reverse.
