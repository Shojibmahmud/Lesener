// A stand-in for the part of supabase-js the content layer uses.
//
// postgrest-js builders are thenables, not promises: every filter returns the
// builder and awaiting it is what runs the request. Anything that resolves too
// early — a plain promise, a mock returning data directly — would let a missing
// .eq() or .order() pass unnoticed, because the request would already have been
// made by the time the filter was left off.
//
// `tables` maps a table name to what awaiting its builder resolves to. Either a
// fixed result:
//
//   stubSupabase({ levels: { data: [...], error: null } })
//
// or a function of the filters that builder was given, for when one table is
// queried more than once with different arguments:
//
//   stubSupabase({ posts: ({ level_id }) => ({ data: byLevel[level_id] ?? [], error: null }) })
//
// Writes are recorded too: `calls.insert` collects [table, payload] pairs, so
// a case can assert what an insert actually sent rather than only that it
// resolved.
//
// The function is called at await time rather than at from() time, so it sees
// every filter the caller applied, and which kind of statement it turned out to
// be. A table with no entry resolves empty.
//
// The second argument matters once one table is read, inserted into and deleted
// from — saved_words is all three — because keying only on the table name would
// make every one of them answer the same way:
//
//   stubSupabase({ saved_words: (filters, op) =>
//     op === 'delete' ? { data: [{ id: 7 }], error: null } : { data: rows, error: null } })
// Edge Functions are the second argument, because they are not tables and share
// nothing with the builder above: `functions.invoke` resolves straight to
// { data, error } with no chaining in between.
//
//   stubSupabase({}, { 'delete-account': { data: { deleted: true }, error: null } })
//
// A failing invocation is what most cases need, and supabase-js does not put the
// function's own JSON in the error -- it puts a generic "non-2xx status code"
// message there and hides the body behind error.context. So a stubbed failure
// has to carry a context whose .json() resolves to the payload, or the code
// under test would be reading something the real client never returns:
//
//   { data: null, error: { message: 'Edge Function returned a non-2xx status code',
//                          context: { status: 401, json: async () => ({ error: 'wrong_password' }) } } }
export function stubSupabase(tables, fns = {}) {
  const calls = { from: [], select: [], eq: [], order: [], range: [], insert: [], update: [], delete: [], invoke: [] };

  function from(table) {
    calls.from.push(table);

    // Per builder, not per stub: loadContent calls from('posts') once per level,
    // and each of those has to answer for the level id its own .eq() was given.
    const filters = {};
    let op = 'select';
    let single = false;

    const builder = {
      select: (columns) => (calls.select.push(columns), builder),
      // Recorded per table, because what a write sent is the whole assertion:
      // a column left off here is a row the database refuses, and nothing else
      // in the suite would notice.
      insert: (payload) => ((op = 'insert'), calls.insert.push([table, payload]), builder),
      // Updating is recorded like an insert, and for the delete's reason too:
      // profiles_update_own is a USING clause, so an update aimed at somebody
      // else's row resolves having changed nothing. What it sent and what it
      // filtered on are the only evidence it aimed at the right one.
      update: (payload) => ((op = 'update'), calls.update.push([table, payload]), builder),
      // Deleting is recorded the same way, and for a sharper reason: the
      // saved_words delete policy filters rather than raises, so a delete that
      // removed nothing still resolves. What it filtered on is the only
      // evidence that it aimed at the right row.
      delete: () => ((op = 'delete'), calls.delete.push(table), builder),
      // Unwraps at await time exactly as postgrest-js does, so code that forgets
      // .single() is handed an array and fails on the shape rather than passing
      // by luck.
      single: () => ((single = true), builder),
      eq: (column, value) => (calls.eq.push([column, value]), (filters[column] = value), builder),
      order: (column) => (calls.order.push(column), builder),
      // Recorded into `filters` rather than only into `calls`, so a stub that is
      // a function can answer differently per page. That is the only way to
      // reproduce PostgREST's 1000-row cap in a test, and the cap is not
      // hypothetical: it silently truncated the dictionary once the seeded
      // content passed a thousand terms.
      range: (from, to) => (
        calls.range.push([from, to]), (filters.__range = [from, to]), builder
      ),
      then: (resolve, reject) => {
        const answer = tables[table];
        const raw = typeof answer === 'function' ? answer(filters, op) : answer;
        let result = raw ?? { data: [], error: null };
        if (single && Array.isArray(result.data)) {
          result = { ...result, data: result.data[0] ?? null };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return builder;
  }

  // Recorded like a write, and for the same reason: what the invocation sent is
  // the whole assertion. A password left out of the body is a delete the server
  // refuses, and nothing else in the suite would notice.
  const functions = {
    invoke: (name, options) => {
      calls.invoke.push([name, options]);
      const answer = fns[name];
      const raw = typeof answer === 'function' ? answer(options) : answer;
      return Promise.resolve(raw ?? { data: null, error: null });
    },
  };

  return { from, functions, calls };
}
