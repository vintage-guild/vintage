import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findConflictMarkers } from './check-conflict-markers.mjs';

// Built from parts so this file never holds a marker line itself.
const OURS = `${'<'.repeat(7)} HEAD`;
const BASE = `${'|'.repeat(7)} merged common ancestors`;
const SPLIT = '='.repeat(7);
const THEIRS = `${'>'.repeat(7)} origin/main`;

function errorsFor(files) {
  const root = mkdtempSync(join(tmpdir(), 'conflict-check-'));
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content);
    return findConflictMarkers(Object.keys(files), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('conflict markers: clean files pass', () => {
  const md = '# Title\n\nSetext\n========\n\n| a | b |\n|---|---|\n';
  assert.deepEqual(errorsFor({ 'a.md': md, 'b.json': '{"a": 1}\n' }), []);
});

test('conflict markers: a committed conflict fails on every marker line', () => {
  const md = ['# Decisions', OURS, 'ours', SPLIT, 'theirs', THEIRS, ''].join('\n');
  assert.deepEqual(errorsFor({ 'AGENTS.md': md }), [
    `AGENTS.md:2: ${OURS}`,
    `AGENTS.md:4: ${SPLIT}`,
    `AGENTS.md:6: ${THEIRS}`,
  ]);
});

test('conflict markers: diff3 base marker and CRLF line endings are caught', () => {
  const yml = ['a: 1', OURS, BASE, SPLIT, THEIRS].join('\r\n');
  assert.equal(errorsFor({ 'ci.yml': yml }).length, 4);
});

test('conflict markers: a lone marker line fails', () => {
  assert.equal(errorsFor({ 'x.json': `{\n${SPLIT}\n}\n` }).length, 1);
});

test('conflict markers: markers inside a line or longer runs pass', () => {
  const text = [` ${OURS}`, `"${SPLIT}"`, '='.repeat(8), `${'<'.repeat(7)}x`, ''].join('\n');
  assert.deepEqual(errorsFor({ 'a.ts': text }), []);
});

test('conflict markers: binary files are skipped', () => {
  assert.deepEqual(errorsFor({ 'a.png': `\0PNG\n${SPLIT}\n` }), []);
});
