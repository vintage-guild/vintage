// Shared helpers for repo gate scripts: discover workspace packages and their layer.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');

export const LAYERS = ['libs', 'packages', 'modules', 'apps'];

/** Layer rank: a package may only depend on packages of a lower or equal rank (see PLAN §4.3). */
export const LAYER_RANK = { libs: 0, packages: 1, modules: 2, apps: 3 };

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** All workspace packages: { name, dir, layer, folder, pkg }. */
export function workspacePackages(root = ROOT) {
  const out = [];
  for (const layer of LAYERS) {
    const layerDir = join(root, layer);
    if (!existsSync(layerDir)) continue;
    for (const folder of readdirSync(layerDir)) {
      const dir = join(layerDir, folder);
      const pkgPath = join(dir, 'package.json');
      if (!statSync(dir).isDirectory() || !existsSync(pkgPath)) continue;
      out.push({ name: readJson(pkgPath).name, dir, layer, folder, pkg: readJson(pkgPath) });
    }
  }
  return out;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '_generated', 'coverage', '.turbo']);

/** Source files (ts/mts/js/mjs) under a directory, skipping generated and build output. */
export function sourceFiles(dir) {
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(d, entry.name));
      } else if (/\.(m?ts|m?js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(join(d, entry.name));
      }
    }
  };
  walk(dir);
  return files;
}

const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Module specifiers imported by a source file. */
export function importsOf(file) {
  const text = readFileSync(file, 'utf8');
  const specs = [];
  for (const match of text.matchAll(IMPORT_RE)) specs.push(match[1] ?? match[2]);
  return specs;
}

export function rel(path, root = ROOT) {
  return relative(root, path).split(sep).join('/');
}
