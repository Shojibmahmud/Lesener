import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import Dashboard from '../src/components/Dashboard';

const level = { id: 7, position: 1, name: 'B1 Foundation', cefr: 'B1', slug: 'b1-foundation', post_count: 2 };
const posts = [
  { id: 101, level_id: 7, position: 1, slug: 's101', title: 'Der Alltag', blurb: 'Blurb.', topic: 'Alltag', body: 'Satz.' },
];

function show(profile, over = {}) {
  render(
    <Dashboard
      dark={false}
      toggleTheme={() => {}}
      email="shojibmahmud108@gmail.com"
      profile={profile}
      level={level}
      levels={[level]}
      unlocked={new Map([[7, true]])}
      selectLevel={() => {}}
      posts={posts}
      postCount={2}
      savedCount={0}
      doneCount={0}
      pctLabel="0%"
      completed={[]}
      menuOpen
      toggleMenu={() => {}}
      goVocab={() => {}}
      signOut={() => {}}
      askDelete={() => {}}
      askChangePassword={() => {}}
      openPost={() => {}}
      reviewPost={() => {}}
      {...over}
    />,
  );
}

// The avatar is the only button rendering a single letter, and it is not
// labelled — matching it by its own text is what the reader sees.
const avatar = () => screen.getByRole('button', { name: /^[A-ZÀ-ÖØ-Þ?]$/ });

describe('the greeting', () => {
  it('calls the reader by their first name', () => {
    show({ id: 'r1', first_name: 'Shojib', last_name: 'Mahmud' });

    expect(screen.getByText('Grüß Gott, Shojib.')).toBeInTheDocument();
  });

  it('uses the first name only, never the surname', () => {
    show({ id: 'r1', first_name: 'Shojib', last_name: 'Mahmud' });

    expect(screen.queryByText(/Grüß Gott, Shojib Mahmud/)).not.toBeInTheDocument();
  });

  // The nameless state should be unreachable, which is exactly why it is worth
  // a test: it is the only thing standing between a missing name and a heading
  // reading "Grüß Gott, undefined."
  it('stays a whole sentence when there is no name at all', () => {
    show(null);

    expect(screen.getByText('Grüß Gott.')).toBeInTheDocument();
    expect(screen.queryByText(/undefined|null/)).not.toBeInTheDocument();
  });

  it('greets a reader who has a first name but no surname', () => {
    show({ id: 'r1', first_name: 'Basabodol1430', last_name: null });

    expect(screen.getByText('Grüß Gott, Basabodol1430.')).toBeInTheDocument();
  });
});

describe('the avatar', () => {
  it('shows the first name initial', () => {
    show({ id: 'r1', first_name: 'Shojib', last_name: 'Mahmud' });

    expect(avatar()).toHaveTextContent('S');
  });

  it('falls back to the email initial when there is no name', () => {
    show(null);

    expect(avatar()).toHaveTextContent('S');
  });

  it('capitalises a lowercase name', () => {
    show({ id: 'r1', first_name: 'anna', last_name: null });

    expect(avatar()).toHaveTextContent('A');
  });

  // Found on a running build, not in a test: charAt(0) takes one UTF-16 code
  // unit, which is the bare consonant of a Bengali cluster with its vowel sign
  // left behind — শোহাব rendered as শ.
  it('keeps a whole Bengali grapheme cluster together', () => {
    show({ id: 'r1', first_name: 'শোহাব', last_name: null });

    expect(screen.getByRole('button', { name: 'শো' })).toBeInTheDocument();
  });

  // The same bug's sharper half: half a surrogate pair renders as an empty box.
  it('never renders half a surrogate pair', () => {
    show({ id: 'r1', first_name: '𐐷aviaan', last_name: null });

    const shown = screen.getByRole('button', { name: /𐐏|𐐷/ });
    // One whole character, which here is two UTF-16 code units. charAt(0) would
    // have handed back a lone high surrogate: length 1, and unrenderable.
    expect([...shown.textContent]).toHaveLength(1);
    expect(shown.textContent.length).toBe(2);
  });
});

describe('the account menu', () => {
  it('names the reader above their email', () => {
    show({ id: 'r1', first_name: 'Shojib', last_name: 'Mahmud' });

    expect(screen.getByText('Shojib Mahmud')).toBeInTheDocument();
    expect(screen.getByText('shojibmahmud108@gmail.com')).toBeInTheDocument();
  });

  // Every backfilled reader has no surname, because an email address does not
  // carry one. A trailing space would be visible in the menu.
  it('shows a first name alone without a trailing space', () => {
    show({ id: 'r1', first_name: 'Basabodol1430', last_name: null });

    expect(screen.getByText('Basabodol1430')).toBeInTheDocument();
  });

  it('shows the email alone when there is no name', () => {
    show(null);

    expect(screen.getByText('shojibmahmud108@gmail.com')).toBeInTheDocument();
  });
});
