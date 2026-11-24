// Mainspec over Offspec (MS/OS) loot method — first method chosen in Q5 (#30, #26).
// Pure: evaluates class/role eligibility, optional per-raid MS cap, and optional MS+1 tiebreaker.
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
} from '../types';

export const msosConfigSchema = z.object({
  /** Maximum mainspec wins per character per raid; null means unlimited. */
  maxMainspecPerRaid: z.number().int().min(1).max(20).nullable().default(null),
  /** When true (MS+1), fewer mainspec wins tonight ranks ahead within mainspec candidates. */
  plusOne: z.boolean().default(false),
  /** Allow offspec eligibility and awards when mainspec doesn't take the item. */
  allowOffspec: z.boolean().default(true),
  /** Require the recipient to be listed as an attendee of the raid (when attendees are known). */
  requireAttendee: z.boolean().default(true),
});

export type MsosConfig = z.infer<typeof msosConfigSchema>;

export const DEFAULT_MSOS_CONFIG: MsosConfig = msosConfigSchema.parse({});

export interface MsosCharTally {
  mainspec: number;
  offspec: number;
}

export interface MsosState {
  /** Per-event win counts keyed by eventId -> characterId. */
  winsByEvent: Record<string, Record<string, MsosCharTally>>;
}

function winsFor(
  eventId: string,
  characterId: string,
  ctx: MethodContext<MsosConfig, MsosState>,
): MsosCharTally {
  const fromState = ctx.state.winsByEvent[eventId]?.[characterId];
  if (fromState) return fromState;
  // Derive from recentAwards if state hasn't been hydrated for this raid yet.
  let mainspec = 0;
  let offspec = 0;
  for (const a of ctx.raid.recentAwards) {
    if (a.eventId !== eventId || a.characterId !== characterId) continue;
    if (a.intent === 'mainspec') mainspec++;
    else if (a.intent === 'offspec') offspec++;
  }
  return { mainspec, offspec };
}

function totalRecentWins(characterId: string, awards: readonly LootAwardRecord[]): number {
  let n = 0;
  for (const a of awards) {
    if (a.characterId === characterId) n++;
  }
  return n;
}

function classIneligible(item: LootItem, attendee: RaidAttendee): boolean {
  return Boolean(
    item.classes?.length && attendee.class !== null && !item.classes.includes(attendee.class),
  );
}

function mainspecReason(role: RaidAttendee['role'], msWins: number): string {
  const rolePart = role ? ` (${role})` : '';
  if (msWins === 0) return `Mainspec${rolePart}`;
  const suffix = msWins === 1 ? 'win' : 'wins';
  return `Mainspec${rolePart} · ${msWins} MS ${suffix} tonight`;
}

function classifyTier(
  attendee: RaidAttendee,
  tally: MsosCharTally,
  isMainRole: boolean,
  isDeclaredOffRole: boolean,
  config: MsosConfig,
): { tier: CandidateTier; reason: string } {
  const cap = config.maxMainspecPerRaid;
  const hitMsCap = cap !== null && tally.mainspec >= cap;

  if (isMainRole && !hitMsCap) {
    return { tier: 'mainspec', reason: mainspecReason(attendee.role, tally.mainspec) };
  }
  if (!config.allowOffspec) {
    return {
      tier: 'ineligible',
      reason: hitMsCap
        ? `Reached ${cap} mainspec win cap this raid`
        : 'Not mainspec role (offspec disabled)',
    };
  }
  if (isMainRole && hitMsCap) {
    return {
      tier: 'offspec',
      reason: `Reached ${cap} MS cap (${tally.mainspec} won); offspec eligible`,
    };
  }
  return { tier: 'offspec', reason: isDeclaredOffRole ? 'Offspec (declared off-role)' : 'Offspec' };
}

function scoreCandidate(
  tier: CandidateTier,
  msWins: number,
  recent: number,
  plusOne: boolean,
): number {
  if (tier === 'ineligible') return 0;
  const base = tier === 'mainspec' ? 1000 : 500;
  const plusOnePenalty = tier === 'mainspec' && plusOne ? msWins * 20 : 0;
  return Math.max(0, base - plusOnePenalty - Math.min(recent, 19));
}

