# 0003 — No local Supabase stack; migrations applied to one remote project

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

The Supabase CLI can run the whole stack locally in Docker — `supabase start`,
`supabase db push`, a local Postgres, a local inbox for mail. That is the
recommended workflow.

This project had a Supabase MCP server configured from the outset, which can apply
migrations and run SQL against the remote project directly from an agent session.

## Decision

No CLI, no `supabase/config.toml`, no local stack. Migrations are written as files
in `supabase/migrations/` and applied to the remote project with MCP
`apply_migration`, which records them in `supabase_migrations.schema_migrations`.

Every applied migration keeps a matching file here under the same name. Files are
**append-only** — an applied migration is never edited, even when a comment inside
it turns out to be wrong.

## Consequences

- **One environment serves everything**: development, testing and real content. There
  is no staging. Mitigations are listed in
  [operations.md](../operations.md#the-one-environment-reality) — chiefly that
  `rls_checks.sql` rolls itself back and that gate predictions run inside throwaway
  transactions.
- **A fresh contributor cannot run the app without credentials for the shared
  project.** [local-setup.md](../local-setup.md#path-b--your-own-supabase-project)
  documents the fork path in full, but it is a real barrier rather than a formality.
- Migration comments go stale and cannot be corrected in place. The convention is
  that the documentation supersedes them, worked through for
  [`profiles.theme`](../data-model.md#theme).
- No Docker requirement, no port conflicts, no stack to start before working — which
  is the whole benefit, and on a hobby project's time budget it is not a small one.
- Adding the CLI later is cheap: `supabase link` followed by
  `supabase migration list` should show all eight migrations already applied.
