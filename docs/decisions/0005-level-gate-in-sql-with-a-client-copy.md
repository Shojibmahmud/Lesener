# 0005 — The level gate is enforced in SQL, with a deliberate client-side copy

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

Levels unlock in sequence: level N opens once every published post in level N−1 has
been completed. Something has to enforce that, and something has to grey out the
levels the reader cannot open yet.

`private.has_level_access(bigint)` enforces it, inside the `posts_select_unlocked`
RLS policy. But `private` is not an exposed schema, so PostgREST will not surface
the function as an RPC and supabase-js cannot call it.

## Decision

Keep the enforcement in SQL, and **write a second implementation of the same rule in
`src/lib/levels.js`** for the client's own use. The SQL function is the enforcer;
the JavaScript copy decides only what to grey out.

The function stays in `private` — a `security definer` function in `public` would be
callable as `/rest/v1/rpc/<name>` by `anon` and `authenticated` alike.

## Consequences

- **Two implementations of one rule, with nothing checking them against each other.**
  Not the test suite, not a linter; there is no CI. If the SQL changes, that file
  must change with it, by hand. This is the sharpest maintenance hazard in the
  codebase and `src/lib/levels.js` says so in its own header.
- The copy needs a step the SQL does not. Postgres sees every post; the client sees
  only what RLS handed over, and a locked level hands over none — so "every published
  post of the preceding level is completed" is *vacuously true* of it, which would
  open level 3 for a reader locked out of level 2. `levels.post_count` is what tells
  genuinely-empty from withheld, and it is maintained over all posts regardless of
  publication precisely so it can.
- A wrong client copy is a cosmetic bug, never a data leak — the database still
  refuses. That asymmetry is what makes the duplication acceptable.
- The gate is not DRM: a determined client can insert and complete ten
  `reading_sessions` rows. Accepted; see
  [security.md](../security.md#the-level-gate-is-not-drm).
- Alternatives rejected: exposing the function through `public` (a security
  regression for a convenience), or fetching `level_progress` and using its
  `is_unlocked` column (which would work, and is the obvious fix if this ever needs
  revisiting — see [0009](0009-no-router-no-state-library.md) for why the client
  derives so much).
