import { error, success } from '@vintage/guild-kit';
import {
  AWARD_INTENTS,
  type AwardDraft,
  DEFAULT_METHOD_ID,
  type ValidationResult,
} from '@vintage/loot-core';
import { z } from 'zod';
import type { LootAwardInput } from '../contract';
import { command } from '../store';
import {
  buildMethodContext,
  lootItemFields,
  methodNotFound,
  raidNotFound,
  resolveMethod,
  toLootItem,
} from './helpers';

export const lootCandidates = command({
  name: 'loot-candidates',
  description:
    'Rank a raid’s attendees for an item under the raid’s loot method (or an explicit method), ' +
    'returning each candidate’s tier, priority, and human-readable reason.',
  tier: 'leader',
  input: z.object({
    eventId: z.string().min(1),
    ...lootItemFields,
    methodId: z.string().min(1).optional(),
  }),
  handler: async (input, { guildId, deps, now }) => {
    const raid = await deps.lootRaids.getRaidContext(guildId, input.eventId);
    if (!raid) return raidNotFound(input.eventId);

    const requestedMethodId = input.methodId ?? raid.lootMethodId ?? DEFAULT_METHOD_ID;
    const method = resolveMethod(deps, requestedMethodId);
    if (!method) return methodNotFound(requestedMethodId);

    const item = toLootItem(input);
    const { loaded, ctx } = await buildMethodContext(deps, guildId, method, raid, now());
    const candidates = method.candidates(item, ctx);
    const standings = method.standings ? method.standings(ctx) : [];
    const eligible = candidates.filter((c) => c.tier !== 'ineligible').length;

    return success(
      {
        eventId: raid.eventId,
        eventName: raid.name,
        methodId: method.id,
        methodName: method.name,
        methodVersion: method.version,
        configVersion: loaded.configVersion,
        item,
        candidates,
        standings,
      },
      {
        reasoning: `${eligible} eligible of ${candidates.length} attendees under ${method.name}`,
      },
    );
  },
});

const awardInputSchema = z.object({
  eventId: z.string().min(1),
  ...lootItemFields,
  characterId: z.string().min(1),
  characterName: z.string().trim().min(1).max(80).optional(),
  memberId: z.string().min(1).nullable().optional(),
  intent: z.enum(AWARD_INTENTS).default('mainspec'),
  methodId: z.string().min(1).optional(),
  roll: z.number().int().min(1).max(1000).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  override: z.boolean().optional(),
});

function checkValidation(
  validation: ValidationResult,
  override: boolean | undefined,
  note: string | null,
) {
  if (validation.ok) return null;
  if (!override) {
    return error('AWARD_NOT_ALLOWED', validation.reason, {
      suggestion: 'Pass override: true with a note to record an officer override',
      retryable: false,
    });
  }
  if (!note) {
    return error('OVERRIDE_NOTE_REQUIRED', 'Officer override requires a note explaining why', {
      suggestion: 'Include a non-empty note describing the override',
      retryable: false,
    });
  }
  return null;
}

function buildAwardDraft(
  input: z.infer<typeof awardInputSchema>,
  raid: {
    eventId: string;
    attendees: { characterId: string; characterName: string; memberId: string | null }[];
  },
): { draft: AwardDraft } | { failure: ReturnType<typeof error> } {
  const attendee = raid.attendees.find((a) => a.characterId === input.characterId);
  const characterName = input.characterName ?? attendee?.characterName;
  if (!characterName) {
    return {
      failure: error(
        'VALIDATION_ERROR',
        `characterName is required when "${input.characterId}" is not in the raid’s attendees`,
        { retryable: false },
      ),
    };
  }
  const memberId = input.memberId !== undefined ? input.memberId : (attendee?.memberId ?? null);
  return {
    draft: {
      eventId: raid.eventId,
      item: toLootItem(input),
      characterId: input.characterId,
      characterName,
      memberId,
      intent: input.intent,
      roll: input.roll ?? null,
      note: input.note?.trim() || null,
    },
  };
}

export const lootAward = command({
  name: 'loot-award',
  description:
    'Record a loot award under the raid’s loot method, stamping methodId, methodVersion, and ' +
    'configVersion. Officer-only and destructive: shows a preview first; confirm to record.',
  tier: 'officer',
  destructive: true,
  input: awardInputSchema,
  handler: async (input, { guildId, caller, deps, dryRun, now }) => {
    const raid = await deps.lootRaids.getRaidContext(guildId, input.eventId);
    if (!raid) return raidNotFound(input.eventId);

    const requestedMethodId = input.methodId ?? raid.lootMethodId ?? DEFAULT_METHOD_ID;
    const method = resolveMethod(deps, requestedMethodId);
    if (!method) return methodNotFound(requestedMethodId);

    const built = buildAwardDraft(input, raid);
    if ('failure' in built) return built.failure;
    const { draft } = built;

    const { loaded, ctx } = await buildMethodContext(deps, guildId, method, raid, now());
    const validation = method.validateAward(draft, ctx);
    const blocked = checkValidation(validation, input.override, draft.note ?? null);
    if (blocked) return blocked;

    const itemLabel = draft.item.itemName ?? `item #${draft.item.itemId}`;
    const overridden = !validation.ok;
    if (dryRun) {
      return success(
        {
          willAward: {
            ...draft,
            methodId: method.id,
            methodVersion: method.version,
            configVersion: loaded.configVersion,
          },
          overridden,
          validation,
        },
        {
          reasoning:
            `Awards ${itemLabel} to ${draft.characterName} (${input.intent}) under ${method.name}` +
            (overridden ? ' [officer override]' : ''),
        },
      );
    }

    const awardedAt = now();
    const awardedBy = caller.memberId ?? caller.discordId ?? 'system';
    const record: LootAwardInput = {
      guildId,
      eventId: raid.eventId,
      itemId: draft.item.itemId,
      itemName: draft.item.itemName,
      characterId: draft.characterId,
      characterName: draft.characterName,
      memberId: draft.memberId,
      intent: draft.intent,
      methodId: method.id,
      methodVersion: method.version,
      configVersion: loaded.configVersion,
      roll: draft.roll ?? null,
      note: draft.note ?? null,
      awardedAt,
      awardedBy,
    };
    const award = await deps.loot.insertAward(record);
    const nextState = method.apply(award, ctx);
    await deps.loot.upsertMethodConfig({
      guildId,
      methodId: method.id,
      methodVersion: method.version,
      configVersion: loaded.configVersion,
      config: loaded.config,
      state: nextState,
      updatedAt: awardedAt,
      updatedBy: awardedBy,
    });

    return success(
      { award, overridden },
      {
        reasoning: `Recorded ${itemLabel} to ${draft.characterName} (${input.intent}) under ${method.name} v${method.version}`,
      },
    );
  },
});

export const lootHistory = command({
  name: 'loot-history',
  description:
    'Read recorded loot awards for this guild, newest first, optionally filtered by raid or ' +
    'character.',
  tier: 'member',
  input: z.object({
    eventId: z.string().min(1).optional(),
    characterId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  handler: async ({ eventId, characterId, limit }, { guildId, deps }) => {
    const effectiveLimit = limit ?? 50;
    const awards = await deps.loot.listAwards(guildId, {
      ...(eventId ? { eventId } : {}),
      ...(characterId ? { characterId } : {}),
      limit: effectiveLimit,
    });
    return success(
      { awards },
      {
        reasoning: awards.length
          ? `${awards.length} award${awards.length === 1 ? '' : 's'} recorded`
          : 'No loot awards recorded',
      },
    );
  },
});
