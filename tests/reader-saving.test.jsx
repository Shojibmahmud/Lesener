import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Reader from '../src/components/Reader';

// Ids that are not positions, and a body whose first sentence opens with a
// non-noun — "Jeden" is capitalised only because it starts the sentence, which
// is the one case where storing the word as tapped is knowingly wrong.
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

const keep = () => screen.getByRole('button', { name: '+' });

const savedRow = (over = {}) => ({
  id: 701,
  post_id: 101,
  post_label: 'Post 3: Der Alltag',
  term: 'herausforderung',
  surface_form: 'Herausforderung',
  translation: 'challenge',
  ...over,
});

describe('keeping a word', () => {
  it('reports the word as it was tapped, with its capital intact', async () => {
    const { onSaveWord } = renderReader();

    await userEvent.click(word('Herausforderung.'));
    await userEvent.click(keep());

    expect(onSaveWord).toHaveBeenCalledWith({ surfaceForm: 'Herausforderung', translation: 'challenge' });
  });

  it('reports no translation as absent, not as the dash on screen', async () => {
    const { onSaveWord } = renderReader();

    await userEvent.click(word('Zusammenhang'));
    expect(screen.getByText('—')).toBeInTheDocument();

    await userEvent.click(keep());

    // The dash is a rendering decision. Sending it would store a translation
    // that no dictionary row contains.
    expect(onSaveWord).toHaveBeenCalledWith({ surfaceForm: 'Zusammenhang', translation: undefined });
  });

  it('keeps a sentence-opening word with the capital that sentence gave it', async () => {
    // Knowingly wrong, and recorded as such: "jeden" is not a noun. Asserted so
    // that the day somebody authors proper display forms, this test fails and
    // says why rather than quietly disagreeing.
    const { onSaveWord } = renderReader();

    await userEvent.click(word('Jeden'));
    await userEvent.click(keep());

    expect(onSaveWord).toHaveBeenCalledWith({ surfaceForm: 'Jeden', translation: 'every' });
  });

  it('recognises an already-kept word by its stored key, and does not keep it twice', async () => {
    const { onSaveWord } = renderReader({ saved: [savedRow()] });

    await userEvent.click(word('Herausforderung.'));

    expect(screen.getByRole('button', { name: '✓' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '✓' }));
    expect(onSaveWord).not.toHaveBeenCalled();
  });
});

describe('when a word could not be kept', () => {
  it('says so, rather than leaving the tap looking like a miss', () => {
    renderReader({ saveWordFailed: true });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be saved/i);
  });

  it('says nothing while saving is working', () => {
    renderReader();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('the session sidebar', () => {
  it('lists the word as it was tapped', () => {
    renderReader({ session: [savedRow()] });

    expect(screen.getByText('Herausforderung')).toBeInTheDocument();
    expect(screen.getByText('challenge')).toBeInTheDocument();
  });

  it('shows an em dash for a word the dictionary could not translate', () => {
    renderReader({ session: [savedRow({ translation: null })] });

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
