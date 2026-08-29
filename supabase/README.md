# Database

Postgres schema for Lesener, on Supabase project `mxkyojmuodcksvgddgke`.

The React app **reads** this. On sign-in it fetches `levels`, `posts` and
`dictionary_entries`, and everything a reader sees of the library now comes from
those tables: the post list, the titles, the blurbs, the prose, the topic and
level labels, the counts, and the translation shown when a word is tapped.
Correcting any of them is a row edit, not a rebuild. `src/data.js` is gone: it
was retired once everything rendered from these tables, and nothing in `src/`
holds a post body or a dictionary any more.

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

The vocabulary bank writes `saved_words` too: one row when a reader taps **+**
in the reader, deleted when they tap 🗑 in the bank, and the whole set read back
alongside the library on every load.

The dashboard greets the reader by name from `profiles`, read alongside the
library and written back when they edit it. That was the last table the app had
never touched, so every table in the schema is now reached by it — only the
`level_progress` view is still unread.

Two things about that write are worth knowing before changing it. The delete
policy is a `USING` clause, so a row belonging to somebody else is *filtered
out* rather than rejected — the statement succeeds having removed nothing, and
`src/lib/vocab.js` counts the returned rows because that is the only way to tell
the two apart. And a saved word outlives its post: `post_id` is
`ON DELETE SET NULL`, and an unpublished post is withheld by
`posts_select_unlocked`, so the bank cannot always look the heading up. It reads
`post_label` when it cannot.

## Layout

