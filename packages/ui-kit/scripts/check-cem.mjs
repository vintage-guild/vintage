#!/usr/bin/env node
// Gate for the Custom Elements Manifest (PLAN §3.9): every element ui-kit defines is in
// dist/custom-elements.json with a description, and every `@command` method is listed in its
// `commands`. Run after `cem analyze` (the package's build script does both).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const elementsDir = join(root, 'src', 'elements');
const manifest = JSON.parse(readFileSync(join(root, 'dist', 'custom-elements.json'), 'utf8'));

const declarations = new Map(
  manifest.modules
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.tagName)
    .map((d) => [d.tagName, d]),
);

const errors = [];
for (const file of readdirSync(elementsDir).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
)) {
  const source = readFileSync(join(elementsDir, file), 'utf8');
  for (const [, tag] of source.matchAll(/\.define\(\{\s*name:\s*'([a-z0-9-]+)'/g)) {
    const declaration = declarations.get(tag);
    if (!declaration) {
      errors.push(`${file}: <${tag}> is not in the manifest (add a @tagname JSDoc tag)`);
      continue;
    }
    if (!declaration.description) errors.push(`${file}: <${tag}> has no description`);
    const listed = new Set((declaration.commands ?? []).map((c) => c.id));
    for (const [, id] of source.matchAll(/@command\(\s*'([^']+)'/g)) {
      if (!listed.has(id)) errors.push(`${file}: <${tag}> command ${id} is not in the manifest`);
    }
  }
}

if (errors.length) {
  console.error(
    `Custom Elements Manifest check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`Custom Elements Manifest check passed (${declarations.size} elements).`);
