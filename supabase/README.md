# Database

Postgres schema for Lesener, on Supabase project `mxkyojmuodcksvgddgke`.

The React app does **not** talk to any of this yet — it still reads `src/data.js`
and keeps progress in `useState`. This directory is the persistence layer waiting
for it.

## Layout

```
migrations/   applied in filename order; append-only history
tests/        RLS and trigger behaviour checks
```

## Applying changes

There is no Supabase CLI or local stack in this repo, so migrations are written
here and applied to the remote project through the Supabase MCP server
(`apply_migration`), which records them in `supabase_migrations.schema_migrations`.
Keep the two in sync: every applied migration gets a matching file here, under the
same name.

If you add the CLI later (`brew install supabase/tap/supabase`), `supabase link`
followed by `supabase migration list` should show these already applied.

## Model

Content is shared and owned by nobody; everything else hangs off `auth.users`.

```
levels ──< posts ──< reading_sessions ──< saved_words >── dictionary_entries
   │                        │                  │
   │                 reading_progress          │
   │                        │                  │
   └────────── profiles ────┴──────────────────┘
```

- **`levels` / `posts` / `dictionary_entries`** — the library. Written by
  `service_role` only. `posts.body` holds prose with paragraphs separated by a
  blank line, matching the `'\n\n'` split in `Reader.jsx`.
- **`dictionary_entries.term`** is a normalised _surface form_, not a lemma: it has
  to equal `clean(raw).toLowerCase()` from `src/utils.js` or lookups silently miss.
  A check constraint enforces the lowercasing.
- **`reading_sessions`** — one row per pass through a post.
- **`reading_progress`** — trigger-maintained roll-up, one row per (user, post).
  Users have `SELECT` and nothing else, because this table is what the level gate
  reads.
- **`saved_words`** — the vocabulary bank. Unique per `(user_id, term)`, globally
  rather than per post, matching `Reader.jsx`'s refusal to bank the same word
  twice. `translation` is nullable for words the dictionary doesn't cover.
- **`level_progress`** — a `security_invoker` view with the per-level figures the
  dashboard renders.

## Level gating

`posts` are readable only when `private.has_level_access(level_id)` returns true:
level 1 always, level N once every published post in level N-1 has a completed
`reading_progress` row for the caller. The function is `security definer` so it can
read past `reading_progress`'s own RLS, lives in `private` (not an exposed schema,
so it is not callable as an RPC), and takes the user from `auth.uid()` internally.

This stops bulk content scraping with the publishable key. It is **not** DRM — a
determined client can still insert and complete ten `reading_sessions` rows to open
the next level. Closing that would mean moving session completion behind an Edge
Function.

## Running the checks

Execute `tests/rls_checks.sql` as one batch (MCP `execute_sql`, `supabase db query`,
or `psql -f`). It creates its own users and level-2 content, asserts, and rolls
everything back, so it is safe against the live project. Every row of the result
must have `ok = true`.

Also worth running after any schema change:

```
get_advisors(type: "security")     -- must be empty
get_advisors(type: "performance")  -- "unused index" INFOs are expected while traffic is zero
```

## Known gaps

- `src/data.js` only ever contained two bodies, alternated across all ten posts.
  The seed reproduces that faithfully, so **posts 3–10 carry placeholder prose that
  does not match their titles**. Real content is needed before launch.
- `b1-momentum` (level 2) is seeded as an empty shell so the dashboard's "to Level
  2" copy has something to point at.
