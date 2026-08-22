import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { THEME_KEY } from '../src/utils';

// A file-content test rather than a behaviour test, and the only guard this part
// of the feature will ever have.
//
// index.html stamps data-theme before the first paint, which is the one thing
// that stops a dark reader seeing a white flash on every load. It has to hard-code
// the storage key, because a bare inline script cannot import. So the key lives in
// two places with nothing linking them, and the drift is SILENT: change it in
// src/utils.js alone and the app still works perfectly -- it just reads and writes
// a key the boot script has never heard of, and the flash comes back with no test,
// no lint and no build saying a word.
//
// Nothing here proves the flash is actually gone. Vitest renders into a jsdom
// document the environment created, so index.html is never parsed and the script
// never runs. Only a human watching a real load can confirm that.
// Resolved from the project root rather than from import.meta.url: under Vite's
// transform this module's URL is an http one, and readFileSync refuses it.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

// --bg as index.css declares it for each theme. The light one is the first
// declaration in :root; the dark one is the first inside [data-theme="dark"].
const cssBackground = (theme) => {
  const block = theme === 'dark' ? css.slice(css.indexOf('[data-theme="dark"]')) : css;
  return block.match(/--bg:\s*(#[0-9A-Fa-f]{3,8})/)[1].toLowerCase();
};

// The same colour as the inline <style> paints it, before any stylesheet exists.
const inlineBackground = (theme) => {
  const rule = theme === 'dark'
    ? html.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)[1]
    : html.match(/:root\s*\{([^}]*)\}/)[1];
  return rule.match(/background-color:\s*(#[0-9A-Fa-f]{3,8})/)[1].toLowerCase();
};

// The <script> element that carries the key, tag and all.
const bootScript = html.match(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*lesener-theme[\s\S]*?<\/script>/)?.[0];

describe('the pre-paint theme script', () => {
  it('exists', () => {
    expect(bootScript).toBeDefined();
  });

  it('reads the same storage key the app writes', () => {
    expect(bootScript).toContain(`'${THEME_KEY}'`);
  });

  // A module or an external script is deferred until the document has been
  // parsed, which is after the first paint -- exactly the moment this exists to
  // beat. Either attribute would leave the code present, correct and useless.
  it('is inline and synchronous, not deferred', () => {
    const openingTag = bootScript.slice(0, bootScript.indexOf('>') + 1);

    expect(openingTag).toBe('<script>');
    expect(openingTag).not.toMatch(/\bsrc=/);
    expect(openingTag).not.toMatch(/\btype=/);
    expect(openingTag).not.toMatch(/\b(defer|async)\b/);
  });

  // The app refuses anything that is not one of the two themes, and the boot
  // script has to make that judgement independently -- it cannot call into src/.
  // Without it a hand-edited value would be written straight onto <html>.
  it('refuses a stored value that is not a theme', () => {
    expect(bootScript).toContain("'light'");
    expect(bootScript).toContain("'dark'");
  });
});

// Stamping data-theme early is only half of it. The attribute says which theme;
// until src/index.css has loaded, nothing says what that theme looks like — and
// in dev there is no stylesheet link at all, because Vite injects the CSS from
// main.jsx. So the browser paints its own white canvas and the flash survives a
// perfectly correct boot script. Measured 2026-08-23: it did exactly that.
//
// The fix duplicates two colours out of index.css into an inline <style>, which
// cannot reference them. This is the same silent-drift shape as the storage key,
// and these are the only checks that will ever notice.
describe('the pre-paint background', () => {
  it.each(['light', 'dark'])('matches --bg for the %s theme', (theme) => {
    expect(inlineBackground(theme)).toBe(cssBackground(theme));
  });

  // Without this the browser keeps a light canvas, light scrollbars and light
  // form controls around a dark page.
  it('tells the browser which scheme its own surfaces should use', () => {
    expect(html).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(html).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  });
});
