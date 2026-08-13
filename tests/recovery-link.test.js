import { beforeEach, describe, expect, it, vi } from 'vitest';

// recovery.js reads the URL fragment once, at import time — so each case needs
// the hash in place before the module is evaluated, and a fresh module registry.
async function loadRecovery(hash) {
  vi.resetModules();
  window.location.hash = hash;
  return import('../src/lib/recovery.js');
}

describe('recovery link fragment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('recognises a recovery link and leaves its fragment alone', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    const { startedInRecovery, linkError } = await loadRecovery(
      '#access_token=a-token&refresh_token=r-token&type=recovery',
    );

    expect(startedInRecovery).toBe(true);
    expect(linkError).toBeNull();

    // Load-bearing: the Supabase client still has to read those tokens out of
    // the URL. Clearing the fragment here would destroy the session before it
    // is ever established, and the reader would land on a dead reset screen.
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('explains an expired link and clears the fragment so a reload cannot replay it', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');

    const { startedInRecovery, linkError } = await loadRecovery(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );

    expect(startedInRecovery).toBe(false);
    expect(linkError).toMatch(/expired/i);
    expect(linkError).toMatch(/request a fresh one/i);
    expect(replaceState).toHaveBeenCalled();
  });

  it('falls back to a usable message for an unrecognised failure', async () => {
    const { linkError } = await loadRecovery('#error_code=something_new');

    expect(linkError).toBeTruthy();
    expect(linkError).not.toMatch(/something_new/);
  });

  it('reports nothing for an ordinary page load', async () => {
    const { startedInRecovery, linkError } = await loadRecovery('');

    expect(startedInRecovery).toBe(false);
    expect(linkError).toBeNull();
  });
});
