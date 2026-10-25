# Brand assets

> **All rights reserved** — not covered by the repo's code license. See [LICENSE.md](LICENSE.md).

| File | Use |
|---|---|
| `vintage-logo.png` | Original raster (1536×1024), the source for the traces |
| `vintage-logo.svg` | Single-color trace. `fill="currentColor"`: the ink takes the surrounding text color and the letters are knockouts that show whatever is behind them. Best on light backgrounds, or as a stamp |
| `vintage-logo-two-tone.svg` | Ink plus a "paper" fill behind the letters, so it keeps the original look (light letters on a dark tag) on any background |
| `vintage-logo-color-800.png` | Web copy of the color emblem (800×520, trimmed, ~430 KB): README header and anywhere bandwidth matters |
| `vintage-logo-color.png` | Full-color painted emblem (gold letters, crimson tag, iron chain), 1536×1024 with a transparent background. Use for the website hero, Discord server icon/banner, and CurseForge. Not traced: painted shading doesn't vectorize cleanly |

The color emblem is the source of the `vintage` token node's palette (PLAN §3.8, Q12): gold
letterforms (`--color-gold-*`), the crimson tag (`--color-crimson-*`), and the iron frame
(`--color-iron-*`), sampled from `vintage-logo-color.png`. Values and method:
[libs/design-tokens](../../libs/design-tokens/README.md#palette).

## Theming the two-tone logo

```css
.site-header .logo {
  --vintage-logo-ink: var(--logo-ink);     /* tag + outline (crimson) */
  --vintage-logo-paper: var(--logo-paper); /* letters + inner frame (gold) */
}
```

Defaults: ink = `currentColor`, paper = `#fff`. `--logo-ink` and `--logo-paper` are component
tokens from `@vintage/design-tokens`; don't hard-code colors.

## Regenerating

The SVGs were traced from the PNG with potrace (threshold 128, turdSize 4, optTolerance 0.2),
then the viewBox was cropped to the artwork with an 8px pad. Re-trace only if the source art
changes; edit the SVG paths otherwise.
