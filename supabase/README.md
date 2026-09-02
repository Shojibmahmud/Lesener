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

- `b1-rhythm` (level 8) is **seeded**: ten posts of 601-635 words and the
  vocabulary behind them. Eight of the ten levels now hold real content, the
  dictionary holds 7,151 rows covering all of them, and `term_gap.py` reports
  full coverage for every level — no word in levels 1-8 can render as an em
  dash. Level 8's subject field is sport, festivals and free time — the 50+1
  rule, the Schrebergarten, Karneval, Christmas markets, hiking, Munich 1972,
  the Volkshochschule, the swimming pool and the Ehrenamt — a deliberately
  human counterweight after level 6's twentieth century and level 7's arts. Its
  level row did not exist and was created by `_level.tsv`, the same route levels
  4 to 7 took. Level 8's posts are `posts.id` 107-116.

  Coverage keeps improving as the shared vocabulary grows: 1,309 of the 1,911
  terms level 8 can produce were already bought by levels 1-7, so only 602 rows
  were new — 68% of this level's vocabulary came free, against 57% at level 5.

  Verified by checksum, as levels 5 to 7 were: thirty digests (`md5(body)`,
  `md5(title)`, `md5(blurb)` for all ten posts) match the authored files, and an
  `md5` over the whole `term || '|' || translation` set ordered `collate "C"`
  came back `fa27c579fab30a2697cb8e529219f6bc` from both the database and the
  file. Only 618 of 7,151 rows had changed, so the delta went in as two
  statements rather than the eighteen the generator emits. Reader counts — 63
  sessions, 62 progress rows, 32 saved words, none orphaned — were unchanged by
  the seed itself; they moved afterwards only because the author then read
  Level 7 to the end, which is the walk recorded below.

  One trap worth recording for the next level: comparing `length(p.body)` from
  Postgres against `len(body.encode())` in Python reports all ten posts as
  mismatched while every digest matches. `length()` counts *characters* and the
  Python figure counts *bytes*, and German prose carries 40-60 multi-byte
  characters per post. Compare `octet_length()`, or trust the digests.

- **Level 8 has been walked in the running app while unlocked**, by the author
  rather than from SQL, and this gap was closed on the same day it was seeded.
  It was first walked *locked*, which is worth recording because that state has
  its own screen: the switcher listed all eight levels with Level 8 rendered as
  `🔒 Level 8: B1 Rhythm` and the tooltip "Finish every post in Level 7 to open
  this", while `level_progress` still reported `posts_total = 10` with
  `is_unlocked = false` — the distinction the client needs to tell *withheld*
  from *empty*.

  Finishing Level 7 opened it on screen. The dashboard reads "Level 8: B1 Rhythm
  — 1 of 10 posts completed" at 10%, the header badge reads "B1 · Level 8", all
  ten cards show their own title and blurb, and *Fünfzig plus eins* is marked
  Gelesen while the other nine offer "Read post". The account went from 62 to 72
  progress rows (Level 7 now 10 of 10) and stands at 1 of 10 on Level 8.

  The cheap check had predicted the walk exactly, and the two agree.
  Impersonating the same reader in a rolled-back transaction while they were
  1 of 10 through Level 7, Level 8 reported 0 visible posts; completing Level 7
  through `reading_sessions` inside the same transaction flipped it to
  `is_unlocked = true` with all ten posts visible and the body of *Fünfzig plus
  eins* reaching the reader, which is what the dashboard then showed. That check
  has now predicted the walk on levels 5, 6, 7 and 8, for the cost of one
  transaction that is thrown away.

  The vocabulary path was proven end to end rather than only in SQL:
  `betriebssportgruppen` was tapped in Level 8's *Fünfzig plus eins*, returned
  "company sports clubs" and was saved to the bank — one of the 602 rows authored
  for this level, taking it from 32 to 33 saved words.

  The paging was measured rather than assumed. `Bahnsteig` was tapped in Level
  1's *Der Alltag in Berlin* and returned "platform", and the network log shows
  `fetchDictionary` making exactly eight requests — offsets 0 through 7,000, the
  last one short — so all 7,151 rows reach the reader and the paging loop still
  stops on its own. This is the read that silently truncated at
  1,000 during the level-1 seed, and it is now three pages past where level 7
  left it.

