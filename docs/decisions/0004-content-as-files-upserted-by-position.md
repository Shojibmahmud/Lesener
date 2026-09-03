# 0004 — Content lives as repo files, applied as data, upserted on `(level_id, position)`

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Lesener is 100 German posts and an 8,170-row dictionary. That content had to get
into the database somehow, and three routes were available: an admin UI, migration
files, or generated SQL applied as data.

Content also changes for a different reason than schema does — a typo is not a
schema event — and it changes far more often.

## Decision

**Content is written as files in this repo and applied as data.** The files are the
record; the tables are a serving copy.

- Posts live at `src/assets/posts/level-NN/NN-LN-<slug>.md`, frontmatter plus prose.
- The dictionary is one TSV for the whole app.
- `build_seed_sql.py` generates idempotent SQL, applied with MCP **`execute_sql`**,
  never `apply_migration`.
- **Posts are upserted on `(level_id, position)`. Never deleted and reinserted.**
- A post is retired by setting `published_at = null`.

## Consequences

- Prose gets a diff, a review and a rollback, and a correction is a file edit plus a
  re-run — no migration, no deploy, no rebuild.
- **The upsert key is not a detail.** `reading_sessions.post_id` and
  `reading_progress.post_id` are `on delete cascade`, so a delete-and-reinsert would
  erase every reader's history for that post and could re-lock the next level for
  someone who had finished it. Keying on `id` would also be wrong — `posts.id`
  equals `posts.position` today only by accident of the original seed.
- It must be `insert … on conflict do update`, not a bare `UPDATE`. Found the hard
  way at Level 2: a level being written for the first time holds no rows, so an
  `UPDATE` matches nothing **and reports success**. A seed that silently writes
  nothing is the one failure mode this route must not have.
- `published_at` is set on insert and left out of the update list, so a retired post
  stays retired across re-runs.
- Content files are never imported by `src/`, so Vite excludes them and they add
  nothing to the bundle. This replaced `src/data.js`, a compiled-in copy of the
  posts and dictionary that was deleted once everything rendered from the database;
  older specs and roadmaps still refer to it.
- There is no admin UI and no way to fix a typo without a developer. Accepted: there
  is one author.
- Migration 5 still contains the original placeholder seed. It is accurate about
  what was applied that day and is left alone.
