# Content log

An append-only record of how each level was seeded and how it was verified. Newest
first.

This is a journal, not a reference. The rules for authoring content live in
[content-authoring.md](content-authoring.md); the schema these rows land in is in
[data-model.md](data-model.md). Entries are kept verbatim from the day they were
written, so figures in an older entry are that day's figures and are not updated
later.

Every level from 5 onward was verified the same way: `md5` digests of `body`,
`title` and `blurb` for all ten posts compared between the authored files and the
database, plus an `md5` over the whole `term || '|' || translation` set ordered
`collate "C"`. The gate was predicted before each walk by impersonating a reader
inside a transaction that was then rolled back.

---

## Level 10 — `b2-threshold`

### Seeded

`b2-threshold` (level 10) is **seeded**, and the ladder is complete: ten
posts of 450-500 words and the vocabulary behind them. All ten levels now hold
real content, the dictionary holds 8,170 rows, and `term_gap.py` reports full
coverage for every level - no word anywhere in the app can render as an em
dash. Level 10's subject field is prehistoric animals, chosen because Germany
holds an outsized share of that story: the Messel pit, the Neandertal, the
Solnhofen limestone and Archaeopteryx, the Berlin Naturkundemuseum's mounted
skeleton and where it was dug up, Tilly Edinger, the Schoeningen spears, the
Loewenmensch, Ice Age bones out of the Rhine gravel, and what has to happen
before a slab becomes a species. Its level row did not exist and was created
by `_level.tsv`, the same route levels 4 to 9 took. Level 10's posts are
`posts.id` 127-136, and it is the first row in `levels` whose `cefr` is not
`B1`.

**The length ladder reverses here, on purpose.** Word counts climbed from 473
at level 1 to 640 at level 9; level 10 drops back to level 1's own band,
456-476. The difficulty moves out of stamina and into grammar, so the reader
meets B2 at a length they have already proved they can finish. Longer
sentences at the same word count mean fewer paragraphs - 8 or 9 here against
level 9's 9 - which is worth expecting rather than fighting.

Coverage held up better than a fresh subject field deserved: 1,069 of the
1,610 terms level 10 can produce were already bought by levels 1-9, so only
541 rows were new - 66% free, against 74% at level 9. Five earlier rows were
widened rather than added, and one of them mattered more than the rest:
`art` carried only "kind, sort; manner", which is simply the wrong sense in a
level where *Art* means **species** on nearly every page. Also widened were
`platten` (gained *slabs*, having meant only *records*), `frage` (had only
the verb *ask*, now carries the noun *question*), `lagen` (gained *layers,
strata*) and `arbeiten` (gained *works, operations*). The lesson generalises:
a new subject field is likelier to make an old row **wrong** than to leave a
word missing, and only reading the level's own senses against the existing
rows catches that - `term_gap.py` reports nothing, because the term is there.

Two traps this level paid that earlier ones did not. **Deep time is the worst
numeral trap the app has met**: the subject is nothing but large numbers, and
numerals are inert. Every magnitude is spelled out - `achtundvierzig
Millionen`, `dreihunderttausend`, `vierzigtausend` - and the bodies contain
**not one digit**, verified by grep. Each number word costs a dictionary row
and is tappable, which is the trade worth making. **Latin binomials cost two
rows each** and have no italics to mark them as foreign, so they were used
only where they are genuinely the name people know (Archaeopteryx) and German
preferred elsewhere - `Urvogel`, `Flugsaurier`, `Wollnashorn`.

Verified by checksum, as levels 5 to 9 were: thirty digests (`md5(body)`,
`md5(title)`, `md5(blurb)` for all ten posts) match the authored files, and an
`md5` over the whole `term || '|' || translation` set ordered `collate "C"`
came back `67900538ad60b3536a9521fa2420370b` from both the database and the
file. The database matched the *previous* commit's file
(`66517d69eab626b900ce451b57c7b6d0`) before the seed, which is what made the
delta provable: only 546 of 8,170 rows changed, so the dictionary went in as
three statements rather than the twenty-one the generator emits at a batch
size of 1,000. Reader counts - 83 sessions, 82 progress rows, 34 saved words,
none unlinked - were unchanged by the seed, and unchanged again after the app
walk below. `03-cleanup.sql` was checked read-only and would have relabelled
nothing (0 rows), which is right: every level 10 post is new, so no saved word
points at one.

`supabase/tests/rls_checks.sql` needed no change, for the same reason it
needed none at level 9.