- `b1-register` (level 7) is **seeded**: ten posts of 581-608 words and the
  vocabulary behind them. Seven of the ten levels now hold real content, the
  dictionary holds 6,549 rows covering all of them, and `term_gap.py` reports
  full coverage for every level — no word in levels 1-7 can render as an em
  dash. Level 7's subject field is the arts — theatre, literature, radio, film,
  museums and criticism — after level 6's twentieth century. Its level row did
  not exist and was created by `_level.tsv`, the same route levels 4, 5 and 6
  took. Level 7's posts are `posts.id` 97-106.

  Verified by checksum, as levels 5 and 6 were: thirty digests (`md5(body)`,
  `md5(title)`, `md5(blurb)` for all ten posts) match the authored files, and an
  `md5` over the whole `term || '|' || translation` set ordered `collate "C"`
  came back `8a724f6906fdded2094d260ba76f1c34` from both the database and the
  file. Only 585 of 6,549 dictionary rows had changed, so the delta went in as
  three statements rather than the seventeen the generator emits. Reader counts —
  53 sessions, 52 progress rows, 31 saved words, none orphaned — are unchanged
  from before the seed.

- **An established level's vocabulary can be wrong rather than missing, and
  `term_gap.py` cannot see it.** The script only reports terms with *no* row, so
  a word the earlier levels already bought passes silently even when this
  level's sense is different. It happens on every level: level 8 needed 16
  existing rows widened, and four were actively misleading in context —
  `wirtschaft` read "economics; economy" where the carnival piece means *a pub*,
  `umzug` read "move, relocation" where it means *a parade*, `zug` read only
  "train" where a reader walks *in a procession*, and `tor` read "gate" where the
  block stands behind the *goal*. Level 7 needed 17 rows widened, and three
  were actively misleading in context: `karten` read "maps; cards" where a
  theatre level means tickets, `gedreht` read "turned, twisted" where it means
  filmed, and `strich` read "struck out, deleted" where the Feuilleton piece
  means the printed rule on the page. Each widened row keeps its original sense
  and adds the new one, so earlier levels are unaffected. Worth reviewing, on any
  new level, the words its subject re-uses: `haus`/`häuser`, `stück`, `werk`,
  `folgen`, `blatt`, `spielen`, `lief`/`liefen` all moved here, and level 8 added
  `platz`, `stand`, `band`, `eis`, `kasse`, `leinen`, `wagen`, `anlagen`,
  `gefahren`, `fremden`, `sitzungen` and `überträgt` to the list.

  The way to find them is not to read the whole dictionary. Take the words the
  new level's *subject* owns — for a sport level `tor`, `platz`, `spiel`,
  `tabelle`; for a festival one `zug`, `umzug`, `wagen`, `garde` — and read only
  those rows against the sentences that use them.

- **`tests/rls_checks.sql` did not need renumbering for this seed, and the note
  that any content change breaks it is out of date.** Its content-dependent
  assertions were long since rewritten as shapes and floors: the dictionary
  check asserts `reachable`, the levels check asserts `at least 2`, and
  `'A: posts visible (L1 only)', '10'` stays true no matter how many levels are
  seeded, because the gate hides everything above level 1 from a reader with no
  progress. Re-checked against the live project after this seed: all five
  content-sensitive assertions still pass, and `b1-register` reports
  `posts_total = 10` while `is_unlocked = false`, which is the distinction the
  client needs to tell *withheld* from *empty*. Still true after the level 8
  seed: the file has not been touched since the level 2 seed, every remaining
  literal is scoped to a fresh test user's own rows, and adding a level changes
  none of them.

