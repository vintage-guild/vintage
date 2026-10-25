# Phase 0 — Foundation

> Status: active · Window: 2026-10-25 → 2026-11-04 · Source: [PLAN.md §8](../../../../PLAN.md)

**Done when:** a guildie signs in with Discord, sees the tier matching their Discord role,
adds characters, and an officer's agent lists members over MCP from Claude or the CLI.

## Spikes

| Spike | Result |
|---|---|
| Q8: Convex local components from a workspace package | **Pass** (2026-10-25). `modules/identity/convex` installs as component `identity`; the module package must export `./_generated/component.js` for the app's codegen. |
| AFD 2.2 stateless Streamable HTTP | In progress in a separate AFD session; `/mcp` waits on it |
| Q14: Violet CLI export from in-repo nodes | **Fail → plain-DTCG fallback** (2026-10-25). Not installable: `@lushly-dev/violet-cli` and `violet-core` 404 on npm (control: `afd-core` resolves 2.1.0); `lushly-dev/violet` is private, `dist/` is gitignored, and the CLI depends on `violet-core` and `violet-server` via `workspace:*`, so a git dependency means cloning with a token and building the Violet monorepo in CI. No server needed (the CLI runs commands against SQLite via `better-sqlite3` or `--memory`), but no file-based input: nodes live in the database (`~/.violet/violet.db`), `--memory` lasts one process, and `import json` reads Style Dictionary `value` (not DTCG `$value`) and drops `$type` / `$description`. CI would replay `node create` + `import json` per node into a scratch DB before `export css/ts`. Exporters: json, css, scss, ts, swift, kotlin, dart, tailwind; no Lua. `libs/design-tokens` keeps the same node names and tiers as plain DTCG with a pure resolver. |
| Q10: Vercel plan (Pro seat vs public repo) | **Public repo** (2026-10-25), so the Vercel Hobby plan can deploy it. Convex plan and OpenAI budget still open |

## Tasks

- [x] Monorepo: pnpm workspaces + catalog, Turborepo, Biome, lefthook, commitlint
- [x] Gates: boundaries, agent docs, command manifest, CI lane selection, `validate:final` / `check`
- [x] CI: `select` → lanes → `ci-ok`
- [x] Agent setup: AGENTS.md, INIT.md, `vintage-*` skills, three reviewer agents, settings; architecture, setup, and model-routing docs
- [x] `packages/guild-kit`: commands, tiers, registry, confirm tokens, manifest
- [x] `modules/identity`: members, characters, guild rank → tier (#42); memory store; Convex component
- [x] `apps/api`: Convex app composing `identity`, `commands.read` / `commands.run` / `syncMember`
- [x] `botcore-vintage` plugin: `module-new`, `repo-check`
- [x] GitHub org + remote (`vintage-guild/vintage`, public); ruleset requiring `ci-ok`; CodeQL, secret scanning, Dependabot
- [ ] Better Auth with Discord sign-in (`@convex-dev/better-auth`) → `resolveCaller` uses it
- [x] Role sync: role → rank map in identity, `guild-roles-get`/`-set`, 15-minute cron (#44). Live Discord path waits on the bot invite
- [ ] `/mcp` on AFD 2.2 with meta-tools; `apps/cli` = `afd-cli`
- [x] `libs/design-tokens` (plain DTCG; Q14): CSS per theme, TS map, interim FenUI Lua table
- [ ] `packages/ui-kit` on FAST-AF; `apps/web` shell
- [ ] Discord: app and bot created ✅, `libs/discord-kit` + `/discord/interactions` built and tested (#43) ✅; bot invite (Stridulent), Server Members intent, deploy + endpoint verification still to do

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-25 | Command names are kebab-case | AFD convention and `checkNamingConvention` in afd-testing |
| 2026-10-25 | Commands depend on store ports; `apps/api` adapts them to components | Commands stay testable without Convex; components stay private |
| 2026-10-25 | `commands.read` (query) + `commands.run` (mutation) as the Convex surface | Live queries for the website; one entry point per kind |
| 2026-10-25 | Dependency-free boundary script instead of dependency-cruiser | Lushly does the same; rules are repo-specific and small |
| 2026-10-25 | Design tokens are plain DTCG nodes with a pure in-repo resolver; generated CSS/TS/Lua are committed and a test checks they are fresh | Q14 failed (Violet not installable or file-driven in CI); committed outputs need no build step for consumers, and the lib stays free of `node:` |
