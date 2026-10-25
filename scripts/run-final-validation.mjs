#!/usr/bin/env node
// Local quality gate (PLAN §7.2). Same commands CI runs.
//   pnpm validate:final  → what a typical change needs before a PR
//   pnpm validate:full   → everything, including the gate self-tests and botcore tests
import { execSync, spawnSync } from 'node:child_process';

const full = process.argv.includes('--full');

const steps = [
  // CI installs with --frozen-lockfile; catch a stale lockfile before it does.
  ['lockfile', 'pnpm install --frozen-lockfile --lockfile-only --silent'],
  ['lint', 'pnpm lint'],
  ['boundaries', 'pnpm check:boundaries'],
  ['agent docs', 'pnpm check:agent-docs'],
  ['command manifest', 'pnpm check:manifest'],
  ['type-check', 'pnpm type-check'],
  ['tests', 'pnpm test:run'],
];
if (full) {
  steps.push(['ci selection self-test', 'pnpm check:ci-selection']);
  if (hasUv()) steps.push(['botcore plugin tests', 'uv run --directory tooling/botcore pytest -q']);
  else console.warn('! uv not found: skipping botcore plugin tests');
}

function hasUv() {
  try {
    execSync('uv --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const started = Date.now();
for (const [label, command] of steps) {
  console.log(`\n▶ ${label}: ${command}`);
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed`);
    process.exit(result.status ?? 1);
  }
}
console.log(
  `\n✔ ${full ? 'validate:full' : 'validate:final'} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
