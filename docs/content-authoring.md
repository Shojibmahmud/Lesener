# Authoring content

How German prose and dictionary rows get from a text editor into the database.

The operational rules an author follows — register, sentence length, the German
itself — live in `.claude/skills/content-authoring/SKILL.md`, which is the working
document and the one to read before writing a level. This page covers the pipeline
around it: where files live, what the scripts do, how a seed is applied, and the
lessons ten levels have taught about the parts that are easy to get wrong.

The record of what was actually seeded and when is [content-log.md](content-log.md).

## The rule that shapes everything else

**Content is written as files in this repo and applied as data.** It is not typed
into the database, and it is not carried in a migration.

The files are the record; the tables are a serving copy. That is what gives prose a
diff, a review and a rollback — see
[ADR 0004](decisions/0004-content-as-files-upserted-by-position.md).

```
src/assets/posts/level-NN/NN-LN-<slug>.md   one file per post, frontmatter + prose
src/assets/posts/level-NN/_level.tsv        the level row — only for a new level
src/assets/dictionary/de-en.tsv             one file for the whole dictionary
```

Nothing in `src/` imports any of these, so Vite excludes them from the bundle. They
add nothing to what the reader downloads.

The dictionary is one file for the **whole app**, not one per level.
`dictionary_entries.term` is globally unique and carries no `post_id`, so a word is
defined once and every level's vocabulary merges into the same table.

## The three scripts

All in `.claude/skills/content-authoring/scripts/`.

| Script | Invocation | What it does |
|---|---|---|
| `check_posts.py` | `python3 check_posts.py <posts-dir> [min-words] [max-words]` | Validates frontmatter, filename/slug agreement, paragraph structure and word range, and flags any token that loses a character to `clean()`. Exits non-zero, so it can gate a seed. |
| `term_gap.py` | `python3 term_gap.py <posts-dir> [dictionary.tsv]` | Prints `term\|display_form[\|?]` for every term the reader can produce that the dictionary lacks. Also reports homographs that collapse under lowercase uniqueness. |
| `build_seed_sql.py` | `python3 build_seed_sql.py <posts-dir> <dictionary.tsv> <out-dir> [batch=400]` | Generates the idempotent SQL. |

`build_seed_sql.py` emits numbered files:

- `00-level.sql` — `insert into public.levels … on conflict (slug) do nothing`,
  only when `_level.tsv` exists.
- `01-post-NN.sql` — one per post, `insert … on conflict (level_id, position) do
  update`. `published_at` is set on insert and **deliberately left out of the update
  list**, so a post retired with `published_at = null` stays retired across a re-run.
- `02-dictionary-NN.sql` — batched `insert … on conflict (term) do update set
  translation = excluded.translation`.
- `03-cleanup.sql` — deletes dictionary rows containing a character `clean()` strips
  (they could never match a tap), and nulls `saved_words.post_id` where `post_label`
  no longer matches the live heading.

It dollar-quotes with `$txt$` and raises if that delimiter appears in content, and
resolves `level_id` by slug so no generated id is ever hard-coded.

## Applying a seed

