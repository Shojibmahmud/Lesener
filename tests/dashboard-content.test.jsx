import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { stubSupabase } from './helpers/supabase';

// These cases mount App over the *real* content layer, stubbing only the
// database underneath it. tests/content-lifecycle.test.jsx replaces loadContent
// wholesale, which proves App reacts correctly to what it is handed but says
// nothing about whether what the database returns ever reaches the screen
// intact. This file covers that join.
//
// The fixture deliberately contradicts the seeded content, where every post's
// id equals its position and every topic is the same word. On that data, code
// that reads a position where it means an id renders perfectly. Here the ids
// start at 101 and the topics differ, so it cannot.
const level = { id: 7, slug: 'b1-foundation', name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 5 };

const posts = [
  { id: 101, level_id: 7, position: 1, slug: 'der-alltag', title: 'Der Alltag', blurb: 'Ein Morgen in Berlin.', topic: 'Alltag', body: 'Erster Satz vom ersten Post.' },
  { id: 102, level_id: 7, position: 2, slug: 'die-suche', title: 'Die Wohnungssuche', blurb: 'Zwölf Termine.', topic: 'Wohnen', body: 'Der Zusammenhang bleibt klar.' },
  { id: 103, level_id: 7, position: 3, slug: 'beim-arzt', title: 'Beim Arzt', blurb: 'Symptome erklären.', topic: 'Gesundheit', body: 'Dritter Satz.' },
  { id: 104, level_id: 7, position: 4, slug: 'am-see', title: 'Ein Tag am See', blurb: 'Wetter und Ruhe.', topic: 'Freizeit', body: 'Vierter Satz.' },
];

const dictionary = [{ term: 'zusammenhang', translation: 'context', part_of_speech: 'noun' }];

const ok = {
  levels: { data: [level], error: null },
  dictionary_entries: { data: dictionary, error: null },
  posts: ({ level_id }) => ({ data: level_id === level.id ? posts : [], error: null }),
};

// Mounts App with the database stubbed and the content layer left real.
// `tables` is the stub's table map; App is imported afresh each time because
// src/lib/recovery.js reads the URL fragment at import time.
async function mountApp(tables) {
  vi.resetModules();
  window.location.hash = '';

  const listeners = [];
  const { from, calls } = stubSupabase(tables);

  vi.doMock('../src/lib/supabase', () => ({
    supabase: {
      from: vi.fn(from),
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

  const { default: App } = await import('../src/App.jsx');

  await act(async () => {
    render(<App />);
  });

  async function emit(event, session) {
    await act(async () => {
      listeners.forEach((callback) => callback(event, session));
    });
  }

  return { emit, calls };
}

const session = { user: { id: 'reader-1', email: 'reader@example.com' } };

async function signIn(tables = ok) {
  const mounted = await mountApp(tables);
  await mounted.emit('SIGNED_IN', session);
  return mounted;
}

// The reader is reached the way a reader reaches it, through a card, because
// which id the card hands over is exactly what is under test.
async function openPostAtPosition(position) {
  const card = screen.getByText('Post ' + position).closest('.lift');
  await userEvent.click(within(card).getByRole('button', { name: /read post/i }));
}

// The reader renders one tappable span per word, so a post's body is never one
// text node and has to be found a word at a time.
function word(text) {
  return screen.queryByText((_, element) => element?.className === 'w' && element.textContent.trim() === text);
}

describe('the dashboard, rendering what the database returned', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a card for every post the level handed over', async () => {
    await signIn();

    for (const post of posts) {
      expect(screen.getByText(post.title)).toBeInTheDocument();
      expect(screen.getByText(post.blurb)).toBeInTheDocument();
      expect(screen.getByText('Post ' + post.position)).toBeInTheDocument();
    }
  });

  it('names the level from its own record', async () => {
    await signIn();

    expect(screen.getByText(/Level 1: B1 Foundation/)).toBeInTheDocument();
  });

  // The level says it holds five posts and hands over four. The count on screen
  // has to be the level's own figure, not the number of rows in hand: they are
  // different questions, and only the seeded data makes them look like one.
  it('counts the posts the level says it holds, not the ones it handed over', async () => {
    await signIn();

    expect(screen.getByText(/of 5 posts completed/)).toBeInTheDocument();
    expect(screen.queryByText(/of 4 posts completed/)).not.toBeInTheDocument();
    // The unlock line used to be a second witness here. It is gone now, and
    // rightly: this fixture holds one level, so a line promising Level 2 was
    // describing a level that does not exist. tests/level-switching.test.jsx
    // covers when it should and should not appear.
  });
});

describe('opening a post from a card', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The card labelled "Post 2" belongs to post 102. Handing over the position
  // instead of the id asks for a post numbered 2, which does not exist in this
  // library — so the reader never opens at all.
  it('opens the post the card belongs to, by id and not by position', async () => {
    await signIn();

    await openPostAtPosition(2);

    expect(word('Zusammenhang')).toBeInTheDocument();
    expect(word('Erster')).not.toBeInTheDocument();
  });

  it('shows the level and the post topic the database gave', async () => {
    await signIn();

    await openPostAtPosition(2);

    // Post 102's topic, not the level's first post's and not a hardcoded one.
    expect(screen.getByText((_, element) => element?.textContent === 'B1 · Wohnen')).toBeInTheDocument();
  });

  // End to end: the dictionary row fetched by the same call that produced this
  // post reaches the reader and answers a tap on a word in its body.
  it('translates a word using the dictionary from the same fetch', async () => {
    await signIn();

    await openPostAtPosition(2);
    await userEvent.click(word('Zusammenhang'));

    expect(screen.getByText('context')).toBeInTheDocument();
  });
});

describe('when the database itself refuses', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const refusal = { data: null, error: { code: '42501', message: 'permission denied for table levels' } };

  // Not a substituted rejection: the error arrives as postgrest delivers one, in
  // the payload of a query that resolved successfully. Turning that into a
  // failure the reader is told about is the content layer's job, and this is the
  // only case that exercises it end to end.
  it('shows the error screen rather than an empty dashboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await signIn({ ...ok, levels: refusal });

    expect(screen.getByText(/couldn’t load your library/i)).toBeInTheDocument();
    expect(screen.queryByText(/Grüß Gott/)).not.toBeInTheDocument();
  });

  it('loads the library when the reader retries and the database answers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let refuse = true;
    await signIn({
      ...ok,
      levels: () => (refuse ? refusal : { data: [level], error: null }),
    });

    expect(screen.getByText(/couldn’t load your library/i)).toBeInTheDocument();

    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('Die Wohnungssuche')).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load your library/i)).not.toBeInTheDocument();
  });
});
