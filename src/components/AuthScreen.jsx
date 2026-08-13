import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

function tabStyle(active) {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 9,
    font: '600 13.5px var(--ui)',
    transition: 'all .2s ease',
    background: active ? 'var(--surf)' : 'none',
    color: active ? 'var(--text)' : 'var(--muted)',
    boxShadow: active ? 'var(--shadow)' : 'none',
  };
}

const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 11,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  color: 'var(--text)',
  font: '400 14.5px var(--ui)',
};

const labelStyle = {
  display: 'block',
  font: '600 12.5px var(--ui)',
  color: 'var(--muted)',
  marginBottom: 7,
};

// Supabase's raw strings leak its own vocabulary ("email rate limit exceeded"),
// which tells a reader nothing about what to do. Anything unmapped falls through
// to the original message rather than a useless generic.
const ERROR_TEXT = {
  over_email_send_rate_limit:
    'Too many confirmation emails have gone out in the last hour. Please try again a little later.',
  email_not_confirmed: 'Confirm your email first — check your inbox for the link we sent.',
  invalid_credentials: 'That email and password do not match.',
  user_already_exists: 'An account with that email already exists. Try signing in instead.',
  email_exists: 'An account with that email already exists. Try signing in instead.',
  email_address_invalid: 'That email address does not look valid.',
};

const messageStyle = {
  font: '400 13px/1.55 var(--ui)',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 16,
};

export default function AuthScreen({ dark, toggleTheme, goLanding, authTab, setSignUp, setSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const isUp = authTab === 'up';
  const authTitle = isUp ? 'Create your account' : 'Welcome back';
  const authSub = isUp ? 'Ten B1 texts are waiting. No card, no trial timer.' : 'Pick up where you left off.';
  const authCta = isUp ? 'Start learning' : 'Sign in';

  const switchTab = (next) => {
    setError('');
    setNotice('');
    if (next === 'up') setSignUp();
    else setSignIn();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);

    const credentials = { email: email.trim(), password };
    const { data, error: authError } = isUp
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);

    if (authError) {
      setError(ERROR_TEXT[authError.code] || authError.message);
      setBusy(false);
      return;
    }

    // Signing up an address that already exists is not an error while email
    // enumeration protection is on: Supabase returns a decoy user carrying no
    // identities. Without this branch a duplicate registration looks like it
    // worked and the reader waits for a mail that will never arrive.
    if (isUp && data.user?.identities?.length === 0) {
      setError(ERROR_TEXT.user_already_exists);
      setBusy(false);
      return;
    }

    // Only reachable while "Confirm email" is on: sign-up returns a user but no
    // session, and there is nothing to route to until they click the link.
    // Otherwise App's onAuthStateChange listener unmounts this screen, so busy
    // is deliberately left true.
    if (!data.session) {
      setNotice(`Almost there — check ${credentials.email} for a confirmation link.`);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative', animation: 'fade .35s ease' }}>
      <ThemeToggle dark={dark} onToggle={toggleTheme} style={{ position: 'absolute', top: 24, right: 32 }} />
      <div style={{ position: 'absolute', top: 24, left: 32 }}>
        <Logo onClick={goLanding} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, animation: 'rise .4s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', padding: 32 }}>
          <div style={{ display: 'flex', padding: 4, background: 'var(--surf2)', borderRadius: 12, marginBottom: 26 }}>
            <button type="button" onClick={() => switchTab('up')} style={tabStyle(isUp)}>
              Create account
            </button>
            <button type="button" onClick={() => switchTab('in')} style={tabStyle(!isUp)}>
              Sign in
            </button>
          </div>
          <h2 style={{ font: '400 30px/1.2 var(--serif)', margin: '0 0 6px', letterSpacing: '-.02em' }}>{authTitle}</h2>
          <p style={{ font: '400 14.5px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>{authSub}</p>

          <form onSubmit={submit}>
            {error && (
              <p role="alert" style={{ ...messageStyle, background: 'var(--surf2)', color: 'var(--red)', border: '1px solid var(--red)' }}>
                {error}
              </p>
            )}
            {notice && (
              <p role="status" style={{ ...messageStyle, background: 'var(--surf2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                {notice}
              </p>
            )}

            <label htmlFor="auth-email" style={labelStyle}>
              Email address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              placeholder="anna@example.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <label htmlFor="auth-password" style={labelStyle}>
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={isUp ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              style={{ ...inputStyle, marginBottom: 24 }}
            />
            <button
              type="submit"
              className="btnp"
              disabled={busy}
              style={{
                width: '100%',
                padding: 15,
                borderRadius: 12,
                background: 'var(--ind)',
                color: '#fff',
                font: '600 15px var(--ui)',
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? 'One moment…' : authCta}
            </button>
          </form>

          <p style={{ font: '400 12.5px/1.6 var(--ui)', color: 'var(--muted)', textAlign: 'center', margin: '18px 0 0' }}>
            By continuing you agree to our terms and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
