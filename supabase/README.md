# Database

Postgres schema for Lesener, on Supabase project `mxkyojmuodcksvgddgke`.

The React app **reads** this. On sign-in it fetches `levels`, `posts` and
`dictionary_entries`, and everything a reader sees of the library now comes from
those tables: the post list, the titles, the blurbs, the prose, the topic and
level labels, the counts, and the translation shown when a word is tapped.
Correcting any of them is a row edit, not a rebuild. `src/data.js` still exists
but nothing renders from it — only its dictionary survives, as an unreachable
fallback, and it goes when that is removed.

The app also **writes**, though only in one place. Pressing *Finish reading*
inserts a single completed row into `reading_sessions`; the
`reading_sessions_sync_progress` trigger rolls that up into `reading_progress`,
and the level gate opens off the result. Nothing else is written: the app never
touches `reading_progress` directly, and a session is recorded at Finish rather
than when a post opens, so abandoning a post leaves no trace.

Two columns of that insert are less obvious than they look, and both are proven
against this database rather than against the test suite, which stubs it:

- **`ended_at` must be set.** `reading_sessions_one_open_idx` is unique on
  `(user_id, post_id)` *where `ended_at is null`*, so a null there survives the
  first finish and fails the second with `23505`.
- **`started_at` must be sent too**, from the same clock reading as `ended_at`.
  The table checks `ended_at is null or ended_at >= started_at`; letting
  `started_at` fall back to its `now()` default compares a timestamp the browser
  made before the request was sent against one Postgres evaluated after it
  arrived, so `ended_at` is earlier by at least the round trip and every insert
  fails with `23514`, however well the clocks agree.

`saved_words` is still `useState` and reaches no table — that is Feature 3.

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
- **`reading_sessions`** — one row per pass through a post. The app inserts here
  and nowhere else in this pair; `INSERT` carries no `DELETE` grant, so a
  completion cannot be taken back from the client.
- **`reading_progress`** — trigger-maintained roll-up, one row per (user, post).
  Users have `SELECT` and nothing else, because this table is what the level gate
  reads.
- **`saved_words`** — the vocabulary bank. Unique per `(user_id, term)`, globally
  rather than per post, matching `Reader.jsx`'s refusal to bank the same word
  twice. `translation` is nullable for words the dictionary doesn't cover.
- **`level_progress`** — a `security_invoker` view holding the per-level figures.
  Still unread: the dashboard's counts come from `levels.post_count` for the
  denominator and from the `reading_progress` rows the app fetches for the
  numerator, so the view has not been needed.

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

The gate is live: it has opened for a real reader, and the app now greys out
levels it believes are shut. That client-side judgement is a **copy** of this
function in `src/lib/levels.js`, written because `private` is not an exposed
schema and supabase-js therefore cannot call the real one. The copy decides only
what to disable; this function is still the enforcer. If the rule here changes,
that file changes with it.

The copy needs one step this function does not. Postgres sees every post, while
the client sees only what RLS handed over — and a locked level hands over none,
so "every published post of the preceding level is completed" is vacuously true
of it. `levels.post_count` tells the two apart: it counts every post regardless
of publication and is reported even for a locked level, so `post_count = 0` means
genuinely empty while an empty list under `post_count > 0` means withheld.

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
