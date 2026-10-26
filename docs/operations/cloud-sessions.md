# Cloud sessions

Claude Code cloud sessions (claude.ai/code, the Claude app, the Desktop app's **Cloud**
environments, `claude --cloud`) run on a fresh Ubuntu VM with a clone of the repo. Two pieces make
that VM able to run `pnpm validate:final`:

| Piece | Where | Does |
|---|---|---|
| [`scripts/cloud/setup.sh`](../../scripts/cloud/setup.sh) | The environment's **Setup script** at claude.ai/code | Installs Node from `.nvmrc` (the image ships 20–22) and pnpm; cached by the environment |
| [`scripts/cloud/session-start.sh`](../../scripts/cloud/session-start.sh) | `SessionStart` hook in `.claude/settings.json` | Puts that Node on `PATH`, runs `pnpm install` when the lockfile changed; no-op locally |

The hook works without the setup script (it installs Node itself), but every session then pays
for the download. Set the script once per environment.

## Set up an environment

At [claude.ai/code](https://claude.ai/code), add or edit an environment:

| Field | Value |
|---|---|
| Name | `Vintage` |
| Network access | **Limited**, **Allow package managers** on, allowed domain `nodejs.org` (npm, PyPI, and GitHub releases for the Convex local backend come with the package managers list) |
| Environment variables | none needed |
| Setup script | the contents of `scripts/cloud/setup.sh` |

Never put Discord tokens or Convex deploy keys in the environment: anyone using it can read them.
Cloud sessions use the anonymous local Convex backend (`pnpm --filter @vintage/api dev:local`),
like a fresh local checkout.

The GitHub connection needs the Claude GitHub App installed on `vintage-guild/vintage` for
sessions to clone, push branches, and use Auto-fix on PRs.

## When versions change

- **Node (`.nvmrc`):** update `NODE_VERSION` in `setup.sh` and paste it into the environment
  again (that rebuilds the cache). Until then the hook installs the new Node each session.
- **pnpm (`packageManager`):** same, with `PNPM_VERSION`.
- **Dependencies:** nothing to do; the hook reinstalls when `pnpm-lock.yaml` changes.

## Check a session

Ask Claude in a new cloud session to run `node --version && pnpm validate:final`. The hook's
first message in the session says which Node and pnpm it set up; if it reports a failure, its
log is at `/tmp/vintage-session-start.log`.

## Commits from cloud sessions

The sign-off and attribution rules in [AGENTS.md](../../AGENTS.md#commits-and-attribution) apply
as they do locally: commit with `-s`, disclose AI help with `Assisted-by:`, and check that
`git config user.email` is a verified email on the GitHub account driving the session before
committing. The lefthook hooks are installed by `pnpm install`, so `pre-push` still runs
`pnpm validate:final`.
