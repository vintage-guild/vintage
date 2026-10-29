import type { LootDrop } from './contract';
import type { LootDeps, LootStore } from './store';

/** In-memory LootStore for tests. Same behavior contract as the Convex component. */
export function createMemoryLootStore(): LootStore & { drops: Map<string, LootDrop> } {
  const drops = new Map<string, LootDrop>();
  let seq = 0;
  const forRaid = (guildId: string, eventId: string) =>
    [...drops.values()]
      .filter((d) => d.guildId === guildId && d.eventId === eventId)
      .sort((a, b) => a.at - b.at);
  return {
    drops,
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
  };
}

export function createMemoryLootDeps(): LootDeps & {
  loot: ReturnType<typeof createMemoryLootStore>;
} {
  return { loot: createMemoryLootStore() };
}
