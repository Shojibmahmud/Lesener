import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 26 defines a `localStorage` global of its own and leaves it disabled
// unless the process was started with --localstorage-file. That global shadows
// jsdom's, so `'localStorage' in window` is true while reading it yields
// undefined -- which is the ExperimentalWarning printed once per worker on every
// run. (Measured 2026-08-22: origin is http://localhost:3000, so jsdom would
// otherwise have provided a real one.)
//
// The app reads and writes the reader's theme through this, wrapped in try/catch
// because a browser really can refuse it. So without a stand-in the writes were
// silently swallowed in every test that has ever run, and no test could set up
// "this device is already dark" in the first place.
//
// An in-memory stand-in rather than the real thing: it is per-worker, and vitest
// gives one environment per test file, so it cannot leak between files. It can
// still leak between tests inside one file -- clearing that is each file's own
// job, deliberately, so this cannot quietly change what other suites run under.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();

  const storage = {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => void store.set(String(key), String(value)),
    removeItem: (key) => void store.delete(String(key)),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  // Both, because the app reaches for the bare global and tests reach through
  // window. In this environment they are the same object, but saying so out loud
  // costs nothing and survives that stopping being true.
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  if (globalThis.window && globalThis.window !== globalThis) {
    Object.defineProperty(globalThis.window, 'localStorage', { value: storage, configurable: true });
  }
}

// jsdom implements no `matchMedia`, and vitest then copies the key onto the
// global anyway with the `undefined` it found -- so `'matchMedia' in window` is
// true while calling it throws. `src/lib/responsive.js` guards with `typeof`
// for exactly that reason and answers "not narrow" when there is nothing to ask,
// which means that without this shim the phone layout would be unreachable in
// every test that will ever run: the one branch this whole feature adds, never
// exercised.
//
// It answers `(max-width: Npx)` against `window.innerWidth`, which jsdom sets to
// 1024. 1024 is wider than the 820px breakpoint, so every existing test keeps
// the desktop path it has always taken, and a test that wants the phone layout
// says so by setting `window.innerWidth` before rendering.
//
// `matches` is a getter rather than a value: a test that changes the width
// between renders should see the new answer, not the one computed when the
// query object happened to be made.
if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.matchMedia !== 'function') {
  const maxWidthOf = (query) => {
    const found = /\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/.exec(String(query));
    return found ? Number(found[1]) : null;
  };

  const matchMedia = (query) => {
    const max = maxWidthOf(query);
    return {
      media: String(query),
      get matches() {
        // Only `max-width` is understood. Anything else answers false rather
        // than guessing, so a query this shim cannot evaluate fails towards the
        // desktop layout rather than silently claiming a match.
        return max === null ? false : globalThis.window.innerWidth <= max;
      },
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  };

  Object.defineProperty(globalThis.window, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  if (globalThis !== globalThis.window) {
    Object.defineProperty(globalThis, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  }
}

afterEach(cleanup);
