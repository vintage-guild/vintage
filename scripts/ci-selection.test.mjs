import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBreaks } from './check-contract-break.mjs';
import { selectCi } from './ci-selection.mjs';

test('docs-only PR owes no lanes', () => {
  const s = selectCi({ eventName: 'pull_request', paths: ['PLAN.md', 'docs/architecture.md'] });
  assert.equal(s.docsOnly, true);
  assert.equal(s.ts || s.contract || s.addon || s.botcore || s.workflowContracts, false);
});

test('vendor change owes ts', () => {
  const s = selectCi({
    eventName: 'pull_request',
    paths: ['vendor/fast-element/dist/esm/index.js'],
  });
  assert.equal(s.ts, true);
  assert.equal(s.contract, false);
});

test('module command change owes ts and contract', () => {
  const s = selectCi({
    eventName: 'pull_request',
    paths: ['modules/identity/src/commands/member.ts'],
  });
  assert.equal(s.ts, true);
  assert.equal(s.contract, true);
  assert.equal(s.addon, false);
});

test('module domain change owes ts but not contract', () => {
  const s = selectCi({ eventName: 'pull_request', paths: ['modules/identity/src/domain/tier.ts'] });
  assert.equal(s.ts, true);
  assert.equal(s.contract, false);
});

test('bridge-format change owes ts and addon', () => {
  const s = selectCi({ eventName: 'pull_request', paths: ['libs/bridge-format/src/index.ts'] });
  assert.equal(s.ts, true);
  assert.equal(s.addon, true);
});

test('workflow change owes workflow contracts', () => {
  const s = selectCi({ eventName: 'pull_request', paths: ['.github/workflows/ci.yml'] });
  assert.equal(s.workflowContracts, true);
  assert.equal(s.ts, false);
});

test('full-validation label owes every lane', () => {
  const s = selectCi({
    eventName: 'pull_request',
    paths: ['PLAN.md'],
    labels: ['ci:full-validation'],
  });
  assert.equal(s.fullValidation, true);
  assert.equal(s.docsOnly, false);
  assert.equal(s.ts && s.contract && s.addon && s.botcore && s.workflowContracts, true);
});

test('push to main runs full validation', () => {
  assert.equal(selectCi({ eventName: 'push', paths: [] }).fullValidation, true);
});

const cmd = (over = {}) => ({
  name: 'character-add',
  tier: 'member',
  destructive: false,
  input: { required: ['name'] },
  ...over,
});

test('contract: compatible changes pass', () => {
  const before = { commands: [cmd()] };
  const after = { commands: [cmd({ tier: 'public' }), cmd({ name: 'character-new' })] };
  assert.deepEqual(findBreaks(before, after), []);
});

test('contract: removal, raised tier, new required field, new confirmation all break', () => {
  assert.match(findBreaks({ commands: [cmd()] }, { commands: [] })[0], /removed/);
  assert.match(
    findBreaks({ commands: [cmd()] }, { commands: [cmd({ tier: 'officer' })] })[0],
    /tier raised/,
  );
  assert.match(
    findBreaks(
      { commands: [cmd()] },
      { commands: [cmd({ input: { required: ['name', 'spec'] } })] },
    )[0],
    /"spec" is now required/,
  );
  assert.match(
    findBreaks({ commands: [cmd()] }, { commands: [cmd({ destructive: true })] })[0],
    /confirmation/,
  );
});
