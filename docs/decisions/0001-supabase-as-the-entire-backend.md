# 0001 — Supabase as the entire backend

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Lesener needs authentication, a database, per-user data isolation and one
privileged operation. It is a hobby project built to learn, with a hard zero-money
budget and one part-time developer.

Writing a backend — an API server, session handling, an ORM, a hosting story for
all of it — would have been more code than the app itself, and would have cost
money to run.

## Decision

Use Supabase for everything: Postgres, PostgREST for data access, GoTrue for auth,
and Edge Functions for the one operation the browser cannot be trusted with. The
frontend talks to it directly. **There is no server of our own.**

Security is enforced by row-level security in the database rather than by
application code.

## Consequences

- Three runtime dependencies total: `react`, `react-dom`, `@supabase/supabase-js`.
- **The database is the security boundary.** A mistake in an RLS policy is a data
  leak; there is no application layer that would catch it. This is why
  `supabase/tests/rls_checks.sql` exists and why it has 85 assertions.
- The client's Supabase key ships in the browser bundle. Safe only because `anon` is
  revoked from every table — see [security.md](../security.md).
- Anything needing a secret must become an Edge Function. So far that is one
  function ([0007](0007-account-deletion-via-edge-function.md)).
- The free tier is a real constraint on schema decisions. The dictionary at 8,170
  rows is ~4% of the 500 MB quota; it is a latency problem long before it is a quota
  problem ([0008](0008-dictionary-paging-under-the-postgrest-cap.md)).
- Vendor lock-in is real but bounded: the schema is ordinary Postgres, and the
  Supabase-specific parts are auth, PostgREST's query shape, and `auth.uid()`.
