import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { THEME_KEY } from '../src/utils';

const library = () => ({
  levels: [{ id: 1, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 1 }],
  postsByLevel: {
    1: [{ id: 41, level_id: 1, position: 1, slug: 'der-alltag', title: 'Der Alltag', blurb: 'Ein Morgen.', topic: 'Alltag', body: 'Erster Satz.' }],
  },
  dictionary: new Map(),
});

const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

// The toggle is found by its glyph rather than by an accessible name, because it
// has none: spec 12 rules that gap out of scope and files it with the app's three
// modals, which share it. So these queries assert on a decoration. If they ever
// fail, check whether somebody changed the icon before assuming the toggle broke.
const MOON = '☾'; // shown while light — pressing it goes dark
const SUN = '☀'; // shown while dark — pressing it goes light

const attribute = () => document.documentElement.getAttribute('data-theme');
const stored = () => window.localStorage.getItem(THEME_KEY);

// `profileTheme` is what the account remembers; null is what every account in the
// live database holds today, and is therefore the default here too. Mounting
// signed out still fires INITIAL_SESSION, because that is what supabase-js does
// on subscribe and it is what tells App the auth state is known -- without it the
// app renders nothing and no screen has a toggle on it.
async function mountApp({ profileTheme = null, event = 'SIGNED_IN', signedIn = true, themeWriteFails = false } = {}) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
  const updateProfileTheme = vi.fn(() =>
    themeWriteFails ? Promise.reject(new Error('offline')) : Promise.resolve(),
  );
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn(() => Promise.resolve({ data: { user: { id: 'reader-1' } }, error: null }));

  const profileRow = { id: 'reader-1', first_name: 'Anna', last_name: 'Schneider', theme: profileTheme };

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
    fetchProfile: () => Promise.resolve(profileRow),
    updateProfileName: vi.fn(),
    updateProfileTheme,
  }));
  vi.doMock('../src/lib/account', () => ({ deleteAccount: vi.fn() }));

  const { default: App } = await import('../src/App.jsx');
  await act(async () => { render(<App />); });

  const fire = async (name, payload) => {
    await act(async () => { listeners.forEach((cb) => cb(name, payload)); });
  };

  await fire(...(signedIn ? [event, session] : ['INITIAL_SESSION', null]));

  return { updateProfileTheme, signOut, listeners, signIn: () => fire('SIGNED_IN', session) };
}

const press = async (user, glyph) => user.click(screen.getByText(glyph));

