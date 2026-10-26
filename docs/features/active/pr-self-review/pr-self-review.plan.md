# PR self-review — review lanes before every PR

> Status: active (Phase A built) · Owner: Bloodfen · Planned 2026-10-25
> Related: [PLAN.md §7.4](../../../../PLAN.md) (agent-native setup, workflow loops),
> [AGENTS.md](../../../../AGENTS.md) invariants, the `vintage-pr-workflow` and
> `vintage-maintain-docs` skills, `.claude/agents/`
> Source studied: Fabric Zero's review setup (`fz-reviewer`, `fz-security-auditor`,
> `review-code-fz`, `do-review`, `do-prepare-pr`; local checkout, read 2026-10-25)

**The ask.** Look at how Fabric Zero's review agents work and plan a comparable setup here, so
every Vintage PR gets a self-review as part of its process.

**Short answer.** Adopt Fabric Zero's *procedure* (fresh reviewer, claims first, fix-in-PR
triage, two passes, execution declared) and its *lane model*, but not its machinery. Vintage
has one maintainer, agent-authored PRs, and CI that already blocks on the machine-verifiable
things. What is missing is a written review procedure, agents that follow one contract, a place
in the PR flow where review happens before the commit, and a place in the PR body where the
result is recorded. That is one small PR, then two optional ones.

## What Fabric Zero does

| Piece | Where it lives there | What it buys |
|---|---|---|
| Reviewer agents (`fz-reviewer`, `fz-security-auditor`, plus a test author and a UX designer) | `.claude/agents/` | Read-only lanes with one contract: open with `EXECUTION: available/unavailable`, tag each claim `[executed]` or `[traced]`, honor a pass number, return findings as Fix in PR / Follow-up issue / No action with a Coverage block |
| Review procedure (`review-code-fz` knowledge skill) | `.claude/skills/review-code-fz/` + `references/review-lanes.md` | Fresh-reviewer protocol, the claims-first procedure, probing rules, the scope rule (fix here unless…), the follow-up bar, two-pass convergence, the merge-blocker definition, a lane map with scopes and a prompt template |
| `do-review` action skill | `.claude/skills/do-review/` | No args: self-review as a find-and-fix gate on the current branch. With a PR number: a read-only incoming-PR review with a verdict |
| `do-prepare-pr` orchestrator | `.claude/skills/do-prepare-pr/` | Fixed order: preflight → base sync → **review lanes** → docs → commit → one publish check → PR. The PR body has a required `reviewSummary` section; pass counts are tracked per lane |
| Hooks | `.claude/settings.json` | A pre-commit nudge for docs, a session-start orientation. Nothing blocks on review; the PR body carries the evidence |
| Policy | agents and skills | Coordinator owns every mutation; lanes only report. One owner for small changes; fan out only for a named assurance question. Models pinned to the repo's approved list |

Two findings from reading it matter most for Vintage:

1. **The procedure found defects the diff read did not.** Fabric Zero records that reading a diff
   in commit order found a class of test defect in zero of ten reviews, while "collect every
   declarative sentence the change ships and ask what would have to execute for it to be
   falsifiable" found it in ten of ten. Vintage's "every gate must be watched failing" invariant is
   the same idea stated as a rule; the review lane should ask for that evidence.
2. **Most of the machinery solves fleet-scale problems.** Readiness manifests, push receipts,
   probe-isolation guards, merge-queue watchers, and per-lane pass state files exist because many
   worktrees and agents publish at once. Vintage's pre-push already runs `validate:final`, and
   `ci-ok` is the only required check. Adopting that machinery now would add process without
   catching more defects.

## What Vintage has today

