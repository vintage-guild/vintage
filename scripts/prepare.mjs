#!/usr/bin/env node
// `pnpm install` runs this: install the git hooks for contributors. Skipped where there is no git
// checkout to hook into, such as Vercel builds of apps/gateway.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (process.env.VERCEL || !existsSync('.git')) {
  console.log('prepare: no git checkout here, skipping lefthook install');
} else {
  execSync('lefthook install', { stdio: 'inherit' });
}
