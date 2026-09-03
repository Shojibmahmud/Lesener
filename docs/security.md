# Security

The honest posture, including the parts that are weaker than they look.

Most of what follows was **measured against the live project**, not inferred from
documentation. Where a date appears, that is when the measurement was taken.

## The model in one line

Row-level security is the entire perimeter. There is no server to enforce anything
else.

- **`anon` is revoked from all seven tables and from the view.** A signed-out
  request does not come back empty; it errors. `src/lib/content.js` records this as
  load-bearing in a header comment.
- **`authenticated` gets exactly the verbs it needs** and no others — notably
  `select` only on `reading_progress`, and no `delete` anywhere except
  `saved_words`.
- **`auth.uid()` is always wrapped in a scalar subquery**, `(select auth.uid())`, so
  it evaluates once per statement rather than once per row.
- **All four database functions are `security definer` with `set search_path = ''`,
  and all live in the non-exposed `private` schema.**

The grant and policy tables are in [data-model.md](data-model.md#grants-and-rls).

## Why the Supabase key ships in the browser bundle

`VITE_SUPABASE_PUBLISHABLE_KEY` is inlined into `dist/` by Vite and is readable by
anyone. That is correct, and it is correct only because of the paragraph above: the
key acts as `anon`, and `anon` can reach nothing. The key buys you a login form.

The one that must never be exposed is `SUPABASE_SERVICE_ROLE_KEY`. It has no `VITE_`
prefix precisely so that Vite cannot inline it, and it exists only inside the Edge
Function runtime.

## The `delete-account` function

The only place in the system where anything runs with `service_role`.

### Three gates, all of them needed

1. **`verify_jwt` at the gateway** — the token was issued by this project.
2. **`auth.getUser()` inside the function** — a real round trip, not a local decode.
   It is the only thing that can tell a signed token for a *deleted* account from
   one for a live account, because a JWT is stateless and outlives its account by up
   to an hour.
3. **`signInWithPassword`** — the caller knows the password.

### `verify_jwt` is weaker than it sounds

**Measured 2026-08-20.** A request whose bearer token is the *publishable key*
passes the gateway, because that key is a token this project issued. Since the
publishable key ships in the browser bundle, **the gateway alone would admit
anyone**.

`auth.getUser()` is what actually establishes that a reader is signed in. It may not
be removed, and anyone tempted to "simplify" the function by trusting `verify_jwt`
should read this paragraph twice.

### The user id comes from the token, never from the body

The function takes a JSON body of `{ password }` and nothing else. A service-role
function that deleted whichever id it was handed would let any signed-in reader
erase anybody — that is not a bug with a blast radius, it is an account-takeover
primitive.

### Two implementation details that are security-relevant

- **Gate 3 runs on a separate client.** `signInWithPassword` replaces the session on
  whatever client it is called against, so reusing the caller's client would
  overwrite the identity just established by gate 2.
- **`deleteUser(user.id)` takes no second argument.** `shouldSoftDelete: true`
  leaves the `auth.users` row in place, and the `on delete cascade` chain fires on
  row deletion and nothing else — so a soft delete would remove nothing below it
  while returning success.

### No limit on password attempts

**Measured 2026-08-20.** 140 consecutive wrong passwords through this endpoint were
refused **zero** times. A *direct* sign-in is refused at about the thirty-fifth.

The plan had been to lean on the auth service's own rate limit. It buckets by the
address a request actually arrives from, and every request from an Edge Function
leaves from the same one — so the function forwards the caller's `x-forwarded-for`
to the verifier client. The auth service rightly ignores an `x-forwarded-for` from
an untrusted hop, which is why the forwarding does not achieve what it was meant to.
Without it there would be one bucket for the whole project, and one person guessing
repeatedly would refuse everybody else's delete.

**A real limit needs a per-account counter, which nothing in this schema stores.**
The client maps a `too_many_attempts` code that the server cannot currently produce.

Scope of the exposure: an attacker who already has a valid session for an account
can brute-force *that account's own password* in order to delete *that same
account*. It is not a path to anyone else's data.

## The level gate is not DRM

`private.has_level_access` stops bulk content scraping with the publishable key,
which is what it was for. It does **not** stop a determined client from inserting
and completing ten `reading_sessions` rows to open the next level.

Closing that would mean moving session completion behind an Edge Function. It has
not been done, and the reason is that the content is free to read anyway — the gate
is pedagogical pacing, not a paywall.

What the gate *does* guarantee is verified in `supabase/tests/rls_checks.sql`: a
direct `reading_progress` insert is refused, so the gate is not one INSERT away from
open — progress has to be written through `reading_sessions` and the trigger.

## The `USING`-only delete policy filters rather than raises

`saved_words_delete_own` is a `USING` clause. Deleting somebody else's row
**succeeds**, having removed nothing.

`src/lib/vocab.js` counts the returned rows (`.select('id')` after the delete) and
throws when zero came back, because that is the only way to tell "not yours" from
"already gone". Proven against this database, not inferred from the docs.

The same shape appears on the update policies, which carry **both** `using` and
`with check` — so a row cannot be reassigned to another user on the way through.

## Auth flows: three things that look like bugs

Each is deliberate and each protects the same thing — not confirming to a stranger
whether an address has an account here.

- **The sign-up decoy.** With email-enumeration protection on, Supabase returns a
  *decoy* user for an address that already exists. `AuthScreen` checks
  `data.user?.identities?.length === 0` to detect it, because otherwise the reader
  waits for a confirmation mail that will never arrive.
- **A swallowed rate-limit error.** `requestReset` deliberately ignores
  `over_email_send_rate_limit`. That error can only be reached by an address that
  really has an account, so showing it would answer precisely the question the
  neutral confirmation refuses to answer.
- **A neutral confirmation either way.** The reset form says the same thing whether
  or not the address exists.

## Deleted-account detection

**Measured 2026-08-20.** A JWT for a deleted account still returned **200 with the
whole library** from `/rest/v1/levels`, while `/rest/v1/profiles` returned `[]`.

Without a check, the reader's *other* device would render a fully working, nameless
dashboard for up to an hour after the account was erased. `App.jsx` calls
`supabase.auth.getUser()` on `SIGNED_IN` / `INITIAL_SESSION` and signs out locally
on a 401/403.

It tests the **status**, not `if (error)`, so a reader in a tunnel is not signed out
by a network failure — and the fetch throw is swallowed for the same reason.

## Password change signs out other sessions

`ChangePasswordModal` re-authenticates with `signInWithPassword` first (there is no
"check this password" call), then `updateUser({ password })`, then
`signOut({ scope: 'others' })`. A changed password should end sessions the reader
may not control.

The reveal toggle on `PasswordField` exists for a security-adjacent usability
reason: the reset flow ends by signing the reader out, so a typo locks them back out
of the account they are halfway through recovering, with another email wait.

## Known-open items

| Item | Status |
|---|---|
| `mailer_autoconfirm = true` | **Deliberate, not a gap.** Sign-up sends no confirmation mail and the account works immediately. See [the note below](#why-there-is-no-signup-confirmation). |
| Leaked-password protection disabled | Open, and cheap to fix. Supabase Auth can reject passwords found in the HaveIBeenPwned corpus; the setting is off. Reported by `get_advisors(security)` as the project's one standing WARN (2026-09-03). |
| No password-attempt limit on `delete-account` | Open. Needs a per-account counter. |
| Level gate bypassable by a determined client | Accepted. Content is free to read. |
| No CI, so nothing enforces the test suites | Open. |
| No monitoring or error reporting | Open. `console.error` is the whole of it. |
| No export path for reader data | Open. Content is reproducible from the repo; reader data is not. |

## Why there is no signup confirmation

`mailer_autoconfirm` is on, so an account is usable the moment it is created and no
confirmation email is sent. This is a choice rather than an oversight, and it is
worth writing down so nobody "fixes" it.

**Custom SMTP is configured** — a Gmail account, sending as
`Lesener, Do not Reply`. Password reset therefore works for any address, not only
for project team members, which is what the built-in Supabase sender would have
limited it to. Verified on 2026-09-03 by a reset mail delivered to a third-party
address unrelated to both the sender and the project owner.

So the usual argument for confirmation mail — that without a working sender nobody
could ever recover an account — does not apply here. Recovery works.

What remains is narrower, and is accepted knowingly:

- **A mistyped address is unrecoverable.** Someone who signs up as
  `jhon@gmial.com` gets in fine, and then can never reset their password, because
  the mail goes somewhere they do not control. Confirmation-on-signup is really a
  typo check, and that check is not being run.
- **Anyone can sign up against an address they do not own.** The practical value of
  doing so is close to nil — an account holds reading progress and a word list,
  nothing more — and the true owner can take it back at any time with a password
  reset, because they control the inbox.

Turning confirmation on later is a dashboard setting and needs no code change.

## Reporting something

This is a personal learning project with no users but its author. If you find
something anyway, open an issue on the repository.