- **Level 7 has been walked in the running app while unlocked**, by the author
  rather than from SQL, and this gap is closed on the same day it was seeded.
  Finishing Level 6 opened it on screen: the switcher lists all seven levels,
  the dashboard reads "Level 7: B1 Register — 1 of 10 posts completed" at 10%,
  the header badge reads "B1 · Level 7", and all ten cards show their own title
  and blurb. The account went from 51 to 61 progress rows (Level 6 now 10 of 10)
  and stands at 1 of 10 on Level 7.

  The cheap check had predicted the walk exactly, and the two agree.
  Impersonating the same reader in a rolled-back transaction while they were
  1 of 10 through Level 6, Level 7 reported 0 visible posts; completing Level 6
  through `reading_sessions` inside the same transaction flipped it to 10
  visible posts with `Das Stadttheater` as the first card, which is what the
  dashboard then showed. Worth keeping as the cheap check before the real one:
  it is free, it needs no reading, and it has now predicted the walk on levels
  5, 6 and 7.

  The vocabulary path was proven end to end rather than only in SQL: `fürst` was
  tapped in Level 7's *Das Stadttheater*, returned "prince, sovereign ruler" and
  was saved to the bank — one of the 568 rows authored for this level. A tap
  reaching this far into a 6,549-row dictionary also exercises
  `fetchDictionary`'s paging at its new seventh request, which is where the
  level-1 seed originally failed.

- `b1-fabric` (level 6) is **seeded**: ten posts of 562-610 words and the
  vocabulary behind them. Six of the ten levels now hold real content, the
  dictionary holds 5,981 rows covering all of them, and `term_gap.py` reports
  full coverage for every level — no word in levels 1-6 can render as an em
  dash. Level 6's subject field is the twentieth century, the most
  Präteritum-heavy level so far, after level 5's land and climate. Its level row
  did not exist and was created by `_level.tsv`, the same route levels 4 and 5
  took.

  Verified by checksum rather than by eye, as level 5 was: `md5(body)`,
  `md5(title)` and `md5(blurb)` for all ten posts match the authored files, and
  an `md5` over the whole `term || '|' || translation` set ordered
  `collate "C"` came back `230f4de733f39fd0732e46da9217446c` from both the
  database and the file. That whole-table digest is what makes the delta shortcut
  safe: `build_seed_sql.py` emits fifteen ~20 KB statements re-upserting all
  5,981 rows, but only 733 had changed (729 new plus four widened for senses this
  level introduces — `oder` is now also the river, `sprachen` also "spoke",
  `beteiligten` also "took part", `stimmen` also "votes"), so the delta went in
  as four statements instead. Reader counts — 44 sessions, 43 progress rows, 28
  saved words, none orphaned — are unchanged from before the seed.

- **A history level must still be written without numerals, and that is
  sharper than it sounds.** `clean()` strips digits, so a year is a token no
  reader can tap, and a paragraph dense with dates teaches nothing. Levels 2, 4
  and 5 contain zero four-digit years and level 3 contains three; level 6 was
  written to the same rule and contains **none**, naming time in words instead
  (`in den zwanziger Jahren`, `im Sommer nach der Währungsreform`, `der
  siebzehnte Juni` — the ordinal spelled out because `17.` would both tokenise
  badly and be inert). Worth grepping `\b(18|19|20)[0-9]{2}\b` over any level
  whose subject invites a chronology. Level 7 goes further and contains **no
  digits at all** in any body, checked directly rather than by year pattern:
  every quantity is spelled out (`siebentausend Eichen`, `siebenunddreißig`,
  `ein Fünftel`, `alle fünf Jahre`), which is the stronger form of the same rule
  and the one worth applying from here on.

