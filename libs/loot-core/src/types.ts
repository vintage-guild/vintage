// Pure LootMethod contract (PLAN §5.2). No I/O, no Convex, no clock.
import type { Role, WowClass } from '@vintage/wow-data';
import type { z } from 'zod';

/** Why a character is receiving an item under a loot method. */
export const AWARD_INTENTS = ['mainspec', 'offspec', 'transmog', 'disenchant', 'other'] as const;
export type AwardIntent = (typeof AWARD_INTENTS)[number];

/** An item being evaluated for candidates or awarded to a character. */
export interface LootItem {
  itemId: number;
  itemName: string | null;
  /** Roles that treat this item as mainspec; omit/empty when item metadata isn't provided. */
  roles?: readonly Role[];
  /** Classes allowed to equip or use this item; omit/empty for class-agnostic items. */
  classes?: readonly WowClass[];
  /** Optional equipment slot label (e.g. "Chest", "Trinket"). */
  slot?: string | null;
}

/** One attendee of the raid being evaluated for loot eligibility and priority. */
export interface RaidAttendee {
  characterId: string;
  characterName: string;
  memberId: string | null;
  class: WowClass | null;
  spec: string | null;
  role: Role | null;
  /** Other roles the character can play (offspecs). */
  alsoRoles?: readonly Role[];
  /** Guild rank, if known (e.g. 'raider', 'recruit', 'flex-raider'). */
  rank?: string | null;
}

/** One recorded award in the loot ledger (PLAN §5.3: always stamps method + versions). */
export interface LootAwardRecord {
  id: string;
  eventId: string;
  itemId: number;
  itemName: string | null;
  characterId: string;
  characterName: string;
  memberId: string | null;
  intent: AwardIntent;
  methodId: string;
  methodVersion: number;
  configVersion: number;
  roll: number | null;
  note: string | null;
  awardedAt: number;
  awardedBy: string;
}

/** Candidate award before the host persists it; validated by `method.validateAward`. */
export interface AwardDraft {
  eventId: string;
  item: LootItem;
  characterId: string;
  characterName: string;
  memberId: string | null;
  intent: AwardIntent;
  roll?: number | null;
  note?: string | null;
}

export type CandidateTier = 'mainspec' | 'offspec' | 'ineligible';

/** One candidate ranked by a loot method, with a human-readable explanation. */
export interface RankedCandidate {
  characterId: string;
  characterName: string;
  memberId: string | null;
  tier: CandidateTier;
  /** Higher ranks earlier; methods choose their own scale. */
  priority: number;
  reason: string;
  /** Mainspec wins recorded for this character in the current raid. */
  recentWins: number;
}

export type ValidationResult = { ok: true } | { ok: false; code: string; reason: string };

/** One member-facing standing row (MS wins tonight, DKP balance, EP/GP ratio, etc.). */
export interface Standing {
  characterId: string;
  characterName: string;
  memberId: string | null;
  label: string;
  value: number;
  detail?: string;
}

/** Read-only raid context supplied by the host (`modules/loot`) to pure methods. */
export interface RaidContext {
  eventId: string;
  attendees: readonly RaidAttendee[];
  /** Awards already recorded for this raid (and optionally recent raids for the guild). */
  recentAwards: readonly LootAwardRecord[];
  now: number;
}

export interface CompletedRaid {
  eventId: string;
  completedAt: number;
  attendees: readonly RaidAttendee[];
}

export interface MethodContext<Config, State> {
  config: Config;
  state: State;
  raid: RaidContext;
}

/**
 * Pluggable loot method contract (PLAN §5.2).
 * Methods are pure: no I/O, no mutation of `ctx.state`, deterministic for the same inputs.
 */
export interface LootMethod<Config = unknown, State = unknown> {
  /** Stable id recorded on every award (e.g. 'msos', 'softres', 'council'). */
  readonly id: string;
  /** Human-readable name shown to officers and members. */
  readonly name: string;
  /** Plain-language summary of how this method decides priority. */
  readonly description: string;
  /** Implementation version recorded on every award. */
  readonly version: number;
  /** Validates officer config and drives config UI / afd-detail. */
  readonly configSchema: z.ZodType<Config>;
  /** Default config when a guild hasn't customized the method yet. */
  readonly defaultConfig: Config;
  initialState(config: Config): State;

  /** Who should get this item, best first, with a human-readable reason per candidate. */
  candidates(item: LootItem, ctx: MethodContext<Config, State>): RankedCandidate[];

  /** Reject awards the method doesn't allow (officers may still override with a note). */
  validateAward(award: AwardDraft, ctx: MethodContext<Config, State>): ValidationResult;

  /** Pure state transition after an award is recorded. */
  apply(award: LootAwardRecord, ctx: MethodContext<Config, State>): State;

  /** Optional member-facing standings (MS wins this raid, DKP table, prio lists, EP/GP). */
  standings?(ctx: MethodContext<Config, State>): Standing[];

  /** Optional maintenance after a raid completes (decay, attendance EP). */
  onRaidCompleted?(raid: CompletedRaid, ctx: MethodContext<Config, State>): State;
}

/** Public metadata for one registered method. */
export interface LootMethodInfo {
  id: string;
  name: string;
  description: string;
  version: number;
  defaultConfig: unknown;
}
