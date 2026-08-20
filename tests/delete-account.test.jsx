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

// `getUserImpl` is how a test plays the other device: the default says the
// reader is alive, and a 403 is what the auth server actually answers for an
// account deleted somewhere else (measured 2026-08-20).
async function mountApp({ deleteImpl, getUserImpl, event = 'SIGNED_IN' } = {}) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
  const deleteAccount = vi.fn(deleteImpl ?? (() => Promise.resolve()));
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn(getUserImpl ?? (() => Promise.resolve({ data: { user: { id: 'reader-1' } }, error: null })));

  vi.doMock('../src/lib/supabase', () => ({
    supabase: {
      auth: {
        onAuthStateChange: (callback) => {
          listeners.push(callback);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut,
        getUser,
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
    updateProfileName: vi.fn(),
  }));
  vi.doMock('../src/lib/account', () => ({ deleteAccount }));

  const { default: App } = await import('../src/App.jsx');
  await act(async () => { render(<App />); });
  await act(async () => { listeners.forEach((cb) => cb(event, session)); });

  return { deleteAccount, signOut, getUser, listeners };
}

async function openDeleteModal(user) {
  await user.click(screen.getByRole('button', { name: 'A' }));
  await user.click(screen.getByRole('button', { name: 'Delete account' }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('deleting your account', () => {
  it('asks for a password before anything can be erased', async () => {
    const { deleteAccount } = await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);

    expect(screen.getByLabelText('Confirm your password')).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  // The sentence this feature exists to make true. It has always said the
  // account is purged; until now the button only signed out.
  it('still shows the warning it has always shown', async () => {
    await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);

    expect(
      screen.getByText(/purges your profile, saved words and reading progress/),
    ).toBeInTheDocument();
  });

  it('sends the password the reader typed', async () => {
    const { deleteAccount } = await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(deleteAccount).toHaveBeenCalledWith('hunter2');
  });

  // The one irreversible thing in the app must not also be the one thing that
  // happens silently: being dropped on the landing page with nothing said is
  // indistinguishable from having been logged out by a bug.
  it('tells the reader it is done before the screen changes', async () => {
    const { signOut } = await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(screen.getByText('Your account is gone')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out locally only once the note has been read', async () => {
    const { signOut } = await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    await user.click(screen.getByRole('button', { name: 'Goodbye' }));

    // 'local', because the account is already gone: a bare signOut() would post
    // to /logout with a token naming a user who no longer exists.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not argue with a reader who has chosen to leave', async () => {
    await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(screen.queryByRole('button', { name: /keep|cancel|stay|instead/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/why|reconsider|are you sure/i)).not.toBeInTheDocument();
  });

  it('keeps the modal open and the account intact when the password is wrong', async () => {
    const { signOut } = await mountApp({
      deleteImpl: () => Promise.reject(new Error('That is not your password.')),
    });
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That is not your password.');
    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeInTheDocument();
    expect(screen.queryByText('Your account is gone')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  // Spec criterion 2. The limit was measured and does not exist through the
  // Edge Function, so the app must not imply one.
  it('says nothing about attempts being limited', async () => {
    await mountApp({ deleteImpl: () => Promise.reject(new Error('That is not your password.')) });
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    await screen.findByRole('alert');
    expect(screen.queryByText(/attempts|tries|locked|wait a few minutes/i)).not.toBeInTheDocument();
  });

  it('lets a wrong password be retried in place', async () => {
    const deleteImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('That is not your password.'))
      .mockResolvedValueOnce(undefined);
    const { deleteAccount } = await mountApp({ deleteImpl });
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    await screen.findByRole('alert');

    await user.clear(screen.getByLabelText('Confirm your password'));
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(screen.getByText('Your account is gone')).toBeInTheDocument();
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });

  it('leaves the account alone when the reader keeps it', async () => {
    const { deleteAccount } = await mountApp();
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.click(screen.getByRole('button', { name: 'Keep my account' }));

    expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  // Dismissing mid-request would leave the reader watching the dashboard while
  // their account was being erased behind it.
  it('cannot be dismissed or resubmitted while it is working', async () => {
    let release;
    const { deleteAccount } = await mountApp({
      deleteImpl: () => new Promise((resolve) => { release = resolve; }),
    });
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep my account' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Deleting…' }));
    expect(deleteAccount).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
  });

  // The backdrop is a div, and `disabled` does nothing to one, so it is guarded
  // by an explicit check instead. That makes it the half of this rule a
  // disabled-attribute assertion cannot reach: clicking outside the card while
  // the delete is in flight would otherwise close the modal and leave the
  // reader watching the dashboard while their account was erased behind it.
  it('ignores a click outside the card while it is working', async () => {
    let release;
    await mountApp({ deleteImpl: () => new Promise((resolve) => { release = resolve; }) });
    const user = userEvent.setup();

    await openDeleteModal(user);
    await user.type(screen.getByLabelText('Confirm your password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));

    // The heading's grandparent is the backdrop; the card sits between them.
    const backdrop = screen.getByRole('heading', { name: 'Delete your account?' })
      .parentElement.parentElement;
    await user.click(backdrop);

    expect(screen.getByRole('heading', { name: 'Delete your account?' })).toBeInTheDocument();

    await act(async () => { release(); });
  });
});

describe('an account deleted on another device', () => {
  // Measured 2026-08-20: PostgREST goes on serving a token whose account has
  // been deleted, so without this check the other device renders a working,
  // nameless, empty dashboard rather than sitting harmlessly on a stale one.
  it('signs this device out when the reader no longer exists', async () => {
    const { signOut } = await mountApp({
      getUserImpl: () =>
        Promise.resolve({
          data: { user: null },
          error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
        }),
    });

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('leaves a live reader signed in', async () => {
    const { signOut } = await mountApp();

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/Grüß Gott/)).toBeInTheDocument();
  });

  // A reader in a tunnel must not be logged out by it. Only an answer from the
  // server counts, which is why the check tests the status and not merely that
  // an error came back.
  it('does not sign anybody out because the network failed', async () => {
    const { signOut } = await mountApp({
      getUserImpl: () =>
        Promise.resolve({ data: { user: null }, error: { message: 'Failed to fetch' } }),
    });

    expect(signOut).not.toHaveBeenCalled();
  });

  // The harder half of the same rule. supabase-js usually reports a failure as
  // `error`, but it throws when fetch itself throws, and a throw took a
  // different path through the code: without a .catch() the rejection escaped
  // as an unhandled promise and printed a red error in the console during
  // precisely the situation the check exists to survive quietly. Measured at
  // one unhandled rejection per dropped request before the fix.
  it('survives a getUser that throws rather than reporting', async () => {
    const { signOut } = await mountApp({
      getUserImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/Grüß Gott/)).toBeInTheDocument();
  });

  // A reload does not raise SIGNED_IN -- supabase-js announces a restored
  // session as INITIAL_SESSION. Without this case the check could be narrowed
  // to SIGNED_IN alone and nothing would go red, while the commonest way to
  // come back to an abandoned tab stopped being covered.
  it('signs out a reloaded tab whose account is gone', async () => {
    const { signOut } = await mountApp({
      event: 'INITIAL_SESSION',
      getUserImpl: () =>
        Promise.resolve({
          data: { user: null },
          error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
        }),
    });

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  // A tab left open is the whole scenario, and it is caught by the re-fire
  // rather than by the first sign-in. Replaying the event is how the suite
  // reaches it: supabase-js raises SIGNED_IN again on focus, which the listener
  // in App.jsx already relies on for its screen-restoring branch.
  it('catches an account deleted after this tab was already open', async () => {
    const dead = {
      data: { user: null },
      error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' },
    };
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: { id: 'reader-1' } }, error: null })
      .mockResolvedValue(dead);

    const { signOut, listeners } = await mountApp({ getUserImpl: getUser });

    // Alive on arrival: the dashboard is showing and nobody has been ejected.
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/Grüß Gott/)).toBeInTheDocument();

    // The reader deletes the account elsewhere, then returns to this tab.
    await act(async () => { listeners.forEach((cb) => cb('SIGNED_IN', session)); });

    expect(getUser.mock.calls.length).toBeGreaterThan(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
