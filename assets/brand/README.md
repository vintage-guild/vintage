# Brand assets

> **All rights reserved** — not covered by the repo's MIT license. See [LICENSE.md](LICENSE.md).

| File | Use |
|---|---|
| `vintage-logo.png` | Original raster (1536×1024), the source for the traces |
| `vintage-logo.svg` | Single-color trace. `fill="currentColor"`: the ink takes the surrounding text color and the letters are knockouts that show whatever is behind them. Best on light backgrounds, or as a stamp |
| `vintage-logo-two-tone.svg` | Ink plus a "paper" fill behind the letters, so it keeps the original look (light letters on a dark tag) on any background |
| `vintage-logo-color.png` | Full-color painted emblem (gold letters, crimson tag, iron chain), 1536×1024 with a transparent background. Use for the website hero, Discord server icon/banner, and CurseForge. Not traced: painted shading doesn't vectorize cleanly |

The color emblem suggests the palette for the `vintage` token node (PLAN §3.8, Q12): gold for
letterforms and accents, deep crimson for surfaces, iron/charcoal for frames.

## Theming the two-tone logo

```css
.site-header .logo {
  --vintage-logo-ink: var(--color-surface-ink);     /* tag + outline */
  --vintage-logo-paper: var(--color-surface-paper); /* letters + inner frame */
}
```

Defaults: ink = `currentColor`, paper = `#fff`. When `libs/design-tokens` lands (PLAN §3.8), map
these to the Vintage tokens rather than hard-coding colors.

## Regenerating

The SVGs were traced from the PNG with potrace (threshold 128, turdSize 4, optTolerance 0.2),
then the viewBox was cropped to the artwork with an 8px pad. Re-trace only if the source art
changes; edit the SVG paths otherwise.
