---
name: do-run-fleet
description: Run an autonomous fleet batch against fleet:candidate issues — claim up to 3 issues in one area with fleet:in-progress and an expiring lease comment, route model and effort per docs/operations/model-routing.md, validate with vintage-review and pnpm validate:final, and open a PR in local or cloud mode.
---

# Run a Vintage fleet batch

Claim a small, cohesive batch of `fleet:candidate` issues, finish them to Vintage's full PR bar,
and leave clean leases so parallel runners never collide or strand work.

## 1. Pick execution mode

- **Local mode:** Start from a clean branch or worktree off up-to-date `origin/main`
  (`git fetch origin`).
- **Cloud mode (`claude.ai/code`):** Use the `Vintage` cloud environment documented in
  `docs/operations/cloud-sessions.md` (`scripts/cloud/setup.sh`, human `GIT_AUTHOR_*` /
  `GIT_COMMITTER_*` env vars for DCO sign-off, anonymous `dev:local` Convex backend, no prod
  secrets).

## 2. Select up to 3 issues in one area

List candidates:

```bash
gh issue list --state open --label fleet:candidate --limit 100 \
  --json number,title,labels,assignees,updatedAt
```

Filter out any issue that:

- carries any `needs:*` label,
- already has an open linked PR (`gh pr list --search "<n>"` or issue timeline), or
- carries `fleet:in-progress` with an **unexpired** lease.

**Lease expiry check:** Read the issue's comments (`gh issue view <n> --comments`) and find the
latest `<!-- fleet-lease -->` comment. A lease is expired when its `Expires:` UTC timestamp is in
the past (or, if no timestamp was recorded, the claim is older than 4 hours with no linked PR or
recent commit).

Group eligible issues by their primary `area:*` label and choose **at most 3 issues in one area**
for a single PR (prefer `priority:p0` → `p1` → `p2`, then closely related scope). One issue per
PR is preferred whenever a single issue is already a meaningful vertical slice.

## 3. Claim with `fleet:in-progress` and a lease

Before editing any file, claim every issue in the batch:

1. Add `fleet:in-progress` (leave `fleet:candidate` on the issue so an expired lease stays
   discoverable by the next run):
   ```bash
   gh issue edit <n> --add-label fleet:in-progress
   ```
2. Post a lease comment with a UTC expiry (default **+2 hours** local, **+4 hours** cloud):
   ```markdown
   <!-- fleet-lease -->
   **Fleet claim**
   - Runner: `<handle-or-session>` (`local` | `cloud`)
   - Branch: `<branch-name>`
   - Claimed: `YYYY-MM-DDTHH:MM:SSZ`
   - Expires: `YYYY-MM-DDTHH:MM:SSZ`
   ```
   If reclaiming an expired lease, include a line noting the expired claim's timestamp.
3. Immediately re-read comments on each claimed issue. If another runner posted an earlier active
   lease, back off: note the collision, drop that issue from your batch, and do not remove the
   other runner's `fleet:in-progress` label.

If a run will outlast its lease, post a brief `<!-- fleet-lease -->` renewal comment with an
updated `Expires:` UTC timestamp before it lapses.

## 4. Route model and effort

Pick the model and effort from `docs/operations/model-routing.md` for each step rather than
running the entire batch at maximum cost:

- Bounded `fleet:candidate` implementation: fast/mid model at high effort (Claude Sonnet, GPT Luna
  Extra High, or GPT Sol Medium/High for tricky Convex/Discord edge cases).
- Mechanical edits, fixtures, and doc syncs: small/fast model.
- Security-sensitive boundaries (auth, tier checks, `guildId` isolation, MCP, Discord signatures):
  dispatch `vintage-security-auditor` (`model: opus`).
- Never skip `pnpm validate:final` regardless of model tier.

## 5. Implement, self-review, and validate

1. Load the area skills routed in `AGENTS.md` (`vintage-afd-commands`, `vintage-convex-modules`,
   `vintage-discord`, `vintage-design-tokens`, `vintage-addon`, `vintage-jtbd`,
   `vintage-maintain-docs`).
2. Keep every change strictly within the claimed issues' acceptance criteria and area.
   - Update `commands.manifest.json` (`pnpm manifest:write`) if any command changes.
   - Keep feature docs, `PLAN.md`, and JTBD docs updated in the same PR.
3. Run the `vintage-review` self-review before committing (Pass 1 across all active lanes; Pass 2
   on fixes only; Pass 3 only for a merge blocker).
4. Run `pnpm validate:final` once on the final tree (plus `addon/Vintage/Tools/validate.py` if
   `addon/` or `libs/bridge-format/` changed).

## 6. Open the PR or release the claim

**When ready:** Follow `vintage-pr-workflow`:

- Commit with `git commit -s` and `Assisted-by: <model>` (never AI `Co-authored-by`).
- Open one PR with a Conventional Commits title, the `area:*` label, `Closes #N` for each claimed
  issue, and the **Review** section from `vintage-review`.
- If a claimed issue requires a human production step before deploy (such as setting a new env
  var), open the PR as a **Draft** and list the rollout steps at the top of the PR description.
- Once the PR merges, GitHub closes the linked issues automatically. If any claimed issue stays
  open after a partial PR, remove `fleet:in-progress` and comment with what remains.

**When blocked mid-run:** Do not hold a dead lease:

- Remove `fleet:in-progress` (`gh issue edit <n> --remove-label fleet:in-progress`).
- Add the fitting `needs:*` label (`needs:decision`, `needs:approach`, `needs:repro`,
  `needs:human`).
- Post a short comment explaining what was tried, what blocked progress, and any partial branch or
  Draft PR link.
