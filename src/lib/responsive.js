// Layout that has to change *shape* below a phone's width, and the couple of
// values the four screens share so they cannot drift apart again.
//
// Almost none of the responsive work in this app needs this file. Styling is
// inline style objects, which a media query cannot reach, but most of what was
// broken is expressible inside those objects with no breakpoint at all --
// `clamp()` for type and gutters, `repeat(auto-fill, minmax(...))` for the card
// grids, `flexWrap`. Those need no JavaScript and no re-render on resize, so
// they stay where they are, at the site that uses them.
//
// What is left is the handful of places where the *structure* differs rather
// than the measurements: the reader's second pane becomes a bottom sheet, the
// level switcher becomes a scrolling strip. That is what this hook is for, and
// it should not grow beyond it. Reaching for `useIsNarrow` to change a padding
// means a `clamp()` was available and was not used.
//
// It lives in `src/lib/` beside `authUi.js`, which is the existing precedent for
// a module here that carries no network call.

import { useCallback, useSyncExternalStore } from 'react';

// One breakpoint, deliberately. Phones and small foldables get the single-column
// reading layout; a tablet in portrait still has room for the 300px sidebar and
// ~700px of text beside it, which is a comfortable measure. A second breakpoint
// would need a second thing to be true of every screen, and nothing here needs
// that yet.
export const NARROW = 820;

// 16px on a phone, 40px once there is room for it. The four screens and their
// four different paddings ('18px 40px', '14px 40px', '13px 32px', '14px 40px')
// are what put the account button off the right edge of a 590px screen.
export const gutter = 'clamp(16px, 5vw, 40px)';

// The shared header recipe, spread at each of the four sites rather than
// extracted into a component: the four headers carry genuinely different
// content -- logo and two calls to action, logo and four controls with a menu,
// a back arrow and a post title and a percentage -- and a component covering
// all of them needs enough slots to stop being simpler than this.
//
// `flexWrap` is the fix. A flex item's default `min-width: auto` means the text
// pills refuse to shrink below their content, so without a wrap the row simply
// overflows and `justifyContent: 'space-between'` sends the overflow rightwards,
// off the screen.
export const headerRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 10,
  padding: `12px ${gutter}`,
};

// Written as `typeof ... !== 'function'`, and it has to be exactly that.
//
// jsdom implements no `matchMedia` at all. Vitest, though, copies a `matchMedia`
// key onto the global as part of populating the window, with the value it found
// -- `undefined`. So `'matchMedia' in window` is *true* and falls through to a
// call on undefined, and `window.matchMedia?.(q)` returns undefined and throws
// on `.matches`. Both of the idiomatic guards are wrong here; only this one is
// right.
//
// `tests/setup.js` installs a shim that answers against `window.innerWidth`, so
// the phone path is reachable under test. This guard is what covers any other
// environment that has no matchMedia, and it answers `false` -- the desktop
// layout, which is the one that works without JavaScript's help.
function mediaQueryList(maxPx) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(`(max-width: ${maxPx}px)`);
}

export function useIsNarrow(maxPx = NARROW) {
  const subscribe = useCallback(
    (onStoreChange) => {
      const mql = mediaQueryList(maxPx);
      if (!mql) return () => {};
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [maxPx]
  );

  // Returns a boolean, so a fresh read every render is safe -- there is no
  // object identity for `useSyncExternalStore` to compare and loop over.
  const getSnapshot = useCallback(() => mediaQueryList(maxPx)?.matches ?? false, [maxPx]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