```
migrations/   applied in filename order; append-only history
functions/    Edge Functions; deployed by MCP, source of truth lives here
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

## Edge Functions

Same rule as migrations, for the same reason. A function is authored here at
`functions/<name>/index.ts` and deployed to the remote project through the MCP
server (`deploy_edge_function`) with `verify_jwt: true`. **The file in this repo
is the source of truth**, and nothing reconciles it with what is deployed — so
edit here first and redeploy, never the other way round.

There is one, and it exists because the browser cannot do its job:

- **`delete-account`** — erases the caller's own account. `auth.admin.deleteUser`
  needs the service-role key, which must never reach the bundle, and there is no
  client-side fallback either: `authenticated` holds no `delete` grant on
  `profiles`, `reading_sessions` or `reading_progress`, so three of the four
  tables refuse before RLS is consulted. One admin call erases the whole
  footprint through the cascade below.

  It takes a JSON body of `{ password }` and **nothing else**. The user id comes
  from the caller's JWT and never from the body — a service-role function that
  deleted whichever id it was handed would let any signed-in reader erase
  anybody. Three gates, all needed: the gateway proves the token was issued by
  this project, `auth.getUser()` proves it still names a live user, and
  `signInWithPassword` proves the caller knows the password.

  **`verify_jwt` is weaker than it sounds** (measured 2026-08-20): a request
  whose bearer token is the *publishable key* passes the gateway, because that
  key is a token this project issued. Since that key ships in the browser
  bundle, the gateway alone would admit anyone. `auth.getUser()` is what
  actually establishes that a reader is signed in, and may not be removed.

  **There is no limit on password attempts, and the app promises none.** The
  plan was to lean on the auth service's rate limit; 140 consecutive wrong
  passwords through this endpoint were measured without a single refusal, while
  a *direct* sign-in is refused at about the thirty-fifth. The limit buckets by
  the address a request actually arrives from, and an `x-forwarded-for` from an
  untrusted hop is rightly ignored. A real limit would need a per-account
  counter, which nothing in this schema stores.

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
- **`profiles`** — one row per account, created by the `on_auth_user_created`
  trigger rather than by the client, which holds no insert path and should never
  be given one. `first_name` and `last_name` come from the metadata sign-up
  passes as `options.data`; `display_name` is read by the same trigger but
  nothing sends or shows it yet.

  Both names are **nullable on purpose**. A `not null` column here would make
  the trigger raise on a sign-up carrying no metadata, and a trigger that raises
  on an `auth.users` insert does not produce a bad profile — it fails account
  creation outright.

  Their check constraints refuse a padded, empty or over-60-character value, and
  count **characters, not bytes**: a 25-character Bengali name is already over
  60 bytes in UTF-8, so an `octet_length` cap would refuse real names in one
  script while allowing a 60-character name in another. Those constraints police
  the *update* path, where the client owns the statement and can report a
  refusal. The trigger cleans its input instead — `nullif(left(btrim(...), 60), '')`
  — for the reason above.

  A reader may clear their surname but not their first name. The dashboard falls
  back to a nameless greeting, and that is a guard against a null which should be
  unreachable, not a state anyone should be able to choose; the rule is enforced
  in `src/lib/profile.js`, since a nullable column cannot express it.

  **`profiles.theme`** holds the reader's light/dark choice, and there are only
  those two: `check (theme in ('light','dark'))`. The client never writes anything
  else and does not validate the value on its way out — that constraint is the
  rule, and `tests/rls_checks.sql` proves it refuses both `'system'` and `'Dark'`.

  **Null means "not asked yet", not "follow the device".** The comment above the
  column in `20260810103010_init_user_schema.sql:12` says otherwise, and it is
  superseded by this paragraph: it describes a tri-state that was designed, never
  built, and refused outright in Feature 6. Nothing in the client has ever read
  `prefers-color-scheme`. The migration file is an append-only record of what was
  applied and is not edited to match — see *Applying changes* above — so the stale
  sentence stays where it is and this is the correction.

  Null should also be rare. The column was unwritten on every row until Feature 6,
  and the client now adopts whatever theme the reader's device is showing into it
  on their first sign-in, so an account stops being null after one visit and the
  reader is never reset to light. From then on the account's value wins wherever
  they sign in.

  `localStorage` is still the device's own copy and is still what paints the first
  frame — `index.html` stamps `data-theme` from it before React boots, which is
  what stops a dark reader seeing a white flash on every load. It is also the only
  store a signed-out visitor has. The account is what carries the choice to the
  next browser.
- **`reading_sessions`** — one row per pass through a post. The app inserts here
  and nowhere else in this pair; `INSERT` carries no `DELETE` grant, so a
  completion cannot be taken back from the client.
- **`reading_progress`** — trigger-maintained roll-up, one row per (user, post).
  Users have `SELECT` and nothing else, because this table is what the level gate
  reads.
- **`saved_words`** — the vocabulary bank. Unique per `(user_id, term)`, globally
  rather than per post, matching `Reader.jsx`'s refusal to bank the same word
  twice. `translation` is nullable for words the dictionary doesn't cover, and is
  stored as `NULL` rather than as the em dash the reader is shown — otherwise an
  absent translation could not be told from a real one.
  Three columns describe one word, and they are not interchangeable:
  - **`term`** — the lowercase key. What `unique (user_id, term)` and the
    dictionary both hinge on.
  - **`surface_form`** — the word as the reader tapped it, and what the bank
    displays. German capitalises every noun in running text, so this is correct
    for free — except for a non-noun opening a sentence, which keeps that
    sentence's capital. A `check (term = lower(surface_form))` keeps the two
    honest.
  - **`post_label`** — the post heading as it read at save time. A fallback, not
    an identity: the bank prefers the live title from the library so a rename
    reaches it, and reads this only when `post_id` resolves to nothing.

  `session_id` is left null by design. Nothing writes a `reading_sessions` row
  until the reader presses Finish, and words are saved before that, so there is
  no session to point at.
- **`level_progress`** — a `security_invoker` view holding the per-level figures.
  The one object still unread: the dashboard's counts come from
  `levels.post_count` for the denominator and from the `reading_progress` rows
  the app fetches for the numerator, so the view has not been needed.

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

## Authoring content

Content is **written as files in this repo and applied as data**, not typed into
the database and not carried in a migration. The files are the record; the tables
are a serving copy.

```
src/assets/posts/level-NN/NN-LN-<slug>.md   one file per post, frontmatter + prose
src/assets/posts/level-NN/_level.tsv        optional: the level row, for a new level
src/assets/dictionary/de-en.tsv             one file for the whole dictionary
```

The dictionary is one file for the **whole app**, not one per level.
`dictionary_entries.term` is globally unique and carries no `post_id`, so a word
is defined once and every level's vocabulary is merged into the same table.

The `content-authoring` skill (`.claude/skills/content-authoring/`) holds the
rules and three scripts: `check_posts.py` validates the prose against what
`Reader.jsx` and `clean()` will do to it, `term_gap.py` reports dictionary
coverage and prints a worklist, and `build_seed_sql.py` generates idempotent SQL.
That SQL is applied with MCP `execute_sql` — **not** `apply_migration`, because a
prose correction is data and should not accumulate in migration history.

Two rules that are not negotiable:

- **Posts are upserted on `(level_id, position)`.** Never delete and reinsert.
  `reading_sessions.post_id` and `reading_progress.post_id` are
  `on delete cascade`, so a delete erases every reader's history for that post and
  can re-lock the next level for somebody who had finished it. Keying on `id`
  would also be wrong: `posts.id` equals `posts.position` today only by accident
  of the original seed.

  It is an `insert … on conflict do update`, not a bare `UPDATE`, and that
  distinction was found the hard way while preparing Level 2. A level being
  written for the first time holds no rows at all, so an `UPDATE` against it
  matches nothing **and reports success** — a seed that silently writes nothing
  is the one failure mode this route must not have. The conflict clause keeps
  `posts.id` on every later run, so a correction is still an update in place.
  `published_at` is set on insert and deliberately left out of the update list,
  so a post retired with `published_at = null` stays retired across a re-run.
- **Retire a post by unpublishing it** (`published_at = null`), not by deleting it.

Level 1 was written this way in Feature 13: ten posts of 450–500 words and 1,440
dictionary rows covering every word in them. Applying the whole thing twice is a
no-op — proven by hashing `posts` and `dictionary_entries` before and after.

### The thousand-row ceiling

**PostgREST returns at most 1000 rows per response, and says so only in a header.**
The reply is a `206` carrying `Content-Range: 0-999/1440` and an array of exactly
a thousand; supabase-js reports no error, so a caller that does not page is handed
a silently truncated table.

Seeding Level 1 crossed that line on the first try. `src/lib/content.js` asked for
the whole dictionary in one request, 440 terms never arrived, and the reader
showed an em dash for words that were plainly in the database. Which words failed
looked random, and that part is worth understanding: the query carried no
`ORDER BY`, so rows came back in heap order, and the upsert had rewritten all 117
pre-existing rows and moved them to the end of the heap. A row's `id` predicted
nothing.

`fetchDictionary` now pages under `order('id')`. The sort is not decoration — 
paging across requests without a stable one lets a row cross the page boundary
between two calls and never be returned.

Note that roadmap 1 put this ceiling at ~5,000 rows and planned to revisit the
single fetch there. That estimate was wrong by a factor of five. **Any table this
app reads whole is subject to the same cap**, so a growing `levels` or `posts`
would hit it the same way.

## Known gaps

- `b1-momentum` (level 2) is **seeded**: ten posts of 500-530 words and the
  vocabulary behind them. The dictionary now holds 2,658 rows covering both
  levels, and no word in either level renders as an em dash.
- The dictionary is projected to reach roughly 7,400 rows at ten levels.
  `fetchDictionary` pages, so correctness is fine, but that is eight sequential
  requests on every app load. Worth revisiting before the level count gets much
  higher — it is a latency problem long before it is a free-tier one (ten levels
  is projected at ~4% of the 500 MB quota).
- **The CEFR ladder is levels 1-9 B1, level 10 B2.** Level 10 is a deliberate
  first taste of B2 rather than the top of a smooth ramp, so B2 grammar —
  Konjunktiv I in reported speech above all — is held back until then. Level 1
  carried three Konjunktiv I constructions and two lexical Präteritum verbs from
  the original seed; both were corrected in Feature 14 and re-seeded.
- **The German in Level 1 has been read by nobody but the model that wrote it.**
  Accepted knowingly: a wrong sentence in a learning app teaches the error, and
  the mitigation is that correcting one is a file edit and a re-run.
- `dictionary_entries.display_form` does not exist. `de-en.tsv` already carries a
  canonical spelling per term (`u-bahn` → `U-Bahn`), so the column and the vocab
  bank change from roadmap 3 can be done without re-authoring 1,440 rows.
- `part_of_speech` is still null on every row. Nothing reads it.
