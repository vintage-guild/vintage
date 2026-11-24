import { error } from '@vintage/guild-kit';
import {
  type AnyLootMethod,
  DEFAULT_METHOD_ID,
  defaultLootMethods,
  type LootItem,
  type MethodContext,
} from '@vintage/loot-core';
import { classSchema, type Role, roleSchema, type WowClass } from '@vintage/wow-data';
import { z } from 'zod';
import type { LootMethodConfigRecord } from '../contract';
import type { LootDeps, LootRaidContext } from '../store';

export const lootItemFields = {
  itemId: z.number().int().positive(),
  itemName: z.string().trim().min(1).max(160).nullable().optional(),
  roles: z.array(roleSchema).optional(),
  classes: z.array(classSchema).optional(),
  slot: z.string().trim().min(1).max(60).nullable().optional(),
};

export function toLootItem(input: {
  itemId: number;
  itemName?: string | null;
  roles?: Role[];
  classes?: WowClass[];
  slot?: string | null;
}): LootItem {
  return {
    itemId: input.itemId,
    itemName: input.itemName ?? null,
    ...(input.roles ? { roles: input.roles } : {}),
    ...(input.classes ? { classes: input.classes } : {}),
    ...(input.slot !== undefined ? { slot: input.slot } : {}),
  };
}

export function registryOf(deps: LootDeps) {
  return deps.lootMethods ?? defaultLootMethods;
}

export function resolveMethod(
  deps: LootDeps,
  methodId: string | null | undefined,
): AnyLootMethod | null {
  const id = methodId ?? DEFAULT_METHOD_ID;
  return registryOf(deps).get(id) ?? null;
}

export function methodNotFound(methodId: string) {
  return error('METHOD_NOT_FOUND', `Unknown loot method "${methodId}"`, {
    suggestion: 'Run loot-methods-list to see available loot methods',
    retryable: false,
  });
}

export function raidNotFound(eventId: string) {
  return error('EVENT_NOT_FOUND', `No raid found with id "${eventId}"`, {
    suggestion: 'Check the raid id with raid-list',
    retryable: false,
  });
}

export interface LoadedMethodConfig {
  record: LootMethodConfigRecord | null;
  configVersion: number;
  config: unknown;
  state: unknown;
}

export async function loadMethodConfig(
  deps: LootDeps,
  guildId: string,
  method: AnyLootMethod,
): Promise<LoadedMethodConfig> {
  const record = await deps.loot.getMethodConfig(guildId, method.id);
  if (!record) {
    return {
      record: null,
      configVersion: 0,
      config: method.defaultConfig,
      state: method.initialState(method.defaultConfig),
    };
  }
  const parsed = method.configSchema.safeParse(record.config);
  const config = parsed.success ? parsed.data : method.defaultConfig;
  const state = record.state === undefined ? method.initialState(config) : record.state;
  return {
    record,
    configVersion: record.configVersion,
    config,
    state,
  };
}

export async function buildMethodContext(
  deps: LootDeps,
  guildId: string,
  method: AnyLootMethod,
  raid: LootRaidContext,
  now: number,
): Promise<{ loaded: LoadedMethodConfig; ctx: MethodContext<unknown, unknown> }> {
  const [loaded, recentAwards] = await Promise.all([
    loadMethodConfig(deps, guildId, method),
    deps.loot.listAwards(guildId, { eventId: raid.eventId, limit: 500 }),
  ]);
  const ctx: MethodContext<unknown, unknown> = {
    config: loaded.config,
    state: loaded.state,
    raid: {
      eventId: raid.eventId,
      attendees: raid.attendees,
      recentAwards,
      now,
    },
  };
  return { loaded, ctx };
}
