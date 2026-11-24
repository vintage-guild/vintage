---
name: do-triage
description: Triage open GitHub issues in vintage-guild/vintage — classify unassigned or unlabeled issues with type, priority, area, and upstream labels, then either mark bounded work fleet:candidate or assign an owner from .github/area-ownership.json with the right needs:* blocker label. Run when sweeping or triaging the backlog.
---

# Triage the Vintage backlog

Turn raw or unlabeled issues into routed, actionable backlog items so either a fleet run
(`do-run-fleet`) or a human owner can pick them up without re-reading the whole repo.

## 1. Gather issues needing triage

List open issues that are unassigned, missing classification labels (`type:*`, `priority:*`,
`area:*`), or still carry `status:triage`:

```bash
gh issue list --state open --limit 100 --json number,title,labels,assignees,updatedAt
```

Skip issues already marked `fleet:in-progress` or `status:in-progress`. For each candidate, read
its full body and comments (`gh issue view <n> --comments`) before changing anything.

## 2. Apply labels from the repo taxonomy

Check existing labels with `gh label list --limit 100` before inventing anything. Never create
ad-hoc labels during triage.

| Dimension | Labels | Rule |
|---|---|---|
| Type (pick 1) | `type:bug`, `type:feature`, `type:chore` | Required on every issue |
| Priority (pick 1) | `priority:p0`, `priority:p1`, `priority:p2` | `p0` outage/data-loss, `p1` active-phase blocker, `p2` planned |
| Area (1–2) | `area:<name>` from `.github/area-ownership.json` (plus `area:discord` when Discord-specific outside gateway) | Match the files the fix will touch |
| Status | Remove `status:triage`; add `status:planned` once scoped | Don't set `status:in-progress` during triage |
| Upstream | `upstream` + `upstream:<project>` (`afd`, `botcore`, `fenui`, `mechanic`, `fencore`, `violet`, `fast-af`, `farsight`) | Required when the root cause lives in a Bloodfen foundation project (`PLAN.md §7.5`) |

Check open epics and recent issues for duplicates or parent tracking. Link related epics in a
comment (`Part of #N`) and close true duplicates only with a direct link to the canonical issue.

## 3. Route: `fleet:candidate` vs. human owner

Read `.github/area-ownership.json` for each issue's `area:*` owner (strip the leading `@` when
passing logins to `gh issue edit --add-assignee`).

**Mark `fleet:candidate`** only when **all** of these hold:

1. **Clear spec:** Concrete, testable acceptance criteria (no open product, UX, or architecture
   choices).
2. **Bounded scope:** Touches 1–2 areas and fits cleanly in a single PR without breaking unseen
   contracts or requiring a multi-step human rollout.
3. **Locally verifiable:** Can be proven with `pnpm validate:final`, local Convex (`dev:local`),
   or `addon/Vintage/Tools/validate.py` — no production secrets, Discord Developer Portal edits,
   or live WoW client verification required.

**Otherwise, route to a human owner** (do **not** add `fleet:candidate`):

- Add the matching `needs:*` label:
  - `needs:decision` — product, policy, or architecture choice needed
  - `needs:approach` — design or spike needed before implementation
  - `needs:ux` — visual, copy, or interaction design needed
  - `needs:repro` — bug lacks reliable reproduction steps
  - `needs:human` — requires human-only action (secrets, Portal/CurseForge setup, live WoW client,
    production rollout ordering)
- Assign the owner(s) from `.github/area-ownership.json` (fall back to `areas.default.owners`).
- Post a short triage comment stating the exact question, missing input, or rollout dependency so
  the owner can answer in one reply.

If an issue is otherwise ready to code except for a production rollout prerequisite (for example,
setting a new env var before deploy), you may keep `status:planned`, assign the owner, and note
the rollout order explicitly so any implementer opens a Draft PR rather than auto-merging.

## 4. Apply edits and report

Apply labels and assignees with `gh issue edit <n> --add-label ... --remove-label ... --add-assignee ...`.
Finish with a concise summary table of every issue touched: issue number, labels added/removed,
route (`fleet:candidate` or assigned owner + `needs:*`), and any blockers or duplicates noted.
