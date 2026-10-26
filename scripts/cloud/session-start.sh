#!/bin/bash
# SessionStart hook (.claude/settings.json): make a Claude Code cloud session ready for
# `pnpm validate:final`. Does nothing outside the cloud. See docs/operations/cloud-sessions.md.
#
# 1. Node from .nvmrc and pnpm from package.json, installed by scripts/cloud/setup.sh (cached by
#    the environment's setup script; installed here only if that's missing or out of date)
# 2. That Node first on PATH for every command Claude runs (via $CLAUDE_ENV_FILE)
# 3. `pnpm install`, skipped while the lockfile and manifests are unchanged
#
# Whatever happens, exit 0: a broken install shouldn't stop the session, and the message below
# tells Claude what to fix.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

log=/tmp/vintage-session-start.log
node_version="$(tr -d 'v \r\n' < .nvmrc)"
pnpm_version="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)"
node_dir="/opt/node-v${node_version}"

fail() {
  echo "Vintage cloud setup: $1 (log: $log). Fix it before running pnpm validate:final."
  exit 0
}

if [ ! -x "${node_dir}/bin/node" ] || [ ! -x "${node_dir}/bin/pnpm" ]; then
  bash scripts/cloud/setup.sh "$node_version" "$pnpm_version" >>"$log" 2>&1 ||
    fail "installing Node ${node_version} failed"
fi

export PATH="${node_dir}/bin:${PATH}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PATH=\"${node_dir}/bin:\$PATH\""
    echo "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
  } >>"$CLAUDE_ENV_FILE"
fi

hashes=node_modules/.vintage-install.sha256
inputs=(scripts/cloud/session-start.sh .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml)
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  pnpm install --frozen-lockfile >>"$log" 2>&1 || fail "pnpm install failed"
  sha256sum "${inputs[@]}" >"$hashes"
fi

echo "Vintage cloud setup: node $(node --version), pnpm $(pnpm --version), dependencies installed."
