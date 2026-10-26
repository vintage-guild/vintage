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
| Network access | **Limited**, **Allow package managers** on, and these allowed domains (below) |
| Environment variables | your git identity (below) |
| Setup script | the contents of `scripts/cloud/setup.sh` |

Allowed domains, one per line:

```
nodejs.org
version.convex.dev
objects.githubusercontent.com
release-assets.githubusercontent.com
```

`nodejs.org` serves Node 24. The other three let `pnpm --filter @vintage/api dev:local` find
and download the Convex local backend binary. Don't add `github.com` or `api.github.com`: GitHub
traffic goes through the session's GitHub proxy, which only serves the session's own repos
whatever the allowlist says.

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

Cloud VMs set git's identity to `Claude <noreply@anthropic.com>`, but a session you drive is a
human-driven commit: you're the author and you sign off ([AGENTS.md](../../AGENTS.md#commits-and-attribution)).
Set your identity as the environment's variables (use a verified email on your GitHub account):

```
GIT_AUTHOR_NAME=Your Name
GIT_AUTHOR_EMAIL=you@example.com
GIT_COMMITTER_NAME=Your Name
GIT_COMMITTER_EMAIL=you@example.com
```

Git prefers these over `git config`, and `git commit -s` signs off as the committer, so the
sign-off matches the author. Disclose AI help with `Assisted-by:`, never `Co-authored-by`. The
lefthook hooks are installed by `pnpm install`, so `pre-push` still runs `pnpm validate:final`.

## Lockfile registry

`pnpm-lock.yaml` must not pin tarball URLs to a private feed: cloud sessions (and anyone without
access) can't download them. `pnpm install` on a machine with a corporate npm mirror adds
`tarball:` fields for new packages, and `pnpm check:lockfile` (part of `validate:final` and CI)
fails on them. Strip them before committing; pnpm then builds URLs from whatever registry each
machine is configured with:

```bash
sed -i -E 's#, tarball: https://[^}]*\}#}#' pnpm-lock.yaml
``` A session that hits this reports
`pnpm install failed` from the SessionStart hook.
