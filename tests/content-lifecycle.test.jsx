import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// App is imported afresh for every case. src/lib/recovery.js reads the URL
// fragment once, at import time, and whether the page began on a recovery link
// is precisely what these cases vary — so the hash has to be in place before
// the module graph is evaluated.
async function mountApp(hash = '', loadContentImpl) {
  vi.resetModules();
  window.location.hash = hash;

  const listeners = [];
  const loadContent = vi.fn(
    loadContentImpl ??
      (() => Promise.resolve({ levels: [], postsByLevel: {}, dictionary: new Map() })),
  );

  vi.doMock('../src/lib/supabase', () => ({
    supabase: {
      auth: {
        onAuthStateChange: (callback) => {
          listeners.push(callback);
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  }));

  vi.doMock('../src/lib/content', () => ({ loadContent }));

  const { default: App } = await import('../src/App.jsx');

  await act(async () => {
    render(<App />);
  });

  // The listener is the only way in: every screen App shows is downstream of an
  // auth event, so driving one is how a case says "somebody signed in".
  async function emit(event, session) {
    await act(async () => {
      listeners.forEach((callback) => callback(event, session));
    });
  }

  return { emit, loadContent };
}

const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

describe('when a reader signs in', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('asks the database for the library', async () => {
    const { emit, loadContent } = await mountApp();

    await emit('SIGNED_IN', session);

    expect(loadContent).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing at all while nobody is signed in', async () => {
    const { emit, loadContent } = await mountApp();

    await emit('INITIAL_SESSION', null);

    expect(loadContent).not.toHaveBeenCalled();
  });

  // SIGNED_IN re-fires every time the tab regains focus, handing back an
  // equal-but-fresh user object. Keying the effect on the id rather than the
  // object is what stops that from refetching the whole library on every focus.
  it('does not refetch when the same session is announced again', async () => {
    const { emit, loadContent } = await mountApp();

    await emit('SIGNED_IN', session);
    await emit('SIGNED_IN', { user: { ...session.user } });

    expect(loadContent).toHaveBeenCalledTimes(1);
  });

  it('fetches again after signing out and back in', async () => {
    const { emit, loadContent } = await mountApp();

    await emit('SIGNED_IN', session);
    await emit('SIGNED_OUT', null);
    await emit('SIGNED_IN', session);

    expect(loadContent).toHaveBeenCalledTimes(2);
  });
});

describe('when the library cannot be obtained', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  const refuse = () =>
    Promise.reject(new Error('Could not load levels [42501]: permission denied for table levels'));

  // Acceptance criterion 7. The compiled-in copy is what every screen renders,
  // so a failed request must cost a reader nothing at all — least of all the
  // whole app.
  it('leaves the app running and on a real screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emit } = await mountApp('', refuse);

    await emit('SIGNED_IN', session);

    // The dashboard, not a blank page: the reader is where they should be and
    // the failure is invisible to them, which is the intended behaviour until
    // the loading and error screens are designed.
    expect(screen.getByText(/Guten Tag/)).toBeInTheDocument();
  });

  // Acceptance criterion 8. Invisible to a reader is not the same as invisible
  // to the maintainer — nothing on screen says anything is wrong, so this is
  // the only place the failure surfaces at all.
  it('reports the failure where the maintainer will see it', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emit } = await mountApp('', refuse);

    await emit('SIGNED_IN', session);

    expect(reported).toHaveBeenCalled();
    const [message, error] = reported.mock.calls[0];
    expect(message).toMatch(/content could not be loaded/i);
    expect(error.message).toMatch(/permission denied/);
  });

  it('recovers on the next sign-in rather than staying broken', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emit, loadContent } = await mountApp('', refuse);

    await emit('SIGNED_IN', session);
    await emit('SIGNED_OUT', null);
    await emit('SIGNED_IN', session);

    expect(loadContent).toHaveBeenCalledTimes(2);
  });
});

describe('when the page was opened from a recovery link', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  const recoveryHash = '#access_token=a-token&refresh_token=r-token&type=recovery';

  // A recovery link carries a real session, and the session lands before
  // PASSWORD_RECOVERY does. Without seeding the hold from the URL itself, the
  // whole library would already be on its way to somebody who will only ever
  // see the reset screen.
  it('fetches nothing, even though the session is genuine', async () => {
    const { emit, loadContent } = await mountApp(recoveryHash);

    await emit('INITIAL_SESSION', session);
    await emit('PASSWORD_RECOVERY', session);

    expect(loadContent).not.toHaveBeenCalled();
  });

  // Completing a reset signs out everywhere, which is what ends the recovery.
  // Signing in afterwards is an ordinary session and must behave like one.
  it('fetches once the reset is finished and the reader signs in again', async () => {
    const { emit, loadContent } = await mountApp(recoveryHash);

    await emit('PASSWORD_RECOVERY', session);
    await emit('SIGNED_OUT', null);
    await emit('SIGNED_IN', session);

    expect(loadContent).toHaveBeenCalledTimes(1);
  });
});
