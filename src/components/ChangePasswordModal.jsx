import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { authErrorText, errorMessageStyle, noticeMessageStyle, submitButtonStyle } from '../lib/authUi';
import PasswordField from './PasswordField';

export default function ChangePasswordModal({ email, onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);

    // There is no "check this password" call, so proving they know the current
    // one means signing in with it. Doing this first is what makes a wrong
    // current password refuse the change rather than quietly perform it.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });

    if (reauthError) {
      setError(
        reauthError.code === 'invalid_credentials'
          ? 'That is not your current password.'
          : authErrorText(reauthError),
      );
      setBusy(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      setError(authErrorText(updateError));
      setBusy(false);
      return;
    }

    // 'others' leaves this browser signed in and drops every other device —
    // the whole point of changing a password you suspect somebody else has.
    await supabase.auth.signOut({ scope: 'others' });

    setDone(true);
    setBusy(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        // `margin: auto` on the card instead of centring the flex line: a
        // flex-centred item taller than the backdrop overflows *both* ways and
        // its top becomes unreachable, which is what a tall dialog does on a
        // short phone. Auto margins centre while still allowing a scroll.
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        zIndex: 70,
        padding: 24,
        animation: 'fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          margin: 'auto',
          maxWidth: 420,
          background: 'var(--surf)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: 30,
          animation: 'rise .3s ease',
        }}
      >
        <h2 style={{ font: '400 26px var(--serif)', margin: '0 0 8px' }}>
          {done ? 'Password updated' : 'Change your password'}
        </h2>

        {done ? (
          <>
            <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
              You are still signed in here. Every other device has been signed out.
            </p>
            <button type="button" className="btnp" onClick={onClose} style={submitButtonStyle(false)}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 22px' }}>
              Confirm the password you use now, then pick a new one of at least six characters.
            </p>

            {error && (
              <p role="alert" style={errorMessageStyle}>
                {error}
              </p>
            )}
            <p role="status" style={noticeMessageStyle}>
              Your other devices will be signed out.
            </p>

            <PasswordField
              id="current-password"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              disabled={busy}
            />
            <PasswordField
              id="next-password"
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              disabled={busy}
              minLength={6}
              marginBottom={24}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btng"
                onClick={onClose}
                disabled={busy}
                style={{ flex: 1, padding: 13, borderRadius: 11, border: '1px solid var(--line)', font: '600 14px var(--ui)' }}
              >
                Cancel
              </button>
              <button type="submit" className="btnp" disabled={busy} style={{ ...submitButtonStyle(busy), flex: 1, padding: 13, borderRadius: 11, font: '600 14px var(--ui)' }}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
