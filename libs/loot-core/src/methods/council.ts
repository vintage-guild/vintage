// Loot Council loot method — ranks candidates using per-character wishlist priority (#27)
// alongside role/class eligibility and mainspec wins tonight. Pure: no I/O, no Convex, no clock.
import { z } from 'zod';
import type {
  AwardDraft,
  CandidateTier,
  LootAwardRecord,
  LootItem,
  LootMethod,
  MethodContext,
  RaidAttendee,
  RankedCandidate,
  Standing,
  ValidationResult,
  WishlistSignal,
} from '../types';

export const councilConfigSchema = z.object({
  /** Bonus weight per wishlist priority tier (higher ranks rank 1 well ahead of lower ranks). */
  wishlistWeight: z.number().int().min(0).max(50).default(10),
  /** Priority penalty per mainspec win already recorded in the current raid. */
  recentWinPenalty: z.number().int().min(0).max(100).default(25),
  /** Allow offspec candidates when mainspec does not take the item. */
  allowOffspec: z.boolean().default(true),
  /** When true, mainspec attendees without the item on their wishlist drop to offspec tier. */
  requireWishlist: z.boolean().default(false),
  /** Require the recipient to be listed as an attendee of the raid (when attendees are known). */
  requireAttendee: z.boolean().default(true),
});

export type CouncilConfig = z.infer<typeof councilConfigSchema>;

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = councilConfigSchema.parse({});

export interface CouncilCharTally {
  mainspec: number;
  offspec: number;
}

export interface CouncilState {
  winsByEvent: Record<string, Record<string, CouncilCharTally>>;
}

function winsFor(
  eventId: string,
  characterId: string,
  ctx: MethodContext<CouncilConfig, CouncilState>,
): CouncilCharTally {
  const fromState = ctx.state.winsByEvent[eventId]?.[characterId];
  if (fromState) return fromState;
  let mainspec = 0;
  let offspec = 0;
  for (const a of ctx.raid.recentAwards) {
    if (a.eventId !== eventId || a.characterId !== characterId) continue;
    if (a.intent === 'mainspec') mainspec++;
    else if (a.intent === 'offspec') offspec++;
  }
  return { mainspec, offspec };
}

function classIneligible(item: LootItem, attendee: RaidAttendee): boolean {
  return Boolean(
    item.classes?.length && attendee.class !== null && !item.classes.includes(attendee.class),
  );
}

function wishlistFor(
  itemId: number,
  characterId: string,
  ctx: MethodContext<CouncilConfig, CouncilState>,
): WishlistSignal | null {
  const list = ctx.raid.wishlistByItem?.[itemId];
  if (!list?.length) return null;
  return list.find((w) => w.characterId === characterId) ?? null;
}

function wishlistSuffix(signal: WishlistSignal | null): string {
  if (!signal) return 'Not on wishlist';
  return signal.note ? `Wishlist #${signal.rank} (${signal.note})` : `Wishlist #${signal.rank}`;
}

function winsSuffix(msWins: number): string | null {
  if (msWins === 0) return null;
  return `${msWins} MS ${msWins === 1 ? 'win' : 'wins'} tonight`;
}

function classifyCouncil(
  attendee: RaidAttendee,
  signal: WishlistSignal | null,
  msWins: number,
  isMainRole: boolean,
  isDeclaredOffRole: boolean,
  config: CouncilConfig,
): { tier: CandidateTier; reason: string } {
  const rolePart = attendee.role ? ` (${attendee.role})` : '';
  const parts: string[] = [];
  const winText = winsSuffix(msWins);

  if (isMainRole && (!config.requireWishlist || signal !== null)) {
    parts.push(`Mainspec${rolePart}`, wishlistSuffix(signal));
    if (winText) parts.push(winText);
    return { tier: 'mainspec', reason: parts.join(' · ') };
  }

  if (!config.allowOffspec) {
    return {
      tier: 'ineligible',
      reason: isMainRole
        ? 'Not on wishlist (wishlist required)'
        : 'Not mainspec role (offspec disabled)',
    };
  }

  if (isMainRole && config.requireWishlist && !signal) {
    parts.push(`Mainspec${rolePart} (not on wishlist; offspec priority)`);
    if (winText) parts.push(winText);
    return { tier: 'offspec', reason: parts.join(' · ') };
  }

  parts.push(isDeclaredOffRole ? 'Offspec (declared off-role)' : 'Offspec', wishlistSuffix(signal));
  if (winText) parts.push(winText);
  return { tier: 'offspec', reason: parts.join(' · ') };
}

function scoreCouncil(
  tier: CandidateTier,
  signal: WishlistSignal | null,
  msWins: number,
  config: CouncilConfig,
): number {
  if (tier === 'ineligible') return 0;
  const base = tier === 'mainspec' ? 1000 : 400;
  const wishBonus = signal ? Math.max(1, 51 - signal.rank) * config.wishlistWeight : 0;
  const penalty = msWins * config.recentWinPenalty;
  return Math.max(0, base + wishBonus - penalty);
}

