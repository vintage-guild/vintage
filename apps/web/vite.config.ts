import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// The single-color trace: `fill="currentColor"` takes the header's text color and the letters
// are knockouts, so it reads as a mark rather than the painted emblem.
const logoPath = fileURLToPath(new URL('../../assets/brand/vintage-logo.svg', import.meta.url));

/**
 * Inlines the two-tone logo into index.html at build time. It has to be inline SVG (not an
 * <img>) so its ink and paper can follow the theme's --logo-ink / --logo-paper tokens. The
 * link around it carries the accessible name, so the SVG itself is hidden from assistive tech.
 */
function brandLogo(): Plugin {
  return {
    name: 'vintage-brand-logo',
    transformIndexHtml: (html) => {
      // width/height give it an intrinsic size (the header's 5.4rem at the viewBox's ratio), so
      // even before any CSS loads it can't paint page-wide.
      const svg = readFileSync(logoPath, 'utf8')
        .trim()
        .replace('<svg ', '<svg aria-hidden="true" focusable="false" width="86" height="47" ');
      return html.replace('<!-- brand:logo -->', svg);
    },
  };
}

export default defineConfig({
  plugins: [brandLogo()],
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  // violet-elements and fast-router use top-level await to register their elements.
  build: { target: 'es2022' },
  server: { port: 5173, strictPort: true },
});