- `b1-texture` (level 5) is **seeded**: ten posts of 562-577 words and the
  vocabulary behind them. Five of the ten levels now hold real content, the
  dictionary holds 5,252 rows covering all of them, and `term_gap.py` reports
  full coverage for every level — no word in levels 1-5 can render as an em
  dash. Level 5's subject field is land and climate — the physical country and
  what it costs to live in it — after level 4's science and industry. Its level
  row did not exist and was created by `_level.tsv`, the same route level 4 took.

  The seed was verified by checksum rather than by eye: `md5(body)`, `md5(title)`
  and `md5(blurb)` for all ten posts, and an `md5` over the whole
  `term || translation` set ordered `collate "C"`, match the authored files
  exactly. Level 5's posts are `posts.id` 77-86, and every reader count —
  33 sessions, 32 progress rows, 24 saved words, none orphaned — is unchanged
  from before the seed.

  One deviation from `build_seed_sql.py` is worth recording. Its dictionary step
  re-upserts the whole table, which at 5,252 rows is eleven ~25 KB statements;
  only 774 rows actually changed (770 new plus four widened), so the delta was
  applied instead, in two statements. That is only safe because it is checked
  afterwards rather than assumed: the whole-table `md5` above is what proves the
  database matches the file, and it would have caught any pre-existing row that
  had drifted. Note that `md5(term || '\t' || translation)` does **not** contain
  a tab — `'\t'` is a literal backslash-t in Postgres unless written `E'\t'`.
  The digest is still stable and still comparable, but only against a file side
  computed the same way.
- The dictionary is projected to reach roughly 7,400 rows at ten levels, and
  that estimate still looks about right, though the growth per level is falling
  as the shared vocabulary does more of the work: 1,420 terms for level 1, then
  +1,238 for level 2, +936 for level 3, +888 for level 4, +770 for level 5,
  +729 for level 6 and +568 for level 7 — 68% of level 7's vocabulary was
  already covered by the levels before it, the highest re-use yet, and that held
  even though the arts were an entirely fresh subject field. At 6,549 rows
  `fetchDictionary` makes seven sequential requests on every app load, offsets 0
  through 6000, up from six at 5,981 — confirmed in the running app by a
  level-7 word resolving on tap.
  Worth revisiting before the level count gets much higher — it is a latency
  problem long before it is a free-tier one (ten levels is projected at ~4% of
  the 500 MB quota).
- **The CEFR ladder is levels 1-9 B1, level 10 B2.** Level 10 is a deliberate
  first taste of B2 rather than the top of a smooth ramp, so B2 grammar —
  Konjunktiv I in reported speech above all — is held back until then. Level 1
  carried three Konjunktiv I constructions and two lexical Präteritum verbs from
  the original seed; both were corrected in Feature 14 and re-seeded. Level 4's
  drafts carried three more (`werde` twice, `sehe` once); a grep for Konjunktiv I
  forms caught them before seeding, and it is worth running on every new level.
  It earned its keep again on level 5, which carried two (`sei` in an indirect
  question, `habe` in reported speech), and on level 6, which carried three
  (`sei` and `wolle` in one post, `werde` and `seien` in another) — a level full
  of verdicts, proclamations and reported speech is exactly where the form
  creeps in. All were rewritten as indicatives before seeding, and the grep is
  worth running on every new level. Level 7 carried one — `dürfe` in reported
  speech in the Kollwitz post — caught and rewritten before seeding; the grep's
  only other hits were `ich habe` and `Ich gehe` in the two first-person pieces,
  which is the false-positive rate that makes the over-broad pattern worth
  keeping. Level 3 narrates in Präteritum and reaches for Konjunktiv II, and
  levels 4 to 7 continue from there — the register climbs across the B1 levels
  rather than sitting flat. Level 7 sits at the top of that climb so far, with
  `fiele` and `ließe` in conditional clauses; if the ramp ever needs flattening,
  those are the first two to soften.
- **The German in every seeded level has been read by nobody but the model that
  wrote it.** Accepted knowingly: a wrong sentence in a learning app teaches the
  error, and the mitigation is that correcting one is a file edit and a re-run.