### Walked

**Level 10 has been walked in the running app while unlocked**, by the author,
on the same day it was seeded, and this gap was closed rather than carried.

It was first seen from outside the gate: the switcher listed all ten levels
with the tenth disabled, labelled "Finish every post in Level 9 to open this"
- the *withheld* state rather than "No posts in this level yet", which is the
distinction Feature 2's Trap 2 was about, and right because `level_progress`
reports `posts_total = 10` for a level whose posts the reader cannot yet see.

Finishing Level 9 opened it. The switcher now shows Level 10 selected and
enabled, the dashboard reads "Level 10: B2 Threshold - 2 of 10 posts
completed" at 20%, and all ten cards carry their own title and blurb with
*Die Grube Messel* and *Der Neandertaler* marked Gelesen. The account went
from 83 to 94 sessions and 82 to 93 progress rows (Level 9 now 10 of 10),
saved words from 34 to 38, and the dictionary digest was re-checked
afterwards and is unchanged - reading does not touch content.

**The B2 badge has now been rendered, and this is the first time.** The header
reads `B2 · Level 10` where every previous level drew `B1`, and the reader
eyebrow draws `{level.cefr} · {post.topic}`. Nine levels of content shipped
before anything in this app had to display a CEFR string other than `B1`; it
displays correctly, and the ladder has no untested state left in it.

The cheap check was done and predicts the walk. Impersonating the reader in a
rolled-back transaction, Level 10 reported `posts_total = 10` with
`is_unlocked = false` and **0 posts visible** - withheld, not empty;
completing Level 9 through `reading_sessions` inside the same transaction
flipped it to `is_unlocked = true` with all ten posts reaching the reader. The
transaction was thrown away and the counts re-read afterwards to prove it: 83
sessions, 82 progress rows, Level 9 still at exactly 1 completed. That check
has now predicted the walk on levels 5, 6, 7, 8, 9 and 10.

The paging was measured, not assumed, and it crossed another boundary. At
8,170 rows the network log shows `fetchDictionary` making exactly **nine**
requests - offsets 0 through 8,000 under `order=id.asc`, every one a 200, the
last one short - up from eight at 7,629. As at level 9, this level's rows sit
on the final page, and by rank rather than raw id (the id sequence has gaps
now, so `max(id)` is 8,365 against 8,170 rows): `schöningen` ranks 8,016,
`stoßzahn` 8,041, `tilly` 8,061 and `übersehen` 8,170. **170 of Level 10's own
rows are reachable only by the ninth request.** A client that stopped at eight
would leave levels 1-9 looking perfect and Level 10 full of em dashes.


---

## Level 9 — `b1-command`

### Seeded

`b1-command` (level 9) is **seeded**: ten posts of 625-658 words and the
vocabulary behind them. Nine of the ten levels now hold real content, the
dictionary holds 7,629 rows covering all of them, and `term_gap.py` reports
full coverage for every level - no word in levels 1-9 can render as an em
dash. Level 9's subject field is Germany looking outward - the euro, the
Schengen border, a year abroad, the asylum article of the Grundgesetz,
Marlene Dietrich, a Goethe-Institut classroom in Cairo, the port of Hamburg,
development aid, the emigrants of the nineteenth century and an army that has
to ask parliament - which was the last big gap in the arc after eight levels
that never looked past the border. It is the last B1 level; level 10 is the
B2 preview. Its level row did not exist and was created by `_level.tsv`, the
same route levels 4 to 8 took. Level 9's posts are `posts.id` 117-126.

Coverage keeps improving: 1,372 of the 1,850 terms level 9 can produce were
already bought by levels 1-8, so only 478 rows were new - 74% of this level's
vocabulary came free, against 68% at level 8 and 57% at level 5. Ten earlier
rows were widened rather than added, because a level about borders and trade
makes narrow senses wrong: `karte` had "card, ticket" and now carries *map*,
`klagen` had only the verb and now carries the noun *lawsuits*, and `anlegen`
gained *to dock, to berth* alongside *to invest*.

A finding worth recording for level 10: **a level about the world pays a
proper-noun tax**. Every place and person name survives `clean()` as a
tappable term needing its own dictionary row, so Kairo, Bremerhaven, Athen,
Namibia and Hunsrück each cost a row the way any other word does. It also
constrains the prose, because `clean()` keeps only `[A-Za-zÄÖÜäöüß-]`: São
Paulo, Curaçao and Québec would tokenise to junk no row can match, so the
examples were chosen from names that survive the regex.

