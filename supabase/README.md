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

## Known gaps

- `src/data.js` only ever contained two bodies, alternated across all ten posts.
  The seed reproduces that faithfully, so **posts 3–10 carry placeholder prose that
  does not match their titles**. Real content is needed before launch.
- `b1-momentum` (level 2) is seeded as an empty shell so the dashboard's "to Level
  2" copy has something to point at.
