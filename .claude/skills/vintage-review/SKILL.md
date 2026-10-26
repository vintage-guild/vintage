---
name: vintage-review
description: Review a Vintage change — the self-review every PR gets before its commit, or a read-only review of someone else's PR. Covers the fresh-reviewer and claims-first procedure, the lane map, fix-in-PR / follow-up / no-action triage and the scope rule, the two-pass cap and merge blockers, the reviewer output contract, and how to record the result in the PR. Load before reviewing a diff, before opening a PR, or when asked to review one.
---

# Reviewing a change

Self-review is a **find-and-fix gate**, not a report to wait on: the session that wrote the change
reviews it, fixes what it finds, and records the result in the PR. Reviewing someone else's PR uses
the same procedure but stays read-only and ends in a verdict.

## Roles

- **Coordinator** — the authoring session. Owns every edit, commit, push, issue, and comment.
- **Lanes** — review categories (below). One owner reviews the active lanes directly. Dispatch a
  read-only reviewer agent only for a named assurance question that needs fresh context: a
  security boundary, data integrity, the addon, or a hard-to-reverse change. Never two reviewers
  on one lane.
- **Reviewer agents** (`.claude/agents/`) inspect and report, then stop. They never edit. A probe
  that must edit (watching a gate fail) is the coordinator's, run after the readers finish.
- No sub-agents in this harness? Run the lanes yourself, keeping notes separated by lane until
  you merge them.

## Procedure

1. **Map the change.** `git diff --stat origin/main` (the working tree against the base, so
   uncommitted work counts) and `git status --short` for new files; for someone else's PR,
   `gh pr diff <n>`. Then the PR body, the linked issue,
   and the feature doc. Pick the lanes the changed paths activate
   ([references/lanes.md](references/lanes.md)).
2. **Claims first.** Collect every declarative sentence the change ships: the PR body's Testing
   section, feature-doc checkboxes and status markers, JTBD job text, test names, comments, and
   commit messages. For each, ask *what would have to execute for this to be falsifiable?*
   A sentence with no answer is a finding. A derivation ("the counts match, so nothing else
   changed") is a claim too: ask whether it could be right by accident.
3. **Read the last file first.** Start with the file the author wrote last and the one they'd
   call "just" a doc, fixture, or config. Reviewing in the author's order inherits their blind spot.
4. **Then the mechanism**, lane by lane, against current code. Search the repo; don't review from
   memory. Tie every finding to diff evidence.
5. **Probe by running the mechanism, not by inspecting its output.** Run the test, the command,
   the gate. A surprising result in either direction, pass or fail, gets a second independent check
   before it becomes a finding.
6. **Name the cheap repair.** When a claim and the code disagree, fixing the claim is usually the
   right fix. Say so before proposing to build the thing the claim describes.

## Triage

| Disposition | When |
|---|---|
| **Fix in PR** | The default for a valid finding on a surface this diff touches, pre-existing defects there included |
| **Follow-up issue** | The scope rule sends it out **and** it is material: name who is harmed, and when, if it's never done. File it with `area:*` and `type:*` labels and say why it wasn't fixed here; add to an open issue on the same area first |
| **No action** | False positive, intentional tradeoff, already covered, speculative, polish, an idea nobody asked for. Drop it; don't record it anywhere |

**Scope rule.** A valid finding leaves the PR only if fixing it would need `validate:full` or a
`ci:full-validation` run, a new command or table, a product decision (`needs:decision`), a lane
this PR didn't already need, a third pass, or roughly 30% more diff.

Corrections batch; they don't chain. Never open a follow-up whose only effect is fixing the
wording of the PR before it.

## Passes

1. **Pass 1, broad.** All active lanes. Fix the Fix-in-PR findings with targeted checks
   (`pnpm exec vitest run <file>`, `pnpm check:boundaries`, `pnpm check:manifest`).
2. **Pass 2, verify.** Only the fixes, the code they touched, and regressions they caused. Don't
   reopen untouched scope. A new non-blocker is fixed if small, filed if material, else dropped.
3. **Pass 3, blockers only.** Allowed only for an unresolved merge blocker, scoped to it.

Skip pass 2 when pass 1 fixed nothing. Done means **no blockers**, not zero findings. Changing
reviewer or model, or merging `main`, doesn't reset the count.

A **merge blocker** is a demonstrated acceptance failure, a required-gate failure, a material
regression, data loss or corruption, an exploitable tier or `guildId` boundary failure, or an
incompatible command contract (a break `check-contract-break.mjs` reports, without the
`breaking-contract` label).

## Reviewer output

Every lane, agent or not, reports in this shape:

```markdown
EXECUTION: available (ran: pnpm exec vitest run modules/raids/tests/queue.test.ts)

## {Lane} review — pass {n}

### Findings
- [Fix in PR] modules/raids/src/domain/queue.ts:42 - Promotion skips a late signup.
  Evidence: [executed] `vitest run queue.test.ts -t late` fails: expected 'Aeryn', got undefined.
  Impact: A late member who should move up stays queued and is never told.
  Action: Count `late` signups as eligible when choosing who is promoted.

### Coverage
- Reviewed: files, commands, tests, docs inspected.
- Skipped: what was in scope and not inspected, and why.
```

- **First line is `EXECUTION: available` or `EXECUTION: unavailable`.** It describes this
  invocation, not the agent type. Never refuse a review for lack of a runner; label it honestly.
- Mark each finding's evidence `[executed]` (you ran it; quote the real output) or `[traced]`
  (you read the code). With execution available, cite at least one command that exercises the
  change, not a shell probe.
- An unexecuted report's findings are **hypotheses**. The coordinator reproduces each one before
  fixing it, or re-dispatches the lane with execution.
- No praise unless it changes what the coordinator should do.

To dispatch a lane, use the prompt template in [references/lanes.md](references/lanes.md).

## Record it in the PR

Fill the PR template's **Review** section:

```markdown
## Review

- Lanes: correctness, command contract, tests (self, EXECUTION: available); security
  (vintage-security-auditor, EXECUTION: available)
- Not owed: addon (no addon/ or bridge-format change)
- Findings: 3 fixed in PR · 1 follow-up (#NN) · 2 no action
- Passes: 2
```

Docs-only PRs still list the docs lane. Say plainly what wasn't reviewed.

## Someone else's PR

Read-only: never push to their branch. Gather context with `gh pr view <n>` and `gh pr diff <n>`,
run the same procedure, and report:

```markdown
## PR #N review: {title}
### Required fixes      (table: finding · location · fix direction)
### Follow-up issues    (issue or draft · why it's separate)
### No-action notes     (only where a reader would otherwise raise it again)
### Verdict             Approve / Approve with changes / Request changes, with the reason
```

Post it with `gh pr review` only when asked.
