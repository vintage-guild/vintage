import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkJtbdIds } from './check-agent-docs.mjs';

function withJtbdDocs(files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'vintage-jtbd-'));
  try {
    const dir = join(root, 'docs', 'jtbd');
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes when every JTBD heading id is unique', () => {
  const errors = withJtbdDocs(
    {
      'a.md': '### J01 · First\n### J02 · Second\n',
      'b.md': '### J03 · Third\n',
      'README.md': '### J01 · Ignored index heading\n',
    },
    (root) => checkJtbdIds(root),
  );
  assert.deepEqual(errors, []);
});

test('flags duplicate JTBD ids across files and within a single file', () => {
  const errors = withJtbdDocs(
    {
      'a.md': '### J28 · Make a raid\n### J31 · First\n### J31 · Second\n',
      'b.md': '### J28 · Apply from Discord\n',
    },
    (root) => checkJtbdIds(root),
  );
  assert.deepEqual(errors, [
    'duplicate JTBD id J28 in docs/jtbd/a.md, docs/jtbd/b.md',
    'duplicate JTBD id J31 in docs/jtbd/a.md, docs/jtbd/a.md',
  ]);
});
