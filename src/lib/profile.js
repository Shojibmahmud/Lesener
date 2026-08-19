import { supabase } from './supabase';
import { rows } from './query';

// Read and write layer over the reader's own profile, mirroring content.js,
// progress.js and vocab.js.
//
// RLS scopes every statement here to the signed-in reader, so no query filters
// by user id on the way in: the database already decides whose row this is, and
// asking nicely would add nothing. The one exception is the update, which names
// the id anyway — see updateProfileName.
//
// A profile row is created by a database trigger when the account is made, not
// by this module. There is therefore no insert here and there should never be
// one: a client that could create its own profile could create a second.

// Returns the row, or null. Null is not an error — it is what a reader whose
// trigger somehow did not fire would see, and the dashboard has a nameless
// state ready for exactly that.
export async function fetchProfile() {
  const data = await rows(
    () => supabase.from('profiles').select('id, first_name, last_name'),
    'your profile',
  );

  return data[0] ?? null;
}

// The two fields are not treated alike, and the asymmetry is deliberate.
//
// Clearing a surname is a legitimate thing to do: an email address carries no
// surname, so every backfilled reader already has none, and the dashboard and
// account menu both render that state without comment. Clearing a first name is
// not. The nameless greeting exists as a guard against a null that should be
// unreachable — letting a reader choose it would turn that guard into a feature,
// and leave them looking at a dashboard that greets nobody.
export async function updateProfileName({ firstName, lastName }) {
  const first = (firstName ?? '').trim();
  const last = (lastName ?? '').trim();

  // Refused here rather than by the database, and before any request is made:
  // the column is nullable, so `first_name: null` would be accepted on its way
  // through. This is the only rule in the feature the schema cannot enforce.
  if (!first) {
    throw new Error('Your first name cannot be empty.');
  }

  const { data: session, error: sessionError } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;

  if (sessionError || !userId) {
    throw new Error('Could not save your name: no signed-in reader.');
  }

  // profiles_update_own is a USING clause, so somebody else's row is filtered
  // out rather than rejected and the statement succeeds having changed nothing.
  // Reading back what was actually updated is the only way to tell the two
  // apart — the same reasoning as deleteSavedWord.
  const { data, error } = await supabase
    .from('profiles')
    .update({ first_name: first, last_name: last || null })
    .eq('id', userId)
    .select('id, first_name, last_name');

  if (error) {
    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not save your name${code}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Could not save your name: nothing was updated.');
  }

  return data[0];
}
