// Public surface of the loot module. Other modules import only this file.
import type { LootAwardRecord } from '@vintage/loot-core';

export {
  AWARD_INTENTS,
  type AwardDraft,
  type AwardIntent,
  type CandidateTier,
  type CompletedRaid,
  type CouncilCharTally,
  type CouncilConfig,
  type CouncilState,
  DEFAULT_COUNCIL_CONFIG,
  DEFAULT_METHOD_ID,
  DEFAULT_MSOS_CONFIG,
  type LootAwardRecord,
  type LootItem,
  type LootMethod,
  type LootMethodInfo,
  type MethodContext,
  type MsosCharTally,
  type MsosConfig,
  type MsosState,
  type RaidAttendee,
  type RaidContext,
  type RankedCandidate,
  type Standing,
  type ValidationResult,
  type WishlistSignal,
} from '@vintage/loot-core';

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

/** One guild-scoped award in the loot ledger (PLAN §5.3: stamps method + versions). */
export interface LootAward extends LootAwardRecord {
  guildId: string;
}

/** An award to persist; the store assigns its id. */
export type LootAwardInput = Omit<LootAward, 'id'>;

/** Per-guild configuration and opaque method state for one loot method. */
export interface LootMethodConfigRecord {
  id: string;
  guildId: string;
  methodId: string;
  methodVersion: number;
  /** Starts at 0 (unconfigured defaults) and bumps by 1 on every `loot-method-configure`. */
  configVersion: number;
  config: unknown;
  state: unknown;
  updatedAt: number;
  updatedBy: string;
}

export type LootMethodConfigInput = Omit<LootMethodConfigRecord, 'id'>;

export const LOOT_COMMANDS = [
  'loot-list',
  'loot-methods-list',
  'loot-method-configure',
  'loot-candidates',
  'loot-award',
  'loot-history',
] as const;
export type LootCommandName = (typeof LOOT_COMMANDS)[number];

/** Events loot emits on the core event bus (PLAN §4.3). None yet. */
export type LootEvents = Record<never, never>;
