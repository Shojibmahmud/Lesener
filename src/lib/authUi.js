// The auth card's look used to live inside AuthScreen. Four forms now share it
// (sign in, sign up, request a reset, choose a new password, change password),
// so it lives here rather than as five near-identical copies that drift apart.

export const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  borderRadius: 11,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  color: 'var(--text)',
  font: '400 14.5px var(--ui)',
};

export const labelStyle = {
  display: 'block',
  font: '600 12.5px var(--ui)',
  color: 'var(--muted)',
  marginBottom: 7,
};

export const messageStyle = {
  font: '400 13px/1.55 var(--ui)',
  borderRadius: 10,
  padding: '10px 12px',
  marginBottom: 16,
};

export const errorMessageStyle = {
  ...messageStyle,
  background: 'var(--surf2)',
  color: 'var(--red)',
  border: '1px solid var(--red)',
};

export const noticeMessageStyle = {
  ...messageStyle,
  background: 'var(--surf2)',
  color: 'var(--muted)',
  border: '1px solid var(--line)',
};

export function submitButtonStyle(busy) {
  return {
    width: '100%',
    padding: 15,
    borderRadius: 12,
    background: 'var(--ind)',
    color: '#fff',
    font: '600 15px var(--ui)',
    opacity: busy ? 0.65 : 1,
  };
}

// Supabase's raw strings leak its own vocabulary ("email rate limit exceeded"),
// which tells a reader nothing about what to do. Anything unmapped falls through
// to the original message rather than a useless generic.
export const ERROR_TEXT = {
  over_email_send_rate_limit:
    'Too many confirmation emails have gone out in the last hour. Please try again a little later.',
  email_not_confirmed: 'Confirm your email first — check your inbox for the link we sent.',
  invalid_credentials: 'That email and password do not match.',
  user_already_exists: 'An account with that email already exists. Try signing in instead.',
  email_exists: 'An account with that email already exists. Try signing in instead.',
  email_address_invalid: 'That email address does not look valid.',
  same_password: 'That is already your password. Choose a different one.',
  weak_password: 'That password is too easy to guess. Try a longer one.',
  session_expired: 'That reset link is no longer valid. Request a fresh one below.',
};

export function authErrorText(error) {
  return ERROR_TEXT[error.code] || error.message;
}
