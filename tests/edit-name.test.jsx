import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const library = () => ({
  levels: [{ id: 1, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 1 }],
  postsByLevel: {
    1: [{ id: 41, level_id: 1, position: 1, slug: 'der-alltag', title: 'Der Alltag', blurb: 'Ein Morgen.', topic: 'Alltag', body: 'Erster Satz.' }],
  },
  dictionary: new Map(),
});

const READER = { id: 'reader-1', first_name: 'Anna', last_name: 'Schneider' };
const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

async function mountApp(updateImpl) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
  const updateProfileName = vi.fn(updateImpl ?? (({ firstName, lastName }) =>
    Promise.resolve({ id: 'reader-1', first_name: firstName.trim(), last_name: lastName.trim() || null })));

  vi.doMock('../src/lib/supabase', () => ({
    supabase: {
      auth: {
        onAuthStateChange: (callback) => {
          listeners.push(callback);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut: vi.fn().mockResolvedValue({ error: null }),
        // App asks whether the reader still exists whenever it learns of a
        // session, so an account deleted on another device cannot go on
        // showing a dashboard here. These tests are all about live readers,
        // so it answers yes; delete-account.test.jsx covers the other reply.
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      },
    },
  }));
  vi.doMock('../src/lib/content', () => ({ loadContent: () => Promise.resolve(library()) }));
  vi.doMock('../src/lib/progress', () => ({
    fetchProgress: () => Promise.resolve([]),
    recordFinish: vi.fn(() => Promise.resolve()),
  }));
  vi.doMock('../src/lib/vocab', () => ({
    fetchSavedWords: () => Promise.resolve([]),
    saveWord: vi.fn(() => Promise.resolve()),
    deleteSavedWord: vi.fn(() => Promise.resolve()),
  }));
  vi.doMock('../src/lib/profile', () => ({
    fetchProfile: () => Promise.resolve(READER),
    updateProfileName,
  }));

  const { default: App } = await import('../src/App.jsx');
  await act(async () => { render(<App />); });
  await act(async () => { listeners.forEach((cb) => cb('SIGNED_IN', session)); });

  return { updateProfileName };
}

// Opens the account menu and the dialog behind it.
async function openEditor(user) {
  await user.click(screen.getByRole('button', { name: 'A' }));
  await user.click(screen.getByRole('button', { name: 'Edit your name' }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('editing your name', () => {
  it('opens with the name the reader already has', async () => {
    await mountApp();
    const user = userEvent.setup();

    await openEditor(user);

    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.getByLabelText(/Last name/)).toHaveValue('Schneider');
  });

  // The greeting is the confirmation: there is no success message because the
  // change is already visible behind the dialog that just closed.
  it('changes the greeting straight away, with no reload and no refetch', async () => {
    await mountApp();
    const user = userEvent.setup();
    expect(screen.getByText('Grüß Gott, Anna.')).toBeInTheDocument();

    await openEditor(user);
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(screen.getByText('Grüß Gott, Shojib.')).toBeInTheDocument();
    expect(screen.queryByText('Grüß Gott, Anna.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument();
  });

  it('changes the avatar initial with it', async () => {
    await mountApp();
    const user = userEvent.setup();

    await openEditor(user);
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument();
  });

  // Clearing a surname is legitimate — every reader whose name came from their
  // email address has none — and it must leave the greeting working.
  it('lets the reader clear their surname', async () => {
    const { updateProfileName } = await mountApp();
    const user = userEvent.setup();

    await openEditor(user);
    await user.clear(screen.getByLabelText(/Last name/));
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(updateProfileName).toHaveBeenCalledWith({ firstName: 'Anna', lastName: '' });
    expect(screen.getByText('Grüß Gott, Anna.')).toBeInTheDocument();
  });

  // The dialog must not close on a failure. A closed dialog and an unchanged
  // greeting is indistinguishable from a save that silently did nothing.
  it('stays open and says so when the save fails, keeping the old name', async () => {
    await mountApp(() => Promise.reject(new Error('Could not save your name: nothing was updated.')));
    const user = userEvent.setup();

    await openEditor(user);
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeInTheDocument();
    expect(screen.getByText('Grüß Gott, Anna.')).toBeInTheDocument();
    expect(screen.queryByText('Grüß Gott, Shojib.')).not.toBeInTheDocument();
  });

  it('succeeds on a retry after the failure clears', async () => {
    let fail = true;
    await mountApp(({ firstName, lastName }) =>
      fail
        ? Promise.reject(new Error('Could not save your name: nothing was updated.'))
        : Promise.resolve({ id: 'reader-1', first_name: firstName.trim(), last_name: lastName.trim() || null }));
    const user = userEvent.setup();

    await openEditor(user);
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(screen.getByText('Grüß Gott, Shojib.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the name alone when the reader cancels', async () => {
    const { updateProfileName } = await mountApp();
    const user = userEvent.setup();

    await openEditor(user);
    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateProfileName).not.toHaveBeenCalled();
    expect(screen.getByText('Grüß Gott, Anna.')).toBeInTheDocument();
  });
});
