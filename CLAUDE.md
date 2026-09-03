# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Lesener is a German B1 graded reader: a React 19 + Vite SPA talking directly to one
Supabase project. Plain JavaScript, no TypeScript, no router, no state library, no
server of our own. Ten levels, 100 authored posts, 8,170 dictionary rows.

Read [docs/architecture.md](docs/architecture.md) before changing anything in
`src/`, and [docs/data-model.md](docs/data-model.md) before touching the schema.

## Before you edit anything

**Run `/new-feature-branch` first.** Every change goes on a feature branch —
documentation and configuration included, not just code. Never start work on `main`.

**Never run `git commit` without asking.** An approved plan that contains a commit
step is approval of the work, not of the git history. The same applies to `--amend`
and any other history rewrite. Do the work, report what changed, then ask.

## Commands

```sh
npm run dev      # vite, http://localhost:5173
npm test         # vitest run — 23 files, 252 cases
npm run lint     # oxlint
npm run build    # production build into dist/
```

Run `npm run lint` and `npm test` before shipping. If anything below the client
changed, also run `supabase/tests/rls_checks.sql` as one batch through MCP
`execute_sql` — every row must read `ok = true`.

## Where things live

| Path | Contents |
|---|---|
| `src/lib/` | Every network call. Components never touch Supabase. |
| `src/components/` | 15 flat files, no subdirectories, inline style objects. |
| `src/App.jsx` | All shared state, the auth listener, the loading effect. |
| `src/assets/` | Content: 100 posts and the dictionary TSV. Not imported by anything. |
| `supabase/migrations/` | Eight files, append-only. |
| `.claude/specs/` | Behaviour specs, numbered in spec order. |
| `.claude/roadmaps/` | Staged implementation plans, `<n>-<kebab>-roadmap.md`. |
| `docs/` | The documentation set. Start at [docs/](docs/). |

Deployed at <https://lesener.vercel.app> (Vercel Hobby, builds from `main` on every
push, no CI). See [docs/deployment.md](docs/deployment.md).

## Project rules that are easy to get wrong

- **Content is applied with `execute_sql`, never `apply_migration`.** A prose
  correction is data and must not accumulate in migration history.
- **Posts are upserted on `(level_id, position)`. Never delete and reinsert** — the
  cascade would erase every reader's history and could re-lock the next level.
- **Migrations are append-only.** Never edit an applied file, even to fix a wrong
  comment. Correct it in `docs/` instead; `docs/data-model.md` has the worked
  example for `profiles.theme`.
- **`src/lib/levels.js` duplicates `private.has_level_access`.** Nothing checks them
  against each other. Change one, change the other.
- **`index.html` duplicates two colours from `src/index.css`.** Nothing at runtime
  notices if they drift. `tests/theme-boot.test.js` is the only guard.
- **Reads go through `rows()` in `src/lib/query.js`.** supabase-js resolves rather
  than rejects on failure, so an unchecked call silently yields `null`.
- **Select explicit columns.** With no TypeScript, a `.select()` column list is the
  type declaration; widening or narrowing one has effects beyond the query.
- **Specs are authoritative on behaviour, roadmaps on implementation.** Spec numbers
  and branch numbers diverged at spec 2 and are only identifiers.
- **Line references in older documents drift.** Re-grep before trusting any
  `file.js:123`; prefer searching for a symbol name.

## Constraints

- **Zero budget.** This is a hobby project built to learn. Propose free tiers, local
  tooling and things already paid for by something else. Do not suggest buying a
  domain, a paid email sender or any subscription. Where no free option exists, say
  so and describe what the free workaround costs in convenience.
- **One Supabase project serves everything** — development, testing, real content.
  There is no staging. Anything run against it should either be read-only or roll
  itself back.
- **No local Supabase stack**, no `config.toml`, no CLI. Schema and function changes
  go through the Supabase MCP server.

## After implementing a feature

Suggest running `/roadmap-updater` to tick off what is genuinely done, and update
the relevant page under `docs/` in the same commit as the code.
