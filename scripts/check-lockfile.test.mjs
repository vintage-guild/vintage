import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPrivateTarballs } from './check-lockfile.mjs';

const entry = (resolution) => `  'zod@4.1.0':\n    resolution: {${resolution}}\n`;

test('passes entries resolved from the configured registry', () => {
  assert.deepEqual(findPrivateTarballs(entry('integrity: sha512-abc')), []);
});

test('passes public tarballs', () => {
  const lock = entry('tarball: https://codeload.github.com/o/r/tar.gz/abc');
  assert.deepEqual(findPrivateTarballs(lock), []);
});

test('flags tarballs pinned to a private mirror', () => {
  const lock = entry(
    'integrity: sha1-abc=, tarball: https://ms-feed-25.pkgs.visualstudio.com/x/zod/-/zod-4.1.0.tgz',
  );
  assert.deepEqual(findPrivateTarballs(lock), [
    'pnpm-lock.yaml:2 pins a tarball on ms-feed-25.pkgs.visualstudio.com',
  ]);
});
