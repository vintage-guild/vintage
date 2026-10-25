import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAgentCoauthors, findUnsigned } from './check-dco.mjs';

const commit = (over = {}) => ({
  sha: 'abc1234',
  author: 'Aeryn',
  email: 'aeryn@example.com',
  body: 'feat(identity): thing\n\nSigned-off-by: Aeryn <aeryn@example.com>\n',
  ...over,
});

const bot = (over = {}) =>
  commit({
    author: 'dependabot[bot]',
    email: '49699333+dependabot[bot]@users.noreply.github.com',
    body: 'ci: bump\n',
    ...over,
  });

test('dco: signed commit passes', () => {
  assert.deepEqual(findUnsigned([commit()]), []);
});

test('dco: missing sign-off fails', () => {
  assert.equal(findUnsigned([commit({ body: 'feat: thing\n' })]).length, 1);
});

test('dco: sign-off for a different email fails', () => {
  const c = commit({ body: 'feat: x\n\nSigned-off-by: Someone <other@example.com>\n' });
  assert.equal(findUnsigned([c]).length, 1);
});

test('dco: email match is case-insensitive', () => {
  assert.deepEqual(findUnsigned([commit({ email: 'Aeryn@Example.com' })]), []);
});

test('dco: fully automated (bot-authored) commits are exempt', () => {
  assert.deepEqual(findUnsigned([bot()]), []);
});

test('attribution: a human commit crediting an AI co-author is rejected', () => {
  const c = commit({
    body: 'feat: x\n\nSigned-off-by: Aeryn <aeryn@example.com>\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n',
  });
  assert.equal(findAgentCoauthors([c]).length, 1);
});

test('attribution: Assisted-by and human co-authors are fine', () => {
  const c = commit({
    body: 'feat: x\n\nSigned-off-by: Aeryn <aeryn@example.com>\nCo-authored-by: Kol <kol@example.com>\nAssisted-by: Claude Opus 5.5\n',
  });
  assert.deepEqual(findAgentCoauthors([c]), []);
});

test('attribution: fully automated commits may credit an agent', () => {
  const c = bot({
    body: 'ci: bump\n\nCo-authored-by: Copilot <copilot@users.noreply.github.com>\n',
  });
  assert.deepEqual(findAgentCoauthors([c]), []);
});
