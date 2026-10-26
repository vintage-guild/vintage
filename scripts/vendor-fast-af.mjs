#!/usr/bin/env node
// Refresh vendor/ from a built FAST-AF checkout in .vendor-src/fast-af. The clone and build
// steps are in vendor/VENDORED.md ("Re-sync"). This copies each package's dist/, drops tests,
// stories, and source maps, and writes a trimmed package.json and LICENSE.
//
// Vendored code is never edited in place: fix it in FAST-AF, then re-run this script.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, '.vendor-src', 'fast-af');
const VENDOR = join(ROOT, 'vendor');

const PACKAGES = [
  {
    dir: 'fast-element',
    from: 'packages/element/packages/fast-element',
    license: 'packages/element/LICENSE',
    dependencies: { '@webcomponents/scoped-custom-element-registry': '^0.0.10' },
  },
  {
    dir: 'fast-router',
    from: 'packages/element/packages/fast-router',
    license: 'packages/element/LICENSE',
    // Compiled with importHelpers; upstream doesn't declare tslib (reported upstream).
    dependencies: { '@lushly-dev/fast-element': 'workspace:*', tslib: '^2.6.3' },
  },
  {
    dir: 'violet-elements',
    from: 'packages/violet-elements',
    // Declared MIT by "Lushly Dev" in package.json, but FAST-AF ships no LICENSE file for it yet.
    license: null,
    dependencies: {
      '@lushly-dev/fast-element': 'workspace:*',
      '@tanstack/virtual-core': '3.13.23',
    },
  },
];

const MIT = `MIT License

Copyright (c) Lushly Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

/** Built files that are tests, stories, or source maps never ship. */
const EXCLUDE =
  /(\.(spec|test|browser-test|stories|pw)\.(d\.ts|js)$)|(\.map$)|([\\/]__test__[\\/])|(\.(cjs|d\.cts)$)/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function stripSourceMapComment(file) {
  if (!file.endsWith('.js') && !file.endsWith('.d.ts')) return;
  const text = readFileSync(file, 'utf8');
  const cleaned = text.replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
  if (cleaned !== text) writeFileSync(file, cleaned);
}

if (!existsSync(SRC)) {
  console.error(
    `No FAST-AF checkout at ${relative(ROOT, SRC)}. See "Re-sync" in vendor/VENDORED.md.`,
  );
  process.exit(1);
}
const commit = execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

for (const pkg of PACKAGES) {
  const from = join(SRC, pkg.from);
  const to = join(VENDOR, pkg.dir);
  if (!existsSync(join(from, 'dist'))) {
    console.error(`${pkg.from}/dist is missing: build it first (step 2).`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });

  let copied = 0;
  for (const file of walk(join(from, 'dist'))) {
    const rel = relative(from, file);
    if (EXCLUDE.test(rel)) continue;
    const dest = join(to, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(file, dest);
    stripSourceMapComment(dest);
    copied++;
  }

  const upstream = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'));
  const manifest = {
    name: upstream.name,
    version: upstream.version,
    private: true,
    description: `Vendored from lushly-dev/fast-af@${commit.slice(0, 7)} (${pkg.from}). Do not edit; see vendor/VENDORED.md.`,
    license: 'MIT',
    type: upstream.type,
    main: upstream.main,
    ...(upstream.module ? { module: upstream.module } : {}),
    types: upstream.types,
    ...(upstream.exports ? { exports: upstream.exports } : {}),
    ...(upstream.sideEffects !== undefined ? { sideEffects: upstream.sideEffects } : {}),
    dependencies: pkg.dependencies,
  };
  writeFileSync(join(to, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (pkg.license) cpSync(join(SRC, pkg.license), join(to, 'LICENSE'));
  else writeFileSync(join(to, 'LICENSE'), MIT);
  console.log(`vendor/${pkg.dir}: ${copied} files from ${pkg.from}`);
}

writeFileSync(join(VENDOR, '.fast-af-commit'), `${commit}\n`);
console.log(`Pinned to lushly-dev/fast-af@${commit}`);