| Fabric Zero piece | Vintage today | Gap |
|---|---|---|
| Reviewer agents | `vintage-reviewer`, `vintage-security-auditor`, `vintage-addon-reviewer` (read-only, open with `EXECUTION:`) | No fresh-reviewer framing, no `[executed]`/`[traced]` tags, no pass number, no triage dispositions, no Coverage block, no shared output shape |
| Review procedure | None written. The agents list what to check, not how to review | Claims-first, scope rule, follow-up bar, two-pass cap, blocker definition |
| Self-review step in the flow | `vintage-pr-workflow` goes commit → PR. PLAN §7.4 names `pnpm review:lanes (max 2 passes)` but nothing implements it | A step before the commit that runs the lanes and fixes findings |
| Review evidence in the PR | PR template has What / Why / How / Testing / Checklist | No Review section; readers cannot tell whether a review ran or what it found |
| Incoming-PR review | Nothing | Needed once contributors other than the maintainer open PRs |
| Independent (CI-side) reviewer | Nothing | Optional; see D5 |

## Design

### Principles

- **One coordinator, read-only lanes.** The authoring session owns every edit, commit, and
  comment. Reviewer agents inspect and report. A probe that must edit (watching a gate fail) is
  the coordinator's job, run after the readers finish, never a reviewer's.
- **Review before the commit, fix in place.** Self-review is a find-and-fix gate, not a report
  to wait on. The order is: diff → lanes → fix → `pnpm validate:final` once → commit → PR.
- **Harness-neutral.** The procedure lives in a skill any harness reads (Claude Code, Codex,
  Copilot). Sub-agents are an optimization: when unavailable, the coordinator runs the lanes
  itself and keeps the notes separated by lane. Inside Claude Code, the built-in `/code-review`
  may implement the correctness lane; it still gets recorded like any lane.
- **Gates block on machine-verifiable danger.** CI keeps blocking on lint, boundaries, manifest,
  types, tests, DCO, and title. Review quality is not machine-verifiable; at most CI checks that
  a review was recorded (D4).
- **Two passes, then stop.** Pass 1 broad, pass 2 verifies fixes. Pass 3 only for an unresolved
  merge blocker. Completion means no blockers, not zero findings.
- **Follow-ups are issues or nothing.** A finding leaves the PR only under the scope rule *and*
  when it names who is harmed if it is never done. Everything else is fixed here or dropped
  without a record.

### Pieces

**1. `vintage-review` knowledge skill** (`.claude/skills/vintage-review/SKILL.md`, routed from
the AGENTS.md Skills table: "Reviewing a diff, before a PR, or when asked to review a PR").
Adapted from `review-code-fz`, kept short, with these sections:

- Fresh reviewer: judge the artifacts, not the author's reasoning; search current code, not
  memory; tie every finding to diff evidence.
- Claims first, mechanism second: collect the PR body's Testing claims, feature-doc checkboxes,
  JTBD job sentences, test names, and comments; for each ask what would have to execute to
  falsify it; sentences with no answer are findings. Weight the file written last highest.
- Probing rules: prefer running the mechanism over inspecting its output; any surprising probe
  result, pass or fail, gets a second independent check. Name the cheap repair (fix the prose)
  before the expensive one (build the thing).
- Triage: Fix in PR (default for a valid finding on a touched surface, pre-existing defects
  included) / Follow-up issue (scope rule *and* material) / No action (dropped, no record).
- Scope rule: a finding leaves the PR only if fixing it would need a full-validation run, a new
  command or table, a product decision (`needs:decision`), a review lane the PR did not already
  need, a third pass, or roughly 30% more diff.
- Two-pass convergence and the merge-blocker definition (acceptance failure, required-gate
  failure, material regression, data loss, exploitable permission or `guildId` boundary failure,
  incompatible command contract).
- The Vintage lane map (below), the shared reviewer output, and the lane prompt template.

**2. Reviewer agents on one contract.** Rewrite the three existing agents to the Fabric Zero
shape while keeping their Vintage checklists:

- Open with `EXECUTION: available` or `EXECUTION: unavailable`; mark each claim `[executed]`
  (ran it, quoting real output) or `[traced]` (read it). When execution is available, cite at
  least one command that exercises the reviewed change, not a shell probe.
