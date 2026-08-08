export function clean(word) {
  return word.replace(/[^A-Za-zÄÖÜäöüß-]/g, '');
}
