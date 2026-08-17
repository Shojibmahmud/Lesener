import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// App is imported afresh for every case. src/lib/recovery.js reads the URL
// fragment once, at import time, and whether the page began on a recovery link
// is precisely what these cases vary — so the hash has to be in place before
// the module graph is evaluated.
// A library shaped like the real one. It has to hold at least one level with at
// least one post: the dashboard now renders from these, so an empty stand-in
// would exercise the "nothing to read" path rather than the ordinary one.
const library = () => ({
  levels: [{ id: 1, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 2 }],
  postsByLevel: {
    1: [
      { id: 41, level_id: 1, position: 1, slug: 'der-alltag', title: 'Der Alltag', blurb: 'Ein Morgen.', topic: 'Alltag', body: 'Erster Satz.' },
      { id: 42, level_id: 1, position: 2, slug: 'die-suche', title: 'Die Suche', blurb: 'Eine Wohnung.', topic: 'Wohnen', body: 'Zweiter Satz.' },
    ],
  },
  dictionary: new Map([['alltag', 'everyday life']]),
});

// A level that hands over no posts while still recording that it holds ten —
// what the reader sees when the posts exist but are unpublished. The mismatch is
// the whole point: post_count is deliberately non-zero, so any figure derived
// from it that survives onto the screen is describing a library that is not
// there. Cases below assert that none of them do.
const emptyLevel = () => ({
  levels: [{ id: 1, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 10 }],
  postsByLevel: { 1: [] },
  dictionary: new Map([['alltag', 'everyday life']]),
});

async function mountApp(hash = '', loadContentImpl) {
  vi.resetModules();
  window.location.hash = hash;

  const listeners = [];
  const loadContent = vi.fn(loadContentImpl ?? (() => Promise.resolve(library())));

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

  // The gap this covers did not exist before: the compiled-in copy was on
  // screen the moment the dashboard rendered. Now there is a wait, and a reader
  // is told about it rather than shown a dashboard with no posts on it.
  it('says the library is loading before showing the dashboard', async () => {
    let release;
    const { emit } = await mountApp('', () => new Promise((resolve) => { release = resolve; }));

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/loading your library/i)).toBeInTheDocument();
    expect(screen.queryByText(/Guten Tag/)).not.toBeInTheDocument();

    await act(async () => {
      release(library());
    });

    expect(screen.getByText(/Guten Tag/)).toBeInTheDocument();
    expect(screen.queryByText(/loading your library/i)).not.toBeInTheDocument();
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

describe('when the level holds no posts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('says so, rather than showing an empty grid', async () => {
    const { emit } = await mountApp('', () => Promise.resolve(emptyLevel()));

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/no posts in this level yet/i)).toBeInTheDocument();
  });

  // The half that was actually wrong. An empty grid is unhelpful; a grid with
  // nothing in it under a header promising ten posts is a false statement, and
  // the reader has no way to tell it is the content that is missing.
  it('makes no claim about a post count it cannot show', async () => {
    const { emit } = await mountApp('', () => Promise.resolve(emptyLevel()));

    await emit('SIGNED_IN', session);

    expect(screen.queryByText(/posts completed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlocks when all/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/of 10/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/to Level 2/)).not.toBeInTheDocument();
  });

  it('still names the level, so the reader knows which one is empty', async () => {
    const { emit } = await mountApp('', () => Promise.resolve(emptyLevel()));

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/B1 Foundation/)).toBeInTheDocument();
  });

  // Not a full-screen takeover. Reusing the failure shell here would strand a
  // reader with no way to reach their saved words or sign out.
  it('leaves the rest of the dashboard reachable', async () => {
    const { emit } = await mountApp('', () => Promise.resolve(emptyLevel()));

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/Guten Tag/)).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('is not treated as a failure, and offers nothing to retry', async () => {
    const { emit } = await mountApp('', () => Promise.resolve(emptyLevel()));

    await emit('SIGNED_IN', session);

    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load your library/i)).not.toBeInTheDocument();
  });

  // A library that has not arrived is also one with no posts in it. The two mean
  // opposite things and must never look alike, so the empty message has to wait
  // for the fetch to actually settle.
  it('shows nothing of itself while the library is still arriving', async () => {
    let release;
    const { emit } = await mountApp('', () => new Promise((resolve) => { release = resolve; }));

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/loading your library/i)).toBeInTheDocument();
    expect(screen.queryByText(/no posts in this level yet/i)).not.toBeInTheDocument();

    await act(async () => {
      release(emptyLevel());
    });

    expect(screen.getByText(/no posts in this level yet/i)).toBeInTheDocument();
  });
});

describe('when the library cannot be obtained', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  const refuse = () =>
    Promise.reject(new Error('Could not load levels [42501]: permission denied for table levels'));

  // The dashboard used to render regardless, because it drew the compiled-in
  // copy and never needed the request to succeed. Now that it renders the
  // database's copy there is nothing to fall back to, so the failure has to be
  // said out loud rather than swallowed.
  it('tells the reader, rather than showing an empty dashboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emit } = await mountApp('', refuse);

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/couldn’t load your library/i)).toBeInTheDocument();
    expect(screen.queryByText(/Guten Tag/)).not.toBeInTheDocument();
  });

  // Generic by decision: a reader can do nothing differently whether the cause
  // was being offline or the database refusing, and naming the wrong one reads
  // worse than naming neither.
  it('keeps the message generic', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { emit } = await mountApp('', refuse);

    await emit('SIGNED_IN', session);

    expect(screen.queryByText(/permission denied/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/42501/)).not.toBeInTheDocument();
  });

  // Retry has to move something the fetch effect depends on. Neither the user
  // nor the recovery flag changes when it is pressed, so without a counter of
  // its own the button would look alive and do nothing.
  it('asks again when the reader presses Retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loadContent = vi
      .fn()
      .mockImplementationOnce(refuse)
      .mockImplementation(() => Promise.resolve(library()));
    const { emit } = await mountApp('', loadContent);

    await emit('SIGNED_IN', session);
    expect(screen.getByText(/couldn’t load your library/i)).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: /try again/i }).click();
    });

    expect(loadContent).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Guten Tag/)).toBeInTheDocument();
  });

  // A library that arrives holding no levels is a successful request that
  // returned nothing to read. The dashboard has no level to name and no count
  // to render, so it must not be shown.
  it('treats a library with no levels as a failure', async () => {
    const { emit } = await mountApp('', () =>
      Promise.resolve({ levels: [], postsByLevel: {}, dictionary: new Map() }),
    );

    await emit('SIGNED_IN', session);

    expect(screen.getByText(/couldn’t load your library/i)).toBeInTheDocument();
  });

  // Saying nothing on screen is not the same as saying nothing at all — the
  // cause still has to reach whoever is debugging it.
  it('reports the cause where the maintainer will see it', async () => {
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

  // Nothing was ever requested for them, so there is nothing to wait for. The
  // loading screen is gated on the same flag as the fetch precisely so it does
  // not appear over the reset screen and strand somebody mid-recovery.
  it('shows no loading indication over the reset screen', async () => {
    const { emit } = await mountApp(recoveryHash);

    await emit('PASSWORD_RECOVERY', session);

    expect(screen.queryByText(/loading your library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load your library/i)).not.toBeInTheDocument();
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
