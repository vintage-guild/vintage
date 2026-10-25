import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkTitle } from './check-pr-title.mjs';

test('pr title: valid headers pass', () => {
  assert.deepEqual(checkTitle('feat(identity): add character-update'), []);
  assert.deepEqual(checkTitle('docs: add architecture overview'), []);
  assert.deepEqual(checkTitle('fix(api)!: drop legacy read path'), []);
});

test('pr title: free-form titles fail', () => {
  assert.equal(checkTitle('Update stuff').length, 1);
});

test('pr title: unknown type or scope fails', () => {
  assert.match(checkTitle('feature(identity): add x')[0], /type "feature"/);
  assert.match(checkTitle('feat(nope): add x')[0], /scope "nope"/);
});

test('pr title: subject rules', () => {
  assert.match(checkTitle('feat(identity): Add character-update')[0], /lowercase/);
  assert.match(checkTitle('feat(identity): add character-update.')[0], /period/);
  assert.match(checkTitle(`feat(identity): ${'x'.repeat(80)}`)[0], /longer than/);
});
