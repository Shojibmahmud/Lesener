import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VocabBank from '../src/components/VocabBank';

// Post ids that are not positions. The seeded posts are numbered 1..10 in both
// id and position, so a bank keyed on the wrong one renders identically there —
// these fixtures are the only place the difference shows.
const ALLTAG = 41;
const SUCHE = 42;

const word = (over = {}) => ({
  id: 701,
  post_id: ALLTAG,
  post_label: 'Post 1: Der Alltag in Berlin',
  term: 'herausforderung',
  surface_form: 'Herausforderung',
  translation: 'challenge',
  ...over,
});

const library = (entries = [[ALLTAG, 'Post 1: Der Alltag in Berlin'], [SUCHE, 'Post 2: Die Wohnungssuche']]) =>
  new Map(entries);

function bank(saved, { postLabels = library(), removeFailed = false, onRemove = vi.fn() } = {}) {
  render(
    <VocabBank
      dark={false}
      toggleTheme={() => {}}
      saved={saved}
      postLabels={postLabels}
      goDashboard={() => {}}
      onRemove={onRemove}
      removeFailed={removeFailed}
    />,
  );
  return { onRemove };
}

const sections = () => Array.from(document.querySelectorAll('section'));

describe('grouping words by the post they were met in', () => {
  it('heads each group with the post’s current title', () => {
    bank([word(), word({ id: 702, post_id: SUCHE, term: 'geduld', surface_form: 'Geduld', translation: 'patience' })]);

    expect(screen.getByRole('heading', { name: 'Post 1: Der Alltag in Berlin' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Post 2: Die Wohnungssuche' })).toBeInTheDocument();
  });

  it('prefers the current title over the one stored when the word was saved', () => {
    // A post renamed since the word was kept. The bank must follow the rename,
    // or correcting a title would never reach the reader.
    bank([word({ post_label: 'Post 1: Ein alter Titel' })], {
      postLabels: library([[ALLTAG, 'Post 1: Der neue Titel']]),
    });

    expect(screen.getByRole('heading', { name: 'Post 1: Der neue Titel' })).toBeInTheDocument();
    expect(screen.queryByText('Post 1: Ein alter Titel')).not.toBeInTheDocument();
  });

  it('falls back to the stored heading when the post can no longer be found', () => {
    // Deleted, or unpublished and therefore withheld by RLS — either way it is
    // absent from the library, and the word must not lose its place.
    bank([word()], { postLabels: library([]) });

    expect(screen.getByRole('heading', { name: 'Post 1: Der Alltag in Berlin' })).toBeInTheDocument();
    expect(screen.getByText('Herausforderung')).toBeInTheDocument();
  });

  it('keeps words from two different vanished posts in two different groups', () => {
    // Both carry a null post_id once their posts are deleted, so grouping on
    // the id alone would merge two unrelated posts into one heading.
    bank(
      [
        word({ id: 701, post_id: null, post_label: 'Post 1: Der Alltag in Berlin' }),
        word({ id: 702, post_id: null, post_label: 'Post 2: Die Wohnungssuche', term: 'geduld', surface_form: 'Geduld' }),
      ],
      { postLabels: library([]) },
    );

    expect(sections()).toHaveLength(2);
  });

  it('renders a vanished post’s group exactly like a live one', () => {
    bank(
      [
        word(),
        word({ id: 702, post_id: 999, post_label: 'Post 9: Ein verschwundener Post', term: 'geduld', surface_form: 'Geduld', translation: 'patience' }),
      ],
      { postLabels: library([[ALLTAG, 'Post 1: Der Alltag in Berlin']]) },
    );

    const [live, vanished] = sections();
    // Same shape: a heading, a count, and one row per word. Nothing marks the
    // second as unavailable, because nothing in the bank links to a post.
    [live, vanished].forEach((s) => {
      expect(within(s).getByRole('heading')).toBeInTheDocument();
      expect(within(s).getByText('1 word')).toBeInTheDocument();
    });
    expect(vanished.textContent).not.toMatch(/no longer|unavailable|missing/i);
  });
});

describe('what a row shows', () => {
  it('shows the word as it was tapped, not the lowercase key', () => {
    bank([word()]);

    expect(screen.getByText('Herausforderung')).toBeInTheDocument();
    expect(screen.queryByText('herausforderung')).not.toBeInTheDocument();
  });

  it('shows an em dash where a word has no translation', () => {
    bank([word({ translation: null })]);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('removing a word', () => {
  it('identifies the row by its id', async () => {
    const { onRemove } = bank([word({ id: 701 }), word({ id: 702, term: 'geduld', surface_form: 'Geduld' })]);

    await userEvent.click(screen.getAllByRole('button', { name: '🗑' })[1]);

    // Not the word and not the heading: those matched by coincidence before,
    // and two readers' rows can share both.
    expect(onRemove).toHaveBeenCalledWith(702);
  });

  it('says so when a removal did not take effect', () => {
    bank([word()], { removeFailed: true });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t be removed/i);
    // And the word is still listed — a failed delete changes nothing.
    expect(screen.getByText('Herausforderung')).toBeInTheDocument();
  });

  it('says nothing when removals are working', () => {
    bank([word()]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('an empty bank', () => {
  it('says nothing is saved yet', () => {
    bank([]);

    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    expect(sections()).toHaveLength(0);
  });
});
