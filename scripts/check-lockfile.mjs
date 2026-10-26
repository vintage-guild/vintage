#!/usr/bin/env node
// pnpm-lock.yaml must not pin tarballs to a private registry mirror. pnpm records a `tarball:`
// URL when it installs through a mirror (a corporate npm feed, say), and CI, cloud sessions, and
// other contributors can't download from it. Without the field pnpm builds the URL from each
// machine's own registry. Fix: strip the `, tarball: …` parts (docs/operations/cloud-sessions.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/workspace.mjs';

const PUBLIC_HOSTS = new Set(['registry.npmjs.org', 'codeload.github.com']);

/** Packages whose lockfile entry pins a tarball outside the public hosts. */
export function findPrivateTarballs(lockfile) {
  return lockfile
    .split('\n')
    .map((line, i) => ({ line: i + 1, url: /tarball: (https?:\/\/[^,}\s]+)/.exec(line)?.[1] }))
    .filter(({ url }) => url && !PUBLIC_HOSTS.has(new URL(url).host))
    .map(({ line, url }) => `pnpm-lock.yaml:${line} pins a tarball on ${new URL(url).host}`);
}

if (process.argv[1]?.endsWith('check-lockfile.mjs')) {
  const errors = findPrivateTarballs(readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8'));
  if (errors.length) {
    const shown = errors.slice(0, 5).map((e) => `  - ${e}`);
    if (errors.length > 5) shown.push(`  - …and ${errors.length - 5} more`);
    console.error(
      `Lockfile check failed (${errors.length} private tarball URLs):\n${shown.join('\n')}\n` +
        'Strip the ", tarball: …" fields; see docs/operations/cloud-sessions.md.',
    );
    process.exit(1);
  }
  console.log('Lockfile check passed.');
}
