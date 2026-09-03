# 0008 — Read the dictionary in pages, ordered by `id`

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

The reader taps any word and gets a translation, so the whole dictionary is fetched
once per app load and held in a `Map`.

Seeding Level 1 took the table past 1,000 rows and the reader began showing an em
dash for words that were plainly in the database. **PostgREST returns at most 1,000
rows per response and says so only in a header** — a `206` carrying
`Content-Range: 0-999/1440` — and supabase-js reports no error. A caller that does
not page is handed a silently truncated table.

Which words failed looked random, and that part is the instructive half: the query
carried no `ORDER BY`, so rows came back in heap order, and the upsert had rewritten
all 117 pre-existing rows and moved them to the end of the heap. A row's `id`
predicted nothing about whether it arrived.

## Decision

`fetchDictionary` pages in 1,000-row chunks under **`.order('id')`**, stopping on a
short page. `id` is the sort key precisely because it never moves.

## Consequences

- Nine sequential requests per app load at 8,170 rows, and that is the settled cost.
  A tenth arrives at 9,001.
- **The ordering is not decoration.** Paging across requests without a stable sort
  lets a row cross the page boundary between two calls and never be returned at all.
- The failure mode this replaced is the worst kind: silent, partial, and
  indistinguishable from a content gap. Nothing errored.
- **Any table this app reads whole is subject to the same cap.** A growing `levels`
  or `posts` would hit it the same way. Roadmap 1 put the ceiling at ~5,000 rows and
  planned to revisit; that estimate was wrong by a factor of five.
- The 1,000-row cap is reproduced in the test suite — `tests/helpers/supabase.js`
  lets a table answer as a function of `(filters, op)`, and `.range()` is recorded
  into `filters` for exactly this.
- Worth revisiting if a B2 app ever extends this table rather than starting its own.
  It is a latency problem long before it is a free-tier one (~4% of the 500 MB quota).
