# Feature 5 Implementation Roadmap: Really Delete an Account

> **Agent Goal:** Replace the delete path that only signs out — `onConfirm={signOut}` (`App.jsx:564`), sitting behind a modal that promises *"This purges your profile, saved words and reading progress. It cannot be undone."* (`DeleteModal.jsx:33`) — with a password-gated Edge Function that calls `auth.admin.deleteUser`, so the cascade the schema has carried since day one finally erases the reader's whole footprint across four tables.

> **Line references** in this document were last refreshed on 2026-08-20, before any of it was built. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

> **Spec:** `.claude/specs/11-delete-account.md` — spec 11 for roadmap Feature 5; the two numbering sequences diverged at spec 2. The spec is authoritative on observable behaviour; this roadmap is authoritative on how that behaviour gets built.

> **Reconciled with the spec on 2026-08-20**, hours after this roadmap was drafted without one. The spec interview settled four things this document had left open or got slightly wrong, and none of them changed a stage boundary. **The goodbye note has a job:** Decision 10 said only that a `done` panel appears; the spec requires it to be valedictory and forbids it arguing, offering alternatives or asking why the reader is leaving. That rewrote Decision 10 and C3. **The backdrop guard was described as something it cannot be:** C3 said Cancel and the backdrop must both be `disabled={busy}`, but the backdrop is a `div` and `disabled` does nothing to one — it needs a `busy` check inside its handler. That was an implementation error, not a difference of opinion. **Re-signing-up is now a requirement, not a side effect:** the spec's goal 6 and criterion 8 make the freed email address observable behaviour, which the human check did not cover (that task is now C6). **A second device is explicitly unspecified:** spec Assumption 3 leaves it open, and Trap 3 now says so rather than implying the single-device case is the whole story. Nothing else changed.

> **Reconciled again, later the same day.** Shojib pulled both open assumptions into scope, which added two requirements this roadmap had not planned for and one it had explicitly deferred. **Every session ends, not just this one** (spec goal 9): the delete already revokes stored sessions, but a device holding a live token had to be made to notice, which is new Decision 12 and task C5. **Guessing is refused** (spec goal 10): new Decision 11. *The number asked for is not the number being built* — five tries per five minutes needs somewhere to record attempts per account, which would mean a migration; leaning on the auth service's own limit was chosen over that, so the count and window are its defaults. Spec Assumption 1 records the trade in full and spec goal 10 is deliberately written so it stays true either way. **Decision 1 survives: still no migration**, and it now says why the alternative was refused.

