import { commandsFor } from '@vintage/guild-kit';
import type { LootDrop, LootDropInput } from './contract';

/** The loot module's data port. Production adapts it to the Convex component in apps/api. */
export interface LootStore {
  /** A raid's drops, in the order they were looted. */
  listDrops(guildId: string, eventId: string): Promise<LootDrop[]>;
  /** Replaces every drop recorded for a raid (a re-recorded export). */
  replaceDrops(guildId: string, eventId: string, drops: LootDropInput[]): Promise<LootDrop[]>;
}

export interface LootDeps {
  loot: LootStore;
}

export const command = commandsFor<LootDeps>();
