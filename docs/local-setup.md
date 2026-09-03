# Local setup

From a clean checkout to a running app.

> **Read this first.** There is no local Supabase stack in this repo — no
> `supabase/config.toml`, no `supabase start`. Running the app means pointing it at
> a *remote* Supabase project. If you have credentials for the project this repo
> was built against, follow [Path A](#path-a--you-have-credentials). If you are a
> stranger who just cloned this, you need your own project:
> [Path B](#path-b--your-own-supabase-project). Path B is longer but it works, and
> it is written out in full rather than waved at.

## Prerequisites

- **Node 20 or newer.** Node 26 is what this was developed on; the test setup
  contains a workaround specific to it (see [testing.md](testing.md)).
- **npm.** The lockfile is `package-lock.json`; there is no pnpm or yarn setup.
- A Supabase project — see the two paths below.

## Path A — you have credentials

```sh
npm install
cp .env.example .env
```

Fill in the two values in `.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both come from the Supabase dashboard under **Project Settings → API**.

```sh
npm run dev
```

Vite serves on <http://localhost:5173> by default. Create an account through the
app's own sign-up form — there is no seeded login.

That is the whole of Path A.

### Why those two values are safe in the browser

They are read at `src/lib/supabase.js:3-4` and Vite **inlines them into the bundle
at build time**. That is fine, and `.env.example` says so:

- The publishable key only ever acts as the `anon` role.
- `anon` is revoked from every table and from the view.

So the key in the bundle can do nothing except present a login. A signed-out request
does not return empty — it errors. See [security.md](security.md).

The client throws a named error if either variable is missing, rather than letting a
missing `.env` surface as a confusing "Invalid URL" from deep inside supabase-js.

**Never put `SUPABASE_SERVICE_ROLE_KEY` in `.env`.** It has no `VITE_` prefix for a
reason and must never reach the bundle; the Edge Function runtime injects it
server-side.

## Path B — your own Supabase project

For a fork, or for anyone without access to the original project.

### 1. Create the project

Create a free Supabase project at <https://supabase.com/dashboard>. The free tier is
enough: the whole dictionary is about 4% of the 500 MB quota.

Take the **Project URL** and the **publishable key** from Project Settings → API,
and put them in `.env` as above.

### 2. Apply the schema

Apply the eight files in `supabase/migrations/` **in filename order**. Any of these
work:

```sh
# Supabase CLI, if you have it
supabase link --project-ref <your-ref>
supabase db push

# or paste each file into the SQL editor, oldest first
# or, from an agent session with the Supabase MCP server configured:
#   apply_migration(name: <the filename>, query: <the file>)
```

Order matters — migration 3 depends on the tables from 1 and 2, and migration 8
rewrites a function created in 6.

Migration 5 seeds two levels of **placeholder** content. It is part of the history
and should be applied like the rest; step 4 overwrites it.

### 3. Check the schema came up correctly

Run `supabase/tests/rls_checks.sql` as one batch. Every row must come back
`ok = true`. See [testing.md](testing.md#the-sql-suite).

### 4. Seed the real content

```sh
python3 .claude/skills/content-authoring/scripts/build_seed_sql.py \
  src/assets/posts/level-01 \
  src/assets/dictionary/de-en.tsv \
  /tmp/seed-01
```

Then apply the generated files in numeric order (`00-level.sql`, `01-post-*.sql`,
`02-dictionary-*.sql`, `03-cleanup.sql`) with plain SQL execution — **not** as
migrations. Repeat for `level-02` through `level-10`.

The whole thing is idempotent: applying it twice is a no-op, proven by hashing
`posts` and `dictionary_entries` before and after. Full details in
[content-authoring.md](content-authoring.md).

### 5. Deploy the Edge Function

Only needed if you want account deletion to work:

```sh
supabase functions deploy delete-account --project-ref <your-ref>
```

It must be deployed with `verify_jwt: true`. The three environment variables it
reads — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — are
injected by the runtime; you do not set them yourself.

### 6. Auth settings

- **Redirect URLs** — add `http://localhost:5173` under Authentication → URL
  Configuration, or the password-reset link will refuse to come back to your dev
  server. The app sends `redirectTo: window.location.origin`.
- **Email confirmation** — the original project runs with `mailer_autoconfirm` on
  and no SMTP configured, which is why sign-up works there without any mail being
  delivered. That is a development convenience and
  [a launch blocker](operations.md#before-any-public-deployment), not a
  recommendation.

## Environment variables, in full

Five, and no others. This is the complete list; `grep` for
`import.meta.env|process.env|Deno.env` returns exactly these.

| Variable | Read at | Set by you? |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js:3` | **yes**, in `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/lib/supabase.js:4` | **yes**, in `.env` |
| `SUPABASE_URL` | `supabase/functions/delete-account/index.ts:29` | no — runtime injects |
| `SUPABASE_ANON_KEY` | `…/index.ts:30` | no — runtime injects |
| `SUPABASE_SERVICE_ROLE_KEY` | `…/index.ts:31` | no — runtime injects |

Nothing in the test suite reads an environment variable; the Supabase module is
mocked.

`.gitignore` ignores `.env` and `.env.*` with an explicit `!.env.example`.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Vitest, one shot — 252 cases |
| `npm run lint` | oxlint |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

## Troubleshooting

**`Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY`** — `.env` is absent
or a value is blank. Vite reads it at startup, so restart the dev server after
editing it.

**The app loads, then shows "We couldn't load your library."** — the fetch failed or
returned no levels. Both are treated as failure on purpose. Check the browser
console: a `42501` or an empty result usually means the migrations were applied but
content was never seeded (Path B step 4).

**Every word shows an em dash when tapped** — the dictionary is empty, or was
truncated. PostgREST caps a response at 1000 rows and reports it only in a header;
`fetchDictionary` pages under `order('id')` to survive that. See
[ADR 0008](decisions/0008-dictionary-paging-under-the-postgrest-cap.md).

**A password-reset link lands on the app but nothing happens** — the redirect URL is
not registered in the Supabase project (Path B step 6).

**Level 2 stays locked after finishing Level 1** — the gate is real and lives in
SQL. Check `reading_progress` has ten rows with `completed_at` set for your user;
if the sessions are there but progress is not, the
`reading_sessions_sync_progress` trigger did not come across.
