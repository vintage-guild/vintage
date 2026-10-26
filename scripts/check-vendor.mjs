#!/usr/bin/env node
// Keeps vendor/ honest (see vendor/VENDORED.md):
//   - vendor/.fast-af-commit pins a full commit, and VENDORED.md names that same commit
//   - every vendored package is private, says which commit it came from, and ships a LICENSE
//   - no tests, stories, or source maps were copied in
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/workspace.mjs';

const FORBIDDEN = /\.(spec|test|browser-test|stories|pw)\.(d\.ts|js)$|\.map$|^__test__$/;

/** Files and folders under a vendored package, skipping its installed node_modules. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? [path, ...walk(path)] : [path];
  });
}

/** The pin file holds a full sha, and VENDORED.md names it. */
function checkPin(vendor, commit) {
  const errors = [];
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    errors.push('vendor/.fast-af-commit must hold the full FAST-AF commit sha');
  }
  const docPath = join(vendor, 'VENDORED.md');
  if (!existsSync(docPath)) errors.push('vendor/VENDORED.md is missing');
  else if (commit && !readFileSync(docPath, 'utf8').includes(commit)) {
    errors.push(`vendor/VENDORED.md does not name the pinned commit ${commit}`);
  }
  return errors;
}

function checkPackage(dir, where, commit) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return [`${where}: package.json is missing`];
  const errors = [];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.private !== true) errors.push(`${where}: package.json must set "private": true`);
  if (commit && !pkg.description?.includes(commit.slice(0, 7))) {
    errors.push(`${where}: package.json description must name the pinned commit`);
  }
  if (!existsSync(join(dir, 'LICENSE'))) errors.push(`${where}: LICENSE is missing`);
  for (const path of walk(dir)) {
    if (FORBIDDEN.test(path.split(/[\\/]/).pop())) {
      errors.push(`${where}: ${path.slice(dir.length + 1)} is a test, story, or source map`);
    }
  }
  return errors;
}

export function checkVendor(root = ROOT) {
  const vendor = join(root, 'vendor');
  if (!existsSync(vendor)) return [];
  const pinPath = join(vendor, '.fast-af-commit');
  const commit = existsSync(pinPath) ? readFileSync(pinPath, 'utf8').trim() : '';
  return [
    ...checkPin(vendor, commit),
    ...readdirSync(vendor)
      .filter((name) => statSync(join(vendor, name)).isDirectory())
      .flatMap((name) => checkPackage(join(vendor, name), `vendor/${name}`, commit)),
  ];
}

if (process.argv[1]?.endsWith('check-vendor.mjs')) {
  const errors = checkVendor();
  if (errors.length) {
    console.error(`Vendor check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Vendor check passed.');
}
