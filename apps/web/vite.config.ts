import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const logoPath = fileURLToPath(
  new URL('../../assets/brand/vintage-logo-two-tone.svg', import.meta.url),
);

/**
 * Inlines the two-tone logo into index.html at build time. It has to be inline SVG (not an
 * <img>) so its ink and paper can follow the theme's --logo-ink / --logo-paper tokens. The
 * link around it carries the accessible name, so the SVG itself is hidden from assistive tech.
 */
function brandLogo(): Plugin {
  return {
    name: 'vintage-brand-logo',
    transformIndexHtml: (html) => {
      const svg = readFileSync(logoPath, 'utf8')
        .trim()
        .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
      return html.replace('<!-- brand:logo -->', svg);
    },
  };
}

export default defineConfig({
  plugins: [brandLogo()],
  // violet-elements and fast-router use top-level await to register their elements.
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: true },
});