function evaluateAttendee(
  item: LootItem,
  attendee: RaidAttendee,
  ctx: MethodContext<MsosConfig, MsosState>,
): RankedCandidate {
  const tally = winsFor(ctx.raid.eventId, attendee.characterId, ctx);
  const wish = ctx.raid.wishlistByItem?.[item.itemId]?.find(
    (w) => w.characterId === attendee.characterId,
  );
  const wishFields = wish ? { wishlistRank: wish.rank, wishlistNote: wish.note } : {};
  if (classIneligible(item, attendee)) {
    return {
      characterId: attendee.characterId,
      characterName: attendee.characterName,
      memberId: attendee.memberId,
      tier: 'ineligible',
      priority: 0,
      reason: `Class not eligible (${attendee.class})`,
      recentWins: tally.mainspec,
      ...wishFields,
    };
  }

  const roles = item.roles;
  const isMainRole = !roles?.length || (attendee.role !== null && roles.includes(attendee.role));
  const isDeclaredOffRole = Boolean(
    roles?.length && attendee.alsoRoles?.some((r) => roles.includes(r)),
  );
  const { tier, reason } = classifyTier(attendee, tally, isMainRole, isDeclaredOffRole, ctx.config);
  const recent = totalRecentWins(attendee.characterId, ctx.raid.recentAwards);
  return {
    characterId: attendee.characterId,
    characterName: attendee.characterName,
    memberId: attendee.memberId,
    tier,
    priority: scoreCandidate(tier, tally.mainspec, recent, ctx.config.plusOne),
    reason,
    recentWins: tally.mainspec,
    ...wishFields,
  };
}

function tierRank(tier: CandidateTier): number {
  if (tier === 'mainspec') return 2;
  if (tier === 'offspec') return 1;
  return 0;
}

export const msosMethod: LootMethod<MsosConfig, MsosState> = {
  id: 'msos',
  name: 'Mainspec over Offspec (MS/OS)',
  description:
    'Mainspec rolls beat offspec rolls. Supports optional per-raid mainspec win caps and MS+1 tiebreaking.',
  version: 1,
  configSchema: msosConfigSchema,
  defaultConfig: DEFAULT_MSOS_CONFIG,

  initialState(): MsosState {
    return { winsByEvent: {} };
  },

  candidates(item: LootItem, ctx: MethodContext<MsosConfig, MsosState>): RankedCandidate[] {
    return ctx.raid.attendees
      .map((a) => evaluateAttendee(item, a, ctx))
      .sort(
        (a, b) =>
          tierRank(b.tier) - tierRank(a.tier) ||
          b.priority - a.priority ||
          a.recentWins - b.recentWins ||
          a.characterName.localeCompare(b.characterName),
      );
  },

  validateAward(draft: AwardDraft, ctx: MethodContext<MsosConfig, MsosState>): ValidationResult {
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
        reason: 'Offspec awards are disabled under the current MS/OS settings',
      };
    }
    if (attendee && classIneligible(draft.item, attendee)) {
      return {
        ok: false,
        code: 'CLASS_INELIGIBLE',
        reason: `${draft.characterName} (${attendee.class}) is not eligible for this item`,
      };
    }
    if (draft.intent === 'mainspec' && ctx.config.maxMainspecPerRaid !== null) {
      const tally = winsFor(draft.eventId, draft.characterId, ctx);
      if (tally.mainspec >= ctx.config.maxMainspecPerRaid) {
        return {
          ok: false,
          code: 'MS_CAP_REACHED',
          reason: `${draft.characterName} already has ${tally.mainspec} mainspec win(s) this raid (cap ${ctx.config.maxMainspecPerRaid})`,
        };
      }
    }
    return { ok: true };
  },

  apply(award: LootAwardRecord, ctx: MethodContext<MsosConfig, MsosState>): MsosState {
    const prevEvent = ctx.state.winsByEvent[award.eventId] ?? {};
    const prevChar = prevEvent[award.characterId] ?? { mainspec: 0, offspec: 0 };
    const nextChar: MsosCharTally = {
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

  standings(ctx: MethodContext<MsosConfig, MsosState>): Standing[] {
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
