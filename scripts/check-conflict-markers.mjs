#!/usr/bin/env node
// Fails when a tracked file still holds merge-conflict markers. Biome, the agent-docs check,
// and the tests never read most .md/.json/.yml files, so a botched merge can pass every other
// gate (it did in #158). Any one marker line fails: no tracked file has a legitimate one today.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/workspace.mjs';

const MARKER = /^(<{7}|\|{7}|>{7})(?: .*)?$|^={7}$/;

// vendor/ is upstream build output we never edit (vendor/VENDORED.md).
const EXCLUDE = /^vendor\//;

export function trackedFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path && !EXCLUDE.test(path));
}

/** `path:line: marker` for every conflict-marker line in the given repo-relative files. */
export function findConflictMarkers(files, root = ROOT) {
  const errors = [];
  for (const path of files) {
    let buf;
    try {
      buf = readFileSync(join(root, path));
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (MARKER.test(line)) errors.push(`${path}:${i + 1}: ${line}`);
      });
  }
  return errors;
}

if (process.argv[1]?.endsWith('check-conflict-markers.mjs')) {
  const errors = findConflictMarkers(trackedFiles());
  if (errors.length) {
    console.error(
      `Conflict-marker check failed (resolve the merge):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log('Conflict-marker check passed.');
}
