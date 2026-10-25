---
name: vintage-design-tokens
description: Change or use Vintage design tokens — the DTCG node tree (afd-site → vintage → vintage-dark / vintage-parchment), tiers, overrides, contrast rules, the build/check step, and consuming tokens from CSS, TypeScript (Discord embeds), and the FenUI addon theme. Load before touching libs/design-tokens or styling anything.
---

# Design tokens

Full reference: `libs/design-tokens/README.md`. This skill is the short version.

## The model

```
afd-site → vintage → vintage-dark (default) / vintage-parchment
```

- Each node is DTCG JSON in `libs/design-tokens/nodes/`, with `global` (palette, scales),
  `semantic` (meaning: surfaces, text, WoW colors), and `component` (per-component slots) tiers.
- A child lists **only what it changes**; a test fails on redundant overrides.
- Violet's node model, kept in plain DTCG because the Violet CLI can't export from files yet
  (Q14, lushly-dev/violet#30). Don't add a Violet dependency until that's resolved.

## Changing a token

1. Edit the node that owns the decision: palette in `vintage`, theme surfaces in `vintage-dark` /
   `vintage-parchment`, AFD defaults in `afd-site`.
2. `pnpm tokens:build` regenerates `generated/` (CSS, `tokens.ts`, `VintageTokens.lua`).
3. Commit nodes and generated files together. Tests fail on stale output, missing tokens, bad
   aliases, and contrast below WCAG AA (4.5:1 text on surfaces; Blizzard quality/class colors are
   fixed values held to 3:1 on the dark WoW frame).

## Using tokens

- **CSS:** components read only `var(--…)`; never literal colors, fonts, or spacing. Theme by
  setting `data-theme="vintage-parchment"` on an ancestor (dark is the default on `:root`).
- **TypeScript:** `discordColor('color.quality.epic')` for embed colors;
  `tokenValue(theme, id)` for a resolved literal.
- **Addon:** `generated/lua/VintageTokens.lua` feeds `FenUI:RegisterTheme`.
- **Brand:** the logo maps to `--logo-ink` / `--logo-paper` (see `assets/brand/README.md`).

## Don'ts

- Don't change Blizzard's item-quality or class color values; they're game facts.
- Don't hand-edit `generated/`.
- Don't add a semantic token to only one theme.
