import { supabase } from './supabase';
import { rows } from './query';

// Read layer over the three content tables. Nothing here is user-specific:
// levels and dictionary entries are readable by any signed-in reader, and posts
// are filtered by the level gate in the database (posts_select_unlocked), not
// here.
//
// Every function below assumes a signed-in reader. The rls_policies migration
// revokes all privileges on these tables from `anon`, so a call made while
// signed out does not come back empty — it comes back as a permission error.
// Callers must wait for a session rather than treating an empty list as "no
// content yet".

// Every level, locked ones included: the dashboard names the level being worked
// towards ("to Level 2") while that level's posts are still withheld. post_count
// is the denormalised counter, which is why a locked level can still report
// "0 of 10" without exposing a single post row.
export function fetchLevels() {
  return rows(
    () =>
      supabase
        .from('levels')
        .select('id, slug, name, cefr, position, post_count')
        .order('position', { ascending: true }),
    'levels',
  );
}

// An empty result is ambiguous on its own: the level may hold no posts, or it
// may be locked. levels.post_count tells the two apart without another query.
export function fetchPosts(levelId) {
  return rows(
    () =>
      supabase
        .from('posts')
        .select('id, level_id, position, slug, title, blurb, topic, body, published_at')
        .eq('level_id', levelId)
        .order('position', { ascending: true }),
    `posts for level ${levelId}`,
  );
}

// PostgREST refuses to return more than 1000 rows in one response, and it does
// so silently as far as supabase-js is concerned: the reply is a 206 carrying
// `Content-Range: 0-999/1440` and an array of exactly 1000, with no error. This
// was measured against the live project after Level 1 was seeded, and it is why
// the whole dictionary can no longer be had in a single request.
//
// The failure it caused is worth remembering, because nothing looked broken. A
// tapped word simply answered with an em dash, and *which* words did that
// appeared random -- the query carried no ORDER BY, so rows came back in heap
// order, and re-seeding had rewritten the older rows and moved them to the end
// of the heap. A word's id said nothing about whether the reader would get it.
//
// Paging therefore needs a sort that does not move, or a row could shift across
// the page boundary between two requests and be skipped. `id` is the primary
// key: unique, never null, never rewritten by an update.
const DICT_PAGE = 1000;

export async function fetchDictionary() {
  const all = [];

  for (let from = 0; ; from += DICT_PAGE) {
    const page = await rows(
      () =>
        supabase
          .from('dictionary_entries')
          .select('term, translation, part_of_speech')
          .order('id', { ascending: true })
          .range(from, from + DICT_PAGE - 1),
      `dictionary entries ${from}-${from + DICT_PAGE - 1}`,
    );

    all.push(...page);

    // A short page is the only signal that the end has been reached; a full one
    // is ambiguous, so an exactly-1000-row dictionary costs one empty request.
    if (page.length < DICT_PAGE) return all;
  }
}

// Keyed by `term`, which the schema constrains to lowercase so it matches what
// the reader computes as clean(raw).toLowerCase().
//
// A Map rather than a plain object because the keys are arbitrary German words.
// An object inherits Object.prototype, so a word that cleans to "constructor",
// "toString" or "valueOf" would look up to a function — truthy, and rendered as
// though it were a translation. A Map has no keys it was not given.
export function toDictionaryMap(entries) {
  return new Map(entries.map((e) => [e.term, e.translation]));
}

// Everything the screens will need, in one call. Posts are requested per level
// rather than in a single sweep so a locked level is visibly empty rather than
// merely absent — `postsByLevel[id].length` against `level.post_count` is the
// difference between "this level holds nothing" and "this level is closed".
export async function loadContent() {
  const [levels, dictionary] = await Promise.all([fetchLevels(), fetchDictionary()]);

  const fetched = await Promise.all(levels.map((level) => fetchPosts(level.id)));
  const postsByLevel = Object.fromEntries(levels.map((level, i) => [level.id, fetched[i]]));

  return { levels, postsByLevel, dictionary: toDictionaryMap(dictionary) };
}
