import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { authErrorText, errorMessageStyle, noticeMessageStyle, submitButtonStyle } from '../lib/authUi';
import Logo from './Logo';
import PasswordField from './PasswordField';
import ThemeToggle from './ThemeToggle';

export default function NewPassword({ dark, toggleTheme, goLanding, email, onComplete, onExpired }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // The link's session is what authorises this change, so if it has lapsed
      // there is nothing to retry — only a fresh link will do.
      if (updateError.code === 'session_not_found' || updateError.name === 'AuthSessionMissingError') {
        setExpired(true);
      } else {
        setError(authErrorText(updateError));
      }
      setBusy(false);
      return;
    }

    // App signs out everywhere and routes back to Sign in; leaving busy true
    // keeps the button inert through the unmount.
    onComplete();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative', animation: 'fade .35s ease' }}>
      <ThemeToggle dark={dark} onToggle={toggleTheme} style={{ position: 'absolute', top: 24, right: 32 }} />
      <div style={{ position: 'absolute', top: 24, left: 32 }}>
        <Logo onClick={goLanding} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, animation: 'rise .4s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', padding: 32 }}>
          <h2 style={{ font: '400 30px/1.2 var(--serif)', margin: '0 0 6px', letterSpacing: '-.02em' }}>
            Choose a new password
          </h2>

          {/* Naming the address matters when the link was opened in a browser
              already signed in as somebody else — that session has just been
              replaced, and nobody should be left guessing whose account this is. */}
          <p style={{ font: '400 14.5px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
            {email ? <>You are setting the password for <strong>{email}</strong>.</> : 'Pick something you will remember.'}
          </p>

          {expired ? (
            <>
              <p role="alert" style={errorMessageStyle}>
                That reset link is no longer valid. Request a fresh one and try again.
              </p>
              <button type="button" className="btnp" onClick={onExpired} style={submitButtonStyle(false)}>
                Request a new link
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              {error && (
                <p role="alert" style={errorMessageStyle}>
                  {error}
                </p>
              )}
              <p role="status" style={noticeMessageStyle}>
                You will be signed out everywhere once this is saved, then sign in with the new password.
              </p>
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={busy}
                minLength={6}
                marginBottom={24}
              />
              <button type="submit" className="btnp" disabled={busy} style={submitButtonStyle(busy)}>
                {busy ? 'Saving…' : 'Save new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
