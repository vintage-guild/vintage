---
name: vintage-convex-modules
description: Add a Vintage module or change its data — module package layout, the store port, the module's Convex component (tables and functions), wiring it into apps/api, codegen, and the local anonymous backend. Load before adding a module, a table, or a component function.
---

# Modules and Convex components

A module is a workspace package under `modules/<name>` that owns its data through its own
Convex component. Scaffold one with `uv run --directory tooling/botcore vintagebot module-new <name>`.

## Layout

```
modules/<name>/
  module.json             name, maturity (core | official | labs), owners, dependsOn
  src/contract.ts         public types + command names + events (the only cross-module import)
  src/store.ts            <Name>Store port, <Name>Deps, command = commandsFor<Deps>()
  src/commands/           commands + index.ts exporting <name>Commands
  src/testing.ts          memory store, same behavior as the component
  convex/convex.config.ts defineComponent('<name>')
  convex/schema.ts        this module's tables; every table has guildId + by_guild index
  convex/*.ts             component query/mutation functions (no auth: the app checks first)
  AGENTS.md               module rules
```

`package.json` exports only `./contract`, `./commands`, `./testing`, `./convex.config`,
`./_generated/component.js` (Convex codegen needs it), `./ui`, `./package.json`.

## Wire into apps/api

1. `apps/api/convex/convex.config.ts`: `app.use(<name>)` from `@vintage/<name>/convex.config`.
2. `apps/api/convex/stores.ts`: implement the port with `ctx.runQuery/runMutation(components.<name>.*)`.
   Map component `_id` to `id` at the component boundary (see `identity/convex/members.ts`).
3. `apps/api/src/registry.ts`: add the commands and extend `VintageDeps`.
4. `apps/api/convex/commands.ts`: extend `deps(ctx)`.

## Codegen and the local backend

`pnpm --filter @vintage/api dev:local` runs Convex in anonymous local mode (no account):
it pushes functions and regenerates `apps/api/convex/_generated` and
`modules/*/convex/_generated`. Commit both. On Windows, set `CONVEX_TMPDIR` to a folder on the
same drive as the repo if you see a "different filesystems" warning.

## Rules

- Components never see `ctx.auth`; never call component functions from clients.
- Read-only commands work in `commands.read` (a query); a store write inside `read` throws.
- Keep the memory store and the component in step: same ordering, same scoping by `guildId`.
