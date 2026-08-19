import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

import { supabase } from '../src/lib/supabase';
import AuthScreen from '../src/components/AuthScreen';

const props = {
  dark: false,
  toggleTheme: () => {},
  goLanding: () => {},
  setSignUp: () => {},
  setSignIn: () => {},
};

// A sign-up that returns a session is the case where App unmounts this screen,
// so nothing here has to survive the response.
const SIGNED_UP = { data: { user: { identities: [{}] }, session: {} }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('where the name fields appear', () => {
  it('asks for a first and last name on the create-account tab', () => {
    render(<AuthScreen {...props} authTab="up" />);

    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toBeInTheDocument();
  });

  it('asks for neither on the sign-in tab', () => {
    render(<AuthScreen {...props} authTab="in" />);

    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Last name')).not.toBeInTheDocument();
  });

  it('asks for neither on the reset-password form', async () => {
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="in" />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Last name')).not.toBeInTheDocument();
  });

  // Both are required, and capped to match the column they end up in. Without
  // the cap a pasted paragraph reaches a 40px heading on the dashboard.
  it('requires both and caps them at 60 characters', () => {
    render(<AuthScreen {...props} authTab="up" />);

    for (const label of ['First name', 'Last name']) {
      const field = screen.getByLabelText(label);
      expect(field).toBeRequired();
      expect(field).toHaveAttribute('maxLength', '60');
    }
  });
});

describe('what sign-up sends', () => {
  it('carries both names as metadata, trimmed', async () => {
    supabase.auth.signUp.mockResolvedValue(SIGNED_UP);
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="up" />);

    await user.type(screen.getByLabelText('First name'), '  Shojib  ');
    await user.type(screen.getByLabelText('Last name'), '  Mahmud  ');
    await user.type(screen.getByLabelText('Email address'), 'shojib@example.de');
    await user.type(screen.getByLabelText('Password'), 'sixchars');
    await user.click(screen.getByRole('button', { name: 'Start learning' }));

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'shojib@example.de',
      password: 'sixchars',
      options: { data: { first_name: 'Shojib', last_name: 'Mahmud' } },
    });
  });

  // Non-Latin scripts are the point, not an edge case: Lesener's readers write
  // Bengali. A name must arrive exactly as typed.
  it('passes a non-Latin name through unchanged', async () => {
    supabase.auth.signUp.mockResolvedValue(SIGNED_UP);
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="up" />);

    await user.type(screen.getByLabelText('First name'), 'শোহাব');
    await user.type(screen.getByLabelText('Last name'), 'Müller');
    await user.type(screen.getByLabelText('Email address'), 'a@example.de');
    await user.type(screen.getByLabelText('Password'), 'sixchars');
    await user.click(screen.getByRole('button', { name: 'Start learning' }));

    expect(supabase.auth.signUp.mock.calls[0][0].options.data).toEqual({
      first_name: 'শোহাব',
      last_name: 'Müller',
    });
  });

  it('sends no options when signing in', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue(SIGNED_UP);
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="in" />);

    await user.type(screen.getByLabelText('Email address'), 'shojib@example.de');
    await user.type(screen.getByLabelText('Password'), 'sixchars');
    // 'Sign in' names both the tab and the submit button; only one submits.
    await user.click(
      screen.getAllByRole('button', { name: 'Sign in' }).find((b) => b.type === 'submit'),
    );

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'shojib@example.de',
      password: 'sixchars',
    });
  });

  // Signing up an address that already exists returns a decoy user with no
  // identities and creates nothing — so no name is recorded either. The reader
  // must be told, rather than left waiting for a mail that will never come.
  it('records no name when the address is already taken', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="up" />);

    await user.type(screen.getByLabelText('First name'), 'Shojib');
    await user.type(screen.getByLabelText('Last name'), 'Mahmud');
    await user.type(screen.getByLabelText('Email address'), 'taken@example.de');
    await user.type(screen.getByLabelText('Password'), 'sixchars');
    await user.click(screen.getByRole('button', { name: 'Start learning' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
