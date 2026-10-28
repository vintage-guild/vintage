// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// index.html preloads one font file: the display face's, for the hero headline. It has to be the
// file the display family's @font-face asks for (the same path, so Vite emits one hashed asset),
// or the browser fetches it twice and warns that the preload went unused.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const tokensCss = readFileSync(
  new URL('../../../libs/design-tokens/generated/css/themes.css', import.meta.url),
  'utf8',
);

const fontPreloads = [...html.matchAll(/<link rel="preload" as="font"[^>]*>/g)].map((m) => m[0]);
const href = /href="([^"]+)"/.exec(fontPreloads[0] ?? '')?.[1] ?? '';
const file = fileURLToPath(new URL(`..${href}`, import.meta.url));

describe('display face preload', () => {
  it('preloads exactly one font, as a CORS woff2', () => {
    expect(fontPreloads).toHaveLength(1);
    expect(fontPreloads[0]).toContain('type="font/woff2"');
    // Fonts are always fetched in CORS mode; without crossorigin the preload is not reused.
    expect(fontPreloads[0]).toMatch(/\scrossorigin[\s>]/);
    expect(existsSync(file)).toBe(true);
  });

  it('is the upright latin file of the display family the tokens name', () => {
    const display = /--font-family-display:\s*"([^"]+)"/.exec(tokensCss)?.[1];
    const [, pkg, name] =
      /node_modules\/(@[\w-]+\/[\w-]+)\/files\/([\w-]+\.woff2)$/.exec(href) ?? [];
    // main.ts imports the package's stylesheet; that stylesheet's latin, upright face is the file.
    expect(main).toContain(`import '${pkg}';`);
    const css = readFileSync(
      fileURLToPath(new URL(`../node_modules/${pkg}/index.css`, import.meta.url)),
      'utf8',
    );
    const face = css.split('@font-face').find((block) => block.includes(`./files/${name}`)) ?? '';
    expect(face).toContain(`font-family: '${display}'`);
    expect(face).toContain('font-style: normal');
    expect(face).toMatch(/unicode-range: U\+0000-00FF,/);
  });
});
