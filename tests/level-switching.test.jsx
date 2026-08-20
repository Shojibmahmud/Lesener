import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import Dashboard from '../src/components/Dashboard';

// Ids that are not positions, throughout. In the seeded library every id equals
// its position, so a switcher keyed by the wrong one works perfectly against
// real data and only fails once a level is added.
const lvl = (id, position, name, post_count) => ({ id, position, name, cefr: 'B1', slug: 's' + id, post_count });
const one = lvl(7, 1, 'B1 Foundation', 2);
const two = lvl(9, 2, 'B1 Momentum', 2);

const post = (id, position, title) => ({
  id, level_id: 7, position, slug: 's' + id, title, blurb: 'Blurb.', topic: 'Alltag',
  body: 'Satz.', published_at: '2026-08-01T00:00:00Z',
});

const levelOnePosts = [post(101, 1, 'Der Alltag'), post(102, 2, 'Die Suche')];

const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

// The signed-in reader's profile. A name has to be present for the dashboard
// greeting to carry one, and every one of these tests goes through it.
const READER = { id: 'reader-1', first_name: 'Anna', last_name: 'Schneider' };

async function mountApp({ levels = [one, two], postsByLevel = { 7: levelOnePosts, 9: [] }, completed = [], profile = READER } = {}) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
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
  vi.doMock('../src/lib/content', () => ({
    loadContent: () => Promise.resolve({ levels, postsByLevel, dictionary: new Map() }),
  }));
  vi.doMock('../src/lib/progress', () => ({
    fetchProgress: () =>
      Promise.resolve(completed.map((id) => ({ post_id: id, best_percent_read: 100, completed_at: '2026-08-18T10:00:00Z' }))),
    recordFinish: vi.fn(() => Promise.resolve()),
  }));

  vi.doMock('../src/lib/vocab', () => ({
    fetchSavedWords: () => Promise.resolve([]),
    saveWord: vi.fn(() => Promise.resolve()),
    deleteSavedWord: vi.fn(() => Promise.resolve()),
  }));

  vi.doMock('../src/lib/profile', () => ({
    fetchProfile: () => Promise.resolve(profile),
    updateProfileName: vi.fn(() => Promise.resolve(profile)),
  }));

  const { default: App } = await import('../src/App.jsx');
  await act(async () => { render(<App />); });
  await act(async () => { listeners.forEach((cb) => cb('SIGNED_IN', session)); });
}

// Matched by text rather than a regex: the padlock on a locked entry is a
// surrogate pair, and an optional-emoji pattern without the `u` flag makes only
// half of it optional — which quietly fails to match the unlocked entries.
const levelButton = (position) =>
  screen.getAllByRole('button').find((b) => b.textContent.includes(`Level ${position}:`));

// Which level the dashboard is actually showing. The switcher names every
// level, so the name alone is ambiguous — the line under the greeting is the
// one that says which is on screen.
const shownLevel = () =>
  Array.from(document.querySelectorAll('main p')).find((el) => /^Level \d+:/.test(el.textContent))?.textContent;

beforeEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('the level switcher', () => {
  it('lists every level, locked ones included', async () => {
    await mountApp();

    expect(levelButton(1)).toBeDefined();
    expect(levelButton(2)).toBeDefined();
  });

  it('refuses a locked level, and shows the one already open', async () => {
    await mountApp();

    expect(levelButton(2)).toBeDisabled();

    await act(async () => { levelButton(2).click(); });

    // Still on Level 1: what the dashboard is showing is the witness, not the
    // button's styling.
    expect(shownLevel()).toMatch(/^Level 1: B1 Foundation/);
  });

  it('opens the same level once the preceding one is finished', async () => {
    await mountApp({ completed: [101, 102] });

    expect(levelButton(2)).toBeEnabled();

    await act(async () => { levelButton(2).click(); });

    expect(shownLevel()).toMatch(/^Level 2: B1 Momentum/);
  });

  // A choice of one is not a choice.
  it('is absent when there is only one level', async () => {
    await mountApp({ levels: [one], postsByLevel: { 7: levelOnePosts } });

    expect(levelButton(2)).toBeUndefined();
    expect(shownLevel()).toMatch(/^Level 1: B1 Foundation/);
  });
});

