// The one place a PostgREST read is turned into something a caller can trust.
// Shared by the content layer and the progress layer: a second data module
// issuing its own raw queries would reintroduce the clock-skew bug below on the
// first fetch after sign-in, which is exactly when it bites.

// PostgREST rejects a token whose `iat` is ahead of its own clock, with
// PGRST303 "JWT issued at future". The service that issues the token and the
// service that validates it do not share a clock to the millisecond, so a
// token is briefly unusable in the moment after it is minted — which is exactly
// when the library is asked for, because signing in is what triggers the
// request. It cured itself on the reader pressing Retry a second later, which is
// the entire content of the bug: nothing was wrong except the timing.
//
// Nothing on this side can align the two clocks, so the only cure available here
// is to wait out the skew and ask again.
const CLOCK_SKEW = 'PGRST303';
const SKEW_WAIT_MS = 1500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// supabase-js resolves rather than rejects on a failed query, so an unchecked
// call silently yields `data: null` and the caller carries on with nothing.
// Turning that into a throw is what makes a failure reach anybody at all.
//
// `build` is a function rather than a builder because a retry has to issue a
// fresh request, and an already-awaited builder is not a request that can be
// made twice.
export async function rows(build, what) {
  let retried = false;

  for (;;) {
    const { data, error } = await build();

    if (!error) return data ?? [];

    // Once only, and only for the skew. Anything else — a revoked grant, a
    // genuinely expired token, an offline network — is reported immediately
    // rather than sat on for a second and a half first.
    if (error.code === CLOCK_SKEW && !retried) {
      retried = true;
      await wait(SKEW_WAIT_MS);
      continue;
    }

    const code = error.code ? ` [${error.code}]` : '';
    throw new Error(`Could not load ${what}${code}: ${error.message}`);
  }
}
