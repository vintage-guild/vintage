#!/usr/bin/env node
// Writes libs/design-tokens/generated/* from the DTCG nodes (PLAN §3.8, plain-DTCG fallback).
// The lib stays pure (no node: imports); this runner owns the filesystem.
//   pnpm tokens:build          → write the generated files
//   pnpm tokens:build --check  → exit 1 if a committed file is stale (the lib's tests check too)
// Runs under tsx so it can import the lib's TypeScript directly.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOutputs } from '../libs/design-tokens/src/build.ts';

const LIB = fileURLToPath(new URL('../libs/design-tokens/', import.meta.url));
const check = process.argv.includes('--check');

const read = (path) => {
  try {
    return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  } catch {
    return undefined;
  }
};

const stale = [];
for (const [rel, content] of Object.entries(buildOutputs())) {
  const path = join(LIB, rel);
  if (read(path) === content) continue;
  stale.push(rel);
  if (!check) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (check && stale.length) {
  console.error(
    `Design tokens are stale (${stale.length}); run pnpm tokens:build:\n${stale.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(
  check
    ? 'Design tokens are up to date.'
    : `Design tokens: ${stale.length ? `wrote ${stale.join(', ')}` : 'nothing changed'}.`,
);
