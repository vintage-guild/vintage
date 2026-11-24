import { commandsFor } from '@vintage/guild-kit';
import type { LootMethodRegistry, RaidAttendee } from '@vintage/loot-core';
import type { WishlistReader } from '@vintage/wishlist/contract';
import type {
  LootAward,
  LootAwardInput,
  LootDrop,
  LootDropInput,
  LootMethodConfigInput,
  LootMethodConfigRecord,
} from './contract';

export interface LootAwardFilter {
  eventId?: string;
  characterId?: string;
  limit?: number;
}

/** The loot module's data port. Production adapts it to the Convex component in apps/api. */
export interface LootStore {
  /** A raid's drops, in the order they were looted. */
  listDrops(guildId: string, eventId: string): Promise<LootDrop[]>;
  /** Replaces every drop recorded for a raid (a re-recorded export). */
  replaceDrops(guildId: string, eventId: string, drops: LootDropInput[]): Promise<LootDrop[]>;
  /** Saved config + state for one loot method in a guild, or null before first configure/apply. */
  getMethodConfig(guildId: string, methodId: string): Promise<LootMethodConfigRecord | null>;
  /** Every configured loot method row for a guild. */
  listMethodConfigs(guildId: string): Promise<LootMethodConfigRecord[]>;
  /** Creates or updates a guild's config + state row for one loot method. */
  upsertMethodConfig(record: LootMethodConfigInput): Promise<LootMethodConfigRecord>;
  /** Recorded loot awards, newest first. */
  listAwards(guildId: string, filter?: LootAwardFilter): Promise<LootAward[]>;
  /** Records one loot award on the ledger. */
  insertAward(award: LootAwardInput): Promise<LootAward>;
}

/** Raid metadata and attendees needed by loot commands, read through a port (never raids tables). */
export interface LootRaidContext {
  eventId: string;
  name: string;
  lootMethodId: string | null;
  attendees: RaidAttendee[];
}

export interface LootRaidReader {
  getRaidContext(guildId: string, eventId: string): Promise<LootRaidContext | null>;
}

export interface LootDeps {
  loot: LootStore;
  lootRaids: LootRaidReader;
  /** Read-only wishlist contract port (`@vintage/wishlist/contract`), never wishlist tables (#27). */
  lootWishlist?: WishlistReader;
  /** Optional custom registry for tests or future plugins; defaults to `defaultLootMethods`. */
  lootMethods?: LootMethodRegistry;
}

export const command = commandsFor<LootDeps>();
