import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
  },
}));

import { supabase } from '../src/lib/supabase';
import { fetchProgress, recordFinish } from '../src/lib/progress';
import { stubSupabase } from './helpers/supabase';

const READER = 'reader-1';

let calls;

function stub(tables) {
  const stubbed = stubSupabase(tables);
  calls = stubbed.calls;
  supabase.from.mockImplementation(stubbed.from);
}

function signedIn(userId = READER) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null });
}

const sent = () => calls.insert[0][1];

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
});

describe('reading the reader’s progress', () => {
  it('asks only for the columns the dashboard needs', async () => {
    stub({ reading_progress: { data: [], error: null } });

    await fetchProgress();

    expect(calls.from).toEqual(['reading_progress']);
    expect(calls.select[0]).toBe('post_id, best_percent_read, completed_at');
  });

  it('returns a row per post the reader has touched', async () => {
    const rows = [
      { post_id: 101, best_percent_read: 100, completed_at: '2026-08-18T10:00:00Z' },
      { post_id: 103, best_percent_read: 62, completed_at: null },
    ];
    stub({ reading_progress: { data: rows, error: null } });

    await expect(fetchProgress()).resolves.toEqual(rows);
  });

  // A reader who has finished nothing has no rows at all, which is not a
  // failure — reading_progress gains a row only once a session exists.
  it('treats no rows as an empty history rather than an error', async () => {
    stub({ reading_progress: { data: null, error: null } });

    await expect(fetchProgress()).resolves.toEqual([]);
  });

  it('throws rather than resolving to nothing when refused', async () => {
    stub({ reading_progress: { data: null, error: { code: '42501', message: 'permission denied' } } });

    await expect(fetchProgress()).rejects.toThrow(
      'Could not load your reading progress [42501]: permission denied',
    );
  });
});

describe('recording a finished post', () => {
  const ok = { reading_sessions: { data: null, error: null } };

  it('writes one completed session for the signed-in reader', async () => {
    stub(ok);

    await recordFinish({ postId: 101, percentRead: 100 });

    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0][0]).toBe('reading_sessions');
    expect(sent()).toMatchObject({ user_id: READER, post_id: 101, completed: true });
  });

  // Not a hardcoded 100. What the reader actually reached is the whole point of
  // percent_read; sending a constant would make the column decorative.
  it('sends the percentage it was given', async () => {
    stub(ok);

    await recordFinish({ postId: 101, percentRead: 68 });

    expect(sent().percent_read).toBe(68);
  });

  // reading_sessions_one_open_idx is unique on (user_id, post_id) WHERE
  // ended_at is null. A null here lets the first finish through and fails the
  // second with 23505 — so the bug would only ever appear to a reader who
  // re-read something.
  it('sets ended_at, so a second finish on the same post is possible', async () => {
    stub(ok);

    await recordFinish({ postId: 101, percentRead: 100 });

    expect(sent().ended_at).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(sent().ended_at))).toBe(false);
  });

  // Proven against the real database in Stage A, where this failed on the very
  // first insert. The table checks (ended_at is null or ended_at >= started_at).
  // Omitting started_at compares a timestamp made here, before the request was
  // sent, against one Postgres evaluated after it arrived — so ended_at is
  // always earlier and every write dies with 23514, however well the clocks
  // agree. Sending both from one reading is what makes the check meaningful.
  it('sends started_at too, and never later than ended_at', async () => {
    stub(ok);

    await recordFinish({ postId: 101, percentRead: 100 });

    expect(sent().started_at).toEqual(expect.any(String));
    expect(Date.parse(sent().started_at)).toBeLessThanOrEqual(Date.parse(sent().ended_at));
  });

  // Decision 7 rests entirely on this. supabase-js resolves on a failed write,
  // so without the throw App would mark the post complete on a row that never
  // landed, and the badge would vanish on the next load.
  it('throws when the write is refused', async () => {
    stub({ reading_sessions: { data: null, error: { code: '42501', message: 'permission denied' } } });

    await expect(recordFinish({ postId: 101, percentRead: 100 })).rejects.toThrow(
      'Could not save your progress [42501]: permission denied',
    );
  });

  it('refuses to write at all when nobody is signed in', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    stub(ok);

    await expect(recordFinish({ postId: 101, percentRead: 100 })).rejects.toThrow(/no signed-in reader/);
    expect(calls.insert).toHaveLength(0);
  });
});
