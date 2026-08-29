---
name: content-authoring
description: "Use when writing, editing or seeding Lesener reading content — German posts for a level, their blurbs and topics, or dictionary_entries translations. Triggers: write posts, new level, replace placeholder prose, add a text, seed content, fix a typo in a post, translate terms, dictionary coverage, vocabulary gap, a word shows as an em dash in the reader."
metadata:
  author: lesener
  version: "1.0"
---

# Authoring Lesener content

Lesener's library lives in three tables — `levels`, `posts`, `dictionary_entries`
— which grant `authenticated` **SELECT and nothing else**. Every write is
`service_role`, which in this repo means SQL applied through the Supabase MCP
server. There is no admin UI and no local Supabase stack.

Prose is therefore authored as **files in the repo**, and the database is a
serving copy. That is what gives content a diff, a review and a rollback.

## Procedure

Shojib curates before anything is written to the database. Do not compress this.

1. **Write the files.** Posts under `src/assets/posts/level-NN/`, translations in
   `src/assets/dictionary/de-en.tsv`. Nothing touches the database.
2. **Shojib reads and curates.** Titles, blurbs and prose may all change.
3. **Seed only when explicitly instructed** — a separate instruction, not a step
   you take because the files look finished.

## Where content lives

```
src/assets/posts/level-NN/NN-LN-<slug>.md    one file per post
src/assets/posts/level-NN/_level.tsv         the level row, only for a new level
src/assets/dictionary/de-en.tsv              one file for the whole app
```

`_level.tsv` is a single line — `slug`, `name`, `cefr`, `position`, tab
separated, under a header. It exists so a level the database does not have yet
can be created by the same route as its posts; a directory whose level already
exists may carry it (it upserts to nothing) or leave it out. It is deliberately
not frontmatter: repeating the level's name and band in all ten post files would
invite exactly one of them to drift.

The filename ends with the post's `slug`, so the file and `posts.slug` are the
same string. Nothing imports these files, so Vite ignores them and they add
nothing to the bundle.

Post files carry the metadata the seed needs:

```markdown
---
slug: der-alltag-in-berlin
title: Der Alltag in Berlin
blurb: Commuting, coffee and the rhythm of a loud city.
topic: Alltag
level: b1-foundation
position: 1
---

Erster Absatz …

Zweiter Absatz …
```

Everything after the closing `---` becomes `posts.body` verbatim. Blurbs are
**English** (they are the dashboard card subtitle); `topic` is **German** (the
reader eyebrow renders `{level.cefr} · {post.topic}`).

## Writing constraints

These are not style preferences. Each falls out of code, and each is worth
re-checking against the source rather than trusting this file.

**Structure** — `Reader.jsx` splits the body on `'\n\n'`.

- Paragraphs separated by exactly one blank line. A double blank line yields a
  paragraph that begins with a stray newline and an empty leading token.
- One paragraph per line, no hard wrapping, so the file body and `posts.body`
  are byte-identical.
- 450–500 words, 6–10 paragraphs, is what reads well against the scroll-progress
  bar. Shorter posts finish before the reader has scrolled.

**Characters** — `clean()` in `src/utils.js` keeps only `[A-Za-zÄÖÜäöüß-]`, and
`Reader.jsx` refuses to open a token that cleans to an empty string.

- **No abbreviations containing periods.** `z. B.` tokenises to `z` and `B`,
  needing dictionary rows `z` and `b`. Write `zum Beispiel`, `das heißt`.
- **No apostrophes inside words.** `geht's` cleans to `gehts`, a term of its own.
- **No accented characters outside `äöüÄÖÜß`.** They are silently stripped —
  `Café` becomes the term `caf`, which no dictionary row will match. Spell it
  `Cafe`. The original seed carried a dead `café` row that proved the trap; it
  was deleted from the database in Feature 13 and from `de-en.tsv` in Feature 14.
  `term_gap.py` reports any that reappear under *rows no tap can ever match*.
