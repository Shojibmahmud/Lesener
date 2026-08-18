// A client-side copy of private.has_level_access (rls_policies.sql).
//
// A copy, and deliberately so. The function lives in the `private` schema, which
// PostgREST does not expose, so supabase-js cannot call it — and the database
// stays the enforcer regardless. What is decided here is only what to grey out;
// a reader who defeated this check would still be handed nothing, because the
// posts_select_unlocked policy asks the real function.
//
// The consequence of it being a copy is that the two can drift. If the rule in
// the migration ever changes, this changes with it, or the dashboard starts
// offering levels the database will refuse.

// The rule, from the migration:
//   position <= 1  → always open
//   otherwise      → every published post of the level at position - 1 must be
//                    completed, and a preceding level holding no posts opens
//                    this one vacuously.
//
// Reproducing that from the client takes one step the migration does not need.
// The database sees every post; the client sees only the ones RLS handed over,
// and a locked level hands over none. So "the preceding level's posts are all
// completed" is trivially true of a level whose posts were withheld — which
// would unlock level 3 for a reader still locked out of level 2.
//
// levels.post_count is what tells the two apart. It is maintained by
// private.sync_level_post_count() over every post regardless of publication, and
// a locked level still reports it, so post_count === 0 means genuinely empty
// while an empty list under post_count > 0 means withheld.
export function isLevelUnlocked(level, levels, postsByLevel, completedIds) {
  if (!level) return false;
  if (level.position <= 1) return true;

  const preceding = levels.find((candidate) => candidate.position === level.position - 1);
  // No preceding level at all is not a lock. The migration's NOT EXISTS finds
  // no posts to be incomplete and opens the level; matching that here keeps a
  // gap in the level positions from stranding a reader.
  if (!preceding) return true;

  // Vacuously true, exactly as in the migration: a level holding no posts opens
  // the next one rather than trapping the reader behind content nobody wrote.
  if (preceding.post_count === 0) return true;

  // The preceding level holds posts the reader cannot see. They cannot have
  // completed them, so this level is shut — and reading its empty list as
  // "nothing left to finish" is precisely the mistake this guards against.
  if (!isLevelUnlocked(preceding, levels, postsByLevel, completedIds)) return false;

  const published = (postsByLevel[preceding.id] ?? []).filter((post) => post.published_at);

  // Reached only when the preceding level is open, so an empty list here really
  // does mean nothing to finish — every post of it is unpublished, which the
  // database also treats as vacuously satisfied.
  const done = new Set(completedIds);
  return published.every((post) => done.has(post.id));
}

// Which levels a reader may open, keyed by level id — computed once so the
// switcher, the empty/locked decision and the header all answer from the same
// reading rather than each recomputing it.
export function unlockedLevels(levels, postsByLevel, completedIds) {
  return new Map(
    levels.map((level) => [level.id, isLevelUnlocked(level, levels, postsByLevel, completedIds)]),
  );
}
