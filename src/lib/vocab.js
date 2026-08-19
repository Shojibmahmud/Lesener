import { supabase } from './supabase';
import { rows } from './query';

// Read and write layer over the reader's own vocabulary, mirroring content.js
// and progress.js.
//
// saved_words is the only table in the schema where a reader may delete, and
// that grant shapes this whole module. RLS scopes every statement below to the
// signed-in reader, so no query filters by user id: the database already
// decides whose rows these are, and asking nicely would add nothing.
//
// Three columns describe one word. `term` is the lowercase key that
// unique (user_id, term) and the dictionary both hinge on; `surface_form` is
// what the reader actually tapped, and what the bank shows; `post_label` is the
// heading as it read at the time, kept only for the day the post is no longer
// there to be asked.

// Oldest first, so the bank lists words in the order they were met — the order
// the array this replaced appended in.
export function fetchSavedWords() {
  return rows(
    () =>
      supabase
        .from('saved_words')
        .select('id, post_id, post_label, term, surface_form, translation')
        .order('created_at', { ascending: true }),
    'your saved words',
  );
}

// Returns the stored row, which is the point: the caller needs the `id` to be
// able to delete it later, and taking it from the database rather than
// inventing one locally means the row on screen is the row that exists.
// `term` is derived here, not taken from the caller. It is the key that
// unique (user_id, term) and the dictionary both hinge on, and the database
// refuses any row where it is not the lowercase of surface_form — so there is
// no version of this the caller should be able to get wrong.
export async function saveWord({ postId, postLabel, surfaceForm, translation }) {
  const term = surfaceForm.toLowerCase();

  // getSession reads the stored session; getUser would spend a round trip
  // asking the server something the client already knows. The insert needs the
  // id because the RLS check compares user_id against auth.uid() — there is no
  // column default to fall back on.
  const { data, error: sessionError } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;

  if (sessionError || !userId) {
    throw new Error('Could not save that word: no signed-in reader.');
  }

  const { data: inserted, error } = await supabase
    .from('saved_words')
    .insert({
      user_id: userId,
      post_id: postId,
      post_label: postLabel,
      term,
      surface_form: surfaceForm,
      // Null, never the em dash the reader sees. The column is nullable for
      // exactly this reason: a stored '—' could not be told apart from a
      // dictionary entry that genuinely translates to a dash.
      translation: translation ?? null,
    })
    .select('id, post_id, post_label, term, surface_form, translation')
    .single();

  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not save that word${code}: ${error.message}`);
  }

  return inserted;
}

// Deleting is the one destructive thing a reader can do, and the policy that
// permits it is a USING clause — so a row belonging to somebody else is
// filtered out rather than rejected, and the statement succeeds having removed
// nothing. Proven against the live database in Stage B: no error, zero rows,
// the other reader's word still there.
//
// Counting what came back is therefore the only way to know it worked. Without
// the .select() this function would report success for every delete it was ever
// asked to make, including the ones that did nothing.
export async function deleteSavedWord(id) {
  const { data, error } = await supabase.from('saved_words').delete().eq('id', id).select('id');

  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not remove that word${code}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Could not remove that word: nothing was removed.');
  }
}
