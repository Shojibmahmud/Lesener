import { describe, expect, it } from 'vitest';
import { isLevelUnlocked, unlockedLevels } from '../src/lib/levels';

// Ids that are not positions, so a check keyed by the wrong one fails here
// rather than in production, where posts.id and posts.position coincide.
const level = (id, position, post_count) => ({ id, position, post_count });
const one = level(10, 1, 2);
const two = level(20, 2, 2);
const three = level(30, 3, 2);

const published = (id) => ({ id, published_at: '2026-08-01T00:00:00Z' });
const draft = (id) => ({ id, published_at: null });

describe('the level gate, as the client re-derives it', () => {
  it('always opens the first level, whatever the reader has read', () => {
    expect(isLevelUnlocked(one, [one, two], { 10: [published(101)] }, [])).toBe(true);
  });

  it('stays shut while one post of the preceding level is unread', () => {
    const posts = { 10: [published(101), published(102)] };

    expect(isLevelUnlocked(two, [one, two], posts, [101])).toBe(false);
  });

  it('opens once the last of them is finished', () => {
    const posts = { 10: [published(101), published(102)] };

    expect(isLevelUnlocked(two, [one, two], posts, [101, 102])).toBe(true);
  });

  // The migration's NOT EXISTS finds nothing to be incomplete, so the level
  // opens. Anything stricter here would strand a reader behind posts that were
  // never written.
  it('opens vacuously when the preceding level has no published posts', () => {
    expect(isLevelUnlocked(two, [one, two], { 10: [] }, [])).toBe(true);
  });

  // Only published posts gate. An unpublished one is invisible to the reader,
  // so requiring it would lock a level nobody could ever open.
  it('ignores unpublished posts of the preceding level', () => {
    const posts = { 10: [published(101), draft(102)] };

    expect(isLevelUnlocked(two, [one, two], posts, [101])).toBe(true);
  });

  // Level 3 asks about level 2, never about level 1 — the check is one step
  // back, not all the way down.
  it('looks only at the level immediately before it', () => {
    const levels = [level(10, 1, 1), level(20, 2, 1), level(30, 3, 1)];
    const posts = { 10: [published(101)], 20: [published(201)] };

    // Level 1 finished opens level 2; level 2 finished opens level 3. Asking
    // about level 1 is not how level 3 is decided.
    expect(isLevelUnlocked(three, levels, posts, [101, 201])).toBe(true);
    expect(isLevelUnlocked(three, levels, posts, [101])).toBe(false);
  });

  // The mistake this exists to catch. A locked level hands the client no posts,
  // so "all of its posts are completed" is trivially true of it — and level 3
  // would open for a reader still shut out of level 2. The database, which can
  // see the posts it withheld, says the opposite. post_count is what separates a
  // level that holds nothing from one that is merely not showing it.
  it('does not open a level behind one that is itself locked', () => {
    const levels = [one, two, three];
    // Level 2 withheld: its posts are absent from the client's copy even though
    // post_count says it holds two.
    const posts = { 10: [published(101), published(102)], 20: [] };

    expect(isLevelUnlocked(two, levels, posts, [101])).toBe(false);
    expect(isLevelUnlocked(three, levels, posts, [101])).toBe(false);
  });

  it('opens the level after one that is empty rather than withheld', () => {
    const emptyTwo = level(20, 2, 0);
    const levels = [one, emptyTwo, three];
    const posts = { 10: [published(101), published(102)], 20: [] };

    expect(isLevelUnlocked(emptyTwo, levels, posts, [101, 102])).toBe(true);
    // Nothing in level 2 to finish, so level 3 opens with it — the same
    // vacuous NOT EXISTS the migration relies on.
    expect(isLevelUnlocked(three, levels, posts, [101, 102])).toBe(true);
  });
});

describe('resolving every level at once', () => {
  it('answers for each level by id', () => {
    const levels = [level(10, 1, 1), level(20, 2, 1), level(30, 3, 1)];
    const posts = { 10: [published(101)], 20: [published(201)] };

    const unlocked = unlockedLevels(levels, posts, [101]);

    expect(unlocked.get(10)).toBe(true);
    expect(unlocked.get(20)).toBe(true);
    expect(unlocked.get(30)).toBe(false);
  });
});
