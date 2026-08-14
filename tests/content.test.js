import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../src/lib/supabase';
import { fetchLevels, fetchPosts, loadContent, toDictionaryMap } from '../src/lib/content';

// postgrest-js builders are thenables, not promises: every filter returns the
// builder and awaiting it runs the request. This is the smallest stand-in that
// behaves the same way.
function builder(result, calls) {
  const b = {
    select: (columns) => (calls.select.push(columns), b),
    eq: (column, value) => (calls.eq.push([column, value]), b),
    order: (column) => (calls.order.push(column), b),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return b;
}

let calls;

function stub(results) {
  calls = { from: [], select: [], eq: [], order: [] };
  supabase.from.mockImplementation((table) => {
    calls.from.push(table);
    return builder(results[table], calls);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a failed query', () => {
  // supabase-js resolves rather than rejects, so an unchecked call yields
  // `data: null` and the caller carries on with an empty library. Acceptance
  // criterion 6: a failure has to be impossible to overlook.
  it('throws rather than resolving to nothing', async () => {
    stub({ levels: { data: null, error: { code: '42501', message: 'permission denied for table levels' } } });

    await expect(fetchLevels()).rejects.toThrow(
      'Could not load levels [42501]: permission denied for table levels',
    );
  });

  it('names the level whose posts could not be read', async () => {
    stub({ posts: { data: null, error: { message: 'nope' } } });

    await expect(fetchPosts(2)).rejects.toThrow('Could not load posts for level 2: nope');
  });
});

describe('loading the whole library', () => {
  const levels = [
    { id: 1, slug: 'b1-foundation', position: 1, post_count: 2 },
    { id: 2, slug: 'b1-momentum', position: 2, post_count: 1 },
  ];

  function stubLibrary() {
    calls = { from: [], select: [], eq: [], order: [] };
    const postsByLevel = {
      1: [{ id: 1, level_id: 1, title: 'Der Alltag in Berlin' }, { id: 2, level_id: 1, title: 'Einkaufen am Samstag' }],
      2: [], // Locked: published rows exist, the gate withholds them.
    };

    supabase.from.mockImplementation((table) => {
      calls.from.push(table);
      if (table === 'posts') {
        // from() is called afresh per level, so each builder closes over the
        // one level id its .eq() was given.
        let levelId = null;
        const b = {
          select: (c) => (calls.select.push(c), b),
          order: (c) => (calls.order.push(c), b),
          eq: (column, value) => (calls.eq.push([column, value]), (levelId = value), b),
          then: (res, rej) => Promise.resolve({ data: postsByLevel[levelId] ?? [], error: null }).then(res, rej),
        };
        return b;
      }
      return builder(
        {
          levels: { data: levels, error: null },
          dictionary_entries: { data: [{ term: 'herausforderung', translation: 'challenge' }], error: null },
        }[table],
        calls,
      );
    });
  }

  it('asks each level for its own posts', async () => {
    stubLibrary();

    await loadContent();

    expect(calls.eq).toEqual([
      ['level_id', 1],
      ['level_id', 2],
    ]);
  });

  // Acceptance criterion 4: a locked level has to come back present and empty,
  // not missing. Absent and withheld are different answers and the dashboard
  // will have to tell them apart.
  it('keeps a locked level in the result with no posts', async () => {
    stubLibrary();

    const { levels: loaded, postsByLevel } = await loadContent();

    expect(loaded).toHaveLength(2);
    expect(postsByLevel[1]).toHaveLength(2);
    expect(postsByLevel[2]).toEqual([]);
  });

  it('hands back the dictionary keyed for lookup', async () => {
    stubLibrary();

    const { dictionary } = await loadContent();

    expect(dictionary.herausforderung).toBe('challenge');
  });
});

describe('the dictionary map', () => {
  it('is keyed by the normalised term the reader computes', () => {
    const map = toDictionaryMap([
      { term: 'herausforderung', translation: 'challenge' },
      { term: 'gleichzeitig', translation: 'simultaneously' },
    ]);

    expect(map).toEqual({ herausforderung: 'challenge', gleichzeitig: 'simultaneously' });
  });
});
