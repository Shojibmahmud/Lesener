# 0006 — Clients write sessions; progress is trigger-maintained

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Two things need recording when a reader finishes a post: the event itself, and the
running state that the level gate reads.

The gate reads `reading_progress`. If a client could write that table, a client
could unlock any level by writing one row.

## Decision

Split them. `reading_sessions` is an **append-only event log** the client may insert
into; `reading_progress` is a roll-up maintained solely by the
`reading_sessions_sync_progress` trigger. `authenticated` holds `select` on
`reading_progress` and nothing else.

The roll-up rules: `session_count + 1` on insert, `greatest()` on
`best_percent_read`, `coalesce(rp.completed_at, excluded.completed_at)` so the
**first** completion wins, `least()` on `first_read_at`.

## Consequences

- The gate cannot be opened by writing to the table it reads. `rls_checks.sql`
  asserts that a direct `reading_progress` insert is refused.
- Re-reading a post never moves its completion date, and never lowers a percentage.
- The client holds `insert` and `update` on `reading_sessions` but **no `delete`**,
  so a completion cannot be taken back from the browser.
- **Two columns of that insert are mandatory and both were learned from the live
  database**, not from the stubbed test suite:
  - `ended_at` must be set — `reading_sessions_one_open_idx` is unique on
    `(user_id, post_id) where ended_at is null`, so a null survives the first finish
    and fails the second with `23505`.
  - `started_at` must be sent from the *same clock reading*, or the browser's
    pre-request timestamp is compared against Postgres's post-arrival one and the
    `ended_at >= started_at` check fails with `23514` every time.
- A session is recorded at Finish rather than when a post opens, so abandoning a
  post leaves no trace. Reading time is therefore not measurable from this schema.
- The client keeps its own `completed` array in step optimistically, but the next
  load is the authority — see [0010](0010-three-write-disciplines.md).
