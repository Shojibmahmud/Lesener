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
// every filter the caller applied. A table with no entry resolves empty.
export function stubSupabase(tables) {
  const calls = { from: [], select: [], eq: [], order: [], insert: [] };

  function from(table) {
    calls.from.push(table);

    // Per builder, not per stub: loadContent calls from('posts') once per level,
    // and each of those has to answer for the level id its own .eq() was given.
    const filters = {};

    const builder = {
      select: (columns) => (calls.select.push(columns), builder),
      // Recorded per table, because what a write sent is the whole assertion:
      // a column left off here is a row the database refuses, and nothing else
      // in the suite would notice.
      insert: (payload) => (calls.insert.push([table, payload]), builder),
      eq: (column, value) => (calls.eq.push([column, value]), (filters[column] = value), builder),
      order: (column) => (calls.order.push(column), builder),
      then: (resolve, reject) => {
        const answer = tables[table];
        const result = typeof answer === 'function' ? answer(filters) : answer;
        return Promise.resolve(result ?? { data: [], error: null }).then(resolve, reject);
      },
    };

    return builder;
  }

  return { from, calls };
}
