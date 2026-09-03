# Contributing

Lesener is a personal learning project with one author, so "contributing" mostly
means *future you*. The conventions below are written down anyway, because they are
the ones that stopped being obvious after about six weeks.

Start with [docs/local-setup.md](docs/local-setup.md) to get the app running, then
[docs/architecture.md](docs/architecture.md) for how it fits together.

## The loop

Work moves through five slash commands, defined in `.claude/commands/`:

```
/new-feature-branch  →  /new-spec  →  /new-roadmap  →  implement  →  /roadmap-updater  →  /ship-feature-branch
```

1. **`/new-feature-branch`** — branches from `main` as
   `feature/<number>-<kebab-name>`. Numbers are plain integers and grow forever; the
   command finds the highest existing one and offers the next. **Run this before
   editing anything**, documentation included.
2. **`/new-spec`** — interviews you, then writes a behaviour spec to
   `.claude/specs/<n>-<kebab-name>.md`.
3. **`/new-roadmap`** — turns a settled spec into a staged, tickable implementation
   plan in `.claude/roadmaps/<n>-<kebab-name>-roadmap.md`.
4. **`/roadmap-updater`** — verifies which roadmap tasks are genuinely done and ticks
   them off. Run it after implementing anything.
5. **`/ship-feature-branch`** — commits, pushes, squash-merges into `main` and
   deletes the branch.

**Specs are authoritative on behaviour; roadmaps are authoritative on
implementation.** When they disagree, the spec wins and the roadmap is wrong.

### Two things about the numbering

- **Spec numbers and branch numbers diverged at spec 2 and never re-converged.** A
  spec's number is its position in spec order, not the branch it was built on. Every
  spec written after the divergence carries a note saying so. Don't try to fix it
  retroactively; the numbers are only identifiers.
- Roadmaps exist only for features 1–6. Everything after that was built without one,
  including all ten content levels.

### Line references drift

Every roadmap opens with a warning that its line references go stale, and it is
correct. **Re-grep before trusting a `file.js:123` in any older document.** The same
applies to this documentation: prefer searching for a symbol name over jumping to a
line number.

## Gates before shipping

There is no CI. Nothing runs these but you.

```sh
npm run lint     # oxlint
npm test         # 252 cases, one shot
```

Plus, depending on what changed:

| If you changed… | Also run |
|---|---|
| anything below the client | `supabase/tests/rls_checks.sql` — every row `ok = true` |
| the schema | the above, plus `get_advisors(security)` (must be empty) |
| content | the checksum comparison and a walk of the level in the running app |
| the theme or `index.html` | `npm test` covers it — `theme-boot.test.js` guards the duplicated colours |

Details in [docs/testing.md](docs/testing.md).

## Commits

The history is conventional-commits with a distinctive house style worth keeping:
lowercase type and scope, then a subject that says what changed **for the reader**,
often with a second clause naming what it cost or fixed.

```
feat(content): seed Level 9, the level that pays for its proper nouns
feat(content): seed Level 6, a history level written without a single numeral
feat(account): make Delete forever actually delete
feat(content): tell the reader when a level has no posts
```

Types in use: `feat`, `refactor`, `fix`. Scopes are the feature area — `content`,
`auth`, `progress`, `vocab`, `profile`, `theme`, `account`, `state`.

**Never commit without asking.** Approving a plan that mentions a commit is approval
of the work, not of the git history. This applies to amends and any other
history-rewriting operation too.

## Code conventions

- **Components never call Supabase.** Every network call goes through a module in
  `src/lib/`. This is what lets the test suite mock one module and cover everything.
- **Reads go through `rows()`** in `src/lib/query.js`, which turns supabase-js's
  resolve-on-failure into a throw and handles the one retry that matters. The
  exception is `src/lib/account.js`, which bypasses it deliberately — see the
  comment there.
- **Select explicit columns.** With no TypeScript, the column list in a `.select()`
  *is* the type declaration. Widening or narrowing one has consequences beyond the
  query — `src/lib/profile.js` explains a live example.
- **Pick a write discipline deliberately**: awaited, fire-and-forget, or optimistic.
  [ADR 0010](docs/decisions/0010-three-write-disciplines.md) says which goes where.
- **Never word two different nothings alike.** A locked level and an empty level must
  read differently, and the same principle applies to every other empty state.
- **Comments explain *why*, and record measurements.** The codebase's comments carry
  dated findings from the live database — that is deliberate and worth continuing.
  If you learn something by measuring, write down what you measured and when.

## Changing the schema

1. Write a new file in `supabase/migrations/`. **Never edit an applied one**, even
   to fix a comment — correct it in `docs/` instead.
2. Apply it with MCP `apply_migration` under the same filename.
3. Run `rls_checks.sql` and the advisors.
4. Update [docs/data-model.md](docs/data-model.md) in the same commit.

Full runbook: [docs/operations.md](docs/operations.md).

## Changing content

Content is files, not rows. Read
[docs/content-authoring.md](docs/content-authoring.md) first — particularly the
upsert rule, which exists because a delete-and-reinsert would erase every reader's
history.

## Keeping the docs true

Documentation lives in the repo and changes in the same commit as the code it
describes. Two specific hazards:

- **`src/lib/levels.js` duplicates `private.has_level_access`.** Nothing checks them
  against each other. Change one, change the other, and say so in the commit.
- **`index.html` duplicates the two `--bg` colours from `src/index.css`.** Nothing at
  runtime notices if they drift — the app works and the white flash just comes back.
  `tests/theme-boot.test.js` is the only guard.
