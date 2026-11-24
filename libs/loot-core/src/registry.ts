// Pure registry of swappable loot methods (PLAN §5.2).
import { councilMethod } from './methods/council';
import { msosMethod } from './methods/msos';
import type { LootMethod, LootMethodInfo } from './types';

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous method registry typed per lookup
export type AnyLootMethod = LootMethod<any, any>;

export interface LootMethodRegistry {
  get(id: string): AnyLootMethod | undefined;
  has(id: string): boolean;
  list(): LootMethodInfo[];
}

export function createMethodRegistry(methods: readonly AnyLootMethod[]): LootMethodRegistry {
  const byId = new Map<string, AnyLootMethod>();
  for (const m of methods) {
    if (byId.has(m.id)) throw new Error(`duplicate loot method id: ${m.id}`);
    byId.set(m.id, m);
  }
  return {
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
    list: () =>
      [...byId.values()].map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        version: m.version,
        defaultConfig: m.defaultConfig,
      })),
  };
}

/** The built-in loot methods shipped with Vintage (MS/OS default per Q5 / #30; Loot Council #27). */
export const DEFAULT_LOOT_METHODS: readonly AnyLootMethod[] = [msosMethod, councilMethod];

export const DEFAULT_METHOD_ID = msosMethod.id;

export const defaultLootMethods = createMethodRegistry(DEFAULT_LOOT_METHODS);
