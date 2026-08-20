import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Reader from '../src/components/Reader';

// Ids that are not positions. posts.id and posts.position both run 1..10 in the
// seeded library, so a completed set keyed by the wrong one renders identically
// against real data and only breaks in production.
const library = () => ({
  levels: [{ id: 1, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 3 }],
  postsByLevel: {
    1: [
      { id: 101, level_id: 1, position: 1, slug: 'der-alltag', title: 'Der Alltag', blurb: 'Ein Morgen.', topic: 'Alltag', body: 'Erster Satz.' },
      { id: 102, level_id: 1, position: 2, slug: 'die-suche', title: 'Die Suche', blurb: 'Eine Wohnung.', topic: 'Wohnen', body: 'Zweiter Satz.' },
      { id: 103, level_id: 1, position: 3, slug: 'das-fest', title: 'Das Fest', blurb: 'Ein Abend.', topic: 'Feste', body: 'Dritter Satz.' },
    ],
  },
  dictionary: new Map([['alltag', 'everyday life']]),
});

const finished = (postId) => ({ post_id: postId, best_percent_read: 100, completed_at: '2026-08-18T10:00:00Z' });
// A row exists as soon as a session does. Only completed_at makes it a finish.
const started = (postId, percent) => ({ post_id: postId, best_percent_read: percent, completed_at: null });

const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

// The signed-in reader's profile. A name has to be present for the dashboard
// greeting to carry one, and every one of these tests goes through it.
const READER = { id: 'reader-1', first_name: 'Anna', last_name: 'Schneider' };

async function mountApp({ progress = [], recordFinishImpl, profile = READER } = {}) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
  const fetchProgress = vi.fn(() => Promise.resolve(progress));
  const recordFinish = vi.fn(recordFinishImpl ?? (() => Promise.resolve()));
  const loadContent = vi.fn(() => Promise.resolve(library()));

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
  vi.doMock('../src/lib/content', () => ({ loadContent }));
  vi.doMock('../src/lib/progress', () => ({ fetchProgress, recordFinish }));
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

  await act(async () => {
    render(<App />);
  });
  await act(async () => {
    listeners.forEach((callback) => callback('SIGNED_IN', session));
  });

  return { fetchProgress, recordFinish, loadContent };
}

// Cards carry className="lift", which is what makes "the card for Die Suche"
// something a case can name. The first button in a card's footer is the one
// that opens it — "Read post", or "Read again" once it is finished.
const cardFor = (title) =>
  Array.from(document.querySelectorAll('.lift')).find((card) => card.textContent.includes(title));

const openPost = async (title) => {
  await act(async () => {
    cardFor(title).querySelector('button').click();
  });
};

beforeEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('what the dashboard says a reader has read', () => {
  it('badges exactly the posts the database recorded as finished', async () => {
    await mountApp({ progress: [finished(102)] });

    expect(screen.getAllByText('✓ Gelesen')).toHaveLength(1);
    // The badge belongs to Die Suche — post id 102, which sits at position 2.
    // Keying the completed set by position would badge Der Alltag instead, and
    // against the real library that mistake is invisible: there, ids and
    // positions are the same numbers.
    expect(cardFor('Die Suche').textContent).toContain('✓ Gelesen');
    expect(cardFor('Der Alltag').textContent).toContain('Unread');
  });

  it('counts finishes, not rows', async () => {
    await mountApp({ progress: [finished(101), started(102, 74), finished(103)] });

    expect(screen.getAllByText('✓ Gelesen')).toHaveLength(2);
    expect(screen.getByText(/2 of 3 posts completed/)).toBeInTheDocument();
  });

  // The bug this replaces: every account was congratulated with progress it had
  // not earned, because the completed list was a literal.
  it('tells a reader who has finished nothing that they have finished nothing', async () => {
    await mountApp({ progress: [] });

    expect(screen.queryByText('✓ Gelesen')).not.toBeInTheDocument();
    expect(screen.getByText(/0 of 3 posts completed/)).toBeInTheDocument();
  });
});

