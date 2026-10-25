#!/usr/bin/env node
// Push functions to an anonymous local Convex backend (no account) and regenerate codegen.
// Sets CONVEX_TMPDIR on the repo's drive to avoid Windows cross-filesystem temp issues.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tmp = fileURLToPath(new URL('../.convex/tmp', import.meta.url));
mkdirSync(tmp, { recursive: true });

const watch = process.argv.includes('--watch');
const result = spawnSync('npx', ['convex', 'dev', ...(watch ? [] : ['--once'])], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous', CONVEX_TMPDIR: tmp },
});
process.exit(result.status ?? 1);
