import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
}));

import { supabase } from '../src/lib/supabase';
import { fetchProfile, updateProfileName } from '../src/lib/profile';
import { stubSupabase } from './helpers/supabase';

let calls;

function stub(tables) {
  const stubbed = stubSupabase(tables);
  calls = stubbed.calls;
  supabase.from.mockImplementation(stubbed.from);
}

const ROW = { id: 'reader-1', first_name: 'Shojib', last_name: 'Mahmud' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchProfile', () => {
  it('asks for the columns the dashboard renders', async () => {
    stub({ profiles: { data: [ROW], error: null } });

    await fetchProfile();

    expect(calls.from).toEqual(['profiles']);
    expect(calls.select[0]).toBe('id, first_name, last_name');
  });

  // RLS scopes the row to the signed-in reader, so the query filters by nothing.
  // A filter here would be the client asking permission it already has — and it
  // would hide a policy that had stopped working.
  it('filters by nothing, leaving the row to the database', async () => {
    stub({ profiles: { data: [ROW], error: null } });

    await fetchProfile();

    expect(calls.eq).toEqual([]);
  });

  it('hands back the row', async () => {
    stub({ profiles: { data: [ROW], error: null } });

    await expect(fetchProfile()).resolves.toEqual(ROW);
  });

  // Null is not a failure. It is what a reader whose trigger somehow did not
  // fire would get, and the dashboard has a nameless greeting ready for it.
  it('returns null rather than throwing when there is no row', async () => {
    stub({ profiles: { data: [], error: null } });

    await expect(fetchProfile()).resolves.toBeNull();
  });

  it('throws when the query fails, naming what could not be loaded', async () => {
    stub({ profiles: { data: null, error: { code: '42501', message: 'permission denied' } } });

    await expect(fetchProfile()).rejects.toThrow(/your profile.*42501/s);
  });
});

function signedIn(userId = 'reader-1') {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: userId } } },
    error: null,
  });
}

const sent = () => calls.update[0][1];

describe('updateProfileName', () => {
  it('sends both names, trimmed, at the reader’s own row', async () => {
    signedIn();
    stub({ profiles: { data: [ROW], error: null } });

    await updateProfileName({ firstName: '  Shojib  ', lastName: '  Mahmud  ' });

    expect(calls.update[0][0]).toBe('profiles');
    expect(sent()).toEqual({ first_name: 'Shojib', last_name: 'Mahmud' });
    expect(calls.eq).toEqual([['id', 'reader-1']]);
  });

  it('hands back the stored row', async () => {
    signedIn();
    stub({ profiles: { data: [ROW], error: null } });

    await expect(updateProfileName({ firstName: 'Shojib', lastName: 'Mahmud' })).resolves.toEqual(ROW);
  });

  // The two fields are not alike. An email address carries no surname, so every
  // backfilled reader already has none and the dashboard renders that without
  // comment — clearing it is a legitimate thing to want.
  it('stores a cleared surname as null, never as an empty string', async () => {
    signedIn();
    stub({ profiles: { data: [{ ...ROW, last_name: null }], error: null } });

    await updateProfileName({ firstName: 'Shojib', lastName: '   ' });

    expect(sent()).toEqual({ first_name: 'Shojib', last_name: null });
  });

  // Clearing a first name is not. The nameless greeting is a guard against a
  // null that should be unreachable; letting a reader choose it would turn that
  // guard into a feature and leave them looking at a dashboard greeting nobody.
  // The column is nullable, so the database would accept this — refusing it is
  // the one rule in the feature the schema cannot enforce.
  it('refuses a blank first name without asking the database', async () => {
    signedIn();
    stub({ profiles: { data: [ROW], error: null } });

    await expect(updateProfileName({ firstName: '   ', lastName: 'Mahmud' })).rejects.toThrow(
      /first name cannot be empty/i,
    );
    expect(calls.update).toEqual([]);
    expect(calls.from).toEqual([]);
  });

  it('refuses a missing first name the same way', async () => {
    signedIn();
    stub({ profiles: { data: [ROW], error: null } });

    await expect(updateProfileName({ lastName: 'Mahmud' })).rejects.toThrow(/cannot be empty/i);
    expect(calls.update).toEqual([]);
  });

  // profiles_update_own filters rather than raises, so an update that changed
  // nothing resolves without an error. Counting what came back is the only way
  // to tell "saved" from "silently ignored".
  it('throws when the update changed nothing', async () => {
    signedIn();
    stub({ profiles: { data: [], error: null } });

    await expect(updateProfileName({ firstName: 'Shojib', lastName: 'Mahmud' })).rejects.toThrow(
      /nothing was updated/i,
    );
  });

  it('throws with the database’s code when the update fails', async () => {
    signedIn();
    stub({ profiles: { data: null, error: { code: '23514', message: 'violates check constraint' } } });

    await expect(updateProfileName({ firstName: 'Shojib', lastName: 'Mahmud' })).rejects.toThrow(
      /Could not save your name \[23514\]/,
    );
  });

  it('refuses to write when nobody is signed in', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    stub({ profiles: { data: [ROW], error: null } });

    await expect(updateProfileName({ firstName: 'Shojib', lastName: 'Mahmud' })).rejects.toThrow(
      /no signed-in reader/,
    );
    expect(calls.update).toEqual([]);
  });
});
