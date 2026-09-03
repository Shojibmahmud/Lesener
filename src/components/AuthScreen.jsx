import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  authErrorText,
  errorMessageStyle,
  inputStyle,
  labelStyle,
  noticeMessageStyle,
  submitButtonStyle,
} from '../lib/authUi';
import Logo from './Logo';
import PasswordField from './PasswordField';
import ThemeToggle from './ThemeToggle';
import { gutter } from '../lib/responsive';

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

const linkStyle = {
  font: '600 12.5px var(--ui)',
  color: 'var(--ind)',
};

export default function AuthScreen({
  dark,
  toggleTheme,
  goLanding,
  authTab,
  setSignUp,
  setSignIn,
  initialForgot = false,
  initialMessage = null,
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(initialForgot);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialMessage?.kind === 'error' ? initialMessage.text : '');
  const [notice, setNotice] = useState(initialMessage?.kind === 'notice' ? initialMessage.text : '');
  const [busy, setBusy] = useState(false);

  const isUp = authTab === 'up';

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const switchTab = (next) => {
    clearMessages();
    setForgot(false);
    setSent(false);
    if (next === 'up') setSignUp();
    else setSignIn();
  };

  const openForgot = () => {
    clearMessages();
    setSent(false);
    setForgot(true);
  };

  const backToSignIn = () => {
    clearMessages();
    setForgot(false);
    setSent(false);
    setSignIn();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMessages();
    setBusy(true);

    const credentials = { email: email.trim(), password };
    // The names ride along as sign-up metadata, which is where the database's
    // own trigger has been looking for them since the schema was written. They
    // are therefore subject to every branch below: a sign-up that does not
    // create an account does not record a name either, which is what we want.
    const { data, error: authError } = isUp
      ? await supabase.auth.signUp({
          ...credentials,
          options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
        })
      : await supabase.auth.signInWithPassword(credentials);

    if (authError) {
      setError(authErrorText(authError));
      setBusy(false);
      return;
    }

    // Signing up an address that already exists is not an error while email
    // enumeration protection is on: Supabase returns a decoy user carrying no
    // identities. Without this branch a duplicate registration looks like it
    // worked and the reader waits for a mail that will never arrive.
    if (isUp && data.user?.identities?.length === 0) {
      setError(authErrorText({ code: 'user_already_exists' }));
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

  const requestReset = async (e) => {
    e.preventDefault();
    if (busy) return;
    clearMessages();
    setBusy(true);

    const address = email.trim();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: window.location.origin,
    });

    // The hourly send cap is swallowed on purpose. It can only be reached by an
    // address that really has an account, so showing it would answer exactly the
    // question the neutral confirmation below exists to refuse. The cost is a
    // reader who waits for a mail that never comes — accepted knowingly.
    if (resetError && resetError.code !== 'over_email_send_rate_limit') {
      setError(authErrorText(resetError));
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  };

  const messages = (
    <>
      {error && (
        <p role="alert" style={errorMessageStyle}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={noticeMessageStyle}>
          {notice}
        </p>
      )}
    </>
  );

  // Sign-up only: somebody signing in has already told us who they are, and the
  // reset form deliberately asks for nothing but an address.
  //
  // No extracted component. PasswordField exists because its reveal toggle is
  // behaviour; these two share only styling, and the style objects already carry
  // that. maxLength matches the database's 60-character limit — it counts UTF-16
  // code units rather than characters, so on astral-plane input it is stricter
  // than the column, never looser, and cannot produce a value the check refuses.
  //
  // The row wraps rather than squeezing: side by side inside a 420px card both
  // fields are comfortable, but on a 320px screen they become two ~110px boxes.
  // A 150px flex basis is what decides when they stop sharing a line.
  const nameInputs = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        <label htmlFor="auth-first-name" style={labelStyle}>
          First name
        </label>
        <input
          id="auth-first-name"
          type="text"
          required
          autoComplete="given-name"
          maxLength={60}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={busy}
          style={{ ...inputStyle, marginBottom: 16 }}
        />
      </div>
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        <label htmlFor="auth-last-name" style={labelStyle}>
          Last name
        </label>
        <input
          id="auth-last-name"
          type="text"
          required
          autoComplete="family-name"
          maxLength={60}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          disabled={busy}
          style={{ ...inputStyle, marginBottom: 16 }}
        />
      </div>
    </div>
  );

  const emailInput = (
    <>
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
    </>
  );

  return (
    // A real header row rather than two absolutely positioned corners. Absolute
    // placement is fine while the card is short, but the card is centred and
    // grows with the form -- the sign-up card is tall enough that on a phone its
    // top corners reached up under the logo and the toggle and sat behind them.
    // A column with the card taking `margin: auto` centres it in whatever space
    // is left over instead, so the two can never collide at any height.
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: gutter, animation: 'fade .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
        <Logo onClick={goLanding} />
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, margin: 'auto', animation: 'rise .4s cubic-bezier(.2,.7,.3,1)' }}>
        <div
          style={{
            background: isUp ? 'var(--ind-up-soft)' : 'var(--surf)',
            border: '1px solid var(--line)',
            borderRadius: 20,
            boxShadow: 'var(--shadow-lg)',
            padding: 32,
            transition: 'background .2s ease',
          }}
        >
          {forgot ? (
            <>
              <h2 style={{ font: '400 30px/1.2 var(--serif)', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                Reset your password
              </h2>
              <p style={{ font: '400 14.5px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
                {sent
                  ? 'Follow the link in the email to choose a new password.'
                  : 'Tell us your address and we will send a link to choose a new one.'}
              </p>

              {messages}

              {sent ? (
                <>
                  {/* Worded so it reads the same whether or not that address has
                      an account — and the same when the hourly cap swallowed the
                      request. Nothing here confirms the account exists. */}
                  <p role="status" style={noticeMessageStyle}>
                    If an account exists for <strong>{email.trim()}</strong>, a link is on its way. It
                    is good for about an hour.
                  </p>
                  <button type="button" className="btng" onClick={backToSignIn} style={{ ...submitButtonStyle(false), background: 'none', color: 'var(--text)', border: '1px solid var(--line)' }}>
                    Back to sign in
                  </button>
                </>
              ) : (
                <form onSubmit={requestReset}>
                  {emailInput}
                  <button type="submit" className="btnp" disabled={busy} style={{ ...submitButtonStyle(busy), marginTop: 8 }}>
                    {busy ? 'Sending…' : 'Send reset link'}
                  </button>
                  <p style={{ textAlign: 'center', margin: '16px 0 0' }}>
                    <button type="button" onClick={backToSignIn} style={linkStyle}>
                      Back to sign in
                    </button>
                  </p>
                </form>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', padding: 4, background: 'var(--surf2)', borderRadius: 12, marginBottom: 26 }}>
                <button type="button" onClick={() => switchTab('up')} style={tabStyle(isUp)}>
                  Create account
                </button>
                <button type="button" onClick={() => switchTab('in')} style={tabStyle(!isUp)}>
                  Sign in
                </button>
              </div>
              <h2 style={{ font: '400 30px/1.2 var(--serif)', margin: '0 0 6px', letterSpacing: '-.02em' }}>
                {isUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p style={{ font: '400 14.5px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
                {isUp ? 'Ten B1 texts are waiting. No card, no trial timer.' : 'Pick up where you left off.'}
              </p>

              <form onSubmit={submit}>
                {messages}
                {isUp && nameInputs}
                {emailInput}
                <PasswordField
                  id="auth-password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={isUp ? 'new-password' : 'current-password'}
                  disabled={busy}
                  minLength={6}
                  marginBottom={isUp ? 24 : 8}
                />
                {/* Sign in only: someone creating an account has no password to
                    have forgotten yet. */}
                {!isUp && (
                  <p style={{ textAlign: 'right', margin: '0 0 20px' }}>
                    <button type="button" onClick={openForgot} style={linkStyle}>
                      Forgot password?
                    </button>
                  </p>
                )}
                <button
                  type="submit"
                  className="btnp"
                  disabled={busy}
                  style={isUp ? { ...submitButtonStyle(busy), background: 'var(--ind-up)' } : submitButtonStyle(busy)}
                >
                  {busy ? 'One moment…' : isUp ? 'Start learning' : 'Sign in'}
                </button>
              </form>

              <p style={{ font: '400 12.5px/1.6 var(--ui)', color: 'var(--muted)', textAlign: 'center', margin: '18px 0 0' }}>
                By continuing you agree to our terms and privacy policy.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