beforeEach(() => {
  vi.restoreAllMocks();
  // cleanup() unmounts React trees. It does not reset the window, and data-theme
  // is written imperatively onto <html>, outside React entirely — so both survive
  // every unmount and leak into the next test in this file. Cleared here rather
  // than in tests/setup.js, where a global clear would silently change what the
  // other twenty-one files run under for the benefit of this one.
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('choosing a theme', () => {
  it('changes the theme and remembers it on this device', async () => {
    const user = userEvent.setup();
    await mountApp({ signedIn: false });

    await press(user, MOON);

    expect(attribute()).toBe('dark');
    expect(stored()).toBe('dark');

    // The glyph shows the destination rather than the current state, so it has
    // flipped -- and pressing it again is what proves the toggle goes both ways
    // rather than only latching on.
    await press(user, SUN);

    expect(attribute()).toBe('light');
    expect(stored()).toBe('light');
  });

  it('tells the account when a signed-in reader chooses', async () => {
    const user = userEvent.setup();
    const { updateProfileTheme } = await mountApp({ profileTheme: 'light' });

    await press(user, MOON);

    expect(attribute()).toBe('dark');
    expect(updateProfileTheme).toHaveBeenCalledWith('dark');
  });

  it('tells nobody when a signed-out visitor chooses', async () => {
    const user = userEvent.setup();
    const { updateProfileTheme } = await mountApp({ signedIn: false });

    await press(user, MOON);

    expect(attribute()).toBe('dark');
    expect(updateProfileTheme).not.toHaveBeenCalled();
  });

  // A recovery session carries a real user id, and the reset screen has a toggle
  // of its own — but no profile has been loaded for it, and everywhere else in the
  // app a recovery session is deliberately not an ordinary one.
  it('tells nobody when the reader is part-way through a password reset', async () => {
    const user = userEvent.setup();
    const { updateProfileTheme } = await mountApp({ event: 'PASSWORD_RECOVERY' });

    await press(user, MOON);

    expect(attribute()).toBe('dark');
    expect(updateProfileTheme).not.toHaveBeenCalled();
  });
});

describe('signing in', () => {
  it('takes the theme the account remembers', async () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { updateProfileTheme } = await mountApp({ profileTheme: 'dark' });

    expect(attribute()).toBe('dark');
    expect(stored()).toBe('dark');
    expect(updateProfileTheme).not.toHaveBeenCalled();
  });

  it('takes a remembered light theme over a dark device', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { updateProfileTheme } = await mountApp({ profileTheme: 'light' });

    expect(attribute()).toBe('light');
    expect(updateProfileTheme).not.toHaveBeenCalled();
  });

  it('writes nothing back when the two already agree', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { updateProfileTheme } = await mountApp({ profileTheme: 'dark' });

    expect(attribute()).toBe('dark');
    expect(updateProfileTheme).not.toHaveBeenCalled();
  });

  // The adopt path, which every account in the live database takes on its first
  // sign-in. Nothing changes on screen; the row is the only evidence it ran.
  it('adopts the device’s theme when the account has never had one', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { updateProfileTheme } = await mountApp({ profileTheme: null });

    expect(attribute()).toBe('dark');
    expect(updateProfileTheme).toHaveBeenCalledWith('dark');
  });

  it('adopts a light device just the same', async () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { updateProfileTheme } = await mountApp({ profileTheme: null });

    expect(attribute()).toBe('light');
    expect(updateProfileTheme).toHaveBeenCalledWith('light');
  });

  // Reads the device's theme as it stands when the profile lands, not as it stood
  // when the component first rendered. reconcileTheme is a useCallback keyed on
  // applyTheme alone, so it is NOT rebuilt when `theme` changes: swap
  // themeRef.current for `theme` inside it and the closure keeps handing back
  // 'light' from the first render, and this reader has dark written over with
  // light on the account they just signed in to.
  //
  // This is the only test in the file that notices, and nothing lints for it —
  // .oxlintrc.json carries no exhaustive-deps rule.
  it('adopts the theme the reader chose before they signed in', async () => {
    const user = userEvent.setup();
    const { updateProfileTheme, signIn } = await mountApp({ profileTheme: null, signedIn: false });

    await press(user, MOON);
    expect(updateProfileTheme).not.toHaveBeenCalled();

    await signIn();

    expect(updateProfileTheme).toHaveBeenCalledWith('dark');
    expect(updateProfileTheme).not.toHaveBeenCalledWith('light');
  });
});

describe('when the account cannot be told', () => {
  // Asserting on console.error rather than trusting an unhandled rejection to
  // fail the run. Measured 2026-08-22: dropping the .catch() here produces no
  // reported error and vitest still exits 0, so the rejection alone guards
  // nothing. What the handler DOES is the only thing worth pinning — and the
  // reader must not be told, so the console line is the whole of the report.
  it('keeps the theme the reader chose, tells them nothing, and logs it', async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { updateProfileTheme } = await mountApp({ profileTheme: 'light' });
    updateProfileTheme.mockRejectedValueOnce(new Error('offline'));

    await act(async () => { await press(user, MOON); });

    expect(attribute()).toBe('dark');
    expect(stored()).toBe('dark');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('[lesener] theme could not be saved'),
      expect.any(Error),
    );
  });

  // The second fire-and-forget call site. A failure here must not reach the
  // profile effect's own .catch, which would put the reader on the
  // "content could not be loaded" screen because their theme did not save.
  it('still shows the dashboard when the adopting write fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.setItem(THEME_KEY, 'dark');

    const { updateProfileTheme } = await mountApp({ profileTheme: null, themeWriteFails: true });

    expect(updateProfileTheme).toHaveBeenCalledWith('dark');
    expect(attribute()).toBe('dark');
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('[lesener] theme could not be saved'),
      expect.any(Error),
    );
  });
});

describe('signing out', () => {
  // This test's whole job is to stop somebody adding a theme reset to the
  // SIGNED_OUT branch while tidying it. localStorage is the device's store, and
  // the reader is looking at the same screen through the same eyes.
  it('leaves the theme exactly as it was', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { listeners } = await mountApp({ profileTheme: 'dark' });

    await act(async () => { listeners.forEach((cb) => cb('SIGNED_OUT', null)); });

    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
    expect(attribute()).toBe('dark');
    expect(stored()).toBe('dark');
  });
});
