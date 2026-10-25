# Vintage — Agent Context

> **Project:** guild platform for Vintage on WoW: Forever — raid coordinator, website, loot, addon.
> **Methodology:** Agent-First Development (AFD) — commands first, CLI/MCP validation, UI last.

Keep this file lean: it routes to the right place instead of explaining. Area knowledge
lives in skills and module `AGENTS.md` files.

## Start here

- **Orientation for an incoming session:** [INIT.md](INIT.md)
- **The plan (architecture, phases, open questions):** [PLAN.md](PLAN.md)
- **Local validation:** [docs/operations/local-validation.md](docs/operations/local-validation.md)
- **Feature docs:** [docs/features/README.md](docs/features/README.md)

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Before a PR | `pnpm validate:final` |
| Everything | `pnpm check` |
| Tests (watch) | `pnpm test` |
| Regenerate command manifest | `pnpm manifest:write` |
| Local Convex backend (no account) | `pnpm --filter @vintage/api dev:local` |
| New module | `uv run --directory tooling/botcore vintagebot module-new <name>` |

## Invariants (CI enforces these)

1. **Commands are the product.** Every capability is a guild-kit command (`commandsFor<Deps>()`)
   with a Zod input, a minimum tier, and a `CommandResult`. Surfaces never hold logic.
2. **Layers point down:** `apps → modules → packages → libs` (`pnpm check:boundaries`).
3. **Modules own their data.** A module's tables live in its Convex component. Another module
   is reached only through its `/contract` export, never its internals or tables.
4. **Commands depend on ports, not Convex.** A module defines a store interface; `apps/api`
   adapts it to the component, tests use the memory store from `<module>/testing`.
5. **Names are kebab-case `<noun>-<verb>`** (`character-add`), per AFD.
6. **Destructive commands** set `destructive: true` and honor `ctx.dryRun`; guild-kit runs the
   preview → confirm-token flow. Never bypass it.
7. **`guildId` on every record.** Scope every query by the caller's guild.
8. **The manifest is the contract.** Changing a command updates `commands.manifest.json` in the
   same PR; an incompatible change needs the `breaking-contract` label.
9. **Fix foundations upstream.** AFD, botcore, Mechanic, FenCore, FenUI, Violet, FAST-AF are
   Bloodfen's projects: file there, link it, and keep any workaround small (PLAN §7.5).

## Skills

| Skill | Load when |
|---|---|
| `vintage-afd-commands` | Adding or changing a command, tier, or the confirm flow |
| `vintage-convex-modules` | Adding a module, a table, or a Convex component function |

## Commits and attribution

Credit whoever drives the commit:

- **Human-driven (with or without AI help):** the human is the author and signs off
  (`git commit -s`, [contributor agreement](CONTRIBUTOR_AGREEMENT.md)). Agents never add
  `Co-authored-by` trailers for themselves; GitHub counts those as authorship. Disclose AI help
  with a trailer like `Assisted-by: Claude Opus 5.5`.
- **Fully automated** (a bot account authors the commit, like Dependabot): bot attribution is
  fine; no sign-off needed.

CI rejects human commits that are unsigned or credit an AI co-author.

## Gate discipline

Every new or changed gate must be watched failing once. A check that cannot fail is worse
than no check.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-25 | Command names follow AFD kebab-case (`member-me`), not dotted (`member.me`). |
| 2026-10-25 | Module components live in the module package (`modules/<m>/convex`); spike Q8 passed. |
| 2026-10-25 | TypeScript 6 (`tsc6`) for type-check, matching Lushly's tooling pin. |
| 2026-10-25 | Boundary checks are a dependency-free script (`scripts/check-boundaries.mjs`), not dependency-cruiser. |
