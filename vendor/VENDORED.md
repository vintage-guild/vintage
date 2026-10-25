# Vendored code

FAST-AF isn't published to npm yet, so Vintage carries a built copy of the three packages it
needs. This is temporary: once FAST-AF publishes, swap to the npm packages and delete `vendor/`.

| Folder | Package | Version | Upstream path |
|---|---|---|---|
| `fast-element/` | `@lushly-dev/fast-element` | 3.0.1 | `packages/element/packages/fast-element` |
| `fast-router/` | `@microsoft/fast-router` | 1.0.0-alpha.29 | `packages/element/packages/fast-router` |
| `violet-elements/` | `@lushly-dev/violet-elements` | 0.1.0 | `packages/violet-elements` |

- **Source:** [lushly-dev/fast-af](https://github.com/lushly-dev/fast-af) (private for now)
- **Pinned commit:** `4a9afe0b7557a4e0dfefc729c72e4c6455eb7e2f` (2026-10-10, "feat(violet): add
  rich data grid editor family (#156)"). `vendor/.fast-af-commit` holds the same sha.
- **What's here:** the `tsc` output (`dist/`: ESM JavaScript and `.d.ts`), a trimmed
  `package.json` (upstream `exports`, runtime dependencies only, `private: true`), and a
  `LICENSE`. Tests, stories, and source maps are left out.

## Rules

1. **Never edit vendored files.** Fix the problem in FAST-AF, then re-sync. A local patch would
   be silently lost on the next sync.
2. **Re-sync with the script, not by hand.** `scripts/vendor-fast-af.mjs` copies, filters, and
   writes the manifests the same way every time.
3. `pnpm check:vendor` (part of `validate:final` and CI) checks that the pin, this file, the
   licenses, and the filtering agree.
4. **Use them through a bundler** (Vite for `apps/web`). `violet-elements` is compiled with
   bundler module resolution, so its relative imports have no `.js` extension and won't load as
   raw ESM in a browser or Node.
5. Apps and packages depend on these as `"@lushly-dev/fast-element": "workspace:*"` and so on.
   `libs/` must stay platform-free and may not import them (`pnpm check:boundaries`).

## Re-sync

```bash
git -c core.longpaths=true clone https://github.com/lushly-dev/fast-af.git .vendor-src/fast-af
git -C .vendor-src/fast-af checkout <commit>
pnpm --dir .vendor-src/fast-af install --frozen-lockfile --ignore-scripts --filter "@lushly-dev/fast-element..." --filter "@microsoft/fast-router..." --filter "@lushly-dev/violet-elements..."
pnpm --dir .vendor-src/fast-af/packages/element/packages/fast-element exec tsc -p tsconfig.json
pnpm --dir .vendor-src/fast-af/packages/element/packages/fast-router exec tsc -p tsconfig.json
pnpm --dir .vendor-src/fast-af/packages/violet-elements exec tsc -p tsconfig.lib.json
node scripts/vendor-fast-af.mjs
```

Then update the pinned commit above, run `pnpm install` and `pnpm validate:final`, and note
what changed upstream in the PR. `.vendor-src/` is gitignored. On Windows keep it at that
short path; FAST-AF's tree exceeds the default path length.

## Licenses

All three packages are MIT.

- `fast-element` and `fast-router` are forks of [Microsoft FAST](https://github.com/microsoft/fast).
  Their `LICENSE` is FAST's MIT license (Copyright (c) Microsoft Corporation), copied from
  FAST-AF's `packages/element/LICENSE`. FAST-AF's changes are MIT, by Lushly Dev.
- `violet-elements` is declared MIT by Lushly Dev in its `package.json`. FAST-AF doesn't ship a
  LICENSE file for it yet, so its `LICENSE` here is the standard MIT text for that holder.

Vintage's own PolyForm Noncommercial license doesn't apply to `vendor/`.

## Known upstream gaps

- No npm releases yet: the reason this folder exists.
- `fast-router` compiles with `importHelpers` but doesn't declare `tslib`. The vendored manifest
  adds it.
- `violet-elements` emits extensionless relative imports (bundler-only output).
- No LICENSE file at the FAST-AF root or in `packages/violet-elements`, though the README links to one.