- Hyphenated compounds are fine and become one term: `U-Bahn` → `u-bahn`.
- **Numerals are inert.** `1989` cleans to nothing and cannot be tapped. Use
  figures where they carry meaning, but never write a chronology — a paragraph
  dense with dates gives the reader nothing to learn.

**Register.** Aim at the level the `levels.cefr` row actually claims, not at the
textbook page being imitated. For B1: Präsens and Perfekt carry the narration,
Präteritum only for `sein`, `haben`, `werden` and modals; Passiv sparingly;
concrete nouns over nominalised officialese; sentences mostly under 20 words.

Write real-world topics — portraits, history, how something in Germany actually
works — rather than phrasebook scenes. Vary the voice: third person for
explainers and portraits, first person for a couple of pieces, so a level does
not read as ten encyclopedia entries.

## The dictionary

`dictionary_entries.term` is **globally unique** and has no `post_id`. A word is
defined once for the whole app, so translations live in **one file**, never one
per post.

TSV, not CSV — translations contain commas (`travel, ride`). Columns:

```
term	display_form	translation
u-bahn	U-Bahn	subway, underground
essen	Essen	to eat; food, meal
```

- `term` must equal `clean(surface).toLowerCase()` or the lookup silently misses.
  A check constraint enforces the lowercasing.
- `display_form` is the canonical German spelling. It is **not yet a database
  column** — the file carries it so the data is ready if a migration adds it.
- **Homographs share a row.** Because terms are lowercased and unique, `Essen`
  and `essen` collapse; the single translation must carry both senses. Same for
  `macht`, `fest`, `leben`, `reden`, `stellen`.
- Translate **every** term the posts can produce. A missing row renders as `—`.
  Full coverage is the difference between a reader that works and one that
  shrugs. A *wrong* translation is worse than a missing one — it teaches error.
- **Full coverage in the table is not the same as full coverage in the reader.**
  PostgREST caps a response at 1000 rows and reports it only as a `206` with a
  `Content-Range` header, so a client that does not page gets a silently
  truncated dictionary. `fetchDictionary` pages under `order('id')` because of
  this; if a level ever pushes another whole-table read past a thousand rows,
  that read needs the same treatment. Verify in the running app, not only in SQL.
- `part_of_speech` is nullable and unused by the UI; leave it unless asked.

## Verification

Both scripts mirror the real regex and tokeniser. Run them before handing files
over, and again before seeding.

```sh
python3 .claude/skills/content-authoring/scripts/check_posts.py src/assets/posts/level-01
python3 .claude/skills/content-authoring/scripts/term_gap.py \
        src/assets/posts/level-01 src/assets/dictionary/de-en.tsv
```

`check_posts.py` validates frontmatter, filename/slug agreement, paragraph
structure, word range, and flags any token that loses a character to `clean()`.
`term_gap.py` reports coverage and prints a `term|display_form` worklist for
everything still untranslated, marking `|?` where it cannot tell a noun from a
capitalised adverb.

## Seeding (only on explicit instruction)

**Upsert posts on `(level_id, position)`. Never delete and reinsert.**
`reading_sessions.post_id` and `reading_progress.post_id` are both
`on delete cascade`, so deleting a post erases every reader's progress on it and
can re-lock the next level for someone who had finished. `on conflict
(level_id, position) do update` keeps `posts.id`, so progress and saved words
survive even when the slug changes.

A bare `UPDATE` is wrong for a level being written for the first time: it holds
no rows, so every statement matches nothing **and reports success**. Level 2
would have seeded as a silent no-op. `build_seed_sql.py` emits the upsert.

Other things that bite:

- Content edits are **data**, not schema. Prefer MCP `execute_sql` over
  `apply_migration`, so migration history does not fill with typo fixes.
- `levels.post_count` is trigger-maintained and counts posts **regardless of
  publication**. `published_at = NULL` hides a draft from readers while still
  counting.
- `supabase/tests/rls_checks.sql` asserts literal counts (`'A: dictionary
  visible', '117'`). Any content change breaks it until the numbers are updated.
- To retire a post, **unpublish it** (`published_at = null`) rather than delete.
- After seeding, re-read `supabase/README.md` § Known gaps and update what is no
  longer true.
