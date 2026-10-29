// Public surface of the loot module. Other modules import only this file.

/**
 * An item someone looted in a raid, as the addon saw it (PLAN §5.1 "drops"). Recorded from a
 * raid export by raid-export-record; awards under a loot method (#26) build on these.
 */
export interface LootDrop {
  id: string;
  guildId: string;
  eventId: string;
  itemId: number;
  /** From the item data the client revealed, when the export carries it. */
  itemName: string | null;
  count: number;
  /** As the game showed it: `Name`, or `Name-Realm`. */
  looter: string;
  /** The raid signup the looter matched; null for someone not signed up. */
  characterId: string | null;
  memberId: string | null;
  /** UTC epoch ms. */
  at: number;
  /** Encounter the item dropped from, when the addon knew it. */
  source: string | null;
  /** The raid's loot method when the drop was recorded (PLAN §5.3); null when it has none. */
  lootMethodId: string | null;
  recordedAt: number;
}

/** A drop to record for a raid; the store adds the id, guild, and raid. */
export type LootDropInput = Omit<LootDrop, 'id' | 'guildId' | 'eventId'>;

export const LOOT_COMMANDS = ['loot-list'] as const;
export type LootCommandName = (typeof LOOT_COMMANDS)[number];

/** Events loot emits on the core event bus (PLAN §4.3). None yet. */
export type LootEvents = Record<never, never>;
