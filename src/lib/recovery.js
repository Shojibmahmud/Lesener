// A recovery link comes back as a URL fragment. supabase-js reads that fragment
// itself, but asynchronously, and on success it wipes the hash the moment it is
// done — so anything the app wants to know about how this page load started has
// to be read *before* the client gets there. Hence a module that snapshots the
// hash at import time; main.jsx imports it ahead of everything else.

const raw = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
const params = new URLSearchParams(raw);

const errorCode = params.get('error_code') || params.get('error');

const LINK_ERROR_TEXT = {
  otp_expired:
    'That reset link has expired — they are only good for about an hour. Request a fresh one below.',
  access_denied:
    'That reset link is no longer valid. It may already have been used. Request a fresh one below.',
};

// A link that failed carries `error_code` instead of tokens. supabase-js only
// clears the hash on the success path, so a failed one would otherwise sit in
// the address bar and re-trigger on every reload. Clear it here, once, now that
// its meaning has been captured — but never touch a successful hash, since the
// client still has to read the tokens out of it.
if (errorCode && typeof window !== 'undefined') {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

/** Set when this page load began with a reset link that did not work. */
export const linkError = errorCode
  ? LINK_ERROR_TEXT[errorCode] || 'That reset link did not work. Request a fresh one below.'
  : null;

// Knowing this synchronously is what stops the dashboard flashing up: the link
// grants a real session, so without it the app would route the reader straight
// to their dashboard before the PASSWORD_RECOVERY event arrives a tick later.
export const startedInRecovery = params.get('type') === 'recovery';
