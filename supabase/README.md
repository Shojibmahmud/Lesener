# supabase/

Everything that runs on the Supabase project `mxkyojmuodcksvgddgke`.

```
migrations/   eight files, applied in filename order; append-only history
functions/    Edge Functions; the file here is the source of truth
tests/        rls_checks.sql — 85 RLS and trigger assertions, run as one batch
```

This directory used to carry the project's documentation as well. It now lives in
[`docs/`](../docs/):

| Looking for | Go to |
|---|---|
| Tables, columns, constraints, policies, triggers, the migration ledger | [docs/data-model.md](../docs/data-model.md) |
| Applying a migration, deploying the Edge Function, seeding content | [docs/operations.md](../docs/operations.md) |
| RLS posture, the `delete-account` gates, what was measured and when | [docs/security.md](../docs/security.md) |
| Running the checks and what they assert | [docs/testing.md](../docs/testing.md) |
| Authoring German prose and dictionary rows | [docs/content-authoring.md](../docs/content-authoring.md) |
| The per-level seeding and walkthrough journal | [docs/content-log.md](../docs/content-log.md) |

Three things to know before changing anything here:

- **Migrations are append-only.** A file that has been applied is never edited, even
  when a comment inside it turns out to be wrong. The documentation carries the
  correction instead.
- **Content is applied with `execute_sql`, not `apply_migration`.** Prose is data.
- **Nothing reconciles `functions/delete-account/index.ts` with what is deployed.**
  Edit here, then redeploy — never the other way round.
