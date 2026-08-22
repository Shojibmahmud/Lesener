// The key the reader's light/dark choice is stored under on this device.
//
// index.html carries a hard-coded copy of this string in the script that stamps
// the theme before the first paint. That script cannot import anything, so the
// two are genuinely duplicated -- and if they ever drift, NOTHING at runtime
// notices: the app goes on working perfectly and the white flash simply comes
// back. tests/theme-boot.test.js is the only thing that will catch it.
export const THEME_KEY = 'lesener-theme';

export function clean(word) {
  return word.replace(/[^A-Za-zÄÖÜäöüß-]/g, '');
}
