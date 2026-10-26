import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBoundaries } from './check-boundaries.mjs';

/** A workspace with an `identity` module and a `raids` module that depends on it. */
function fixture({ raidsDependsOn = ['identity'], raidsDeps = ['identity'], manifest = true }) {
  const root = mkdtempSync(join(tmpdir(), 'boundaries-check-'));
  const module = (name, deps, dependsOn) => {
    const dir = join(root, 'modules', name);
    mkdirSync(dir, { recursive: true });
    const dependencies = Object.fromEntries(deps.map((d) => [`@vintage/${d}`, 'workspace:*']));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: `@vintage/${name}`,
        exports: { './contract': './src/contract.ts' },
        dependencies,
      }),
    );
    if (dependsOn) writeFileSync(join(dir, 'module.json'), JSON.stringify({ name, dependsOn }));
  };
  module('identity', [], []);
  module('raids', raidsDeps, manifest ? raidsDependsOn : null);
  return root;
}

function errorsFor(opts) {
  const root = fixture(opts);
  try {
    return checkBoundaries(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('boundaries: dependsOn matching package.json passes', () => {
  assert.deepEqual(errorsFor({}), []);
});

test('boundaries: a module dependency missing from dependsOn fails', () => {
  const errors = errorsFor({ raidsDependsOn: [] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /@vintage\/raids: depends on module "identity" but module\.json/);
});

test('boundaries: dependsOn naming a module package.json lacks fails', () => {
  const errors = errorsFor({ raidsDeps: [] });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /dependsOn lists "identity" but package\.json does not/);
});

test('boundaries: a module without module.json fails', () => {
  assert.deepEqual(errorsFor({ manifest: false }), ['@vintage/raids: missing module.json']);
});
