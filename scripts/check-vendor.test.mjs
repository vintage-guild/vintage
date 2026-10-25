import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkVendor } from './check-vendor.mjs';

const SHA = '4a9afe0b7557a4e0dfefc729c72e4c6455eb7e2f';

function fixture({ pin = SHA, doc = `Pinned to ${SHA}.`, pkg = {}, license = true, files = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'vendor-check-'));
  const dir = join(root, 'vendor', 'fast-element');
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(root, 'vendor', '.fast-af-commit'), `${pin}\n`);
  writeFileSync(join(root, 'vendor', 'VENDORED.md'), doc);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ private: true, description: `from fast-af@${SHA.slice(0, 7)}`, ...pkg }),
  );
  if (license) writeFileSync(join(dir, 'LICENSE'), 'MIT');
  mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
  for (const f of ['dist/index.js', 'node_modules/dep/index.js.map', ...files]) {
    writeFileSync(join(dir, f), '');
  }
  return root;
}

function errorsFor(opts) {
  const root = fixture(opts);
  try {
    return checkVendor(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('vendor: a clean vendored package passes', () => {
  assert.deepEqual(errorsFor({}), []);
});

test('vendor: a short or missing pin fails', () => {
  assert.equal(errorsFor({ pin: '4a9afe0' }).length, 1);
});

test('vendor: VENDORED.md must name the pinned commit', () => {
  assert.equal(errorsFor({ doc: 'Pinned to something else.' }).length, 1);
});

test('vendor: a missing LICENSE fails', () => {
  assert.equal(errorsFor({ license: false }).length, 1);
});

test('vendor: a publishable package fails', () => {
  assert.equal(errorsFor({ pkg: { private: false } }).length, 1);
});

test('vendor: tests, stories, and source maps fail', () => {
  const files = ['dist/a.spec.js', 'dist/b.stories.js', 'dist/index.js.map'];
  assert.equal(errorsFor({ files }).length, 3);
});