The generated SQL is applied with Supabase MCP **`execute_sql`** — *not*
`apply_migration`. A prose correction is data, and should not accumulate in
migration history. See [operations.md](operations.md#seeding-content).

### Two rules that are not negotiable

**Posts are upserted on `(level_id, position)`. Never delete and reinsert.**

`reading_sessions.post_id` and `reading_progress.post_id` are `on delete cascade`,
so a delete erases every reader's history for that post — and can re-lock the next
level for somebody who had already finished it. Keying on `id` would also be wrong:
`posts.id` equals `posts.position` today only by accident of the original seed.

It is an `insert … on conflict do update`, not a bare `UPDATE`, and that distinction
was found the hard way while preparing Level 2. A level being written for the first
time holds no rows at all, so an `UPDATE` against it matches nothing **and reports
success** — a seed that silently writes nothing is the one failure mode this route
must not have.

**Retire a post by unpublishing it** (`published_at = null`), not by deleting it.

## Writing constraints the code imposes

These are not style preferences. Each one falls out of something in `src/`.

| Constraint | Because |
|---|---|
| One blank line between paragraphs, none doubled | `Reader.jsx` splits on `'\n\n'`; a double blank line yields an empty leading token |
| One paragraph per line, no hard wrapping | So the file and the column are byte-identical |
| No periods inside abbreviations | `z. B.` tokenises to `z` and `B` |
| No apostrophes inside words | `clean()` strips them, leaving an unmatchable term |
| No accents outside `äöüÄÖÜß` | `Café` cleans to `caf`; São Paulo, Curaçao and Québec tokenise to junk no row can match |
| Magnitudes spelled out, never digits | `clean()` strips digits, so a numeral is a token nobody can tap and a paragraph dense with dates teaches nothing |
| 450–500 words in 6–10 paragraphs | Suits the reader's scroll-progress bar |

## Lessons from ten levels

Recorded because each was paid for once and would otherwise be paid for again.

### An established word can be *wrong* rather than missing, and `term_gap.py` cannot see it

The script reports only terms with **no** row, so a word an earlier level already
bought passes silently even when this level's sense is different. This happened on
every level.

Level 8 needed 16 existing rows widened, four of them actively misleading in
context: `wirtschaft` read "economics; economy" where the carnival piece means *a
pub*; `umzug` read "move, relocation" where it means *a parade*; `zug` read only
"train" where a reader walks *in a procession*; `tor` read "gate" where the block
stands behind the *goal*. Level 7 needed 17 widened, three misleading: `karten`
("maps; cards" → theatre *tickets*), `gedreht` ("turned, twisted" → *filmed*),
`strich` ("struck out" → the printed *rule* on the page). Level 10's worst was
`art`, which carried only "kind, sort; manner" in a level where *Art* means
**species** on nearly every page.

Each widened row keeps its original sense and adds the new one, so earlier levels
are unaffected.

**The way to find them is not to read the whole dictionary.** Take the words the new
level's *subject* owns — for a sport level `tor`, `platz`, `spiel`, `tabelle`; for a
festival one `zug`, `umzug`, `wagen`, `garde` — and read only those rows against the
sentences that use them. Words that have moved before:
`haus`/`häuser`, `stück`, `werk`, `folgen`, `blatt`, `spielen`, `lief`/`liefen`,
`platz`, `stand`, `band`, `eis`, `kasse`, `leinen`, `wagen`, `anlagen`, `gefahren`,
`fremden`, `sitzungen`, `überträgt`.

**A new subject field is likelier to make an old row wrong than to leave a word
missing.**

### A history level must still be written without numerals

Sharper than it sounds. Levels 2, 4 and 5 contain zero four-digit years; level 3
contains three; level 6 contains **none**, naming time in words instead —
`in den zwanziger Jahren`, `im Sommer nach der Währungsreform`,
`der siebzehnte Juni` (the ordinal spelled out, because `17.` would both tokenise
badly and be inert).

Level 7 goes further and contains **no digits at all** in any body, checked directly
rather than by year pattern. That is the stronger form of the same rule and the one
to apply from here on. Grep `\b(18|19|20)[0-9]{2}\b` over any level whose subject
invites a chronology.

Level 10 paid the worst version of this: deep time is nothing but large numbers, so
every magnitude is spelled out — `achtundvierzig Millionen`, `dreihunderttausend`,
`vierzigtausend` — and the bodies contain not one digit, verified by grep. Each
number word costs a dictionary row and is tappable, which is the trade worth making.

### A level about the world pays a proper-noun tax

Every place and person name survives `clean()` as a tappable term needing its own
row, so Kairo, Bremerhaven, Athen, Namibia and Hunsrück each cost a row the way any
other word does. It also constrains which names can be used at all — see the accents
row in the table above.

Latin binomials cost two rows each and have no italics to mark them as foreign, so
level 10 used them only where they are genuinely the name people know
(Archaeopteryx) and preferred German elsewhere: `Urvogel`, `Flugsaurier`,
`Wollnashorn`.

### Konjunktiv I was held back for nine levels and spent at level 10

The CEFR ladder is **levels 1–9 B1, level 10 B2**, and level 10 is a deliberate
first taste of B2 rather than the top of a smooth ramp. B2 grammar — Konjunktiv I in
reported speech above all — was reserved through levels 1 to 9 and spent at 10.

**The grep that policed that reservation inverts at the top of the ladder.** On
levels 1–9 a hit is a defect to rewrite; on level 10 it is checked and kept. Level
10's 33 hits were read individually; `hätten`/`bekämen` appear exactly where
Konjunktiv I collapses into the indicative in the third person plural and written
German switches to Konjunktiv II.

The grep earned its keep repeatedly on the way up: level 1 carried three
constructions from the original seed (corrected and re-seeded in Feature 14), level
4 three, level 5 two, level 6 three — a level full of verdicts and reported speech
is exactly where the form creeps in — and level 7 one. Its only false positives are
`ich habe` and `Ich gehe` in first-person pieces, which is a rate worth keeping an
over-broad pattern for.

The register climbs rather than sitting flat: level 3 narrates in Präteritum and
reaches for Konjunktiv II, and levels 4–7 continue from there. Level 7 sits at the
top of the B1 climb with `fiele` and `ließe` in conditional clauses; if the ramp
ever needs flattening, those are the first two to soften.

### The length ladder reverses at level 10, on purpose

Word counts climbed from 473 at level 1 to 640 at level 9. Level 10 drops back to
level 1's own band, 456–476. The difficulty moves out of stamina and into grammar,
so the reader meets B2 at a length they have already proved they can finish. Longer
sentences at the same word count mean fewer paragraphs — 8 or 9, against level 9's 9
— which is worth expecting rather than fighting.

### The dictionary's growth is settled

Growth per level fell as shared vocabulary did more of the work: 1,420 terms for
level 1, then +1,238, +936, +888, +770, +729, +568, +478, +478, +541 — landing at
**8,170 rows**, against ~7,400 projected. Over by about 10%, because the last two
levels opened subject fields further from the earlier ones than the trend assumed.

Re-use peaked late: 74% of level 9's vocabulary and 66% of level 10's came free from
earlier levels.

**Nine sequential requests per app load is the settled cost.** Worth revisiting if a
B2 app ever extends this table rather than starting its own — it is a latency problem
long before it is a free-tier one (~4% of the 500 MB quota). See
[ADR 0008](decisions/0008-dictionary-paging-under-the-postgrest-cap.md).

### Content seeds no longer break the RLS tests

The note that any content change breaks `supabase/tests/rls_checks.sql` is out of
date. Its content-dependent assertions were rewritten as shapes and floors — the
dictionary check asserts *reachable*, the levels check asserts *at least 2*, and
`'A: posts visible (L1 only)', '10'` stays true no matter how many levels exist,
because the gate hides everything above level 1 from a reader with no progress.

The file has not been touched since the Level 2 seed. Every remaining literal is
scoped to a fresh test user's own rows, and adding a level changes none of them.

## Verification

Every level from 5 onward was verified by checksum rather than by eye:

- Thirty digests — `md5(body)`, `md5(title)`, `md5(blurb)` for all ten posts —
  compared between the authored files and the database.
- An `md5` over the whole `term || '|' || translation` set ordered `collate "C"`,
  computed on both sides.

Computing the dictionary digest against the file at the *previous* commit is what
makes a delta provable: at level 10 only 546 of 8,170 rows had changed, so the
dictionary went in as three statements rather than the twenty-one the generator
emits at a batch size of 1,000.

Reader counts — sessions, progress rows, saved words, and any unlinked ones — are
recorded before and after every seed. Seeding content must not move them.

Then the level is **walked in the running app**: gate prediction first, inside a
rolled-back transaction, and the real walk after. Both are recorded in
[content-log.md](content-log.md).

## Known limitation

**The German in every seeded level has been read by nobody but the model that wrote
it.** This is accepted knowingly rather than overlooked: a wrong sentence in a
learning app teaches the error. The mitigation is that correcting one is a file edit
and a re-run — no migration, no deploy, no rebuild.
