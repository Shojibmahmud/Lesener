import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { supabase } from '../src/lib/supabase';
import ChangePasswordModal from '../src/components/ChangePasswordModal';

async function fillAndSubmit({ current = 'oldpassword', next = 'newpassword' } = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.click(screen.getByRole('button', { name: 'Update password' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.signOut.mockResolvedValue({ error: null });
});

// Acceptance criterion 16.
describe('a wrong current password', () => {
  beforeEach(() => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
  });

  it('is refused in the reader’s own words', async () => {
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit({ current: 'wrongpassword' });

    expect(await screen.findByRole('alert')).toHaveTextContent('That is not your current password.');
  });

  it('changes nothing at all', async () => {
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit({ current: 'wrongpassword' });

    // The whole point of proving the current password first: a refusal here must
    // not reach the update, or a passer-by could lock the owner out.
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});

// Acceptance criterion 17.
describe('the right current password', () => {
  beforeEach(() => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    supabase.auth.updateUser.mockResolvedValue({ error: null });
  });

  it('proves the current password before changing anything', async () => {
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit();

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.de',
      password: 'oldpassword',
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
  });

  it('signs out the other devices but not this one', async () => {
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit();

    // 'others' is what keeps the reader signed in here while dropping anyone
    // else holding a session. A bare signOut() would sign them out too.
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('confirms the change and says what happened to the other devices', async () => {
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit();

    expect(await screen.findByText('Password updated')).toBeInTheDocument();
    expect(screen.getByText(/still signed in here/i)).toBeInTheDocument();
  });

  it('reports a failed update instead of claiming success', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      error: { code: 'same_password', message: 'raw supabase wording' },
    });
    render(<ChangePasswordModal email="anna@example.de" onClose={() => {}} />);

    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/already your password/i);
    expect(screen.queryByText('Password updated')).not.toBeInTheDocument();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});
