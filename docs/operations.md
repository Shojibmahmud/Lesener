# Operations

The frontend is **not deployed anywhere**. The backend is. This is the runbook for
the backend, plus an honest account of what deploying the frontend would take.

## The one-environment reality

There is a single Supabase project, `mxkyojmuodcksvgddgke`, and it serves
everything: local development, the test walkthroughs, and all seeded content. There
is no staging, no preview branch in use, and no separation between "the database I
develop against" and "the database that holds real reader data".

That is a real risk and it is stated rather than hidden. What keeps it survivable:

- **`supabase/tests/rls_checks.sql` rolls itself back.** It creates its own users
  and content, asserts, and throws the transaction away. Its test posts use
  positions 9001+ so they cannot collide with a real seed.
- **Gate predictions run inside throwaway transactions.** Impersonate a reader,
  complete a level through `reading_sessions`, read `level_progress`, roll back,
  then re-read the counts to prove nothing moved. That technique has predicted the
  walk on levels 5 through 10.
- **The Vitest suite never touches the network.** It mocks `src/lib/supabase`
  entirely.
- **Every content seed is idempotent and checksummed** before and after.

MCP branching is enabled in the server's feature list but has never been used. It is
the obvious upgrade path if this ever stops being a hobby project.

## Applying a migration

There is no Supabase CLI and no local stack here, so migrations are **written as
files in this repo and applied to the remote project through the Supabase MCP
server**, which records them in `supabase_migrations.schema_migrations`.

1. Write the file into `supabase/migrations/` using the
   `YYYYMMDDHHMMSS_snake_case_name.sql` convention.
2. Apply it: `apply_migration(name: <same filename>, query: <the file>)`.
3. Verify with `list_migrations`.
4. Run the checks below.

Keep the two in sync — every applied migration gets a matching file here, under the
same name.

**Migrations are append-only.** A file that has been applied is never edited, even
when a comment inside it turns out to be wrong. Where a migration comment and the
documentation disagree, the documentation is the correction; the
[`profiles.theme` note](data-model.md#theme) is the worked example.

If the CLI is ever added (`brew install supabase/tap/supabase`), `supabase link`
followed by `supabase migration list` should show all eight already applied.

## Seeding content

Content goes in with **`execute_sql`, not `apply_migration`**. A prose correction is
data, and should not accumulate in migration history — otherwise a typo fix becomes
a permanent schema event.

The generator, the upsert rules and the verification ritual are in
[content-authoring.md](content-authoring.md). The short version:

```
build_seed_sql.py  →  00-level.sql, 01-post-NN.sql, 02-dictionary-NN.sql, 03-cleanup.sql
                   →  execute_sql, in numeric order
                   →  checksum both sides
                   →  walk the level in the running app
```

## The `delete-account` Edge Function

The only function, and the only server-side code in the project.

### Deploying it

```
deploy_edge_function(name: "delete-account", verify_jwt: true, files: [index.ts])
```

**`supabase/functions/delete-account/index.ts` is the source of truth, and nothing
reconciles it with what is deployed.** Edit here first and redeploy; never the other
way round. There is no drift detection and no way to diff the two from this repo.

### Why it exists

The browser cannot do this job. `auth.admin.deleteUser` needs the service-role key,
which must never reach the bundle — and there is no client-side fallback either:
`authenticated` holds no `delete` grant on `profiles`, `reading_sessions` or
`reading_progress`, so three of the four tables refuse before RLS is even consulted.
One admin call erases the whole footprint through the `on delete cascade` chain.

Its security properties — the three gates, the user id coming from the token rather
than the body, and the measured absence of a rate limit — are in
[security.md](security.md#the-delete-account-function).

### Response codes

| Code | HTTP | Meaning |
|---|---|---|
| `method_not_allowed` | 405 | Not a POST |
| `not_signed_in` | 401 | No valid session |
| `bad_request` | 400 | Body was not `{ password }` |
| `wrong_password` | 401 | The only fixable one — `src/lib/account.js` treats it separately |
| `too_many_attempts` | 429 | Mapped in the client, but **currently unreachable** |
| `delete_failed` | 500 | The admin call failed |
| — | 200 | `{ deleted: true }` |

## After any change below the client

```
supabase/tests/rls_checks.sql        every row must read ok = true
get_advisors(type: "security")       one known WARN, see below — no new ones
get_advisors(type: "performance")    "unused index" INFOs are expected at zero traffic
```

The security advisor is the one that matters. It is what caught `handle_new_user`
sitting in `public` (linter 0028/0029), which is why migration 6 exists.

**It is not currently empty.** As of 2026-09-03 it reports exactly one WARN:
`auth_leaked_password_protection` — Supabase Auth can check new passwords against
HaveIBeenPwned and that check is switched off. It is a project setting rather than
anything in this schema, it costs nothing to enable, and it belongs on the
pre-launch list next to `mailer_autoconfirm`. Treat "one known WARN" as the baseline
and anything else as a regression.

## Known drift

**One migration's recorded version does not match its filename.** The database holds
`20260819122109 saved_words_display_fields`; the file is
`20260819141500_saved_words_display_fields.sql`. Harmless today, and a problem the
day anyone adopts the Supabase CLI — `supabase migration list` would call the file
unapplied and a push would fail on already-existing columns. Details in
[data-model.md](data-model.md#one-recorded-version-does-not-match-its-filename).

## Backups and recovery

Whatever the Supabase free tier provides, which is not much and is worth knowing
before it is needed. Nothing in this repo automates a backup.

The mitigating fact is that **almost everything is reproducible from the repo**: the
schema is eight migration files, and all content is files under `src/assets/` that
can be re-seeded idempotently. What is *not* reproducible is reader data — accounts,
`reading_progress`, `saved_words`. There is currently no export of it.

## Deploying the frontend

**This has not been done.** There is no `vercel.json`, no `netlify.toml`, no
`.github/workflows`, no Dockerfile. `dist/` exists locally but is gitignored.

It is a static Vite build with no server-side anything, so it is genuinely easy and
genuinely free — Cloudflare Pages, Netlify and GitHub Pages all host this at no cost
on their free tiers. Nothing here recommends one until you pick one.

Whatever the host:

- Build command `npm run build`, output directory `dist`.
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host's build
  environment. They are inlined at build time, so a change means a rebuild, not a
  restart.
- Configure an SPA fallback (rewrite everything to `/index.html`). There is no
  router today so nothing depends on it, but adding one later without this would
  break every deep link.

### Before any public deployment

Two blockers, both real:

1. **`mailer_autoconfirm` is `true` on the Supabase project, with no SMTP
   configured.** Accounts are confirmed without an email ever being sent. That is a
   development convenience; shipping it means anyone can create an account against
   an address they do not own. Turn it off and configure a sender first.
2. **Add the deployed origin to Authentication → URL Configuration.** The app sends
   `redirectTo: window.location.origin` on a password reset; an unregistered origin
   means reset links do not come home.

Worth deciding at the same time, though neither blocks a launch:

- The level gate is not DRM ([security.md](security.md#the-level-gate-is-not-drm)).
- Account deletion has no password-attempt limit
  ([security.md](security.md#no-limit-on-password-attempts)).
- There is no CI, so nothing enforces `npm test` before a deploy.

## What does not exist

Listed so nobody spends an afternoon looking:

- No CI or CD of any kind. No `.github/` directory.
- No `supabase/config.toml`, so no `supabase start` and no local stack.
- No container setup.
- No monitoring, alerting or error reporting. `console.error` is the whole of it.
- No staging environment.
- No automated dependency updates.
