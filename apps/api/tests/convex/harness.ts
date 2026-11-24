// Shared convex-test harness for apps/api/convex and all 11 module components (#260).
// Resolves each module's `convex/` directory through its public `@vintage/<mod>/package.json`
// export so layer/package boundaries (`pnpm check:boundaries`) stay intact.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GenericSchema, SchemaDefinition } from 'convex/server';
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';

const require = createRequire(import.meta.url);

const MODULE_COMPONENTS = [
  'identity',
  'raids',
  'coordinator',
  'polls',
  'progress',
  'site',
  'agent',
  'applications',
  'insights',
  'loot',
  'armory',
  'wishlist',
] as const;

export type ComponentName = (typeof MODULE_COMPONENTS)[number];

type ModuleGlob = Record<string, () => Promise<Record<string, unknown>>>;

/** Collect all Convex function modules under `dir` as a `convex-test` glob map. */
function collectConvexModules(dir: string, prefix = '.'): ModuleGlob {
  const out: ModuleGlob = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      Object.assign(out, collectConvexModules(full, key));
    } else if (
      /\.[cm]?[jt]s$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      entry.name !== 'convex.config.ts'
    ) {
      const url = pathToFileURL(full).href;
      out[key] = () => import(url) as Promise<Record<string, unknown>>;
    }
  }
  return out;
}

interface LoadedComponent {
  name: ComponentName;
  schema: SchemaDefinition<GenericSchema, boolean>;
  modules: ModuleGlob;
}

let cachedComponents: Promise<LoadedComponent[]> | null = null;

async function loadComponents(): Promise<LoadedComponent[]> {
  if (!cachedComponents) {
    cachedComponents = Promise.all(
      MODULE_COMPONENTS.map(async (name) => {
        const pkgPath = require.resolve(`@vintage/${name}/package.json`);
        const convexDir = join(dirname(pkgPath), 'convex');
        const schemaUrl = pathToFileURL(join(convexDir, 'schema.ts')).href;
        const mod = (await import(schemaUrl)) as {
          default: SchemaDefinition<GenericSchema, boolean>;
        };
        return {
          name,
          schema: mod.default,
          modules: collectConvexModules(convexDir),
        };
      }),
    );
  }
  return cachedComponents;
}

const apiConvexDir = join(dirname(require.resolve('../../package.json')), 'convex');
const apiModules = collectConvexModules(apiConvexDir);

/** Create a fresh convex-test backend with apps/api schema and all 11 module components registered. */
export async function createConvexBackend() {
  const t = convexTest(schema, apiModules);
  for (const comp of await loadComponents()) {
    t.registerComponent(comp.name, comp.schema, comp.modules);
  }
  return t;
}

export const GUILD_A = 'guild-a';
export const GUILD_B = 'guild-b';