Verified by checksum, as levels 5 to 8 were: thirty digests (`md5(body)`,
`md5(title)`, `md5(blurb)` for all ten posts) match the authored files, and an
`md5` over the whole `term || '|' || translation` set ordered `collate "C"`
came back `8e223fb6150f90f0624f56fc77724d3f` from both the database and the
file. The same digest computed against the file at the *previous* commit
matched the database before the seed, which is what made the delta provable:
only 488 of 7,629 rows changed, so the dictionary went in as two statements
rather than the eight the generator emits at a batch size of 1,000. Reader
counts - 73 sessions, 72 progress rows, 33 saved words, none unlinked - were
unchanged by the seed itself. They moved afterwards only because the author
then finished Level 8 and read the first post of Level 9, which is the walk
recorded below: 83 sessions, 82 progress rows, 34 saved words.

`supabase/tests/rls_checks.sql` needed no renumbering this time. Its levels
and dictionary assertions were converted from censuses to shape checks in an
earlier pass ("at least 2", "reachable"), and its one literal count is
L1 posts, which no later level touches. That earlier change is what stops
every content seed from breaking a test for a reason that has nothing to do
with RLS.


### Walked

**Level 9 has been walked in the running app while unlocked**, by the author,
and this gap was closed on the same day it was seeded. Finishing Level 8
opened it: the switcher lists all nine levels with Level 9 selected, the
dashboard reads "Level 9: B1 Command - 1 of 10 posts completed" at 10%, the
header badge reads "B1 - Level 9", and all ten cards show their own title and
blurb with *Eine Währung für viele* marked Gelesen. The account went from 72
to 82 progress rows (Level 8 now 10 of 10) and stands at 1 of 10 on Level 9.

The cheap check had predicted the walk exactly, and the two agree.
Impersonating the same reader in a rolled-back transaction while they were
1 of 10 through Level 8, Level 9 reported `posts_total = 10` with
`is_unlocked = false` - withheld rather than empty; completing Level 8 through
`reading_sessions` inside the same transaction flipped it to
`is_unlocked = true` with all ten posts visible and the body of *Eine Währung
für viele* reaching the reader. That check has now predicted the walk on
levels 5, 6, 7, 8 and 9, for the cost of one transaction that is thrown away.

The paging was measured rather than assumed, and this level makes the
measurement sharper than before. `loadContent` fetches the dictionary at app
boot, so a dashboard load is enough: the network log shows `fetchDictionary`
making exactly eight requests - offsets 0 through 7,000 under `order=id.asc`,
every one a 200, the last one short - so all 7,629 rows reach the reader and
the loop still stops on its own. What is new is that **Level 9's own rows are
the ones on the last page**. The 478 rows written for this level carry the
highest ids, so `kleingeld` sits at rank 7,381 and `zentralbank` at 7,600:
the eighth request is no longer a formality, it is the request that makes this
level's vocabulary work at all. A truncated read would have left Level 9
looking fine on levels 1 to 8 and full of em dashes on itself.

One word from this level was saved during the walk - `eigenes` ("own") from
*Eine Währung für viele*, taking the author from 29 to 30 saved words. Worth
noting for the next level that this particular save proves less than it looks:
`eigenes` is an old row at rank 1,702, so it only demonstrates that page two
arrived. The eight-request network log is the evidence that the new rows
reach the reader; a tap only adds to it if the word tapped is one of the new
ones.


---

## Level 8 — `b1-rhythm`

### Seeded

`b1-rhythm` (level 8) is **seeded**: ten posts of 601-635 words and the
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


### Walked

**Level 8 has been walked in the running app while unlocked**, by the author
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


---

## Level 7 — `b1-register`

### Seeded

`b1-register` (level 7) is **seeded**: ten posts of 581-608 words and the
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


### Walked

**Level 7 has been walked in the running app while unlocked**, by the author
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


---

## Level 6 — `b1-fabric`

### Seeded

`b1-fabric` (level 6) is **seeded**: ten posts of 562-610 words and the
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


### Seen, but only from outside the gate

**Level 6 has been seen in the running app, but only from outside the gate.**
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


---

## Level 5 — `b1-texture`

### Seeded

`b1-texture` (level 5) is **seeded**: ten posts of 562-577 words and the
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

### Walked

**Level 5 has been walked in the running app while unlocked**, by the author
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

---

## Levels 3 and 4

**Levels 3 and 4 have been walked in the running app while unlocked**, and
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
