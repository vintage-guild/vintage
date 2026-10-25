#!/usr/bin/env node
// Enforces the layer and module boundary rules in PLAN §4.1–4.3:
//   1. dependencies point down: apps → modules → packages → libs, no cycles
//   2. modules import other modules only through their `contract` export
//   3. libs stay platform-free
//   4. module package.json `exports` expose only the public subpaths
//   5. no relative import escapes its package
import { dirname, resolve } from 'node:path';
import {
  importsOf,
  LAYER_RANK,
  ROOT,
  rel,
  sourceFiles,
  workspacePackages,
} from './lib/workspace.mjs';

const LIB_FORBIDDEN = [
  /^convex(\/|$)/,
  /^discord/,
  /^openai/,
  /^@openai\//,
  /^@vercel\//,
  /^@lushly-dev\/afd-(server|client|cli)/,
  /^@microsoft\/fast/,
  /^@lushly-dev\/fast/,
  /^node:/,
];
const MODULE_EXPORTS = new Set([
  './contract',
  './commands',
  './convex.config',
  './_generated/component.js', // required by Convex component codegen
  './convex',
  './ui',
  './testing',
  './package.json',
]);
const WORKSPACE_SCOPE = '@vintage/';
/** Build-time presets with no runtime code; any layer may use them as devDependencies. */
const TOOLING_PACKAGES = new Set(['@vintage/config']);

const allDeps = (p) => ({
  ...p.pkg.dependencies,
  ...p.pkg.devDependencies,
  ...p.pkg.peerDependencies,
});

/** Rule 0: workspace package names share the scope. */
function checkName(p, root) {
  return p.name?.startsWith(WORKSPACE_SCOPE)
    ? []
    : [`${rel(p.dir, root)}: package name must start with ${WORKSPACE_SCOPE}`];
}

/** Rule 1: package.json dependencies point down the layer stack. */
function checkDependencyDirection(p, byName) {
  const errors = [];
  for (const depName of Object.keys(allDeps(p))) {
    const dep = byName.get(depName);
    if (!dep) continue;
    if (TOOLING_PACKAGES.has(depName) && depName in (p.pkg.devDependencies ?? {})) continue;
    if (LAYER_RANK[dep.layer] > LAYER_RANK[p.layer]) {
      errors.push(`${p.name} (${p.layer}) depends upward on ${depName} (${dep.layer})`);
    }
  }
  return errors;
}

/** Rule 4: modules expose only the public subpaths. */
function checkModuleExports(p) {
  if (p.layer !== 'modules') return [];
  return Object.keys(p.pkg.exports ?? {})
    .filter((key) => !MODULE_EXPORTS.has(key))
    .map((key) => `${p.name}: export "${key}" is not a public module subpath`);
}

/** Rules 2, 3, 5: what a single import specifier is allowed to reach. */
function checkImport(p, file, spec, byName, root) {
  const where = `${rel(file, root)} imports "${spec}"`;
  if (spec.startsWith('.')) {
    return resolve(dirname(file), spec).startsWith(p.dir)
      ? []
      : [`${where}: relative import escapes ${p.name}`];
  }
  if (p.layer === 'libs' && LIB_FORBIDDEN.some((re) => re.test(spec))) {
    return [`${where}: libs must stay platform-free`];
  }
  if (!spec.startsWith(WORKSPACE_SCOPE)) return [];

  const [scope, short, ...subpath] = spec.split('/');
  const target = byName.get(`${scope}/${short}`);
  if (!target) return [`${where}: unknown workspace package`];
  if (target.name === p.name) return [];
  const errors = [];
  if (!(target.name in allDeps(p))) {
    errors.push(`${where}: missing dependency on ${target.name} in package.json`);
  }
  if (p.layer === 'modules' && target.layer === 'modules' && subpath.join('/') !== 'contract') {
    errors.push(`${where}: modules may import other modules only via "/contract"`);
  }
  return errors;
}

function checkImports(p, byName, root) {
  return sourceFiles(p.dir).flatMap((file) =>
    importsOf(file).flatMap((spec) => checkImport(p, file, spec, byName, root)),
  );
}

export function checkBoundaries(root = ROOT) {
  const packages = workspacePackages(root);
  const byName = new Map(packages.map((p) => [p.name, p]));
  return [
    ...packages.flatMap((p) => [
      ...checkName(p, root),
      ...checkDependencyDirection(p, byName),
      ...checkModuleExports(p),
      ...checkImports(p, byName, root),
    ]),
    ...findCycles(packages, byName),
  ];
}

function findCycles(packages, byName) {
  const errors = [];
  const state = new Map();
  const stack = [];
  const visit = (p) => {
    state.set(p.name, 'visiting');
    stack.push(p.name);
    const deps = { ...p.pkg.dependencies, ...p.pkg.devDependencies };
    for (const depName of Object.keys(deps)) {
      const dep = byName.get(depName);
      if (!dep) continue;
      if (state.get(depName) === 'visiting') {
        errors.push(
          `dependency cycle: ${[...stack.slice(stack.indexOf(depName)), depName].join(' → ')}`,
        );
      } else if (!state.has(depName)) {
        visit(dep);
      }
    }
    stack.pop();
    state.set(p.name, 'done');
  };
  for (const p of packages) if (!state.has(p.name)) visit(p);
  return errors;
}

if (process.argv[1]?.endsWith('check-boundaries.mjs')) {
  const errors = checkBoundaries();
  if (errors.length) {
    console.error(
      `Boundary check failed (${errors.length}):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
    process.exit(1);
  }
  console.log(`Boundary check passed (${workspacePackages().length} packages).`);
}
