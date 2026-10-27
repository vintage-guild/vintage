# Local validation

The same commands run locally and in CI (PLAN §7.2).

| Command | Runs | When |
|---|---|---|
| `pnpm validate:final` | lockfile, conflict markers, lint, boundaries, agent docs, vendor, lockfile registry, command manifest, type-check, tests | Before every PR (also the pre-push hook) |
| `pnpm check` | everything above, plus the gate-script self-tests and botcore plugin tests | Before merging gate or tooling changes |
| `pnpm check:boundaries` | layer, module, and cycle rules (`scripts/check-boundaries.mjs`) | Any change under `apps/ modules/ packages/ libs/` |
| `pnpm check:manifest` | `commands.manifest.json` matches the registry | Any command change; fix with `pnpm manifest:write` |
| `pnpm check:agent-docs` | AGENTS.md budget, live links, named skills exist, module AGENTS.md | Any docs/skills change |
| `pnpm check:lockfile` | `pnpm-lock.yaml` pins no tarballs to a private registry mirror (`scripts/check-lockfile.mjs`) | Any lockfile change |
| `pnpm check:conflict-markers` | no tracked file outside `vendor/` holds a merge-conflict marker line (`scripts/check-conflict-markers.mjs`); CI runs it in the always-on `select` job | After resolving any merge |
| `pnpm check:vendor` | `vendor/` pin matches VENDORED.md, LICENSE per package, no tests or maps (`scripts/check-vendor.mjs`) | Any `vendor/` change |
| `python addon/Vintage/Tools/validate.py --lua lua5.1` | the addon gate, CI's `addon` lane: Lua tool versions, validator tests, locale keys, TOC/XML manifest, `.pkgmeta`, library pins, theme freshness, CHANGELOG version, luacheck, busted | Any `addon/`, `libs/bridge-format/`, or generated FenUI theme change. Needs Lua 5.1, busted, and luacheck (`addon/Vintage/Tools/install_lua_tools.py`); without them, `--static` runs only the Python stages |
| `pnpm tokens:build --check` | `libs/design-tokens/generated/` and the addon's copy of the FenUI theme are current | Any token node change; fix with `pnpm tokens:build` |

## Hooks (lefthook)

- **pre-commit:** Biome on staged files (auto-fixes), boundaries when packages change
- **commit-msg:** commitlint (Conventional Commits, scopes in `commitlint.config.mjs`)
- **pre-push:** `pnpm validate:final`

## Convex locally

`pnpm --filter @vintage/api dev:local` starts an anonymous local backend (no account),
pushes functions, and regenerates `convex/_generated`. Set the confirm secret once:

```bash
cd apps/api
npx convex env set VINTAGE_CONFIRM_SECRET local-dev-secret
```

## Gate discipline

When you add or change a gate, make it fail once on purpose and watch it fail before relying
on it. Record the check in the PR description.
