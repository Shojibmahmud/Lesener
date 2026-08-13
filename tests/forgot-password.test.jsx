import { cleanup, render, screen } from '@testing-library/react';
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

// Drives the request form to completion and hands back what the reader is told.
async function confirmationFor(result, address = 'anna@example.de') {
  supabase.auth.resetPasswordForEmail.mockResolvedValue(result);
  const user = userEvent.setup();
  render(<AuthScreen {...props} authTab="in" />);

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
  await user.type(screen.getByLabelText('Email address'), address);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));

  const text = (await screen.findByRole('status')).textContent;
  cleanup();
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Acceptance criterion 1.
describe('the way in', () => {
  it('offers Forgot password? on the Sign in tab', () => {
    render(<AuthScreen {...props} authTab="in" />);

    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('does not offer it on the Create account tab', () => {
    render(<AuthScreen {...props} authTab="up" />);

    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument();
  });
});

// Acceptance criteria 2, 3 and 12 — the three cases that must be indistinguishable.
describe('what the reader is told', () => {
  it('never states whether the account exists', async () => {
    const text = await confirmationFor({ error: null });

    expect(text).toMatch(/if an account exists/i);
  });

  it('says exactly the same thing when the hourly cap swallowed the request', async () => {
    const delivered = await confirmationFor({ error: null });
    const capped = await confirmationFor({
      error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    });

    // The cap can only be hit by an address that really has an account, so any
    // difference here would answer the question the wording exists to refuse.
    expect(capped).toBe(delivered);
    expect(capped).not.toMatch(/rate limit/i);
  });

  it('asks Supabase to send the reader back to this app', async () => {
    await confirmationFor({ error: null });

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'anna@example.de',
      expect.objectContaining({ redirectTo: expect.stringContaining('http') }),
    );
  });

  it('trims a pasted address before sending it', async () => {
    await confirmationFor({ error: null }, '  anna@example.de  ');

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'anna@example.de',
      expect.anything(),
    );
  });

  it('still surfaces failures that are not the cap', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: 'email_address_invalid', message: 'raw supabase wording' },
    });
    const user = userEvent.setup();
    render(<AuthScreen {...props} authTab="in" />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.type(screen.getByLabelText('Email address'), 'anna@example.de');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/does not look valid/i);
    expect(alert).not.toHaveTextContent('raw supabase wording');
  });
});

// Acceptance criterion 11, as it reaches the reader from App.
describe('an expired link', () => {
  it('opens the request form with the explanation already showing', () => {
    render(
      <AuthScreen
        {...props}
        authTab="in"
        initialForgot
        initialMessage={{ kind: 'error', text: 'That reset link has expired — request a fresh one below.' }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });
});