- Capability is per invocation: never infer it from the tools list; never refuse for lack of a
  runner; an unexecuted report's findings are hypotheses the coordinator reproduces.
- Honor the caller's pass number (1 broad, 2 verify, 3 blocker only).
- Invoke `vintage-review` first; the agent file is routing plus the Vintage checklist.
- Return the shared output: findings with disposition, `file:line`, Evidence, Impact, Action;
  then Coverage (reviewed / skipped).

Roster now: `vintage-reviewer` (correctness, command contract, data and boundaries, tests,
surfaces), `vintage-security-auditor`, `vintage-addon-reviewer`. Later, per PLAN §7.4:
`vintage-afd-reviewer` once guild-kit is on AFD 2.2 and the contract diff exists;
`vintage-ux-reviewer` once the website and ui-kit have enough surface.

**3. The lane map.** Categories, not an agent count. One owner reviews the active lanes
directly for a small change; a distinct read-only agent is dispatched only for a named
assurance question (security boundary, data integrity, the addon).

| Lane | Active when the diff touches | Looks for | Runs as |
|---|---|---|---|
| Intent and correctness | Any behavior | Claims vs. code, edge cases, error paths, event ordering (claim-before-send in the coordinator), time zones, composition with freshly merged `main` | `vintage-reviewer` |
| Command contract | `modules/*/src/commands`, `packages/guild-kit`, `commands.manifest.json` | Zod input, minimum tier, `CommandResult` with a suggestion on failure, `destructive: true` honoring `dryRun`, kebab `<noun>-<verb>` names, manifest regenerated, `breaking-contract` label when owed | `vintage-reviewer` |
| Data and boundaries | `modules/*/convex`, stores, cross-module imports | `guildId` on every record and query, another module reached only via `/contract`, no table reached across modules, layers point down (the mechanical part is `check:boundaries`) | `vintage-reviewer` |
| Security | guild-kit caller/tier/confirm tokens, `apps/gateway` Discord, `/mcp`, Better Auth, env handling | The six properties already listed in the auditor (tier enforcement, caller resolution, confirm tokens, disclosure, Discord signature, MCP audience) | `vintage-security-auditor` |
| Tests and gates | Any behavior; `scripts/`, `lefthook.yml`, `ci.yml` | New behavior tested through `registry.execute` with the memory store; memory store and Convex component behaviorally identical; a new or changed gate *watched failing* with the evidence quoted; a JTBD job added or updated when a member capability changes; assertions that cannot run or cannot fail | `vintage-reviewer` |
| Discord and web surfaces | `modules/*/discord`, `apps/web`, `packages/ui-kit`, `libs/design-tokens` | No logic in a surface, embed and component limits, tokens not hard-coded, keyboard and label basics in ui-kit | `vintage-reviewer` now, `vintage-ux-reviewer` later |
| Addon | `addon/`, `libs/bridge-format` | Forever API, Core/Bridge layering, secret values, bridge version bump with fixtures on both sides | `vintage-addon-reviewer` |
| Docs and release readiness | `docs/`, `AGENTS.md`, skills, `PLAN.md`, feature docs | The `vintage-maintain-docs` table satisfied in the same PR; PR body claims supported by commits and tests; no secret values | Coordinator |

**4. Where review sits in the flow.** `vintage-pr-workflow` gains a "Self-review" section
between "Before you commit" and "The PR":

```
diff against main  →  activate lanes from the changed-file map
  →  pass 1 (fan out only for named assurance questions)
  →  fix every Fix-in-PR finding; file material follow-ups with area:* labels
  →  pass 2 on the fixes only
  →  pnpm validate:final once  →  commit (-s)  →  PR with a Review section
```

Targeted checks during the fix loop (`vitest run <file>`, `pnpm check:boundaries`); the
full `validate:final` runs once on the final tree, which the pre-push hook enforces anyway.

**5. The PR template gains a Review section**, and the Checklist a line for it:

