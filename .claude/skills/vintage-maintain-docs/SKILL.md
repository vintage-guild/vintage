---
name: vintage-maintain-docs
description: Keep Vintage's docs true as the code changes — which file to update for which change (architecture status, package tables, module AGENTS.md, feature docs, PLAN, skills, SETUP), how status markers and decisions are recorded, and when to add a skill. Load before finishing any PR that changes behavior, structure, or setup.
---

# Keeping docs true

Docs change **in the same PR** as the code. A stale doc is worse than none: agents trust it.

## What to update

| You changed… | Update |
|---|---|
| A command (added, renamed, tier, input) | `commands.manifest.json` (`pnpm manifest:write`), the module's `AGENTS.md` rules if behavior changed |
| A package (new, removed, renamed) | `docs/architecture.md` "Current packages" table, `INIT.md` "Where things live", `.github/area-ownership.json` + `CODEOWNERS`, commitlint scopes |
| Something from 📋/🚧 to built | `docs/architecture.md` status markers (✅ built and tested, 🚧 partly built, 📋 planned) |
| Setup, env vars, or a new tool | `SETUP.md` (env names only, never values), the package README |
| A design or product decision | The feature doc's Decisions table; repo-wide decisions also in `AGENTS.md` Decisions |
| A spike or open question answered | Feature doc Spikes table, PLAN.md §9 row, and tick it in issue #30 |
| A task in the plan | Phase checkboxes in `PLAN.md` §8 and the feature doc; close or comment on the GitHub issue |
| A foundation gap (AFD, botcore, Violet, FAST-AF, Mechanic, FenUI/FenCore) | File it upstream, link it, update PLAN.md §7.5 |
| `vendor/` (re-synced FAST-AF) | The pinned commit in `vendor/VENDORED.md` and its "Known upstream gaps"; `pnpm check:vendor` |
| What a member can do (a new or changed job) | A job in `docs/jtbd/<suite>.md` and its scenario in `apps/api/tests/jtbd` (`vintage-jtbd` skill) |
| A reviewer agent, a review lane, or the PR Review section | The `vintage-review` skill and its `references/lanes.md`; the agent files in `.claude/agents/` |
| A repeatable workflow agents keep re-deriving | Write or update a `vintage-*` skill |

## Skills

- Project skills live in `.claude/skills/vintage-*/SKILL.md` with `name` and `description`
  frontmatter. The description says *when to load it*.
- Every `vintage-*` skill must be listed in the Skills table in `AGENTS.md`;
  `pnpm check:agent-docs` fails otherwise.
- Keep a skill short: rules and routing. Long reference belongs in the package README, which the
  skill links to.

## Rules

- AGENTS.md routes and stays under its line budget; put detail in skills or module docs.
- Feature docs move `proposed/ → active/ → completed/`; update the index in `docs/features/README.md`.
- Never document secret values. Env var names and where to get them are fine.
- Mark unverified things as unverified ("built and tested, not deployed").
