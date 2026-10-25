---
name: vintage-pr-workflow
description: Take a Vintage change from branch to merged PR — branch naming, sign-off and AI attribution, commit and PR title rules, labels (breaking-contract, area), what each CI lane checks, CodeQL findings, auto-merge, and keeping docs in the same PR. Load before committing, pushing, or opening a PR.
---

# From branch to merged PR

## Before you commit

- Branch from up-to-date `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `test/…`.
- Commit identity must be a verified email on the human's GitHub account, or the commit won't
  link to them. Check `git config user.email`.
- Every human-driven commit: `git commit -s` (accepts CONTRIBUTOR_AGREEMENT.md) and, if an agent
  helped, an `Assisted-by: <model>` trailer. **Never** `Co-authored-by` for an AI. Bot-authored
  commits (Dependabot) are exempt.
- Conventional Commits with a scope from `commitlint.config.mjs`. Add a scope there when you add a
  module or app.
- Run `pnpm validate:final` (the pre-push hook does too). Lockfile changed? Commit `pnpm-lock.yaml`.

## The PR

- **Title** = the squash commit on `main`, so it follows the same Conventional Commits rules (CI
  checks it, lowercase subject, no trailing period).
- **Body:** What / Why / How / Testing, `Part of #N` or `Closes #N`, and say what you could not
  verify. Agent-written PRs end with the Claude Code line.
- **Labels:** `area:<module>`; `breaking-contract` when `contract.diff` reports a removed command,
  raised tier, newly required input, or new confirmation.
- **Docs in the same PR:** see the `vintage-maintain-docs` skill.

## CI

`select` decides which lanes the diff owes and also checks PR-title format and commit sign-offs.
Lanes: `ts` (lint, boundaries, agent docs, types, tests), `contract` (manifest + breaking
changes), `addon`, `botcore`, `workflow-contracts`. **`ci-ok` is the only required check** and
fails if any owed lane didn't pass.

CodeQL runs separately. A CodeQL alert blocks merging even when `ci-ok` is green: read it with
`gh api repos/vintage-guild/vintage/check-runs/<id>/annotations`, fix the code (tests too), and
push. Don't dismiss alerts to get a merge through.

## Merging

- Squash only. Branches auto-delete.
- No approvals are required while there's one maintainer; `ci-ok` and resolved threads are.
- `gh pr merge <n> --squash --auto` arms auto-merge once the PR is mergeable.
- Parallel branches usually conflict only on `pnpm-lock.yaml`: take `main`'s lockfile, run
  `pnpm install`, re-run `validate:final`. Never hand-merge the lockfile.

## Repo and org actions

Use the maintainer's GitHub account for repo and org actions (the org owner's token), never a work
account. Changing repo settings, rulesets, or org permissions is a maintainer decision: propose,
don't just do it.
