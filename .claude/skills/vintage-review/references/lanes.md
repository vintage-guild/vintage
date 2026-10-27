# Review lanes

Lanes are categories, not an agent count. The changed paths activate a lane; the coordinator
reviews active lanes directly unless a named assurance question needs a separate reviewer.

| Lane | Active when the diff touches | Reviewer when dispatched |
|---|---|---|
| Intent and correctness | Any behavior | `vintage-reviewer` |
| Command contract | `modules/*/src/commands`, `packages/guild-kit`, `commands.manifest.json` | `vintage-reviewer` |
| Data and boundaries | `modules/*/convex`, `modules/*/src/store.ts`, `apps/api/convex`, any cross-package import | `vintage-reviewer` |
| Security | guild-kit caller, tier, or confirm-token code; `apps/gateway`; `/mcp`; Better Auth; env handling; `.github/workflows` | `vintage-security-auditor` |
| Tests and gates | Any behavior; `scripts/`, `lefthook.yml`, `.github/workflows/ci.yml` | `vintage-reviewer` |
| Discord and web surfaces | `modules/*/src/domain/render.ts` and other Discord renderers, `apps/gateway`, `apps/web`, `packages/ui-kit`, `libs/discord-kit`, `libs/design-tokens` | `vintage-reviewer` |
| Addon | `addon/`, `libs/bridge-format` | `vintage-addon-reviewer` |
| Docs and release readiness | `docs/`, `AGENTS.md`, `INIT.md`, `PLAN.md`, `.claude/`, PR body | Coordinator |

## What each lane looks for

**Intent and correctness.** The code does what the PR, issue, and feature doc claim. Edge cases
and error paths, not just the happy path. Event ordering (the coordinator claims before it sends,
so each notice goes out once). Time zones and DST in schedules. Composition with freshly merged
`main`: work that landed on the same function or contract can merge cleanly and still undo or
double-apply a change.

**Command contract.** Every capability is a guild-kit command with a Zod input, a minimum tier,
and a `CommandResult`; failures carry a suggestion. Names are kebab `<noun>-<verb>`.
`destructive: true` commands change nothing during `dryRun`. `commands.manifest.json`
regenerated (`pnpm manifest:write`); `breaking-contract` label when `scripts/check-contract-break.mjs`
would report a removed command, a raised tier, a newly required input, a command that now
requires confirmation (became `destructive`), or one that became `systemOnly`. Unknown and
forbidden commands answer identically, on every surface (`commands.read` included).

**Data and boundaries.** `guildId` on every record and every query, scoped by the caller's guild.
A module reaches another only through its `/contract` export, never its internals or tables.
Layers point down (`apps → modules → packages → libs`); `check:boundaries` catches imports, not a
component function reading another module's table. The memory store and the Convex component stay
behaviorally identical. Schema changes keep existing rows valid (optional fields, no renames).

**Security.** The six properties in `vintage-security-auditor`: tier enforcement, caller
resolution, confirm tokens, disclosure, Discord signature verification, MCP token audience. Plus:
no secrets in the repo or logs; workflows don't run untrusted PR code with secrets.

**Tests and gates.** New behavior is tested through `registry.execute` with the memory store.
A new or changed gate was **watched failing** once, and the PR quotes that evidence. A change to
what a member can do adds or updates a JTBD job (`vintage-jtbd`). Assertions that cannot run or
cannot fail: a `try`/`catch` that accepts the failure, an `expect` after a call that already
throws on that condition, a `continue` inside a loop over cases, a bound no input approaches.
When a regression test is the deliverable, ask for the mutation that makes it fail.

**Discord and web surfaces.** No logic in a surface: it calls commands. Discord limits (5 action
rows, 5 buttons a row, 25 select options, 100-char `custom_id`, 2000-char content, embed limits).
Colors, spacing, and type come from tokens, never hard-coded. ui-kit: keyboard reachable, labeled
controls, focus visible. The Custom Elements Manifest lists new elements.

**Addon.** The checklist in `vintage-addon-reviewer`: Forever API family, Core/Bridge layering,
secret values, bridge-format version and fixtures on both sides, `Libs/` untouched.

**Docs and release readiness.** The `vintage-maintain-docs` table is satisfied in this PR. The PR
title is a valid squash header; the body's claims match the commits and what was run. Status
markers say "not deployed" or "not verified" where true. No secret values, ever.

## Prompt template for a dispatched lane

```markdown
You are the {lane} reviewer for a Vintage change. Load the `vintage-review` skill first.

- Goal: {what the change is for; issue or feature doc}
- Diff: `git diff origin/main` plus untracked files from `git status --short` ({n} files;
  focus: {paths})
- Review pass: {1 broad | 2 verify these fixes | 3 this blocker only}
- Prior findings and fixes: {none | list with paths}
- Assurance question: {the specific thing to establish, e.g. "can a raider read another
  guild's signups through poll-results?"}

Read-only: don't edit, commit, push, or comment. Stay in your lane; mention another lane's
concern only if it is a blocker. Prefer no finding to a speculative one. Use the reviewer output
shape from the skill, starting with the EXECUTION line.
```
