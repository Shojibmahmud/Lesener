import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../src/lib/supabase';
import { fetchLevels, fetchPosts, loadContent, toDictionaryMap } from '../src/lib/content';
import { stubSupabase } from './helpers/supabase';

let calls;

function stub(tables) {
  const stubbed = stubSupabase(tables);
  calls = stubbed.calls;
  supabase.from.mockImplementation(stubbed.from);
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
    const postsByLevel = {
      1: [{ id: 1, level_id: 1, title: 'Der Alltag in Berlin' }, { id: 2, level_id: 1, title: 'Einkaufen am Samstag' }],
      2: [], // Locked: published rows exist, the gate withholds them.
    };

    stub({
      levels: { data: levels, error: null },
      dictionary_entries: { data: [{ term: 'herausforderung', translation: 'challenge' }], error: null },
      // Answered per builder, so each level's request sees its own level id.
      posts: ({ level_id }) => ({ data: postsByLevel[level_id] ?? [], error: null }),
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

    expect(dictionary.get('herausforderung')).toBe('challenge');
  });
});

describe('a token the API says was issued in the future', () => {
  // The bug this guards against: signing in showed the error screen every time,
  // and Try again always worked. PostgREST had rejected the freshly minted token
  // with PGRST303 because its own clock was a fraction behind the clock of the
  // service that issued it. Nothing was wrong but the timing, so the request is
  // worth making a second time — unlike every other failure here.
  const skewed = { data: null, error: { code: 'PGRST303', message: 'JWT issued at future' } };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits out the skew and asks again, rather than failing the reader', async () => {
    vi.useFakeTimers();

    let attempts = 0;
    stub({
      levels: () => (++attempts === 1 ? skewed : { data: [{ id: 1, position: 1 }], error: null }),
    });

    const loading = fetchLevels();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(loading).resolves.toEqual([{ id: 1, position: 1 }]);
    expect(attempts).toBe(2);
  });

  it('gives up if the second attempt is refused too', async () => {
    vi.useFakeTimers();

    stub({ levels: () => skewed });

    const loading = fetchLevels();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(loading).rejects.toThrow('Could not load levels [PGRST303]: JWT issued at future');
  });

  // A retry is only right for the skew. Repeating a query that was refused for
  // any other reason delays the error screen without changing it — and would
  // repeat a write-shaped failure nobody asked to repeat.
  it('does not retry a failure of any other kind', async () => {
    let attempts = 0;
    stub({
      levels: () => (
        attempts++, { data: null, error: { code: '42501', message: 'permission denied for table levels' } }
      ),
    });

    await expect(fetchLevels()).rejects.toThrow('permission denied');
    expect(attempts).toBe(1);
  });
});

describe('the dictionary map', () => {
  it('is keyed by the normalised term the reader computes', () => {
    const map = toDictionaryMap([
      { term: 'herausforderung', translation: 'challenge' },
      { term: 'gleichzeitig', translation: 'simultaneously' },
    ]);

    expect(map.get('herausforderung')).toBe('challenge');
    expect(map.get('gleichzeitig')).toBe('simultaneously');
  });

  // The keys are arbitrary German words. A plain object would answer these from
  // Object.prototype with a function, which the reader would show as though it
  // were a translation.
  it('holds no key it was not given', () => {
    const map = toDictionaryMap([{ term: 'herausforderung', translation: 'challenge' }]);

    expect(map.get('constructor')).toBeUndefined();
    expect(map.get('toString')).toBeUndefined();
    expect(map.get('valueOf')).toBeUndefined();
  });
});