- **Level 6 has been seen in the running app, but only from outside the gate.**
  The switcher lists all six levels and the sixth reads "Level 6: B1 Fabric",
  disabled, with the label "Finish every post in Level 5 to open this" — the
  *withheld* state rather than "No posts in this level yet", which is the
  distinction Feature 2's Trap 2 was about, and it is right because
  `level_progress` reports `posts_total = 10` for a level the reader cannot yet
  see the posts of. The unlocked walk is still open: the author's account stands
  at 2 of 10 on Level 5, and Level 6 opens only when that reaches 10.

  The cheap check was done and predicts the walk. Impersonating the reader in a
  rolled-back transaction, Level 6 reported 0 visible posts and `is_unlocked =
  false`; completing Level 5 through `reading_sessions` inside the same
  transaction flipped it to `is_unlocked = true` with 10 visible posts and the
  right first card. The rollback left the account untouched — still 44 sessions,
  43 progress rows, 2 of 10 on Level 5.

- **Level 5 has been walked in the running app while unlocked**, by the author
  rather than from SQL, and this gap is closed. Finishing Level 4 opened it on
  screen: the switcher lists all five levels, the dashboard reads "Level 5: B1
  Texture — 2 of 10 posts completed" at 20%, the header badge reads
  "B1 · Level 5", and all ten cards show their own title and blurb. The account
  now stands at 10 of 10 for levels 1-4 and 2 of 10 for level 5.

  Before that walk the gate had been checked the cheap way, and the two agree.
  Impersonating the same reader in a rolled-back transaction while they were
  1 of 10 through Level 4, Level 5 reported 0 visible posts, and 10 the moment
  Level 4 was completed through `reading_sessions` — a direct `reading_progress`
  insert is refused by RLS, so the gate is not one INSERT away from open.
  `private.has_level_access` recurses on `position - 1` and nothing hardcodes a
  level count, which is the same generic gate that opened Level 4. Worth keeping
  as the cheap check before the real one: it is free, it needs no reading, and
  here it predicted the walk exactly.

  Level-5 dictionary rows resolve on lookup (`wattwurm` → "lugworm",
  `deichgraf` → "dike reeve, dike warden"). A tap reaching this far into a
  5,252-row dictionary also exercises `fetchDictionary`'s paging, now six
  sequential requests, which is where the level-1 seed originally failed.
- **Levels 3 and 4 have been walked in the running app while unlocked**, and
  that gap is closed too. It had stood open since level 3 was seeded. The author's
  account finished levels 1, 2 and 3 (10 of 10 each), which opened Level 4 on
  screen: the switcher lists all four levels, the dashboard reads "Level 4: B1
  Depth — 1 of 10 posts completed" at 10%, all ten cards show their own title and
  blurb, and the header badge reads "B1 · Level 4".

  The vocabulary path was proven end to end rather than only in SQL: a word
  tapped in level-4 prose returned its translation and was saved to the bank —
  `waisenjungen` → "orphan boy", one of the 888 rows authored for this level.
  A tap reaching a row this far into a 4,482-row dictionary also exercises
  `fetchDictionary`'s paging, which is where the level-1 seed originally failed.

  Before the walk, the same chain had been checked against an impersonated
  reader in a rolled-back transaction: with no progress a reader sees exactly
  Level 1's ten posts, Level 4 stays shut while reporting `posts_total = 10` so
  the client can tell "withheld" from "empty", and completing each level in turn
  opens the next. Progress had to be written through `reading_sessions`, because
  a direct `reading_progress` insert is refused by RLS — the gate is not one
  INSERT away from open. Worth keeping as the cheap check before the real one.
- `dictionary_entries.display_form` does not exist. `de-en.tsv` already carries a
  canonical spelling per term (`u-bahn` → `U-Bahn`), so the column and the vocab
  bank change from roadmap 3 can be done without re-authoring 5,252 rows.
- `part_of_speech` is still null on every row. Nothing reads it.
