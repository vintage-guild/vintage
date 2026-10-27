// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// index.html carries literal colors for the first paint (before any stylesheet loads). They must
// stay equal to the theme tokens, or a reload flashes the wrong ground.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const tokensCss = readFileSync(
  new URL('../../../libs/design-tokens/generated/css/themes.css', import.meta.url),
  'utf8',
);

/** The hex value a theme gives a semantic token, following one `var()` alias. */
function tokenValue(theme: string, name: string): string {
  const block = tokensCss.split(`[data-theme="${theme}"]`)[1]?.split('}')[0] ?? '';
  const raw = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? '';
  const alias = /^var\(--([\w-]+)\)$/.exec(raw)?.[1];
  const value = alias ? new RegExp(`--${alias}:\\s*([^;]+);`).exec(tokensCss)?.[1]?.trim() : raw;
  return (value ?? '').toLowerCase();
}

describe('first paint', () => {
  it.each([
    ['vintage-dark', /html \{ background: (#\w+); color: (#\w+); \}/],
    [
      'vintage-parchment',
      /html\[data-theme='vintage-parchment'\] \{ background: (#\w+); color: (#\w+); \}/,
    ],
  ])('paints %s with its canvas and text tokens', (theme, rule) => {
    const [, background, color] = rule.exec(html) ?? [];
    expect(background).toBe(tokenValue(theme, 'color-surface-canvas'));
    expect(color).toBe(tokenValue(theme, 'color-text-primary'));
  });

  it('hides the header until its element is defined, at its own height', () => {
    expect(html).toContain(
      'vintage-logo-header:not(:defined) { display: block; min-block-size: 4.1rem; visibility: hidden; }',
    );
  });
});

describe('first reveal', () => {
  it('keeps the page transparent until data-ready, with a fallback that never waits forever', () => {
    expect(html).toContain('html:not([data-ready]) body > :not(script) { opacity: 0; }');
    // The head sets data-ready on its own after 4s, independent of the app script: a classic
    // (blocking) script loaded before the app's module.
    expect(html).toMatch(/<script src="\/first-paint\.js"><\/script>\s*<script type="module"/);
    const firstPaint = readFileSync(new URL('../public/first-paint.js', import.meta.url), 'utf8');
    expect(firstPaint).toMatch(
      /setTimeout\(\(\) => \{\s*document\.documentElement\.dataset\.ready = '';\s*\}, 4000\);/,
    );
  });

  it('is revealed by the shell once the first page renders', () => {
    const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    expect(main).toContain("document.documentElement.dataset.ready = '';");
    expect(main).toMatch(/READY_CAP_MS = \d+/);
  });
});
