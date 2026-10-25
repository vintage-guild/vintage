# Vintage

Guild platform for **Vintage** on WoW: Forever: an autonomous raid coordinator, the guild
website, a swappable loot system, and an in-game addon — all on one typed command surface
that people, Discord, and AI agents share.

- **Plan:** [PLAN.md](PLAN.md)
- **For agents:** [AGENTS.md](AGENTS.md), [INIT.md](INIT.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Status

Phase 0 (foundation). Working today:

- `guild-kit`: commands, permission tiers, validation, dryRun → confirm tokens, command manifest
- `identity` module: members, characters, Discord role → tier, as a Convex component
- `apps/api`: Convex backend exposing the registry (`commands.read`, `commands.run`)
- Repo gates: lint, boundaries, agent docs, manifest, type-check, tests, CI lane selection

Next: Better Auth with Discord sign-in, `/mcp` on AFD 2.2, the website shell.

## Requirements

Node 24, pnpm 10, and `uv` for the botcore repo tooling.

```bash
pnpm install
pnpm validate:final
```

## License

Code is [MIT](LICENSE). The Vintage logos and brand artwork in [`assets/brand/`](assets/brand/)
are **all rights reserved** ([details](assets/brand/LICENSE.md)); forks must use their own branding.
