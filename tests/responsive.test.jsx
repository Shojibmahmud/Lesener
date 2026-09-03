import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Reader from '../src/components/Reader';
import { NARROW, useIsNarrow } from '../src/lib/responsive';

// The phone layout is the one branch this whole feature adds, and it is
// invisible to a test that does not say how wide the window is: jsdom sets
// innerWidth to 1024, which is wider than the breakpoint, so everything else in
// the suite takes the desktop path. tests/setup.js installs a matchMedia that
// answers against innerWidth; these tests are the ones that move it.

const post = {
  id: 101,
  position: 3,
  title: 'Der Alltag',
  topic: 'Alltag',
  body: 'Jeden Morgen die Herausforderung.\n\nDer Zusammenhang bleibt.',
};

const level = { id: 1, name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 5 };

const dict = new Map([
  ['herausforderung', 'challenge'],
  ['jeden', 'every'],
]);

const savedRow = (over = {}) => ({
  id: 701,
  post_id: 101,
  post_label: 'Post 3: Der Alltag',
  term: 'herausforderung',
  surface_form: 'Herausforderung',
  translation: 'challenge',
  ...over,
});

const DEFAULT_WIDTH = window.innerWidth;

function widthOf(px) {
  window.innerWidth = px;
}

afterEach(() => {
  window.innerWidth = DEFAULT_WIDTH;
});

function renderReader({ saved = [], session = [], saveWordFailed = false, onSaveWord = vi.fn() } = {}) {
  render(
    <Reader
      post={post}
      level={level}
      dict={dict}
      saved={saved}
      session={session}
      onSaveWord={onSaveWord}
      saveWordFailed={saveWordFailed}
      onFinish={vi.fn()}
      goDashboard={vi.fn()}
      dark={false}
      toggleTheme={vi.fn()}
    />,
  );
  return { onSaveWord };
}

const word = (text) =>
  screen.getByText((_, element) => element?.className === 'w' && element.textContent.trim() === text);

const sessionBar = () => screen.queryByRole('button', { expanded: false }) ?? screen.queryByRole('button', { expanded: true });

describe('the breakpoint', () => {
  it('reports the desktop layout at the width jsdom renders at', () => {
    // 1024 is jsdom's default and is what every other test in the suite runs
    // under. If this ever answered true, the whole suite would silently switch
    // to the phone layout.
    expect(DEFAULT_WIDTH).toBeGreaterThan(NARROW);
  });

  it('answers false where the browser cannot be asked', () => {
    // The guard in responsive.js is `typeof window.matchMedia !== 'function'`,
    // and this is why it cannot be `'matchMedia' in window`: vitest copies the
    // key onto the global with an undefined value, so `in` is true while the
    // call throws. Removing the shim reproduces the environment the guard is
    // actually written for.
    const shim = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true });

    let seen = null;
    function Probe() {
      seen = useIsNarrow();
      return null;
    }
    try {
      render(<Probe />);
      expect(seen).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: shim, configurable: true, writable: true });
    }
  });
});

describe('the reader on a phone', () => {
  it('puts the session in a bottom sheet instead of a column beside the text', () => {
    widthOf(390);
    renderReader({ session: [savedRow()] });

    // The sheet is collapsed, so the count is the bar's label.
    expect(screen.getByRole('button', { name: /This session · 1 word/ })).toBeInTheDocument();
    // And the sidebar's own heading is not on screen at all.
    expect(screen.queryByText('This session')).not.toBeInTheDocument();
  });

  it('keeps the sidebar and the sheet mutually exclusive', async () => {
    // This is the guard on every singular query in the two Reader suites --
    // getByRole('button', {name: '+'}), getByText('—'), getByRole('alert').
    // Rendering both and hiding one with CSS would leave two of each in the
    // accessibility tree, because no test loads a stylesheet and jsdom does not
    // evaluate width queries anyway. getBy* throws on a second match, so these
    // singular queries are themselves the assertion.
    widthOf(390);
    renderReader({ session: [savedRow()], saveWordFailed: true });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(word('Jeden'));
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    expect(screen.getByText('every')).toBeInTheDocument();
  });

  it('carries the tap-a-word instruction while there is nothing to count', () => {
    widthOf(390);
    renderReader();

    expect(screen.getByRole('button', { name: /Tap any word to translate/ })).toBeInTheDocument();
  });

  it('opens the saved words when the bar is tapped, and closes them again', async () => {
    widthOf(390);
    renderReader({ session: [savedRow()] });

    expect(screen.queryByText('challenge')).not.toBeInTheDocument();

    await userEvent.click(sessionBar());
    expect(screen.getByText('Herausforderung')).toBeInTheDocument();
    expect(screen.getByText('challenge')).toBeInTheDocument();

    await userEvent.click(sessionBar());
    expect(screen.queryByText('challenge')).not.toBeInTheDocument();
  });

  it('opens itself when a word fails to save, so the retry is not hidden', () => {
    widthOf(390);
    renderReader({ saveWordFailed: true });

    // Without this the reader is left believing a word was saved that was not:
    // the message lives in the sheet, and the sheet starts closed.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the translation and offers to keep the word', async () => {
    widthOf(390);
    const { onSaveWord } = renderReader();

    // 'Jeden' rather than 'Herausforderung': the token carries its trailing
    // punctuation, so that one's span reads "Herausforderung." and would not
    // match.
    await userEvent.click(word('Jeden'));
    expect(screen.getByText('every')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+' }));
    expect(onSaveWord).toHaveBeenCalledWith({ surfaceForm: 'Jeden', translation: 'every' });
  });
});

describe('the reader on a wide screen', () => {
  it('still renders the sidebar, and no sheet', () => {
    widthOf(1280);
    renderReader({ session: [savedRow()] });

    expect(screen.getByText('This session')).toBeInTheDocument();
    expect(screen.getByText('1 word')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /This session ·/ })).not.toBeInTheDocument();
  });

  it('keeps the text pane the first scroll container in the document', () => {
    // tests/reading-progress.test.jsx finds the scroller by this exact
    // substring and takes the first match, so nothing above the text pane may
    // ever gain an overflow.
    widthOf(1280);
    renderReader();

    const first = document.querySelector('[style*="overflow-y: auto"]');
    expect(first).toBeTruthy();
    // The text pane, not the sidebar: it is the one holding the post.
    expect(first.textContent).toContain('Herausforderung');
    expect(first.textContent).toContain('Finish reading');
  });
});
