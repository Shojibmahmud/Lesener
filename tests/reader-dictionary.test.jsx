import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Reader from '../src/components/Reader';

// "Zusammenhang" is deliberate: the deleted src/data.js knew it as "context".
// Nothing in this dictionary does. If a bundled copy is ever reintroduced as a
// fallback, the miss case below stops missing and starts answering "context".
const post = {
  id: 101,
  position: 3,
  title: 'Der Alltag',
  topic: 'Alltag',
  body: 'Die Herausforderung, jeden Morgen.\n\nDer Zusammenhang bleibt.',
};

const level = { id: 1, name: 'B1 Foundation', cefr: 'B1', position: 1, post_count: 5 };

function renderReader(dict) {
  render(
    <Reader
      post={post}
      level={level}
      dict={dict}
      saved={[]}
      session={[]}
      onSaveWord={vi.fn()}
      onFinish={vi.fn()}
      goDashboard={vi.fn()}
      dark={false}
      toggleTheme={vi.fn()}
    />,
  );
}

// The body renders one span per whitespace-separated token, punctuation
// included, so a word is found by the text it was written with rather than by
// the key it is looked up under.
function word(text) {
  return screen.getByText((_, element) => element?.className === 'w' && element.textContent.trim() === text);
}

describe('tapping a word', () => {
  it('shows the translation the database gave for it', async () => {
    renderReader(new Map([['herausforderung', 'challenge']]));

    await userEvent.click(word('Herausforderung,'));

    expect(screen.getByText('challenge')).toBeInTheDocument();
  });

  // The body writes words capitalised and punctuated; the dictionary is keyed by
  // the bare lowercase term. "Herausforderung," has to find "herausforderung".
  it('finds it despite the capital and the comma the body writes it with', async () => {
    renderReader(new Map([['herausforderung', 'challenge']]));

    await userEvent.click(word('Herausforderung,'));

    expect(screen.getByText('challenge')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('shows a dash for a word the database has no translation for', async () => {
    renderReader(new Map([['herausforderung', 'challenge']]));

    await userEvent.click(word('Morgen.'));

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // The point of Stage E. This word had a translation in the bundled file, so
  // before it was deleted a reader could have been shown "context" here — from a
  // copy frozen at whatever the file last said. The only correct answer now is
  // that there is no translation.
  it('shows a dash even for a word the deleted bundled copy knew', async () => {
    renderReader(new Map([['herausforderung', 'challenge']]));

    await userEvent.click(word('Zusammenhang'));

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('context')).not.toBeInTheDocument();
  });

  // An empty dictionary is a real state: the table could legitimately be empty.
  // It must read as "no translations", not as a reason to reach for something
  // else.
  it('shows a dash for every word when the dictionary is empty', async () => {
    renderReader(new Map());

    await userEvent.click(word('Herausforderung,'));

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
