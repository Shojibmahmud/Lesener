# Testing

Two suites, neither of which needs the other, and one of which needs the live
database.

| Suite | What it proves | Command |
|---|---|---|
| Vitest — `tests/` | Everything the browser does. 23 files, 252 cases. Never touches the network. | `npm test` |
| SQL — `supabase/tests/rls_checks.sql` | Everything the database does. 85 assertions. Runs against the live project. | one batch via MCP `execute_sql` |

There is no browser end-to-end framework — no Playwright, no Cypress — and no
pgTAP. **"End to end" in this project means the author walking the running app**,
recorded in prose in [content-log.md](content-log.md). Saying so plainly matters
more than pretending otherwise: the walk is a real gate that has caught real
defects, and it is also a manual step nobody else can run.

## The JavaScript suite

Vitest 4 with jsdom. **Configured inline in `vite.config.js`** — there is no
separate `vitest.config` file, which is the first place people look:

```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './tests/setup.js',
  include: ['tests/**/*.test.{js,jsx}'],
}
```

Libraries: `@testing-library/react`, `@testing-library/user-event`,
`@testing-library/jest-dom`.

```sh
npm test          # vitest run — one shot, what CI would use if there were CI
npx vitest        # watch mode
npx vitest tests/vocab.test.js
```

### What is covered

| File | Cases | Area |
|---|---:|---|
| `content-lifecycle.test.jsx` | 33 | Library load, error and retry, the level-opening refetch |
| `profile.test.js` | 20 | Profile fetch, rename, theme write |
| `delete-account.test.jsx` | 18 | Deletion, wrong password, deleted-on-another-device, future-issued token |
| `level-switching.test.jsx` | 16 | The switcher, and locked vs. empty told apart |
| `vocab.test.js` | 13 | `saved_words` reads and writes |
| `theme.test.jsx` | 13 | Toggle, reconciliation, persistence |
| `content.test.js` | 13 | Fetch helpers, dictionary paging past 1000 rows |
| `dashboard-profile.test.jsx` | 12 | Greeting, avatar, grapheme handling |
| `vocab-bank.test.jsx` | 11 | Grouping, removal, empty state |
| `reading-progress.test.jsx` | 11 | Progress, Finish, the percentage recorded |
| `progress.test.js` | 10 | Session insert shape |
| `levels.test.js` | 9 | The client-side gate re-derivation |
| `account.test.js` | 9 | Edge Function error mapping |
| `sign-up-names.test.jsx` | 8 | Sign-up metadata |
| `reader-saving.test.jsx` | 8 | Saving and un-saving a word |
| `forgot-password.test.jsx` | 8 | Reset request, neutral confirmation |
| `dashboard-content.test.jsx` | 8 | Card rendering and error states |
| `edit-name.test.jsx` | 7 | Rename modal |
| `change-password.test.jsx` | 6 | Re-auth then update |
| `theme-boot.test.js` | 7 | The pre-paint script and its duplicated colours |
| `reader-dictionary.test.jsx` | 5 | Word tapping and lookup |
| `recovery-link.test.js` | 4 | Fragment parsing, expired links |
| `password-field.test.jsx` | 3 | The reveal toggle |

Eight files `vi.mock('../src/lib/supabase', …)`. **The suite never reaches a real
database**, which is why it is safe to run at any time and why it cannot catch a
schema drift. That is the SQL suite's job.

### Two harness details that are load-bearing

Both are the kind of thing that silently makes a suite lie, so they are worth
knowing before writing a test.

**`tests/setup.js` installs an in-memory `localStorage`.** Node 26 defines a
*disabled* `localStorage` global that shadows jsdom's — meaning
`'localStorage' in window` is true while reads yield `undefined`. Without the
stand-in, every theme write in every test that has ever run was silently swallowed.

**`tests/helpers/supabase.js` reproduces postgrest-js's thenable builder**, not a
promise. That is deliberate: against a plain promise, a forgotten `.eq()` or
`.order()` would pass unnoticed, which is precisely the class of bug the suite
exists to catch.

`stubSupabase(tables, fns)` records `from / select / eq / order / range / insert /
update / delete / invoke`. A table's answer may be **a function of `(filters, op)`**,
so one table can answer differently for read, delete and per page — which is how the
1000-row cap is reproduced in a test. `.range()` is recorded into `filters` for the
same reason. Writes land in `calls.insert` / `calls.update` / `calls.delete` /
`calls.invoke`, so an assertion can check *what was sent*, not merely that something
was.

