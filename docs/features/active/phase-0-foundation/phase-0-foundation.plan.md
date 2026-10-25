# Phase 0 — Foundation

> Status: active · Window: 2026-10-25 → 2026-11-04 · Source: [PLAN.md §8](../../../../PLAN.md)

**Done when:** a guildie signs in with Discord, sees the tier matching their Discord role,
adds characters, and an officer's agent lists members over MCP from Claude or the CLI.

## Spikes

| Spike | Result |
|---|---|
| Q8: Convex local components from a workspace package | **Pass** (2026-10-25). `modules/identity/convex` installs as component `identity`; the module package must export `./_generated/component.js` for the app's codegen. |
| AFD 2.2 stateless Streamable HTTP | In progress in a separate AFD session; `/mcp` waits on it |
| Q14: Violet CLI export from in-repo nodes | Not started |
| Q10: Vercel plan (Pro seat vs public repo) | Open with the GM |

## Tasks

- [x] Monorepo: pnpm workspaces + catalog, Turborepo, Biome, lefthook, commitlint
- [x] Gates: boundaries, agent docs, command manifest, CI lane selection, `validate:final` / `check`
- [x] CI: `select` → lanes → `ci-ok`
- [x] Agent setup: AGENTS.md, INIT.md, two `vintage-*` skills, three reviewer agents, settings
- [x] `packages/guild-kit`: commands, tiers, registry, confirm tokens, manifest
- [x] `modules/identity`: members, characters, role → tier; memory store; Convex component
- [x] `apps/api`: Convex app composing `identity`, `commands.read` / `commands.run` / `syncMember`
- [x] `botcore-vintage` plugin: `module-new`, `repo-check`
- [ ] GitHub org + remote; branch protection requiring `ci-ok`
- [ ] Better Auth with Discord sign-in (`@convex-dev/better-auth`) → `resolveCaller` uses it
- [ ] Role-sync cron calling `commands:syncMember`
- [ ] `/mcp` on AFD 2.2 with meta-tools; `apps/cli` = `afd-cli`
- [ ] `libs/design-tokens` (Violet or plain DTCG)
- [ ] `packages/ui-kit` on FAST-AF; `apps/web` shell
- [ ] Discord application + `/discord/interactions`

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-25 | Command names are kebab-case | AFD convention and `checkNamingConvention` in afd-testing |
| 2026-10-25 | Commands depend on store ports; `apps/api` adapts them to components | Commands stay testable without Convex; components stay private |
| 2026-10-25 | `commands.read` (query) + `commands.run` (mutation) as the Convex surface | Live queries for the website; one entry point per kind |
| 2026-10-25 | Dependency-free boundary script instead of dependency-cruiser | Lushly does the same; rules are repo-specific and small |