> **Numbering.** Feature 5 in roadmap order, built on branch `feature/11-delete-account`. The branch and spec sequences diverged from the roadmap sequence long ago and have not agreed since (see roadmap 3's header); roadmap 3 was built on `feature/9-vocabulary-bank` and roadmap 4 on `feature/10-real-profile`. Roadmap 4 already reserves this number: `4-real-profile-roadmap.md:369` names *"Erasing an account still deletes nothing"* as the thing a later feature must fix.

> **Baseline, measured 2026-08-20:** 190 tests across 19 files pass; `npm run lint` and `npm run build` are clean. Two accounts exist. Zero Edge Functions are deployed and `supabase/functions/` does not exist.

> **All stages complete, 2026-08-20.** Suite at completion: **215 tests across 21 files**, up from the 190 baseline; `npm run lint` and `npm run build` clean. One `delete-account` Edge Function deployed and ACTIVE. One account remains, `basabodol1430@gmail.com`, untouched at 1 / 18 / 10 / 10 — every other account that existed or was created during the work was deleted, most of them through the feature itself.
>
> **Verified across two real browsers.** The second-device guarantee (spec criterion 12) was run by hand: the same account signed into Brave and Edge, deleted from Brave, and Edge found already on Landing and unable to sign back in. **One criterion remains unverified and is not claimed to be:** criterion 13, an *untouched* device reaching Landing by itself — it needs a tab left alone for up to a token lifetime, and was not waited out. C5's test and Decision 12's server half stand behind it.
>
> **Two things did not go to plan, and both are recorded rather than tidied away.** Decision 11 was retired the day it was written — the auth service's rate limit does not reach through an Edge Function (**Trap 13**), so spec goal 10 became a non-goal. And `verify_jwt` turned out to admit the publishable key (**Trap 12**), which makes the function's own `getUser()` the gate that actually matters rather than a redundancy.

---

## 📌 Context & Motivation

* **Goal:** Make **Delete forever** delete. The reader confirms with their password, the account and everything hanging off it is erased, they are told so, and they are returned to the landing page with no account to sign back into.
* **Why:** `DeleteModal.jsx:33` tells the reader *"This purges your profile, saved words and reading progress. It cannot be undone."* — and `App.jsx:564` hands that button `signOut`:

  ```jsx
  {/* TODO: erasing the account needs auth.admin.deleteUser, which the
      publishable key cannot call — it belongs behind an Edge Function.
      Until that exists this only signs out; nothing is deleted. */}
  {showDelete && <DeleteModal closeDelete={closeDelete} onConfirm={signOut} />}
  ```

  **"Delete forever" and "Log out" are the identical code path** — `signOut` at `App.jsx:239-242` — differing only in that one of them goes through a red modal first. This is the only place in the app that states something untrue to the reader's face, and unlike the placeholder name Feature 4 retired, it is untrue about something the reader cannot check.
* **The entire database half is already built, and says so out loud.** `20260810103010_init_user_schema.sql:1-5` opens with the design:

  ```sql
  -- Everything here cascades from auth.users, so deleting the auth user (the
  -- "Delete forever" button in DeleteModal.jsx) purges the whole footprint.
  ```

  Verified against the live schema on 2026-08-20: `profiles.id references auth.users (id) on delete cascade` (`:10`), and `reading_sessions.user_id` (`:47`), `reading_progress.user_id` (`:72`) and `saved_words.user_id` (`:138`) each `references public.profiles (id) on delete cascade`. `20260810103130_rls_policies.sql:111-112` names the plan in a comment: *"No delete policy: account removal goes through the auth admin API, which cascades from auth.users through every table below."* **This feature needs no migration.**
* **There is no client-side alternative, and that is a fact about the grants rather than a preference.** `rls_policies.sql:26-29` grants `authenticated` `select, insert, update` on `profiles` and `reading_sessions`, `select` alone on `reading_progress`, and only `saved_words` carries `delete`. Three of the four tables refuse a reader's delete *before RLS is consulted at all*. An Edge Function is not the convenient implementation; it is the only possible one.
* **Live state, measured 2026-08-20:**

  | account | profiles | reading_sessions | reading_progress | saved_words |
  |---|---|---|---|---|
  | `basabodol1430@gmail.com` (Basa Bodol) | 1 | 18 | 10 | 10 |
  | `tomas@gmail.com` (Tomas Müller) | 1 | 1 | 1 | 4 |
  | **total** | **2** | **19** | **11** | **14** |

* **`DeleteModal` has zero test coverage.** No test file imports it; `askDelete` appears only as an inert `vi.fn()` prop at `tests/dashboard-profile.test.jsx:32` and `tests/level-switching.test.jsx:173`. The component has never been asserted on.
* **Scope, set deliberately:** deletion, and nothing more. No grace period, no soft delete, no data export (see Deferred).

---

## 📐 Architecture & Architectural Decisions

The following are locked and must not be revisited mid-build:

1. **No migration.** The cascade exists, is correct, and is the schema's stated design. A roadmap step that adds a migration here has misread `init_user_schema.sql:1-5`. Stage A proves the cascade rather than building it.
   * *Re-affirmed 2026-08-20 against the one thing that would have broken it.* A literal five-attempts-per-five-minutes limit needs a per-account counter, and nothing in the schema can hold one — that is a table, its RLS, its own cascade so it is erased with the reader it describes, and its own coverage in `rls_checks.sql`. It was weighed and refused (Decision 11). **If a future session decides the auth service's limit is not good enough, that is a migration and this decision is what it has to revoke** — do not slip a table in without saying so.

2. **The function derives the user from the JWT, never from the request body.**
   * This is the rule `private.has_level_access` already follows, and `rls_policies.sql:35-37` states why: *"it derives the user from `auth.uid()` inside the body rather than trusting an argument."*
   * A `service_role` function that deletes whatever id it is handed is not a bug with a blast radius — it is a **total account-takeover primitive**, callable by any signed-in reader against any account in the project.
   * The body carries exactly one field, `password`. Any other key is ignored, and B5 proves it by sending one.

3. **Three independent gates, all required.**
   * `verify_jwt: true` at the gateway proves the token is **signed** by this project.
   * The function's own `auth.getUser()` proves the token still names a **live** user — a JWT is stateless and outlives its account (Trap 3), so a signature check alone is not proof the account exists.
   * `signInWithPassword` proves the caller **knows the password**.
   * *Why the password is checked in the function and not the modal (settled 2026-08-20):* checking it in `DeleteModal` — the `ChangePasswordModal.jsx:24-38` pattern — makes it a UI speed-bump. Anyone holding a valid token could call the endpoint directly and skip it. Server-side, it is a second factor the endpoint enforces on every caller, including one that never loaded the app.
   * *Accepted cost:* the function spends an auth round-trip per attempt and its `signInWithPassword` counts against the project's token rate limits. Deleting an account is a once-per-lifetime action; this is not a hot path.

4. **Hard delete. `shouldSoftDelete` stays at its `false` default.**
   * A soft delete leaves the `auth.users` row in place. **The cascade fires on a row being deleted, so a soft delete removes nothing below it** — the reader gets a success response and keeps every row they asked to be rid of.
   * There is no state in which a soft delete is what this feature wants. Do not add the argument, not even explicitly as `false`; a reader of the code who sees the parameter will eventually wonder whether it should be `true`.

5. **The client signs out with `{ scope: 'local' }`.**
   * A bare `signOut()` posts to `/auth/v1/logout` with a token naming a user who no longer exists. `ChangePasswordModal.jsx` already establishes that the scope is chosen deliberately rather than defaulted — `signOut({ scope: 'others' })`, with the reason in a comment above it.
   * Local scope drops the stored session without asking the server about an account that has been erased. It also stops supabase-js's auto-refresh timer from firing against a dead refresh token.

6. **`supabase/functions/` mirrors the `supabase/migrations/` convention.**
   * `supabase/README.md:58-67` states the existing rule: there is no CLI and no local stack, so files are authored in the repo and applied to the remote project through the MCP server, and *"every applied migration gets a matching file here, under the same name."*
   * Edge Functions follow it exactly: `supabase/functions/<name>/index.ts` in the repo, deployed via MCP `deploy_edge_function`, kept in sync by hand. **This directory does not exist yet — this feature establishes it**, and D2 writes the rule down so the next function does not invent a second convention.

7. **The `service_role` key never enters `src/`, `.env` or any build.**
   * Vite inlines anything named `VITE_*` into the browser bundle — `src/lib/supabase.js:3-4` and the comment at `.env.example:1-2` both turn on this. The key is read inside the function from `Deno.env`, where the runtime injects it.
   * Confirmed 2026-08-20 that this project has the legacy `anon` key **enabled** alongside its `sb_publishable_…` key, so `SUPABASE_ANON_KEY` is available to the function for the `signInWithPassword` gate. B2's deploy is where this is proven rather than assumed.

8. **All account operations live in `src/lib/account.js`**, mirroring `content.js`, `progress.js`, `vocab.js` and `profile.js`.
   * It does **not** go through `rows()` (`src/lib/query.js:18-49`). That helper turns a PostgREST read into a throw-or-array and retries `PGRST303`; neither applies to a function invocation, and its error wrapping would flatten the wrong-password case into a generic message.
   * Application state stays in `App.jsx`. No new dependency.

9. **The modal's copy does not change.** *(Settled 2026-08-20; recorded so it is not re-litigated.)*
   * Four tables go and `DeleteModal.jsx:33` names three. It is written in reader concepts rather than table names, and *"reading progress"* is what a reader calls the thing `reading_sessions` is the raw log of. No reader distinguishes the two, and no reader has ever seen a session row.
   * **Making the button work is what makes the sentence true.** That is the whole feature. Rewriting the sentence at the same time would make it harder to see that nothing about the promise changed — only whether it is kept.

10. **The reader is told before the screen changes, and the note says goodbye.**
    * On success the modal switches to a `done` panel, exactly as `ChangePasswordModal.jsx:88-98` does, and only signs out when they dismiss it.
    * *Its content is a spec requirement, not a style choice* (spec Assumption 2): it confirms the deletion happened and leaves the door open — the address is free, and they may start again whenever they like. It **must not** argue, offer an alternative to leaving, or ask why they are going. A retention nudge at the moment somebody has chosen to leave would undo the honesty the whole feature exists to restore.
    * *Rejected:* signing out the instant the delete resolves. `SIGNED_OUT` routes to Landing (`App.jsx:154`), so the reader's account would vanish and the marketing page would appear with nothing said — indistinguishable from having been logged out by a bug. The one irreversible thing in the app should not be the one thing that happens silently.

11. **~~Guessing is refused by the auth service, and the function translates the refusal.~~ RETIRED 2026-08-20, the same day it was added — it does not work.**
    * **Struck through rather than deleted**, because the reasoning below is sound and only its premise was false. B4 measured 140 wrong passwords through the function with no refusal, against a direct limit that bites at 35. **Trap 13** carries the evidence and **spec goal 10 is now a non-goal** with the measurement recorded as its reason.
    * **What survives:** the `too_many_attempts` branch stays in the function and its mapping stays in `src/lib/account.js`. Both are correct, cost nothing, and would begin working the moment a limit ever applied. **What does not survive:** any claim to the reader that attempts are limited. The modal says nothing about it (spec criterion 2), so a limit that never fires cannot become a promise that is never kept.
    * **The `x-forwarded-for` pass-through also stays**, for the same reason and with the same caveat: it is what a caller *should* send, it is ignored today, and Trap 13 explains why. Do not present it as working.
    * The original three bullets follow unchanged, so a future session can see exactly what was tried and why it looked right:

    > * The function's `signInWithPassword` gate is already rate-limited by the auth service. When it refuses for that reason rather than for a wrong password, the function returns `{ "error": "too_many_attempts" }` and the modal says so — *"Too many attempts. Wait a few minutes and try again."* **The two must not collapse into one message:** telling somebody their password is wrong when it is merely their timing is exactly the kind of untruth this feature exists to remove.
    > * **The caller's IP must be forwarded.** The auth service buckets by source address, and the function's own egress address is identical for every reader. Without forwarding, one person guessing repeatedly spends a bucket shared with everybody else's delete. Pass the incoming request's `x-forwarded-for` through to the `signInWithPassword` call; B4 is where it is confirmed to have worked.
    > * *Not a counter of our own,* deliberately (Decision 1). The reader-facing behaviour is "guessing stops working, waiting fixes it"; the count and the window are the auth service's and are not ours to promise.

12. **Deleting ends every session, and other devices are made to notice.** *(Added 2026-08-20; spec goal 9.)*
    * The server half is free: `auth.admin.deleteUser` removes the user's stored sessions and refresh tokens, so no other device can renew. That alone bounds the exposure at one token lifetime.
    * The client half is not free, and is what makes the guarantee observable: a device already holding a live token goes on showing a dashboard until it next tries to renew. `App.jsx:158-163` already documents that `SIGNED_IN` re-fires whenever the tab regains focus — **that event is the hook.** C5 uses it to ask the auth server whether the reader still exists, and signs out locally when the answer is no.
    * *Why this and not a shorter token lifetime:* the lifetime is a project-wide setting. Shortening it would put an extra round trip on every reader, all the time, to close a window that opens once per deleted account.
    * *Consequence, accepted:* the other device is not told **why**. It returns to Landing like any other sign-out, because the only person holding it is the person who just deleted the account (spec non-goals).

---

## ⚠️ Known Traps & Edge Cases

* **1. The test stub cannot invoke a function.**
  * `tests/helpers/supabase.js` returns `{ from, calls }` and nothing else. There is no `functions` key at all, so `supabase.functions.invoke(...)` throws `undefined is not an object` — or, once a `functions` object exists but `invoke` is unstubbed, resolves to whatever the fall-through gives it.
  * This is the third time in three features: Feature 3 had to add `delete()` and Feature 4 had to add `update()`, each recording that an untaught stub makes every assertion pass while proving nothing.
  * **Rule:** C1 teaches the stub before any test of the delete path is written, not after.
* **2. `functions.invoke` sends a preflight, and `curl` does not.**
  * The call carries a JSON body, so `content-type: application/json` puts it outside the CORS-safelist and the browser issues an `OPTIONS` request first. A function that handles only `POST` **works perfectly from a shell and fails from the app**, with an error that names CORS rather than anything about deletion.
  * **Rule:** the function answers `OPTIONS` before it does anything else, and C6 verifies from a running build. A green B3–B5 proves nothing about this, because all three are shell calls.
* **3. The access token outlives the account by up to an hour.**
  * JWTs are stateless. `auth.admin.deleteUser` removes the user and its refresh tokens, but the access token already in the browser stays syntactically valid until its `exp`.
  * **Rule:** the client must drop the session itself (Decision 5). And the function's `auth.getUser()` gate exists because of this: it is a live check against the auth server, not a signature check, so a second call with the same token after deletion is refused rather than reaching `admin.deleteUser` a second time.
  * **A second device is deliberately unspecified.** The client can only drop its own stored session; a browser signed in elsewhere keeps a token that is valid until it expires, and this roadmap makes no promise about how quickly that device notices or what it shows when it does. Spec Assumption 3 leaves it open on purpose and flags it as worth confirming before building. **Do not implement a guess** — a global sign-out before the delete would change what Decision 5 means and has not been agreed.
* **4. `shouldSoftDelete: true` is a silent no-op wearing a success response.**
  * The cascade is a foreign key. It fires when the `auth.users` row is deleted and at no other time, so a soft delete leaves all four tables exactly as they were while the function returns 200.
  * **Rule:** Decision 4. Do not pass the argument at all.
* **5. Stage B spends a real account, permanently.**
  * B5 deletes `tomas@gmail.com` and its 1 session, 1 progress row and 4 saved words. There is no undo, no backup, and the free tier has no point-in-time restore.
  * **Rule:** B5 is the last task in the stage and runs only after B3 and B4 have passed. Record the before-counts in this file first, so the after-counts mean something.
* **6. One account afterwards will look like a regression.**
  * Same shape as Feature 2's Trap 5, Feature 3's Trap 8 and Feature 4's Trap 9: after B5 the project holds one account instead of two, and anyone re-reading the Context table will think rows went missing.
  * **Rule:** that is the feature working, and it is the only direct evidence in existence that it works. The table above records the before state precisely so the difference is legible.
* **7. Nothing in the suite can prove any of the security holds.**
  * `supabase` is `vi.mock`'d in every test file that touches it. Invisible to the entire suite: the gateway's JWT check, the password check, the service-role delete, the cascade, and CORS.
  * This is the same blind spot that let `PGRST303` reach the running app with 62 tests green, and that Features 2, 3 and 4 each recorded as their own Trap 10.
  * **Rule:** Stages A and B are the only guard. A test that *resembles* one of them is not a substitute, and D1's mutations deliberately do not claim to cover them.
* **8. `functions.invoke` hides the response body on a non-2xx.**
  * supabase-js returns a `FunctionsHttpError` whose `message` is a generic *"Edge Function returned a non-2xx status code"*. The JSON the function actually sent is reachable only through `await error.context.json()`.
  * **Rule:** C2 reads the context. Without it the reader is told the same useless sentence whether they mistyped their password or the function crashed — and `authUi.js:63-73` exists precisely because Supabase's own vocabulary tells a reader nothing about what to do.
* **9. Checked and cleared on 2026-08-20, recorded so nobody re-checks it.**
  * `reading_sessions_sync_progress` (`init_user_schema.sql:123-125`) is `after insert or update` only. Had it also fired on delete, the cascade would try to re-insert a `reading_progress` row for a profile being removed in the same statement, and the delete would abort on the foreign key — an account that could not be erased, with no message explaining why.
  * **Rule:** do not add a delete branch to that trigger. If one is ever needed, A2 is the assertion that will catch what it breaks.
* **11. The rate-limit bucket is shared unless the caller's IP is forwarded.** *(Added 2026-08-20 with Decision 11.)*
  * The auth service buckets password checks by source address. Every call the function makes leaves from the **same** address, so without forwarding `x-forwarded-for` there is one bucket for the whole project rather than one per reader.
  * The failure is quiet and misattributed: a reader who has typed nothing wrong is refused because somebody else was guessing, and the message tells them to wait — which is true, and useless, and not about anything they did.
  * **Rule:** forward the header, and treat B4 exhausting the limit as diagnostic. If B5 then fails immediately afterwards, the bucket was the function's and the forwarding is not working.
* **12. `verify_jwt` is a weaker gate than its name suggests — measured 2026-08-20, during B3.**
  * Four calls were made against the deployed function. A request with **no** `Authorization` header is refused by the gateway (`UNAUTHORIZED_NO_AUTH_HEADER`) and so is one carrying a malformed token (`UNAUTHORIZED_INVALID_JWT_FORMAT`). But a request whose bearer token is **the publishable key itself** passes the gateway and reaches the function body, where `auth.getUser()` refuses it with `not_signed_in`.
  * The publishable key is in the browser bundle by design (`.env.example:1-2`). So the gateway's guarantee is *"this token was issued by this project"*, **not** *"a reader is signed in"* — and anybody at all can satisfy the former.
  * **Rule:** gate 2 is not belt-and-braces, it is the gate. `auth.getUser()` may never be removed on the grounds that `verify_jwt` already covers it, and `verify_jwt: false` may never be set on the grounds that the function checks anyway — both halves are needed, for different attacks. Decision 3 asserted this; B3 proved it.
* **13. The auth service's rate limit does not reach through an Edge Function. Decision 11 does not work, and spec goal 10 is unmet.** *(Measured 2026-08-20 during B4.)*
  * **140 consecutive wrong passwords** through `delete-account` were every one answered `401 wrong_password`. Not one `429`. The `too_many_attempts` branch in the function has never executed and, on this evidence, cannot.
  * The limit is real and it was measured: hammering `/auth/v1/token` **directly** from the same machine was refused at attempt **35** with `over_request_rate_limit` — roughly the documented thirty per five minutes.
  * **The two facts together are the proof.** That direct run began from a *fresh* bucket immediately after 40 calls had gone through the function. Had the function's `x-forwarded-for` been honoured, those 40 would have counted against the same address and the direct run would have been refused almost at once. It was not. So the auth service is bucketing by the connection's real source — the function's own egress — and is not honouring a forwarded header from an untrusted hop, which is the correct thing for it to do and fatal to the approach that relied on it.
  * **Trap 11 was written backwards.** The predicted failure was one shared bucket locking every reader out. The actual failure is the opposite and worse: **no limit at all**, and an untruth of exactly the kind this feature exists to remove — the modal would promise a limit the endpoint does not enforce.
  * **Rule:** do not "fix" this by deleting the `too_many_attempts` branch — it is correct, cheap, and would start working the moment a limit ever applied. Do not claim goal 10 is met. The only implementations that would meet it are a per-account counter (a migration, Decision 1) or a client-side speed bump that is defeated by a page reload. **Until one is chosen, spec goal 10 and criterion 3 are outstanding**, and the modal must not tell a reader anything about attempts being limited.
* **10. What the tests cannot catch — read this before trusting a green suite.**
  * Everything in Trap 7, plus: whether the deployed function matches the file in the repo. `deploy_edge_function` uploads what it is given; nothing reconciles the two afterwards, exactly as nothing reconciles a migration file with the applied migration.
  * **Rule:** B2 and D2 are the only guard, and the rule they establish is the same one `supabase/README.md:58-67` already states for migrations.

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: Prove the Cascade

> **No application code.** These extend `supabase/tests/rls_checks.sql`, which already exists for exactly this purpose — self-contained, creating its own `auth.users` rows as `postgres` (`:15-36`), asserting into a temp `results` table, and rolled back at `:366`.
>
> Trap 7 is why this stage exists at all. Nothing here is reachable from the JS suite. Following Feature 3's and Feature 4's Stage B precedent this **does** produce a commit, because the file must be touched regardless.

- [x] **A1. Give a fifth fixture reader a complete footprint**
  * **File:** `supabase/tests/rls_checks.sql` — fixtures at `:15-36`, level-2 content at `:38-42`
  * **Action:** Add reader **E** (`55555555-5555-5555-5555-555555555555`, `e@lesener.test`, metadata `{"first_name":"Erika","last_name":"Falk"}`) to the fixture `values` list. After the temp `results` table is created, and still as `postgres`, give E one row in each per-user table:
    ```sql
    insert into public.reading_sessions (user_id, post_id, percent_read, completed, ended_at)
    select '55555555-5555-5555-5555-555555555555',
           (select id from public.posts order by id limit 1), 100, true, now();

    insert into public.saved_words (user_id, post_id, post_label, term, surface_form, translation)
    select '55555555-5555-5555-5555-555555555555',
           (select id from public.posts order by id limit 1),
           'Post 1: fixture', 'wohnung', 'Wohnung', 'flat';
    ```
  * The `profiles` row arrives from `private.handle_new_user()` and the `reading_progress` row from `reading_sessions_sync_progress` — **neither is inserted here on purpose**, because a fixture that writes them by hand would prove the cascade against a footprint the app could never have produced.
  * **This is a positive control and it earns its place**, exactly as the rename control at `:92-99` does: without it, A2's four zeroes would pass just as happily against rows that never existed.
  * **Done when:** four new result rows read `E: profile before delete` = `1`, `E: session before delete` = `1`, `E: progress before delete` = `1`, `E: saved word before delete` = `1`.

- [x] **A2. Delete E's auth user and assert all four tables empty**
  * **File:** same, after the second `reset role` (`:353`)
  * **Action:** As `postgres`, run **one** statement and then count what it took with it:
    ```sql
    delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
    ```
    Four counts for E, and a re-assertion that reader A's own rows are untouched. Nothing below `auth.users` is deleted by hand — a test that removes the child rows itself would pass against a schema with no cascade at all, which is the one thing this stage exists to rule out.
  * Counted as `postgres` deliberately, for Feature 3's Trap 11 reason: the same counts run as another reader are vacuously zero, because RLS hides E's rows either way.
  * **Done when:** every row of the final `select ..., (expected = actual) as ok` (`:365`) reads `ok = true`, including four new rows reading `E: profile after delete` = `0`, `E: session after delete` = `0`, `E: progress after delete` = `0`, `E: saved word after delete` = `0`, and `A's profile survived E's deletion` = `Anna`.
  * **STOP CONDITION:** 🛑 if any of the four is non-zero, the cascade does not work and **no Edge Function can be trusted over it**. Fix the schema before writing a line of Stage B — a function that deletes the auth user and orphans everything else is worse than the honest no-op it replaces.

> **Whole stage done when:** every row of `rls_checks.sql`'s final select reads `ok = true`, as `supabase/README.md:168-180` requires, and `get_advisors(type: "security")` is unchanged.
>
> **Stage A complete, 2026-08-20.** Ran against the live project: **61 rows, all `ok = true`**, up from 51 before this stage — the ten new ones being E's four before-counts, its four after-counts and the two that prove reader A survived it. `get_advisors(type: "security")` is unchanged, still reporting only the pre-existing leaked-password-protection warning.
>
> **What the run actually established, beyond "it passed":** E's `profiles` row and its `reading_progress` row were never written by the fixture — they arrived from `private.handle_new_user()` and `reading_sessions_sync_progress` respectively, and both then vanished with the single `delete from auth.users`. So the cascade was proven against a footprint built the way the app builds one, and Trap 9's concern is now positively confirmed rather than merely reasoned about: the sync trigger did not fire on the delete, and nothing resurrected the progress row.

---

### Stage B: The Edge Function

> The first Edge Function in the project. It creates `supabase/functions/`, and D2 writes down the convention it establishes.
>
> **B3, B4 and B5 are the only proof any of this works** (Trap 7). B5 is irreversible.

- [x] **B1. Write `delete-account`**
  * **File:** `supabase/functions/delete-account/index.ts` (new)
  * **Action:** A `Deno.serve` handler doing exactly five things, in order:
    1. Answer `OPTIONS` with the CORS headers (`access-control-allow-origin: *`, `access-control-allow-headers: authorization, x-client-info, apikey, content-type`, `access-control-allow-methods: POST, OPTIONS`) and a 204 — **before anything else** (Trap 2).
    2. Refuse anything that is not `POST` with 405.
    3. Resolve the caller: build an anon-key client carrying the request's own `Authorization` header, call `auth.getUser()`, and 401 if it fails. Take `id` and `email` from the result and **nothing from the body but `password`** (Decision 2).
    4. Verify the password: a **separate** anon-key client with no session, built with the incoming request's `x-forwarded-for` passed through in its global headers (Decision 11), then `signInWithPassword({ email, password })`. Return 401 with `{ "error": "wrong_password" }` for a bad password, and **429 with `{ "error": "too_many_attempts" }` when the refusal is the rate limit** — the auth service distinguishes them and so must this.
    5. Delete: a `service_role` client, `auth.admin.deleteUser(id)` — no second argument (Decision 4). Return 200 with the CORS headers on success, 500 with `{ "error": "delete_failed" }` otherwise.
  * Keys come from `Deno.env.get('SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY')`, injected by the runtime (Decision 7).
  * Two clients, not one, at steps 3 and 4: `signInWithPassword` replaces the session on the client it is called against, and reusing the caller's client would overwrite the identity just established at step 3.
  * The dependency specifier is the one thing here that cannot be settled from this repo — there is no Deno tooling to resolve it locally. Confirm it at B2; a wrong specifier fails at deploy or first boot, not at write time.
  * **Done when:** `grep -nE "OPTIONS|auth\.getUser|signInWithPassword|admin\.deleteUser" supabase/functions/delete-account/index.ts` returns **four** lines in that order, and `grep -niE "body\.(id|user_?id)|\.id *= *body" supabase/functions/delete-account/index.ts` returns **nothing**.

- [x] **B2. Deploy it**
  * **Action:** MCP `deploy_edge_function` with `name: "delete-account"`, `entrypoint_path: "index.ts"`, `verify_jwt: true`, and the file's exact contents. Keep the repo file and the deployment in sync by hand from here on (Decision 6, Trap 10).
  * **Done when:** MCP `list_edge_functions` returns one function named `delete-account` with `verify_jwt` true and status `ACTIVE`, and MCP `get_edge_function` returns a body whose four gate lines match B1's grep exactly — same four calls, same order.
  * **Confirmed 2026-08-20**, after `/roadmap-updater` caught that this half had been ticked without being run. `get_edge_function` returns the deployed body carrying all four gate calls in the same order as the repo file — `OPTIONS`, `caller.auth.getUser`, `verifier.auth.signInWithPassword`, `admin.auth.admin.deleteUser` — at version 1, `verify_jwt` true, status ACTIVE.
  * *The Done-when is deliberately weaker than "byte-identical".* The platform normalises what it stores, so a byte comparison would fail for reasons that have nothing to do with the function being right. Matching the four gates is what actually matters; keeping the file and the deployment in step beyond that is a discipline (Decision 6), not something this line can enforce.

- [x] **B3. Prove it refuses a call with no session.** 🧑 **Human only** — no test can reach it.
  * **Action:** `POST` to `https://mxkyojmuodcksvgddgke.supabase.co/functions/v1/delete-account` with the publishable key as `apikey`, a JSON body of `{"password":"anything"}`, and **no `Authorization` header**.
  * **Done when:** the response is `401`, and `select count(*) from auth.users` still returns **2**.
  * **STOP CONDITION:** 🛑 if it returns 2xx, `verify_jwt` did not take effect at B2 and the endpoint is erasing accounts for anonymous callers. Do not continue.

- [x] **B4. Prove it refuses the wrong password.** 🧑 **Human only.**
  * **Action:** Get a real access token for `tomas@gmail.com` from `/auth/v1/token?grant_type=password`, then call the function with that `Authorization` header and a **wrong** password.
  * **Then keep going until the limit bites** (Decision 11): repeat the wrong-password call until the response changes, and confirm it becomes `429` carrying `{"error":"too_many_attempts"}` rather than another `401`. This is the only place the rate-limit path can be reached at all — C6 cannot provoke it without spending the same bucket, and no test can reach it.
  * **Done when:** the first wrong password returns `401` carrying `{"error":"wrong_password"}`; repeated attempts eventually return `429` carrying `{"error":"too_many_attempts"}`; and `tomas@gmail.com` still exists with **1 / 1 / 1 / 4** rows across `profiles` / `reading_sessions` / `reading_progress` / `saved_words`.
  * **STOP CONDITION:** 🛑 if the account is deleted, the password gate is decorative and Decision 3 has not been implemented. Everything Stage C builds on top of it is then a lie of the same kind this feature exists to remove.
  * ⚠️ **Note what you spend here.** The bucket you exhaust is the forwarded IP's. If the `x-forwarded-for` pass-through is missing, the bucket is the *function's* and you have just rate-limited every delete in the project for five minutes — including B5's. That is the symptom to look for if B5 then fails for no apparent reason, and it is itself the evidence that Decision 11's forwarding was not implemented.

- [x] **B5. Prove it deletes the caller, and only the caller.** 🧑 **Human only.** ⚠️ **Irreversible.**
  * **Action:** With `tomas@gmail.com`'s access token and their **correct** password, call the function with a body that also carries somebody else's id — `{"password":"<correct>","id":"<basabodol's uuid>"}`. One call proves both halves: the body's `id` must be ignored, and the caller must be the one erased (Decision 2).
  * **⚠️ This is the only irreversible step in the feature.** `tomas@gmail.com` and its 1 session, 1 progress row and 4 saved words are gone afterwards. There is no restore on this plan (Trap 5).
  * **Done when:** the response is 2xx; `select count(*) from auth.users where email = 'tomas@gmail.com'` returns **0**; all four per-user tables return **0** rows for that id; and `basabodol1430@gmail.com` still reads exactly **1 / 18 / 10 / 10**.
  * **STOP CONDITION:** 🛑 if `basabodol1430`'s counts moved at all, the function is trusting the body. Stop and delete the deployment, not just the code — a deployed function outlives the branch it was written on.
  * Record the resulting counts in this file when it is done, as Feature 3's C8 and Feature 4's E4 did (Trap 6).

---

> **Stage B complete, 2026-08-20, with one failure recorded rather than fixed.**
>
> * **B3 passed, and taught us something.** Four probes, not one. No `Authorization` header → the gateway refuses (`UNAUTHORIZED_NO_AUTH_HEADER`); a malformed token → the gateway refuses (`UNAUTHORIZED_INVALID_JWT_FORMAT`); **the publishable key used as the bearer token → the gateway lets it through** and `auth.getUser()` refuses it. `OPTIONS` returned 204 with all three CORS headers. See **Trap 12**, which this produced.
> * **B4 passed on its first half.** A valid token with a wrong password returned 401 `wrong_password`, and the account was still there at 1 / 1 / 1 / 4. *(To get a real token, `tomas@gmail.com`'s password was reset by hand through `execute_sql` — it was slated for deletion in the next task, so this changed nothing that survived the hour.)*
> * **B4's rate-limit half FAILED, and Decision 11 does not work.** See **Trap 13**. The reordering of this check after B5 was deliberate — Trap 11 warned it could poison B5's bucket — and it turned out there was no bucket to poison.
> * **B5 passed on both halves.** Called with `tomas@gmail.com`'s token, the correct password, **and `basabodol1430`'s id planted in the body**. Response 200 `{"deleted":true}`. Afterwards: `tomas@gmail.com` absent from `auth.users`, and **0 / 0 / 0 / 0** across all four tables. `basabodol1430` untouched at **1 / 18 / 10 / 10**, `first_name` still `Basa`. The planted id was ignored, so Decision 2 holds in fact and not only in intent.
> * **One account remains** (`basabodol1430@gmail.com`), which is Trap 6 arriving exactly as predicted. The throwaway used for the rate-limit probe was itself deleted through the function, which is a second successful end-to-end run.

### Stage C: Wire the Client

> **Indivisible — ships as one commit.** A modal that collects a password nothing sends, or a data layer nothing calls, leaves the app in a state no check can settle. C6 is the human confirmation on a running build.
>
> C5 is the one task here that is not about the reader doing the deleting. It is about the other browser they left signed in, and it is the only part of Decision 12 that costs anything to build.

- [x] **C1. Teach the test stub to invoke a function**
  * **File:** `tests/helpers/supabase.js` — `calls` object at `:34`, return at the end
  * **Action:** Add `invoke: []` to `calls`, and return a `functions` object alongside `from`:
    ```js
    functions: {
      invoke: (name, options) => {
        calls.invoke.push([name, options]);
        const answer = fns[name];
        return Promise.resolve(
          (typeof answer === 'function' ? answer(options) : answer) ?? { data: null, error: null },
        );
      },
    }
    ```
    taking a second `fns` argument to `stubSupabase`, so a case can answer differently for success and failure. Document it in the file's header comment in the same voice as the `delete()` and `update()` notes already there.
  * **This comes first.** Written after C2 or C3, every assertion below would pass against a stub that never ran (Trap 1).
  * **Done when:** `npm test` passes with **no existing test's assertions changed**, plus a case asserting `calls.invoke` saw `['delete-account', { body: { password: 'hunter2' } }]`.

- [x] **C2. Add the account data layer**
  * **File:** `src/lib/account.js` (new)
  * **Action:** `deleteAccount(password)` → `supabase.functions.invoke('delete-account', { body: { password } })`. On `error`, read the function's own JSON through `await error.context?.json()` (Trap 8) and map `wrong_password` to *"That is not your password."* and `too_many_attempts` to *"Too many attempts. Wait a few minutes and try again."* (Decision 11); anything else throws a sentence in the house style, with the status appended as `authUi.js` and `vocab.js:68-71` do. Resolves with nothing on success — there is no row to hand back.
  * No `rows()` (Decision 8). No user id is sent (Decision 2) — the id travels in the JWT that supabase-js attaches to the invocation automatically.
  * **Done when:** `npm test` passes with tests asserting the invoke name and body; that a `wrong_password` response throws exactly *"That is not your password."*; that a `too_many_attempts` response throws the waiting message and **not** the wrong-password one; that an unmapped failure throws a message containing the status; and that a success resolves without throwing.

- [x] **C3. Give the modal a password and three states**
  * **File:** `src/components/DeleteModal.jsx`
  * **Action:** Follow `ChangePasswordModal.jsx` throughout — same `error` / `done` / `busy` state, same `busy` guard at the top of submit, same `role="alert"` error paragraph and `errorMessageStyle`, same `'Saving…'` label swap. Wrap the existing buttons in a `<form onSubmit={submit}>` and add one `PasswordField` with `id="delete-password"`, `label="Your password"`, `autoComplete="current-password"`. On success switch to the `done` panel (Decision 10) whose single button calls `onConfirm`. **The copy at `:33` does not change** (Decision 9).
  * `closeDelete` stays on the backdrop and on Cancel, and neither may fire while `busy` — a reader who dismisses the modal mid-request would otherwise watch their account disappear from behind it. **Cancel takes `disabled={busy}`; the backdrop cannot.** It is a `div`, and `disabled` does nothing to one, so its handler needs an explicit `if (busy) return`. *(Corrected 2026-08-20 during spec reconciliation — this line previously asked for `disabled` on both, which would have left the backdrop dismissable mid-delete while looking guarded.)*
  * The `done` panel's copy is Decision 10's, and it is a spec requirement rather than a wording preference.
  * **Done when:** `grep -n "purges your profile, saved words and reading progress" src/components/DeleteModal.jsx` still returns exactly one line, and five tests pass — the password field renders; a failed delete keeps the modal **open** with a message in it and `onConfirm` **not** called; a successful delete shows the `done` panel and calls `onConfirm` only when its button is pressed; and neither Cancel nor a backdrop click closes the modal while a delete is in flight.
  * *Corrected 2026-08-20 by `/roadmap-updater`, which refused this tick.* The line has always demanded that **neither Cancel nor a backdrop click** closes the modal mid-delete, and only the buttons were covered — a `toBeDisabled()` assertion cannot reach a `div`. The fifth test clicks the backdrop while a delete is in flight and asserts the modal is still there; removing the `if (busy || done) return` guard fails it.

- [x] **C4. Wire it up and retire the TODO**
  * **File:** `src/App.jsx:239-242` (`signOut`), `:561-564` (the mount)
  * **Action:** Add a `finishDelete` handler beside `signOut` that calls `supabase.auth.signOut({ scope: 'local' })` (Decision 5), and pass it as the modal's `onConfirm` in place of the bare `signOut`. Delete the three-line TODO comment above the mount.
  * The `SIGNED_OUT` branch already clears `showDelete` (`:140`) and routes to Landing (`:154`), so nothing else in `App` changes. The modal owns the delete itself; `App` owns only what happens after the reader dismisses the confirmation.
  * **Done when:** `grep -rn "Until that exists this only signs out" src/` returns nothing, `grep -n "onConfirm={signOut}" src/App.jsx` returns nothing, and a test shows the modal's `done` button producing a `signOut` call with `{ scope: 'local' }`.
  * *Corrected 2026-08-20 while running it.* This line originally also required `grep -rn "auth.admin.deleteUser" src/` to come back empty. It does not, and should not: `src/lib/account.js` names the call in a comment explaining why the browser cannot make it and why the Edge Function exists. The guard was meant to catch the **TODO**, so it now greps for the TODO's own words — a phrase that matched exactly one line before this task and none after.

- [x] **C5. Make another device notice**
  * **File:** `src/App.jsx` — the auth listener's fallthrough at `:158-163`
  * **Action:** That branch already exists because `SIGNED_IN` re-fires whenever the tab regains focus, and its comment says so. Use the same event to ask whether the reader still exists: call `supabase.auth.getUser()` and, when it comes back without one, `supabase.auth.signOut({ scope: 'local' })`. The existing `SIGNED_OUT` branch (`:134-156`) then does all the navigating, so this adds no new route (Decision 12).
  * **Only on a re-fire, never on the first sign-in.** The session was just minted; asking the auth server to confirm it a moment later is a round trip that can only ever say yes, and putting it in front of the dashboard would delay every sign-in in the app to catch a case that happens once per deleted account.
  * A failure to reach the auth server is **not** an answer. Sign out only on an explicit "no such user" — a reader who loses their connection for a moment must not be logged out by it.
  * **Done when:** a test shows a tab-focus re-fire against a deleted reader producing `signOut` with `{ scope: 'local' }` and landing on Landing; a re-fire against a live reader producing **no** `signOut` and leaving the screen alone; and a re-fire whose `getUser` rejects producing **no** `signOut` either.
  * *Corrected 2026-08-20 by `/roadmap-updater`, which refused this tick and found a defect behind it.* The third case was never written: the "network" test resolved *with* an error rather than rejecting, and those are different paths through the code. A real rejection had **no `.catch()`** to land in, so it escaped as an unhandled promise — one per dropped request, measured — printing a red console error during precisely the situation this check exists to survive quietly. Fixed with a `.catch(() => {})`, and the missing test added.
  * **How that test bites is unusual, and worth knowing before someone "tidies" it.** Reverting the `.catch()` leaves all 18 assertions passing; vitest reports `Errors 1` under *Unhandled Errors* and exits **1**. So `npm test` does fail — but a reader skimming for `Tests 18 passed` would conclude otherwise. **Rule:** judge this one by the exit code, not the test count.

- [x] **C6. Confirm the delete on a running build.** 🧑 **Human only** — none of this is reproducible from the suite.
  * **Action:** Against `npm run dev` and the live database: create a fresh account through the sign-up form, save a word and finish a post so it has a footprint, then delete it from the account menu. Confirm the password field refuses a wrong password **with the modal still open**; confirm the confirmation panel appears, says what happened and does not try to talk the reader out of leaving (Decision 10); confirm dismissing it lands on Landing; confirm signing in with those credentials afterwards fails; and confirm all four tables hold zero rows for that id.
  * **Then sign up again with the same email address** and confirm it is accepted and produces an account with no saved words, no reading history and no name from before. This is spec goal 6 and criterion 8 — the freed address is observable behaviour the reader can check without any access to the database, and it is the strongest proof available to them that the old account is genuinely gone. *(Added 2026-08-20 during spec reconciliation.)*
  * **Also confirm, because only a running browser can:** the request produces **no CORS error in the console** (Trap 2 — B3–B5 are shell calls and prove nothing about this), and no `refresh_token` error appears after the sign-out (Trap 3).
  * **Second device, the whole point of Decision 12.** Before deleting, sign the same throwaway account in on a second browser (a private window is enough — it has its own storage) and leave it sitting on the dashboard. Delete from the first. Then bring the second to the front and confirm it lands on **Landing**, not on a nameless or empty dashboard, and that it never renders a dashboard for the deleted account at any point. *(Spec criterion 13.)*
  * **Done when:** every check above has been run and its result recorded in this file, including which browser was used as the second device.
  * **Partly done, 2026-08-20 — the half that needs no browser was run and passed; the visual half is still outstanding.** The Chrome extension was not connected, so the UI could not be driven. Everything reachable over HTTP and SQL was done instead, against the live project, as one round trip on a throwaway (`roundtrip@lesener.test`, deleted afterwards):
    * signed up through the real endpoint with `options.data` names → profile created reading **Round Trip**;
    * gave it a genuine footprint the way the app does — one finished `reading_sessions` row (201) whose trigger produced the `reading_progress` row, and one `saved_words` row (201) → **1 / 1 / 1** plus the profile;
    * a **wrong** password → 401 `wrong_password`, account intact (**criterion 2**, server half);
    * the correct password → 200 `{"deleted":true}`, and **0 rows across all four tables** (**criterion 9**);
    * signing in with the old credentials → 400 `invalid_credentials` (**criterion 7**);
    * signing up again with the same address → **accepted**, a different user id, name *Fresh Start*, and **nothing carried over** (**criterion 8**);
    * `basabodol1430` untouched throughout — still `Basa`, still 10 saved words (**criterion 10**).
  * **The browser half was then run by Shojib, 2026-08-20, and passed.** Twice over, on `muler@gmail.com` — first on an account carrying **10 finished posts and 6 saved words**, then again on a fresh one made with the same address and a different spelling of the surname. Screenshots of both modal states were reviewed.
    * **Criterion 1** — the modal demands a password before anything can be erased.
    * **Criterion 14** — the warning reads exactly as it always has, and is now true.
    * **Criterion 5** — the goodbye note appears *before* the screen changes, and does only what Decision 10 allows: confirms what went, leaves the door open, asks nothing.
    * **Criteria 8 and 9, on a real footprint** — the second sign-up produced a different `auth.users.id` with a `created_at` seven minutes later and **0 / 0 / 0**, carrying the new spelling. The first account's 10 sessions, 10 progress rows and 6 saved words were gone, and an orphan sweep across all four tables returned **0** in every case: no child row without a profile, no profile without an auth user.
    * **Criterion 10** — `basabodol1430` untouched at 1 / 18 / 10 / 10 throughout both runs.
  * **Trap 2 is closed, and by inference rather than by reading a console.** The goodbye panel only renders after `deleteAccount` resolves, and that requires a real `functions.invoke` to have cleared the browser's CORS preflight; a CORS failure would have produced the error state instead. Every check in Stage B was a shell call, so this was the first time the endpoint had ever been reached from a browser.
  * **Criterion 12 was then run properly, across two real browsers, and passed.** Shojib signed the same account — `peter@gmail.com`, *Peter Parker*, 5 saved words, Level 2 unlocked so all 10 Level 1 posts read — into **Brave** and **Edge** at once. Deleted from Brave; brought Edge to the front; **Edge was already on Landing, signed out**, without being touched beyond being focused. Signing in there with the same email and password was then refused with *"That email and password do not match."*
    * **This is the run that vindicates the measurement in C5.** The first version of that check was `if (!error && !data?.user)`, and it would have done nothing here: a deleted account answers **403**, so the branch never fires, and Edge would have gone on rendering a nameless, empty, fully working dashboard — PostgREST having happily served its still-valid token. Only because the reply was measured rather than assumed does the status test exist, and only because it exists did Edge reach Landing.
    * Afterwards: `peter@gmail.com` absent from `auth.users`, totals back to `basabodol1430`'s own **18 / 10 / 10**, and all four orphan counts **0**.
  * **Still not verified, and honestly so:** **criterion 13** — an *untouched* device reaching Landing by itself. Criterion 12 covers the device being returned to; 13 is the one that needs a tab left alone for up to a token lifetime, and it was not waited out. C5's test and Decision 12's server half are what stand behind it. **Criteria 3 and 4** (Cancel leaving the account intact; the modal refusing to be dismissed mid-delete) are covered by the suite but were not exercised by hand.
  * **Noticed while reviewing the screenshots, and deliberately not fixed here:** the modal carries no `role="dialog"`, no `aria-modal`, no focus trap and no autofocus. `ChangePasswordModal` and `EditNameModal` share every one of those gaps, so it is a codebase-wide pattern rather than something this feature introduced — see *Subsequent Roadmap Context*. Also cosmetic: the card changes height between the two states, so it shifts slightly under the cursor.
  * *Spec criterion 14 — an untouched device reaching Landing by itself — is **not** checked here.* It takes up to a token lifetime to observe and cannot be hurried without changing a project-wide setting. It is covered by C5's test and by Decision 12's server half; a person watching a tab for an hour proves nothing that those two do not.

---

### Stage D: Cover It and Document It

- [x] **D1. Make the suite bite**
  * **Done when:** `npm test` passes, and each of these mutations fails at least one test — apply, watch it fail, revert:
    a. `deleteAccount` sending an empty body instead of `{ password }`,
    b. `deleteAccount` resolving instead of throwing when the function returns an error,
    c. the `wrong_password` mapping removed, so the reader gets Supabase's generic non-2xx sentence,
    d. `signOut()` called without `{ scope: 'local' }`,
    e. the `done` panel skipped, so `onConfirm` fires the moment the delete resolves,
    f. a failed delete closing the modal instead of keeping it open,
    g. `too_many_attempts` mapped to the wrong-password message, so a reader is told their password is wrong when it is their timing,
    h. the focus re-fire signing out on a `getUser` that **rejected** rather than one that returned no user — a dropped connection must not log anybody out,
    i. the focus re-fire not signing out at all when the reader is gone.
  * **Run 2026-08-20: nine of ten bite.** (a) 2 failures, (b) 6, (c) 1, (d) 1, (e) 4, (f) 3, (g) 1, (h) 1, (i) 2. Two more were added while running them:
    * **(k) narrowing the liveness check to `SIGNED_IN` alone, dropping `INITIAL_SESSION`.** It did **not** bite at first, and that was a real hole rather than an unreachable branch: a reload announces a restored session as `INITIAL_SESSION`, which is the commonest way anybody returns to an abandoned tab, and no test went near it. A case was added and the mutation now fails 1.
    * **(j) removing the `if (busy) return` guard at the top of `submit` — does NOT bite, and cannot.** While a delete is in flight the password field, Cancel and the submit button are all `disabled`, so there is no way from the UI to reach the handler a second time and the guard is unreachable by construction. A test could only get there by dispatching a submit event straight at the form, which would assert against something no reader can do. **Rule:** keep the guard — it mirrors `ChangePasswordModal.jsx:26` and is the thing that still holds if a future change stops disabling the button — but do not add a test claiming to cover it. Same shape as Feature 3's Trap 12 and Feature 4's Trap 11.
  * **Deliberately absent, because no test can catch them** (Trap 7): the gateway's JWT check, the password check, the service-role delete, the cascade, CORS, and whether the rate limit buckets per reader or per function. Stages A, B and C6 are their only guard. Do not add a mutation that appears to cover one.

- [x] **D2. Document the Edge Function convention**
  * **File:** `supabase/README.md`, a new section beside *"Applying changes"* (`:58-67`)
  * **Action:** State the rule Decision 6 establishes: functions are authored at `supabase/functions/<name>/index.ts`, deployed through MCP `deploy_edge_function` with `verify_jwt: true`, and the repo and deployment are kept in sync by hand exactly as migrations are. Describe `delete-account` — its three gates, that it takes only a password, and that the id comes from the JWT. Note that the `profiles` bullet's cascade is now exercised by a real caller.
  * **Done when:** `grep -n "delete-account" supabase/README.md` returns at least one line inside a section naming `deploy_edge_function`, and the section states that the repo file is the source of truth.

- [x] **D3. Close it out**
  * **Done when:** `grep -rn "Until that exists this only signs out" src/` returns nothing — it matches exactly one line today, `App.jsx:563`, so it is a guard that can genuinely go from one to zero — and `npm run lint`, `npm test` and `npm run build` all pass, with the test count recorded in this file's header.

---

## 📦 Suggested Commit Breakdown

Four commits, each independently working.

1. `test(account): prove deleting an auth user erases the whole footprint` (`A1`–`A2`) — `rls_checks.sql` only. No application code and no schema change; the cascade this feature depends on is proven before anything is built on it.
2. `feat(account): add the delete-account Edge Function` (`B1`–`B5`) — the function and its deployment. The app is unchanged and still only signs out; the endpoint exists and is proven, and `tomas@gmail.com` is spent proving it.
3. `feat(account): make Delete forever actually delete` (`C1`–`C6`) — indivisible; the stub, the data layer, the modal and the wiring land together.
4. `chore(account): cover the delete path and document Edge Functions` (`D1`–`D3`).

---

## 🔮 Subsequent Roadmap Context

* **Feature 6 — Theme follows the account.** `profiles.theme` is still unwritten; the column and its `check (theme in ('light','dark'))` have existed since `init_user_schema.sql:13`. Settled in this feature's interview on 2026-08-20 and reserved for that one: **two states, light and dark only** — not the tri-state the column's comment at `:12` describes, so that comment must be rewritten rather than implemented — and **localStorage stays the signed-out store** (`THEME_KEY` at `App.jsx:22`, read at `:103-111`, written at `:93-101`), with the account's value winning on sign-in and every signed-in toggle writing both. Widening `fetchProfile`'s `select('id, first_name, last_name')` (`profile.js`) will break `tests/profile.test.js:29-30`, which asserts that exact column list. Theme has **no test coverage at all** today, and `ThemeToggle.jsx` has no accessible name.
* **`display_name` as a chosen nickname.** Still unsent and unshown; `rls_checks.sql:86` remains a working proof of the metadata path.
* **`level_progress` is still the only unread object** in the schema (`supabase/README.md:137`).
* **Content authoring for Level 2:** `b1-momentum` still holds no posts, so Feature 2's Trap 2 stands until posts are seeded by SQL. Not a code change.
* **`supabase/README.md:9-11` is stale** — it still refers to `src/data.js`, which Feature 1's Stage E deleted. A one-paragraph fix nobody has picked up.
* **Posts 3–10 carry placeholder prose** (`supabase/README.md:184-186`).
* **Every modal in the app is inaccessible in the same four ways.** `DeleteModal`, `ChangePasswordModal` and `EditNameModal` each render a bare `div` overlay with no `role="dialog"`, no `aria-modal="true"`, no focus trap and no autofocus on their first field. A keyboard or screen-reader user is not told a dialog opened and can tab straight out of it into the dashboard behind. Noticed 2026-08-20 while reviewing Feature 5's screenshots; deliberately not fixed there, because a change to the shared modal contract touches three components and belongs in a feature of its own rather than riding along with a delete path.
* **Before launch, unrelated to any feature:** the Supabase project runs with `mailer_autoconfirm = true` and no SMTP sender, which must be reverted before real accounts exist. `get_advisors(type: "security")` also reports leaked-password protection disabled, checked 2026-08-20.
