# @vintage/design-tokens

One token source for three surfaces (PLAN §3.8): CSS custom properties for the website, a
TypeScript map for Discord embeds, and a Lua theme table for the FenUI addon.

The tokens are Violet-style nodes kept as plain DTCG JSON. The Violet CLI can't export from
in-repo files in CI yet (spike Q14, see the
[Phase 0 doc](../../docs/features/active/phase-0-foundation/phase-0-foundation.plan.md)), so a
small pure resolver in this lib does the export. Node names, tiers, and token ids follow
Violet's model, so moving to the Violet CLI later only swaps the build script.

## The node tree

```
afd-site                    nodes/afd-site.tokens.json: AFD site styles.css (palette, type, space, motion)
└─ vintage                  nodes/vintage.tokens.json: emblem palette, display face, WoW tokens
   ├─ vintage-dark          nodes/vintage-dark.tokens.json: member app default
   └─ vintage-parchment     nodes/vintage-parchment.tokens.json: long-form pages
```

Each file is DTCG (`$type` / `$value` / `$description`) with three top-level tiers:

| Tier | Holds | Example |
|---|---|---|
| `global` | Raw palette and scales | `color.gold.300`, `space.md` |
| `semantic` | Purpose: surfaces, text, accents, WoW meanings | `color.surface.canvas`, `color.quality.epic` |
| `component` | Per-component slots | `card.bg`, `wow-frame.bg`, `logo.ink` |

The parent is named in `$extensions["dev.vintage.node"].parent`. A node lists **only what it
changes**; everything else is inherited. Aliases (`"{color.gold.300}"`) resolve against the most
derived node, so `card.bg` in `afd-site` picks up `vintage-dark`'s surface without restating it.

Token ids are the dotted path inside a tier and are unique across tiers. The CSS name replaces
dots with dashes: `color.surface.canvas` → `--color-surface-canvas`.

## Change a token

1. Edit the node that owns the decision: a palette value in `vintage`, a theme surface in
   `vintage-dark` or `vintage-parchment`, an AFD default in `afd-site`.
   - To override, repeat the id in the child with a new `$value` (same tier; `$type` is inherited).
   - A new token needs a `$type` (on the token or its group).
2. `pnpm tokens:build` regenerates `generated/`.
3. `pnpm vitest run --project @vintage/design-tokens` checks it. Commit the nodes and the
   generated files together.

The tests fail when:

- a generated file is stale (`pnpm tokens:build --check` reports the same),
- a theme is missing a semantic or component token another node declares,
- a node repeats an inherited value instead of inheriting it,
- an alias is unknown, cyclic, or crosses types, or an override changes tier or type,
- a text-on-surface pair drops below WCAG AA 4.5:1 in either theme (`src/contrast.ts` lists the
  pairs; Blizzard quality and class colors are held to 3:1 on the dark `wow-frame`).

## Outputs

| File | Use |
|---|---|
| `generated/css/vintage-dark.css` | `:root, [data-theme="vintage-dark"]`: dark is the default |
| `generated/css/vintage-parchment.css` | `[data-theme="vintage-parchment"]` |
| `generated/css/themes.css` | Both blocks in one file |
| `generated/tokens.ts` | `tokens[theme][id]`: resolved literals, `as const` |
| `generated/lua/VintageTokens.lua` | FenUI primitives, theme configs, and WoW colors per theme |

CSS keeps aliases live (`--card-bg: var(--color-surface-raised)`), so devtools show the tier
chain. Components read only `var(--…)`; switching theme is setting `data-theme` on an ancestor.

```ts
import { discordColor, tokenValue } from '@vintage/design-tokens';

discordColor('color.quality.epic'); // 0xa335ee, for an embed
tokenValue('vintage-parchment', 'color.surface.canvas'); // '#f3ead7'
```

```css
@import '@vintage/design-tokens/css/themes.css';
```

The Lua table is interim until Violet has a Lua exporter. `FENUI_SEMANTIC_MAP` in
`src/serialize/lua.ts` says which Vintage token fills each FenUI semantic slot; the file's header
shows how the addon registers it.

## Layout

The lib is pure: `src/` resolves and serializes JSON and never touches the filesystem (libs may
not import `node:`). `scripts/build-design-tokens.mjs` at the repo root is the runner that writes
`generated/`. The tests read the committed outputs with Vite `?raw` imports.

## Palette

`vintage` samples the color emblem (`assets/brand/vintage-logo-color.png`): opaque pixels were
binned into gold, crimson, and iron by hue and saturation, then averaged in lightness bands.
Sampled values say so in their `$description`; derived ones (parchment, leather, dark gold, light
crimson) were added to reach contrast targets.

| Family | Sampled | Derived |
|---|---|---|
| Gold (letters) | 100 `#fdedac` · 200 `#fdde8a` · **300 `#fbd275`** · 400 `#f7c760` · 500 `#e49d2b` | 700 `#8a5a12` · 900 `#4d3209` |
| Crimson (tag) | 500 `#750a0e` · 600 `#5e0a0e` · **700 `#4f0b0e`** · 800 `#400a0c` · 900 `#2e0807` | 300 `#e8676b` |
| Iron (frame) | 300 `#504d4f` · 500 `#383031` · 600 `#302a2b` · 700 `#292526` · 900 `#131212` | 950 `#0b0a0a` |
| Parchment / leather | | 50 `#faf5ea` · 100 `#f3ead7` · 200 `#e8dcc0` · 400 `#b5a485` · leather 700 `#5c4a3a` · 900 `#2b2118` |

The site palette was chosen with the home page concepts (2026-10-25, [feature
plan](../../docs/features/active/home-page/home-page.plan.md)), after the dusk sky and teal
banners of Blizzard's Forever page, pulled toward vintage tones. The dark theme is built on it;
the emblem's gold and crimson stay for the logo and WoW frames.

| Family | Values | Role |
|---|---|---|
| Plum (ink) | 300 `#b8b0bf` · 400 `#7f7989` · 600 `#3d3c4e` · 700 `#2a2935` · 800 `#23222c` · 900 `#1a1921` · 950 `#100f15` · 975 `#0b0a10` | Dark surfaces, borders, muted text |
| Verdigris | 200 `#93d0d4` · 400 `#5fb8bf` · 500 `#4aa5ad` · 700 `#2b7078` | Actions, focus, progress, "open / going" |
| Rose | 300 `#dd9d96` · 700 `#a9655f` | Emphasis: the accent word, eyebrows, the signed-in member |
| Gold 500 | `#e49d2b` | The secondary accent on dark: kills, the hairline over figures |

Type: Bitter (variable) for display, IBM Plex Sans for body and UI, IBM Plex Mono for labels;
all OFL and self-hosted by `apps/web`.
