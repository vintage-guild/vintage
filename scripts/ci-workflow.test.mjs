import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT } from './lib/workspace.mjs';

const ciYml = () => readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

function jobBlock(yml, name) {
  const lines = yml.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing job ${name} in .github/workflows/ci.yml`);
  const end = lines.findIndex((line, i) => i > start && /^ {2}[a-z0-9-]+:$/i.test(line));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

test('pull_request trigger excludes labeled/unlabeled so routine labels do not start a second run (#254)', () => {
  const header = ciYml().split('\njobs:')[0] ?? '';
  const typesLine = header.split(/\r?\n/).find((line) => /^\s+types:\s*\[/.test(line));
  assert.ok(typesLine, 'missing pull_request types list in ci.yml');
  assert.doesNotMatch(typesLine, /\blabeled\b/, 'pull_request types must not include labeled');
  assert.doesNotMatch(typesLine, /\bunlabeled\b/, 'pull_request types must not include unlabeled');
});

test('ci-ok skips cancelled runs so concurrency cancellation never reports a failed check (#254)', () => {
  const block = jobBlock(ciYml(), 'ci-ok');
  assert.match(block, /!cancelled\(\)/, 'ci-ok must guard with !cancelled()');
  assert.match(
    block,
    /!contains\(needs\.\*\.result,\s*'cancelled'\)/,
    "ci-ok must guard against cancelled upstream needs with !contains(needs.*.result, 'cancelled')",
  );
});

test('deploy-convex only runs on push to refs/heads/main after ci-ok succeeds', () => {
  const block = jobBlock(ciYml(), 'deploy-convex');
  assert.match(block, /needs:\s*ci-ok/);
  assert.match(block, /github\.event_name == 'push'/);
  assert.match(block, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(block, /always\(\)/, 'deploy-convex should rely on implicit success()');
});
