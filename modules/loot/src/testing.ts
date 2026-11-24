import type { LootMethodRegistry } from '@vintage/loot-core';
import type { LootAward, LootDrop, LootMethodConfigRecord } from './contract';
import type { LootDeps, LootRaidContext, LootRaidReader, LootStore } from './store';

/** In-memory LootStore for tests. Same behavior contract as the Convex component. */
export function createMemoryLootStore(): LootStore & {
  drops: Map<string, LootDrop>;
  methodConfigs: Map<string, LootMethodConfigRecord>;
  awards: Map<string, LootAward>;
} {
  const drops = new Map<string, LootDrop>();
  const methodConfigs = new Map<string, LootMethodConfigRecord>();
  const awards = new Map<string, LootAward>();
  let seq = 0;

  const forRaid = (guildId: string, eventId: string) =>
    [...drops.values()]
      .filter((d) => d.guildId === guildId && d.eventId === eventId)
      .sort((a, b) => a.at - b.at);

  const configKey = (guildId: string, methodId: string) => `${guildId}::${methodId}`;

  return {
    drops,
    methodConfigs,
    awards,
    async listDrops(guildId, eventId) {
      return forRaid(guildId, eventId);
    },
    async replaceDrops(guildId, eventId, inputs) {
      for (const d of forRaid(guildId, eventId)) drops.delete(d.id);
      for (const input of inputs) {
        const drop = { ...input, id: `drop_${++seq}`, guildId, eventId };
        drops.set(drop.id, drop);
      }
      return forRaid(guildId, eventId);
    },
    async getMethodConfig(guildId, methodId) {
      return methodConfigs.get(configKey(guildId, methodId)) ?? null;
    },
    async listMethodConfigs(guildId) {
      return [...methodConfigs.values()].filter((c) => c.guildId === guildId);
    },
    async upsertMethodConfig(input) {
      const key = configKey(input.guildId, input.methodId);
      const existing = methodConfigs.get(key);
      const record: LootMethodConfigRecord = {
        ...input,
        id: existing?.id ?? `cfg_${++seq}`,
      };
      methodConfigs.set(key, record);
      return record;
    },
    async listAwards(guildId, filter = {}) {
      const cap = filter.limit ?? 50;
      const rows = [...awards.values()]
        .filter((a) => {
          if (a.guildId !== guildId) return false;
          if (filter.eventId && a.eventId !== filter.eventId) return false;
          if (filter.characterId && a.characterId !== filter.characterId) return false;
          return true;
        })
        .sort((a, b) => b.awardedAt - a.awardedAt || b.id.localeCompare(a.id));
      return rows.slice(0, cap);
    },
    async insertAward(input) {
      const award: LootAward = { ...input, id: `award_${++seq}` };
      awards.set(award.id, award);
      return award;
    },
  };
}

export interface MemoryLootRaidReader extends LootRaidReader {
  raids: Map<string, LootRaidContext>;
  putRaid(guildId: string, raid: LootRaidContext): void;
}

export function createMemoryLootRaidReader(): MemoryLootRaidReader {
  const raids = new Map<string, LootRaidContext>();
  const key = (guildId: string, eventId: string) => `${guildId}::${eventId}`;
  return {
    raids,
    putRaid(guildId, raid) {
      raids.set(key(guildId, raid.eventId), raid);
    },
    async getRaidContext(guildId, eventId) {
      return raids.get(key(guildId, eventId)) ?? null;
    },
  };
}

export function createMemoryLootDeps(options?: { lootMethods?: LootMethodRegistry }): LootDeps & {
  loot: ReturnType<typeof createMemoryLootStore>;
  lootRaids: MemoryLootRaidReader;
} {
  return {
    loot: createMemoryLootStore(),
    lootRaids: createMemoryLootRaidReader(),
    ...(options?.lootMethods ? { lootMethods: options.lootMethods } : {}),
  };
}
