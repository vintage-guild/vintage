# Vintage Init

> Audience: an agent entering an already-set-up checkout that needs to be productive fast.
> Durable rules are in [AGENTS.md](AGENTS.md); the big picture is in
> [docs/architecture.md](docs/architecture.md); the why is in [PLAN.md](PLAN.md).

## Mental model

```
command (guild-kit, in a module)  →  registry (apps/api)  →  surfaces
   Zod input · tier · handler           permission · validation      Convex read/run (web)
   depends on a store port              dryRun → confirm token       /mcp (afd-server)
                                                                     Discord, CLI, agent
```

Start from the command, not the UI. Business logic belongs in module commands and pure libs.

## First 10 minutes

1. [AGENTS.md](AGENTS.md) — invariants and commands
2. [packages/guild-kit/src/define.ts](packages/guild-kit/src/define.ts) — how a command is declared
3. [packages/guild-kit/src/registry.ts](packages/guild-kit/src/registry.ts) — the one execution path
4. [modules/identity/src/commands/character.ts](modules/identity/src/commands/character.ts) — a real module's commands
5. [modules/identity/src/store.ts](modules/identity/src/store.ts) — the port commands depend on
6. [apps/api/convex/stores.ts](apps/api/convex/stores.ts) — the port adapted to the Convex component
7. [apps/api/convex/commands.ts](apps/api/convex/commands.ts) — the Convex surface (`read`, `run`)

## Where things live

| Folder | Holds |
|---|---|
| `libs/` | Pure TS, platform-free (`wow-data`, `comp-solver`, `discord-kit`, `design-tokens`, `bridge-format`) |
| `packages/` | Platform glue (`guild-kit`, `testing`, `config`, `ui-kit` web components) |
| `modules/` | Features with their own data (`identity`) |
| `apps/` | Composition and transport (`api` on Convex, `gateway` on Vercel, `web` the website) |
| `vendor/` | Built FAST-AF packages, pinned; never edit ([VENDORED.md](vendor/VENDORED.md)) |
| `tooling/botcore/` | Repo commands for humans, CI, and agents |
| `scripts/` | Gate scripts CI and `validate:*` run |

## Try it

```bash
pnpm install
pnpm validate:final
pnpm --filter @vintage/web dev        # website on http://localhost:5173 (/ui: component gallery)
pnpm --filter @vintage/api dev:local
cd apps/api
npx convex env set VINTAGE_CONFIRM_SECRET local-dev-secret
npx convex run commands:syncMember '{"discordId":"d1","displayName":"Aeryn","inServer":true,"roleIds":[]}'
npx convex run commands:read '{"name":"member-list","input":{}}'
```

The last call returns `COMMAND_NOT_FOUND`: the CLI runs as a public caller and `member-list`
needs `recruit`. Sign-in (Better Auth + Discord) is the next Phase 0 item.