describe('the percentage a finish records', () => {
  const post = { id: 101, position: 3, title: 'Der Alltag', topic: 'Alltag', body: 'Die Herausforderung.\n\nDer Zusammenhang.' };
  const level = { id: 1, name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 5 };

  // Not a hardcoded 100 and not 0. The number the header is showing is the one
  // the reader can see, so it is the only number they could reasonably expect
  // to be stored.
  it('is the figure the reader header was showing', async () => {
    const onFinish = vi.fn();
    render(
      <Reader
        post={post} level={level} dict={new Map()} saved={[]} session={[]}
        onSaveWord={vi.fn()} onFinish={onFinish} goDashboard={vi.fn()} dark={false} toggleTheme={vi.fn()}
      />,
    );

    const scroller = document.querySelector('[style*="overflow-y: auto"]');
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 402; // 402 / 600 → 67%

    fireEvent.scroll(scroller);

    expect(screen.getByText('67% read')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /finish reading/i }));

    expect(onFinish).toHaveBeenCalledWith(67);
  });

  // Caught against the real database rather than here: finishing without
  // scrolling stored `percent_read: 0` next to `completed: true`. A post that
  // fits on one screen fires no scroll event at all, so a percentage only ever
  // measured on scroll stays at whatever it was initialised to.
  it('is 100 for a post with nothing to scroll, without waiting for a scroll', async () => {
    const onFinish = vi.fn();
    render(
      <Reader
        post={post} level={level} dict={new Map()} saved={[]} session={[]}
        onSaveWord={vi.fn()} onFinish={onFinish} goDashboard={vi.fn()} dark={false} toggleTheme={vi.fn()}
      />,
    );

    // jsdom reports every element as zero-sized, so scrollHeight and
    // clientHeight are already equal — exactly the no-overflow case.
    expect(screen.getByText('100% read')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /finish reading/i }));

    expect(onFinish).toHaveBeenCalledWith(100);
  });
});

describe('pressing Finish', () => {
  it('writes one completed session and badges the post at once', async () => {
    const { recordFinish, fetchProgress } = await mountApp();

    await openPost('Der Alltag');
    await act(async () => {
      screen.getByRole('button', { name: /finish reading/i }).click();
    });

    expect(recordFinish).toHaveBeenCalledWith({ postId: 101, percentRead: expect.any(Number) });

    await act(async () => {
      screen.getByRole('button', { name: /back to dashboard/i }).click();
    });

    expect(screen.getAllByText('✓ Gelesen')).toHaveLength(1);
    // Decision 5: the badge moves locally. Refetching the whole library to learn
    // something the app just did would cost a round trip to change nothing.
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  });

  // Decision 7. The reader is told, and the post stays unmarked — a badge that
  // appears and then vanishes on the next load is worse than one that never
  // appeared.
  describe('when the write does not land', () => {
    const refuse = () => Promise.reject(new Error('Could not save your progress [42501]: permission denied'));

    it('leaves the post unmarked and says so', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await mountApp({ recordFinishImpl: refuse });

      await openPost('Der Alltag');
      await act(async () => {
        screen.getByRole('button', { name: /finish reading/i }).click();
      });

      expect(screen.getByText(/progress couldn’t be saved/i)).toBeInTheDocument();

      await act(async () => {
        screen.getByRole('button', { name: /back to dashboard/i }).click();
      });

      expect(screen.queryByText('✓ Gelesen')).not.toBeInTheDocument();
      expect(screen.getByText(/0 of 3 posts completed/)).toBeInTheDocument();
    });

    it('does not congratulate the reader for something that was not recorded', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await mountApp({ recordFinishImpl: refuse });

      await openPost('Der Alltag');
      await act(async () => {
        screen.getByRole('button', { name: /finish reading/i }).click();
      });

      expect(screen.queryByText(/gut gemacht/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/level progression updated/i)).not.toBeInTheDocument();
    });

    it('records it when the reader presses Finish again', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const recordFinishImpl = vi.fn().mockImplementationOnce(refuse).mockResolvedValue(undefined);
      await mountApp({ recordFinishImpl });

      await openPost('Der Alltag');
      await act(async () => {
        screen.getByRole('button', { name: /finish reading/i }).click();
      });
      expect(screen.getByText(/progress couldn’t be saved/i)).toBeInTheDocument();

      // The modal is dismissed by clicking its backdrop; the reader is still on
      // the post underneath, which is what makes retrying possible at all.
      await act(async () => {
        screen.getByText(/progress couldn’t be saved/i).closest('div[style*="fixed"]')?.click();
      });
      await act(async () => {
        screen.getByRole('button', { name: /finish reading/i }).click();
      });

      expect(screen.getByText(/level progression updated/i)).toBeInTheDocument();

      await act(async () => {
        screen.getByRole('button', { name: /back to dashboard/i }).click();
      });

      expect(screen.getAllByText('✓ Gelesen')).toHaveLength(1);
    });

    it('reports the cause where the maintainer will see it', async () => {
      const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
      await mountApp({ recordFinishImpl: refuse });

      await openPost('Der Alltag');
      await act(async () => {
        screen.getByRole('button', { name: /finish reading/i }).click();
      });

      expect(reported).toHaveBeenCalled();
      expect(reported.mock.calls[0][0]).toMatch(/progress could not be saved/i);
    });
  });

  // Trap 6 in the database, and the same rule here: the count must not drift on
  // a re-read even though the write succeeds again.
  it('does not double-count a post the reader had already finished', async () => {
    await mountApp({ progress: [finished(101)] });

    await openPost('Der Alltag');
    await act(async () => {
      screen.getByRole('button', { name: /finish reading/i }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: /back to dashboard/i }).click();
    });

    expect(screen.getAllByText('✓ Gelesen')).toHaveLength(1);
    expect(screen.getByText(/1 of 3 posts completed/)).toBeInTheDocument();
  });
});
