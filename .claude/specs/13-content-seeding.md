# Content seeding

**Status:** Implemented · **Feature:** 13 · **Date:** 2026-08-27

## Problem

Level 1 presents ten posts, but only two texts were ever written. They were
alternated across all ten, so eight posts carry prose that has nothing to do
with their titles — one is called *Beim Arzt* and describes commuting in Berlin.
Tapping a word usually returns nothing, because the vocabulary only ever covered
those two texts. The app's shape works; its content is visibly fake.

Underneath that is the larger gap. Nobody has ever put real content into Lesener,
so there is no proven route for doing it. Every future level, every corrected
typo and every new word faces the same unanswered question. The placeholder prose
is the symptom worth fixing; the missing route is the reason this feature exists.

Two accounts read the app today — the author's and a test account — and both have
reading history, completions and saved vocabulary that must survive any content
change.

## Goals

1. Every post in Level 1 carries text that belongs to its own title.
2. Every word a reader can tap anywhere in Level 1 returns a translation.
3. Seeding leaves existing reading history, completions and saved vocabulary
   exactly as they were.
4. Running the same seed a second time changes nothing.
5. Correcting content is an edit to the authored text followed by a re-run, never
   a hand-written database statement.
6. Adding a future level follows the same route, with no new one to design.

## Non-goals

1. Changing how the app reads, renders or lays out content. No screen changes.

   **Amended during implementation.** One read had to change. The app asked for
   the whole dictionary in a single request, and the interface silently returns
   at most a thousand rows — so 440 of Level 1's 1,440 terms never reached the
   reader and the words that answered with a dash looked arbitrary. Goal 2 is
   unreachable without fetching the rest, so the dictionary read now pages. No
   screen changed, and nothing about rendering changed.
2. Fixing the vocabulary bank's capitalisation, where a word tapped at the start
   of a sentence is remembered with that sentence's capital.
3. Adding content to Level 2. It stays an empty shell.
4. Any in-app or browser-based authoring surface.
5. Independent verification of the German by a second reader.

## User flows

### Seeding curated content

1. The author finishes curating the texts and their vocabulary.
2. Validation runs over the authored content and reports anything the reader
   would render badly — a text outside the intended length, a paragraph break
   that would collapse, a word containing a character the app cannot look up, or
   a word in a text with no translation behind it.
3. The author fixes anything reported and re-runs validation until it is clean.
4. The content is applied to the database in several passes, because it is too
   large for one.
5. The author confirms that reading history, completions and saved vocabulary are
   unchanged in number.
6. The author signs in and looks at the result: a post reads correctly, a tapped
   word answers, and the vocabulary bank is intact.

**States:** validation failure · partial application · verification mismatch

A partial application is tolerated rather than prevented. Between passes the app
may briefly show new prose against incomplete vocabulary, so some words answer
with a dash. Re-running the unfinished pass resolves it, and no pass leaves
anything that a repeat run cannot correct.

### Reading Level 1 after a seed

1. The reader signs in and the library loads.
2. The dashboard lists ten posts under their new titles and blurbs, each showing
   its own subject rather than the same one ten times.
3. Opening a post shows its paragraphs separated as written.
4. Tapping any word in the text returns a translation.
5. Completion badges read exactly as they did before the seed.
6. The vocabulary bank still holds every previously saved word. Words saved from
   a post that has since been retitled appear under the heading they were saved
   under, not under the post that now occupies that position.

**States:** loading · content-fetch error · Level 2 locked · Level 2 empty

### Correcting content after seeding

1. The author notices a wrong translation, a typo or a clumsy sentence.
2. The author edits the authored text.
3. Validation runs, and the content is applied again.
4. The correction is visible on the next load. Reading history, completions and
   saved vocabulary are untouched, and everything not edited is unchanged.

**States:** validation failure · no-op re-run

## Assumptions

- **The content ships unverified.** The German has been read by nobody but its
  author. This is accepted knowingly: a wrong sentence in a learning app teaches
  the error, and the mitigation is that correcting one is an edit and a re-run
  rather than a rebuild. Confirm this is still acceptable before applying.
- **A vocabulary entry that no tap can reach is removed.** One existing entry
  contains a character the app strips before looking a word up, so it can never
  match anything. It is deleted rather than left as a permanent dead row.
- **Saved words from retitled posts are detached, not deleted.** Their stored
  heading becomes what the bank shows. The alternative — letting them re-home
  under whatever post now holds that position — would present a word under a text
  that does not contain it.
- **Nine of the ten posts change title.** Only the first keeps its name. Reading
  history stays attached because a post keeps its identity through a rewrite.

## Acceptance criteria

1. Opening each of the ten Level 1 posts shows text about the subject named in
   its title.
2. The dashboard shows ten distinct titles and blurbs, and the posts no longer
   all share a single topic label.
3. Tapping words throughout every Level 1 post never produces a dash in place of
   a translation.
4. After seeding, the number of recorded reading sessions, completions and saved
   words is identical to the number before it.
5. Completion badges on the dashboard are the same before and after seeding, for
   both accounts.
6. The vocabulary bank lists every word it listed before, and words saved from
   retitled posts appear under their original headings.
7. Applying the entire seed a second time reports no change and leaves every
   count identical.
8. Changing one sentence in one authored text and re-applying updates only that
   post, leaves all other content untouched, and preserves all reading history.
9. Validation run against a deliberately broken text — one too short, one with a
   collapsed paragraph break, one containing a word the app cannot look up —
   fails and names each problem.
10. The database's own permission checks pass in full, and a security review of
    the project reports nothing.
