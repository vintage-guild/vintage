#!/usr/bin/env node
// Writes libs/bridge-format/fixtures/*.json, the golden strings shared with the addon (PLAN §3.5).
// The lib stays pure (no node: imports); this runner owns the filesystem.
//   pnpm fixtures:bridge          → write the fixture files
//   pnpm fixtures:bridge --check  → exit 1 if a committed fixture is stale (the lib's tests check too)
// Runs under tsx so it can import the lib's TypeScript directly.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures } from '../libs/bridge-format/src/fixtures.ts';

const DIR = fileURLToPath(new URL('../libs/bridge-format/fixtures/', import.meta.url));
const check = process.argv.includes('--check');

const read = (path) => {
  try {
    return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  } catch {
    return undefined;
  }
};

const stale = [];
for (const [name, content] of Object.entries(buildFixtures())) {
  const path = join(DIR, name);
  if (read(path) === content) continue;
  stale.push(name);
  if (!check) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path, content);
  }
}

if (check && stale.length) {
  console.error(
    `Bridge fixtures are stale (${stale.length}); run pnpm fixtures:bridge:\n${stale.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(
  check
    ? 'Bridge fixtures are up to date.'
    : `Wrote ${stale.length} bridge fixture file(s); the rest were unchanged.`,
);
