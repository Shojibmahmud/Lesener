import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubSupabase } from './helpers/supabase';

const { supabase } = vi.hoisted(() => ({ supabase: { functions: null, from: null } }));

vi.mock('../src/lib/supabase', () => ({ supabase }));

const { deleteAccount } = await import('../src/lib/account');

// supabase-js does not put the function's own JSON in the error. It reports
// every non-2xx as the same generic message and hides the body behind
// error.context, so a stubbed failure has to be shaped the same way or the
// tests below would be proving something the real client never does.
function refusal(status, code) {
  return {
    data: null,
    error: {
      message: 'Edge Function returned a non-2xx status code',
      context: { status, json: async () => ({ error: code }) },
    },
  };
}

function install(answer) {
  const stub = stubSupabase({}, { 'delete-account': answer });
  supabase.functions = stub.functions;
  supabase.from = stub.from;
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleting an account', () => {
  it('sends the password and nothing else', async () => {
    const stub = install({ data: { deleted: true }, error: null });

    await deleteAccount('hunter2');

    expect(stub.calls.invoke).toEqual([['delete-account', { body: { password: 'hunter2' } }]]);
  });

  // The id lives in the JWT supabase-js attaches to the invocation. A client
  // that sent one would be inviting the server to trust it, and a server that
  // trusted it could erase anybody.
  it('never sends a user id', async () => {
    const stub = install({ data: { deleted: true }, error: null });

    await deleteAccount('hunter2');

    const [, options] = stub.calls.invoke[0];
    expect(Object.keys(options.body)).toEqual(['password']);
  });

  it('resolves with nothing when the account is gone', async () => {
    install({ data: { deleted: true }, error: null });

    await expect(deleteAccount('hunter2')).resolves.toBeUndefined();
  });

  it('says so in the reader’s own words when the password is wrong', async () => {
    install(refusal(401, 'wrong_password'));

    await expect(deleteAccount('nope')).rejects.toThrow('That is not your password.');
  });

  // Unreachable in practice -- the auth service's rate limit does not reach
  // through an Edge Function, measured at 140 attempts without a refusal. Kept
  // because the mapping is what stops a limit, if one is ever added, from
  // telling the reader their password was wrong.
  it('does not call a rate-limited attempt a wrong password', async () => {
    install(refusal(429, 'too_many_attempts'));

    await expect(deleteAccount('hunter2')).rejects.toThrow(
      'Too many attempts. Wait a few minutes and try again.',
    );
  });

  it('tells a reader whose session has gone what to do about it', async () => {
    install(refusal(401, 'not_signed_in'));

    await expect(deleteAccount('hunter2')).rejects.toThrow(/Sign in again/);
  });

  // The status is the only clue left about a failure nobody anticipated.
  it('carries the status through on an unrecognised refusal', async () => {
    install(refusal(500, 'delete_failed'));

    await expect(deleteAccount('hunter2')).rejects.toThrow('[500]');
  });

  // A crash before the handler ran, or a connection that dropped: there is no
  // JSON to read, and reading it must not become a second error on top.
  it('still fails cleanly when the refusal carries no body', async () => {
    install({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });

    await expect(deleteAccount('hunter2')).rejects.toThrow(/could not be deleted/);
  });

  it('never reports success on a refusal', async () => {
    install(refusal(401, 'wrong_password'));

    await expect(deleteAccount('nope')).rejects.toThrow();
  });
});
