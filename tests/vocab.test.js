import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
}));

import { supabase } from '../src/lib/supabase';
import { fetchSavedWords, saveWord, deleteSavedWord } from '../src/lib/vocab';
import { stubSupabase } from './helpers/supabase';

const READER = 'reader-1';

let calls;

function stub(tables) {
  const stubbed = stubSupabase(tables);
  calls = stubbed.calls;
  supabase.from.mockImplementation(stubbed.from);
}

function signedIn(userId = READER) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null });
}

const sent = () => calls.insert[0][1];

// Ids that are not positions, so a mix-up between the two cannot render
// correctly by coincidence — the seeded posts are numbered 1..10 in both.
const stored = (over = {}) => ({
  id: 701,
  post_id: 41,
  post_label: 'Post 1: Der Alltag in Berlin',
  term: 'herausforderung',
  surface_form: 'Herausforderung',
  translation: 'challenge',
  ...over,
});

const tapped = (over = {}) => ({
  postId: 41,
  postLabel: 'Post 1: Der Alltag in Berlin',
  surfaceForm: 'Herausforderung',
  translation: 'challenge',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
});

describe('saving a word', () => {
  it('derives the lowercase key from the tapped form, and sends both', async () => {
    stub({ saved_words: { data: [stored()], error: null } });

    await saveWord(tapped());

    expect(sent().term).toBe('herausforderung');
    expect(sent().surface_form).toBe('Herausforderung');
    // The whole point of two columns. If these ever coincide the bank has lost
    // the capital the reader met, or the database has refused the row outright.
    expect(sent().term).not.toBe(sent().surface_form);
  });

  it('records the heading the post carried at the time', async () => {
    stub({ saved_words: { data: [stored()], error: null } });

    await saveWord(tapped());

    expect(sent().post_label).toBe('Post 1: Der Alltag in Berlin');
    expect(sent().post_id).toBe(41);
  });

  it('stores a missing translation as null, not as the dash the reader is shown', async () => {
    stub({ saved_words: { data: [stored({ translation: null })], error: null } });

    await saveWord(tapped({ translation: undefined }));

    // A stored '—' could not be told apart from a dictionary entry that really
    // does translate to a dash, and the column is nullable for that reason.
    expect(sent().translation).toBeNull();
  });

  it('returns the stored row, so the caller holds the id it will delete by', async () => {
    stub({ saved_words: { data: [stored()], error: null } });

    await expect(saveWord(tapped())).resolves.toMatchObject({ id: 701 });
  });

  it('throws rather than resolving when the insert is refused', async () => {
    stub({ saved_words: { data: null, error: { code: '23505', message: 'duplicate key' } } });

    await expect(saveWord(tapped())).rejects.toThrow(/23505/);
  });

  it('throws when there is no signed-in reader to attribute the row to', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    stub({ saved_words: { data: [stored()], error: null } });

    await expect(saveWord(tapped())).rejects.toThrow(/no signed-in reader/i);
  });
});

describe('removing a word', () => {
  it('aims at one row, by id', async () => {
    stub({ saved_words: { data: [{ id: 701 }], error: null } });

    await deleteSavedWord(701);

    expect(calls.delete).toContain('saved_words');
    expect(calls.eq).toContainEqual(['id', 701]);
  });

  it('throws when the delete removed nothing', async () => {
    // The case that makes .select() worth having. The saved_words delete policy
    // is a USING clause, so somebody else's row is filtered out rather than
    // rejected and the statement succeeds having done nothing — proven against
    // the live database in Stage B. Without this the bank would drop a row from
    // the screen that is still in the table, and a reload would bring it back.
    stub({ saved_words: { data: [], error: null } });

    await expect(deleteSavedWord(701)).rejects.toThrow(/nothing was removed/i);
  });

  it('resolves when a row actually came back', async () => {
    stub({ saved_words: { data: [{ id: 701 }], error: null } });

    await expect(deleteSavedWord(701)).resolves.toBeUndefined();
  });

  it('throws when the delete itself errored', async () => {
    stub({ saved_words: { data: null, error: { code: '42501', message: 'permission denied' } } });

    await expect(deleteSavedWord(701)).rejects.toThrow(/42501/);
  });
});

describe('reading the bank', () => {
  it('asks for the columns the bank renders, including both word forms', async () => {
    stub({ saved_words: { data: [], error: null } });

    await fetchSavedWords();

    const columns = calls.select[0];
    ['id', 'post_id', 'post_label', 'term', 'surface_form', 'translation'].forEach((c) =>
      expect(columns).toContain(c),
    );
  });

  it('asks for them oldest first, so the bank lists words in the order they were met', async () => {
    stub({ saved_words: { data: [], error: null } });

    await fetchSavedWords();

    expect(calls.order).toContain('created_at');
  });

  it('throws when the read fails, rather than reporting an empty bank', async () => {
    stub({ saved_words: { data: null, error: { code: '42501', message: 'permission denied' } } });

    await expect(fetchSavedWords()).rejects.toThrow(/42501/);
  });
});
