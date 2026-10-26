#!/bin/bash
# Claude Code cloud environment setup script (docs/operations/cloud-sessions.md).
#
# Paste this into the environment's "Setup script" box at claude.ai/code. It runs as root before
# Claude Code starts, and its result is cached for later sessions, so it does the slow part:
# installing the Node.js the repo needs (the image ships 20-22; we need .nvmrc's 24) and pnpm.
# The SessionStart hook (scripts/cloud/session-start.sh) puts it on PATH and installs packages.
#
# The hook also calls this script with .nvmrc's version, so if NODE_VERSION below drifts from
# .nvmrc, sessions still get the right Node; they just install it on every start until it's fixed.
set -euo pipefail

NODE_VERSION="${1:-24.22.1}"
PNPM_VERSION="${2:-10.26.2}"
NODE_DIR="/opt/node-v${NODE_VERSION}"

if [ ! -x "${NODE_DIR}/bin/node" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" |
    tar -xJ -C "$tmp"
  mv "$tmp/node-v${NODE_VERSION}-linux-x64" "$NODE_DIR"
  rmdir "$tmp"
fi

export PATH="${NODE_DIR}/bin:${PATH}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null

# Warm the install when the repo is already cloned here, so the cached snapshot has node_modules.
if [ -f pnpm-lock.yaml ] && [ -f .nvmrc ]; then
  CI=true pnpm install --frozen-lockfile --silent || true
fi

echo "node $(node --version), pnpm $(pnpm --version) in ${NODE_DIR}"
