# Architecture decision records

One file per decision, in [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
context, decision, consequences.

Records are **immutable**. A decision that is later reversed gets a new record that
supersedes the old one; the old file stays where it is, marked `Superseded by NNNN`.
The point of the log is to explain why the code looks the way it does, including the
parts that were once right and no longer are.

Most of these were written after the fact, in the documentation pass of
September 2026 — the decisions themselves were made as the features were built and
were recorded in prose in `supabase/README.md` and in source comments. The `Date`
field on each record is when the decision was made, not when it was written down.

| # | Decision | Status |
|---|---|---|
| [0001](0001-supabase-as-the-entire-backend.md) | Supabase as the entire backend | Accepted |
| [0002](0002-plain-javascript-not-typescript.md) | Plain JavaScript, not TypeScript | Accepted |
| [0003](0003-no-local-stack-migrations-via-mcp.md) | No local stack; migrations applied to one remote project | Accepted |
| [0004](0004-content-as-files-upserted-by-position.md) | Content as repo files, upserted on `(level_id, position)` | Accepted |
| [0005](0005-level-gate-in-sql-with-a-client-copy.md) | The level gate in SQL, with a deliberate client copy | Accepted |
| [0006](0006-progress-is-trigger-maintained.md) | Clients write sessions; progress is trigger-maintained | Accepted |
| [0007](0007-account-deletion-via-edge-function.md) | Account deletion via a password-gated Edge Function | Accepted |
| [0008](0008-dictionary-paging-under-the-postgrest-cap.md) | Page the dictionary under the PostgREST 1000-row cap | Accepted |
| [0009](0009-no-router-no-state-library.md) | No router and no state library | Accepted |
| [0010](0010-three-write-disciplines.md) | Three write disciplines | Accepted |