```markdown
## Review

- Lanes: correctness, command contract, tests (vintage-reviewer, EXECUTION: available);
  security not owed (no auth, Discord, or MCP change)
- Findings: 3 fixed in PR · 1 follow-up (#NN) · 2 no action
- Passes: 2
```

This is also where pass counts live; Vintage does not need a per-session state file.

**6. A presence gate in CI (optional, D4).** `scripts/check-pr-review.mjs`, run in the `select`
job next to the title and DCO checks: fail when a non-docs-only PR from a human author has no
`## Review` section with a `Lanes:` line naming an `EXECUTION:` status. It cannot judge review
quality; it catches the real failure mode for agent-authored PRs, which is skipping the step.
Per the gate discipline it ships with `scripts/check-pr-review.test.mjs` fixtures (missing
section, section without lanes, docs-only exemption, bot author exemption) and is watched
failing once on the PR that adds it. Docs-only comes from `ci-selection.mjs`'s existing
`docsOnly` output.

**7. `/do-review` action skill (optional, phase B).** A thin wrapper over `vintage-review`:
no args runs the self-review on the current branch; `do-review <pr>` gathers PR context with
`gh` and produces the read-only incoming-PR verdict (Required fixes → Follow-up issues →
No-action notes → Verdict), posting only when asked. Worth adding when the first PR from
someone other than the maintainer arrives, or when botcore seeds the generic `do-*` skills.

### Not adopting, and why

| Fabric Zero piece | Why not here |
|---|---|
| `pr:readiness` manifest, `pr:push` receipts, `pr:body` renderer | Solves "many worktrees publishing at once" and receipt-bound evidence. Vintage's pre-push runs `validate:final` and CI re-runs it; the PR template is filled by hand |
| Merge queue and the enqueue watcher | `gh pr merge --squash --auto` on `ci-ok` is already the rule |
| `review:probe-isolation` guard | Only needed when a mutating probe runs beside reader agents. Rule instead: reviewers never edit; the coordinator runs probes after readers finish |
| Accessibility Ally via Nexus | Microsoft-internal tooling. The surfaces lane checks keyboard and labels directly; a `vintage-ux-reviewer` comes later |
| Model pinned to one vendor | That repo's policy. Vintage routes per `docs/operations/model-routing.md` (D3) |
| `.zero-logs/task-state.md` pass tracking | Pass counts go in the PR's Review section |
| Eight lanes, each a separate agent | Lanes are categories. One owner by default; fan out for named assurance questions only |
| Changeset bump contract | Only the addon is versioned (PLAN §7.3) |

## Tasks

**Phase A — the procedure (one PR, `chore(repo)`)**

The lane map and prompt template live in `.claude/skills/vintage-review/references/lanes.md` so
the skill itself stays short. Building it also corrected `vintage-pr-workflow`, which pointed at a
`contract.diff` that does not exist yet; the contract gate is `scripts/check-contract-break.mjs`.
It also fixed the review scope: self-review runs before the commit, so it diffs the working tree
(`git diff origin/main`), not `origin/main...HEAD`, which is empty until something is committed.

- [x] Write `.claude/skills/vintage-review/SKILL.md` (procedure, lane map, output shape, prompt
      template); add its row to the AGENTS.md Skills table
