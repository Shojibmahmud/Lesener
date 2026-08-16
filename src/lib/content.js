import { supabase } from './supabase';

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

// supabase-js resolves rather than rejects on a failed query, so an unchecked
// call silently yields `data: null` and the caller carries on with nothing.
// Turning that into a throw is what makes a failure reach anybody at all.
async function rows(builder, what) {
  const { data, error } = await builder;

  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not load ${what}${code}: ${error.message}`);
  }

  return data ?? [];
}

// Every level, locked ones included: the dashboard names the level being worked
// towards ("to Level 2") while that level's posts are still withheld. post_count
// is the denormalised counter, which is why a locked level can still report
// "0 of 10" without exposing a single post row.
export function fetchLevels() {
  return rows(
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
    supabase
      .from('posts')
      .select('id, level_id, position, slug, title, blurb, topic, body, published_at')
      .eq('level_id', levelId)
      .order('position', { ascending: true }),
    `posts for level ${levelId}`,
  );
}

// The whole dictionary in one request. It is small (a few hundred rows at B1)
// and the reader needs an arbitrary word from it the moment a reader taps one,
// so paging it would buy nothing and cost a round trip per tap.
export function fetchDictionary() {
  return rows(
    supabase.from('dictionary_entries').select('term, translation, part_of_speech'),
    'dictionary entries',
  );
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
