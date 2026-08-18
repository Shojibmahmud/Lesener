import { supabase } from './supabase';
import { rows } from './query';

// Read and write layer over the reader's own history, mirroring content.js.
//
// The split is not arbitrary. `reading_sessions` carries insert for
// `authenticated`; `reading_progress` carries select only and is maintained
// solely by private.sync_reading_progress(). So this module writes sessions and
// reads progress, and never the other way round. A missing progress row is not
// an error — it simply means this reader has never finished that post.
//
// RLS scopes both tables to the signed-in reader, so neither query filters by
// user id. The database decides whose rows these are; asking nicely would add
// nothing it does not already enforce.

// One row per post the reader has ever finished or opened. `completed_at` is
// null until a completed session lands, which is what separates "read some of
// it" from "finished it".
export function fetchProgress() {
  return rows(
    () => supabase.from('reading_progress').select('post_id, best_percent_read, completed_at'),
    'your reading progress',
  );
}

// One completed session, written when the reader presses Finish. Decision 2:
// nothing is written when a post opens, so started_at and ended_at describe the
// same moment and session_count counts finishes rather than attempts.
export async function recordFinish({ postId, percentRead }) {
  // getSession reads the stored session; getUser would spend a round trip
  // asking the server something the client already knows. The insert needs the
  // id because the RLS check compares user_id against auth.uid() — there is no
  // column default to fall back on.
  const { data, error: sessionError } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;

  if (sessionError || !userId) {
    throw new Error('Could not save your progress: no signed-in reader.');
  }

  // Both timestamps from one clock reading, and both sent from here.
  //
  // ended_at must be set at all because reading_sessions_one_open_idx is unique
  // on (user_id, post_id) only WHERE ended_at is null — leaving it null lets the
  // first finish through and fails the second.
  //
  // started_at must be sent because the table also checks
  // (ended_at is null or ended_at >= started_at). Letting started_at take its
  // now() default would compare a timestamp generated here, before the request
  // was sent, against one Postgres evaluated after it arrived — so ended_at is
  // earlier by at least the round trip and the insert fails with 23514 every
  // time, however well the clocks agree. Both proven against the real database
  // in Stage A.
  const now = new Date().toISOString();

  const { error } = await supabase.from('reading_sessions').insert({
    user_id: userId,
    post_id: postId,
    percent_read: percentRead,
    completed: true,
    started_at: now,
    ended_at: now,
  });

  // Same rule rows() enforces for reads: supabase-js resolves on failure, so
  // without this the caller would mark the post complete on a write that never
  // landed — the exact thing Decision 7 forbids.
  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not save your progress${code}: ${error.message}`);
  }
}