function evaluateAttendee(
  item: LootItem,
  attendee: RaidAttendee,
  ctx: MethodContext<CouncilConfig, CouncilState>,
): RankedCandidate {
  const tally = winsFor(ctx.raid.eventId, attendee.characterId, ctx);
  const signal = wishlistFor(item.itemId, attendee.characterId, ctx);
  if (classIneligible(item, attendee)) {
    return {
      characterId: attendee.characterId,
      characterName: attendee.characterName,
      memberId: attendee.memberId,
      tier: 'ineligible',
      priority: 0,
      reason: `Class not eligible (${attendee.class})`,
      recentWins: tally.mainspec,
      wishlistRank: signal?.rank ?? null,
      wishlistNote: signal?.note ?? null,
    };
  }

  const roles = item.roles;
  const isMainRole = !roles?.length || (attendee.role !== null && roles.includes(attendee.role));
  const isDeclaredOffRole = Boolean(
    roles?.length && attendee.alsoRoles?.some((r) => roles.includes(r)),
  );
  const { tier, reason } = classifyCouncil(
    attendee,
    signal,
    tally.mainspec,
    isMainRole,
    isDeclaredOffRole,
    ctx.config,
  );
  return {
    characterId: attendee.characterId,
    characterName: attendee.characterName,
    memberId: attendee.memberId,
    tier,
    priority: scoreCouncil(tier, signal, tally.mainspec, ctx.config),
    reason,
    recentWins: tally.mainspec,
    wishlistRank: signal?.rank ?? null,
    wishlistNote: signal?.note ?? null,
  };
}

function tierRank(tier: CandidateTier): number {
  if (tier === 'mainspec') return 2;
  if (tier === 'offspec') return 1;
  return 0;
}

export const councilMethod: LootMethod<CouncilConfig, CouncilState> = {
  id: 'council',
  name: 'Loot Council',
  description:
    'Ranks raid attendees using each character’s wishlist priority, mainspec eligibility, and recent wins tonight.',
  version: 1,
  configSchema: councilConfigSchema,
  defaultConfig: DEFAULT_COUNCIL_CONFIG,

  initialState(): CouncilState {
    return { winsByEvent: {} };
  },

  candidates(item: LootItem, ctx: MethodContext<CouncilConfig, CouncilState>): RankedCandidate[] {
    return ctx.raid.attendees
      .map((a) => evaluateAttendee(item, a, ctx))
      .sort(
        (a, b) =>
          tierRank(b.tier) - tierRank(a.tier) ||
          b.priority - a.priority ||
          (a.wishlistRank ?? Number.POSITIVE_INFINITY) -
            (b.wishlistRank ?? Number.POSITIVE_INFINITY) ||
          a.recentWins - b.recentWins ||
          a.characterName.localeCompare(b.characterName),
      );
  },

  validateAward(
    draft: AwardDraft,
    ctx: MethodContext<CouncilConfig, CouncilState>,
  ): ValidationResult {
    const attendee = ctx.raid.attendees.find((a) => a.characterId === draft.characterId);
    if (ctx.config.requireAttendee && ctx.raid.attendees.length > 0 && !attendee) {
      return {
        ok: false,
        code: 'NOT_IN_RAID',
        reason: `${draft.characterName} is not an attendee of this raid`,
      };
    }
    if (draft.intent === 'offspec' && !ctx.config.allowOffspec) {
      return {
        ok: false,
        code: 'OFFSPEC_DISABLED',
        reason: 'Offspec awards are disabled under the current Loot Council settings',
      };
    }
    if (attendee && classIneligible(draft.item, attendee)) {
      return {
        ok: false,
        code: 'CLASS_INELIGIBLE',
        reason: `${draft.characterName} (${attendee.class}) is not eligible for this item`,
      };
    }
    return { ok: true };
  },

  apply(award: LootAwardRecord, ctx: MethodContext<CouncilConfig, CouncilState>): CouncilState {
    const prevEvent = ctx.state.winsByEvent[award.eventId] ?? {};
    const prevChar = prevEvent[award.characterId] ?? { mainspec: 0, offspec: 0 };
    const nextChar: CouncilCharTally = {
      mainspec: prevChar.mainspec + (award.intent === 'mainspec' ? 1 : 0),
      offspec: prevChar.offspec + (award.intent === 'offspec' ? 1 : 0),
    };
    return {
      winsByEvent: {
        ...ctx.state.winsByEvent,
        [award.eventId]: {
          ...prevEvent,
          [award.characterId]: nextChar,
        },
      },
    };
  },

  standings(ctx: MethodContext<CouncilConfig, CouncilState>): Standing[] {
    return ctx.raid.attendees
      .map((a) => {
        const tally = winsFor(ctx.raid.eventId, a.characterId, ctx);
        return {
          characterId: a.characterId,
          characterName: a.characterName,
          memberId: a.memberId,
          label: `${tally.mainspec} MS, ${tally.offspec} OS`,
          value: tally.mainspec,
          ...(tally.offspec > 0 ? { detail: `${tally.offspec} offspec` } : {}),
        };
      })
      .sort((a, b) => a.value - b.value || a.characterName.localeCompare(b.characterName));
  },

  onRaidCompleted(_raid, ctx) {
    return ctx.state;
  },
};