`functions.invoke` is stubbed with the `error.context.json()` shape supabase-js
actually returns for a non-2xx Edge Function, because that shape is the whole reason
`src/lib/account.js` bypasses `rows()`.

### Adding a test

Three shapes, matching the three kinds of file:

- **A `lib/` module** (`vocab.test.js`, `progress.test.js`) — mock
  `../src/lib/supabase` with `stubSupabase`, call the exported function, assert on
  the recorded call *and* on what came back.
- **A component** (`vocab-bank.test.jsx`) — render it with props, drive it with
  `user-event`, assert on what the reader sees.
- **A whole flow** (`content-lifecycle.test.jsx`) — render `App` with a stubbed
  client and walk it. These are the slowest and the most valuable.

## The SQL suite

`supabase/tests/rls_checks.sql` — 85 assertions, run **as one batch**:

```sh
# via Supabase MCP
execute_sql(<the whole file>)

# or, if you have the CLI or a connection string
supabase db query < supabase/tests/rls_checks.sql
psql "$DATABASE_URL" -f supabase/tests/rls_checks.sql
```

It creates its own users and level-2 content, asserts, and **rolls everything
back**, which is what makes it safe against the live project. Every row of the
result must have `ok = true`:

```sql
select n, name, expected, actual, (expected = actual) as ok from results order by n;
```

Impersonation works by setting `request.jwt.claims` and switching to the
`authenticated` role — that is where `auth.uid()` reads from.

### Fixtures

Five users, each earning its place:

| User | Purpose |
|---|---|
| A | A full set of names. The subject of most assertions. |
| B | **No metadata at all** — the only proof that a sign-up carrying nothing still produces a profile. Also the outsider in every cross-user check. |
| C | A padded first name and an empty surname. |
| D | An 80-character name, to prove truncation does not fail account creation. |
| E | Exists to be deleted, with a row in every per-user table. |

Level-2 test content uses **positions 9001+**, not 1–3. `posts` has
`unique (level_id, position)`, so a position no authored level will ever reach keeps
this file independent of whatever content happens to be seeded.

### What it asserts

- **The sign-up trigger** — profile auto-created; names read from metadata; a padded
  name trimmed; an empty surname stored as null; an 80-character name truncated to
  60 *without failing account creation*.
- **Constraints** — a padded rename refused; an over-long rename refused; a
  60-character Bengali name accepted (180 bytes, which is the entire reason the
  constraint counts characters); an unknown theme refused; `'Dark'` refused, because
  a capitalisation bug in the client is far likelier than an invented value.
- **The level gate** — level 1 posts visible and level 2 hidden; `posts_total`
  reported for a locked level so the client can tell *withheld* from *empty*; level
  2 opening once level 1 is done; and A's unlocking **not** shared with B.
- **The progress triggers** — rows appearing after sessions; `session_count`
  incrementing; `best_percent_read` keeping the maximum; `completed_at` surviving a
  re-read; and a **direct `reading_progress` write blocked**, which proves the gate
  is not one INSERT away from open.
- **Cross-user isolation** — B sees only their own profile, none of A's saved words,
  no progress rows; B's write against A's row changes nothing *and raises nothing*.
- **`anon`** — posts unreachable, dictionary unreachable, the gate function
  unreachable.
- **The cascade** — E's profile, session, progress and saved word all gone after
  `delete from auth.users`, with before-counts as positive controls, plus "A's
  profile survived E's deletion".

Several assertions are **positive controls** and say so in a comment. Without them,
"B cannot rename A" would pass just as well if the rename were broken for everybody.

### Content-independence

Content-dependent assertions were rewritten as **shapes and floors** — the
dictionary check asserts *reachable*, the levels check asserts *at least 2* — so a
new level does not break a test for a reason that has nothing to do with RLS. The
file has not been touched since the Level 2 seed.

## After any schema change

```
supabase/tests/rls_checks.sql        every row ok = true
get_advisors(type: "security")       must be empty
get_advisors(type: "performance")    "unused index" INFOs expected while traffic is zero
```

## The gates before shipping

There is no CI, so nothing enforces these but the person shipping:

```sh
npm run lint    # oxlint
npm test        # 252 cases
```
plus `rls_checks.sql` if anything below the client changed, and a walk of the
running app if content changed. See [CONTRIBUTING.md](../CONTRIBUTING.md).