- [x] Rewrite the three agents to the shared contract; keep their Vintage checklists
- [x] Add "Self-review" to `vintage-pr-workflow`; add the review row to the
      `vintage-maintain-docs` table ("You changed a reviewer agent or the lane map → update
      `vintage-review`")
- [x] Add the Review section and checklist line to `.github/PULL_REQUEST_TEMPLATE.md`
- [x] Add review rows to `docs/operations/model-routing.md` (D3) and set agent `model:`
      frontmatter accordingly
- [x] Replace `pnpm review:lanes` in PLAN §7.4's loop table with `vintage-review` (`do-review` joins it in Phase B)
- [x] Dogfood: run the procedure on that PR itself and fill in its Review section

**Phase B — enforcement and incoming review (one PR each, when wanted)**

- [ ] `scripts/check-pr-review.mjs` + `.test.mjs`, wired into `select`; watched failing once
- [ ] `/do-review` action skill with the incoming-PR mode

**Phase C — later**

- [ ] `vintage-afd-reviewer` once guild-kit sits on AFD 2.2 and `contract.diff` exists
- [ ] `vintage-ux-reviewer` once the website and ui-kit have enough surface
- [ ] CI-side independent reviewer, if D5 says yes

## Decisions

| # | Decision | Default | Why |
|---|---|---|---|
| D1 | Skill naming | Knowledge skill `vintage-review`; action skill `do-review` later | `check:agent-docs` enforces routing for `vintage-*`; PLAN §7.4 reserves `do-*` for user-invoked actions |
| D2 | Where the self-review step lives | In `vintage-pr-workflow`, before the commit | One place agents already load before committing; no new orchestrator skill |
| D3 | Models for lanes | Reviewer lanes: the authoring session's model (`model: inherit`). Security lane: strong model (`model: opus` in frontmatter) | Matches model-routing's "security review: strong model" row; inheriting elsewhere avoids silently escalating cost |
| D4 | CI presence gate for the Review section | Yes, in Phase B, after Phase A has been dogfooded on a few PRs | It is a presence check, not a quality check; adding it first would make the section a rubber stamp before the procedure has proven useful |
| D5 | CI-side independent reviewer (`anthropics/claude-code-action` posting one review comment) | Defer; revisit when PRs come from more than one author | Fresh context is already what sub-agents give the self-review. A CI reviewer needs an API key secret, must not run with secrets on fork PRs on a public repo, costs per PR, and third-party reports put AI review comments that lead to a change at under one in five. Anthropic's hosted Code Review product is Team/Enterprise only and priced per review, so it is out for a guild project |
| D6 | Who fixes findings | The authoring session, never the reviewer agent | Keeps one writer per set of files; a reviewer that edits can overwrite the coordinator |

## Open questions

- Should the Review section be required for docs-only PRs too? Default no: `docsOnly` skips the
  code lanes, and the docs lane is the coordinator reading its own change.
- Codex and Copilot sessions have no `.claude/agents/` equivalent. The skill's "no sub-agents"
  path covers them; confirm it reads well from `.codex/skills/` once that mirror exists.
- When `vintage-afd-reviewer` arrives, does the Command contract lane move out of
  `vintage-reviewer` entirely, or stay as a cheap first pass? Decide when the contract diff
  exists.

## Sources

- Fabric Zero (local checkout): `.claude/agents/fz-reviewer.md`, `fz-security-auditor.md`;
  `.claude/skills/review-code-fz/SKILL.md` and `references/review-lanes.md`;
  `.claude/skills/do-review/SKILL.md`; `.claude/skills/do-prepare-pr/SKILL.md` and
  `references/pr-template.md`; `.claude/settings.json` hooks; `.github/PULL_REQUEST_TEMPLATE.md`
- Vintage: `AGENTS.md`, `PLAN.md §7.4`, `.claude/agents/*`, `.claude/skills/vintage-pr-workflow`,
  `.github/workflows/ci.yml`, `scripts/check-agent-docs.mjs`
- D5 background (third-party write-ups, 2026): the GitHub Action at v1 and its review-prompt
  pattern ([setup guide](https://fast.io/resources/claude-code-github-action-setup-guide/),
  [workflow example](https://www.mintlify.com/jackdog668/claude-code/integrations/github-actions));
  the hosted Code Review product's plan and pricing
  ([report](https://www.etvbharat.com/en/technology/anthropic-launches-ai-powered-code-review-tool-in-claude-code-enn26031006348));
  the "under one in five comments lead to a change" figure
  ([article](https://interviewkickstart.com/blogs/articles/claude-code-now-uses-ai-agents-to-review-pull-requests-what-engineers-need-to-know)).
  Verify against Anthropic's own docs before acting on D5.
