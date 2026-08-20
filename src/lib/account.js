import { supabase } from './supabase';

// Erasing the account, which is the one thing in the app the browser cannot do
// for itself.
//
// `auth.admin.deleteUser` needs the service-role key, and the publishable key
// this client is built with only ever acts as `anon`. Nor is there a
// delete-my-own-rows fallback: `authenticated` holds no DELETE grant on
// profiles, reading_sessions or reading_progress, so three of the four tables
// refuse before RLS is consulted. The work therefore happens in the
// `delete-account` Edge Function (supabase/functions/delete-account/index.ts),
// and this module is only the way in.
//
// No user id is sent. The function reads it from the JWT that supabase-js
// attaches to the invocation, and deliberately ignores anything in the body but
// the password -- a server-side delete that trusted an id from its caller would
// let any signed-in reader erase anybody.
//
// This does not go through rows() from query.js. That helper turns a PostgREST
// read into a throw-or-array and retries clock skew; neither applies here, and
// its wrapping would flatten the one distinction this call depends on -- a
// wrong password is something the reader can fix, and everything else is not.

const MESSAGES = {
  wrong_password: 'That is not your password.',
  not_signed_in: 'You are not signed in any more. Sign in again to delete your account.',
  // Unreachable today, and kept deliberately. The plan was to lean on the auth
  // service's rate limit, and it turned out not to reach through an Edge
  // Function: 140 consecutive wrong passwords were measured against this
  // endpoint without one refusal, while a direct sign-in is refused at about
  // the thirty-fifth. So the app promises the reader nothing about attempts
  // being limited -- but if a limit is ever added, or ever starts applying,
  // this is the sentence it should produce rather than the wrong-password one.
  too_many_attempts: 'Too many attempts. Wait a few minutes and try again.',
};

// Resolves with nothing. There is no row to hand back -- the account that would
// have owned it is gone.
export async function deleteAccount(password) {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { password },
  });

  if (!error) return;

  // supabase-js reports every non-2xx as the same generic FunctionsHttpError,
  // and puts the function's own JSON behind error.context. Without reading it
  // the reader would be told the identical unhelpful sentence whether they
  // mistyped their password or the service fell over -- which is the reason
  // authUi.js's ERROR_TEXT map exists for the auth calls.
  let code = '';

  try {
    const body = await error.context?.json();
    code = typeof body?.error === 'string' ? body.error : '';
  } catch {
    /* No JSON body -- a network failure or a crash before the handler ran. */
  }

  if (MESSAGES[code]) {
    throw new Error(MESSAGES[code]);
  }

  // The status is worth carrying: it is the only clue left about a failure
  // nobody anticipated, and it follows how vocab.js appends a PostgREST code.
  const status = error.context?.status ? ` [${error.context.status}]` : '';

  throw new Error(`Your account could not be deleted${status}. Please try again.`);
}
