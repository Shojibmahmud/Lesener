// Erases the caller's own account.
//
// This exists because the browser cannot do it. `auth.admin.deleteUser` needs
// the service-role key, and the publishable key the app ships with only ever
// acts as `anon`. There is no client-side fallback either: `authenticated` holds
// no DELETE grant on profiles, reading_sessions or reading_progress, so three of
// the four tables refuse a reader's delete before RLS is even consulted.
//
// Everything below auth.users cascades from it (see 20260810103010_init_user_schema.sql),
// so one admin call erases the whole footprint. supabase/tests/rls_checks.sql
// proves that cascade; nothing here re-implements it.
//
// THREE GATES, and all of them are load-bearing:
//
//   1. verify_jwt at the gateway  -- the token is signed by this project.
//   2. auth.getUser() here        -- the token still names a live user. A JWT is
//                                    stateless and outlives its account by up to
//                                    an hour, so a signature is not proof the
//                                    account exists.
//   3. signInWithPassword here    -- the caller knows the password.
//
// The user id comes from the token and NEVER from the body. A service-role
// function that deletes whichever id it is handed is not a bug with a blast
// radius, it is an account-takeover primitive: any signed-in reader could erase
// anybody. The body carries exactly one field and every other key is ignored.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// `functions.invoke` sends a JSON body, which puts the request outside the
// CORS safelist and makes the browser issue an OPTIONS preflight first. A
// function that handles only POST works perfectly from curl and fails from the
// app, with an error that names CORS rather than anything about deleting.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authorization = req.headers.get('Authorization') ?? '';

  if (!authorization) {
    return json({ error: 'not_signed_in' }, 401);
  }

  let password = '';

  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (!password) {
    return json({ error: 'wrong_password' }, 401);
  }

  // Gate 2. This is a real round trip to the auth server, not a local decode:
  // it is the only thing that can tell a signed token for a deleted account
  // from a signed token for a live one.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;

  if (userError || !user?.id || !user.email) {
    return json({ error: 'not_signed_in' }, 401);
  }

  // Gate 3, on its own client. signInWithPassword replaces the session on
  // whatever client it is called against, so reusing `caller` would overwrite
  // the identity just established above.
  //
  // The caller's address is forwarded because the auth service buckets its rate
  // limit by source IP -- and every request this function makes leaves from the
  // same one. Without this header there is a single bucket for the whole
  // project, and one person guessing repeatedly would refuse everybody else's
  // delete with a message about waiting that has nothing to do with them.
  const forwardedFor = req.headers.get('x-forwarded-for');

  const verifier = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (passwordError) {
    // The auth service distinguishes "wrong password" from "too many attempts",
    // and so must this. Telling somebody their password is wrong when it is
    // merely their timing is the same kind of untruth this feature exists to
    // remove from the app.
    const status = (passwordError as { status?: number }).status;

    if (status === 429 || passwordError.code === 'over_request_rate_limit') {
      return json({ error: 'too_many_attempts' }, 429);
    }

    return json({ error: 'wrong_password' }, 401);
  }

  // No second argument. `shouldSoftDelete: true` would leave the auth.users row
  // in place, and the cascade fires on a row being deleted and at no other time
  // -- so a soft delete removes nothing below it while returning success. There
  // is no version of this feature that wants one.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('[lesener] account could not be deleted.', deleteError);
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ deleted: true }, 200);
});