describe('a level that is unlocked but holds nothing', () => {
  // Trap 2: this is the reward for finishing Level 1 today, and it is correct
  // behaviour that reads as unfinished. It must not be worked around in code.
  it('says it is empty, and does not claim to be locked', async () => {
    await mountApp({ completed: [101, 102] });

    await act(async () => { levelButton(2).click(); });

    expect(screen.getByText(/no posts in this level yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/is locked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/to open it/i)).not.toBeInTheDocument();
  });
});

describe('the unlock line', () => {
  it('is shown while the next level is still shut', async () => {
    await mountApp();

    expect(screen.getByText(/Level 2 unlocks when all 2 posts are read — 2 to go/)).toBeInTheDocument();
  });

  // The bug this fixes was visible on screen: "Level 2 unlocks when all 10
  // posts are read — 0 to go", padlock and all, on a level already open.
  it('is gone once that level is actually open', async () => {
    await mountApp({ completed: [101, 102] });

    expect(screen.queryByText(/unlocks when all/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 to go/)).not.toBeInTheDocument();
  });

  // C5: there is no Level 3, so there is nothing to promise.
  it('promises nothing on the highest level', async () => {
    await mountApp({ completed: [101, 102] });

    await act(async () => { levelButton(2).click(); });

    expect(screen.queryByText(/unlocks when all/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/to Level 3/)).not.toBeInTheDocument();
  });
});

// Rendered directly: App will not select a locked level, but the component must
// not describe one wrongly if it is ever handed one. Locked and empty arrive at
// the dashboard wearing the same shape — zero posts — and Trap 3 is that they
// are told apart by post_count rather than by the list.
describe('locked and empty, told apart', () => {
  const props = (overrides) => ({
    dark: false, toggleTheme: vi.fn(), email: 'reader@example.com',
    levels: [one, two], posts: [], postCount: 2, savedCount: 0, doneCount: 0,
    pctLabel: '0%', completed: [], menuOpen: false, toggleMenu: vi.fn(),
    goVocab: vi.fn(), signOut: vi.fn(), askDelete: vi.fn(), askChangePassword: vi.fn(),
    openPost: vi.fn(), reviewPost: vi.fn(), selectLevel: vi.fn(),
    ...overrides,
  });

  it('explains a locked level rather than calling it empty', () => {
    render(<Dashboard {...props({ level: two, unlocked: new Map([[7, true], [9, false]]) })} />);

    expect(screen.getByText(/Level 2 is locked/)).toBeInTheDocument();
    expect(screen.getByText(/Finish every post in Level 1 to open it/)).toBeInTheDocument();
    expect(screen.queryByText(/no posts in this level yet/i)).not.toBeInTheDocument();
  });

  it('still calls an unlocked level with no posts empty', () => {
    render(<Dashboard {...props({ level: two, unlocked: new Map([[7, true], [9, true]]) })} />);

    expect(screen.getByText(/no posts in this level yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/is locked/i)).not.toBeInTheDocument();
  });

  // The two messages are the whole point of C4, so it is worth asserting they
  // are not quietly the same sentence.
  it('uses different words for the two', () => {
    const { unmount } = render(<Dashboard {...props({ level: two, unlocked: new Map([[9, false]]) })} />);
    const lockedText = screen.getByText(/is locked/).textContent;
    unmount();

    render(<Dashboard {...props({ level: two, unlocked: new Map([[9, true]]) })} />);
    const emptyText = screen.getByText(/no posts in this level yet/i).textContent;

    expect(lockedText).not.toBe(emptyText);
  });
});
