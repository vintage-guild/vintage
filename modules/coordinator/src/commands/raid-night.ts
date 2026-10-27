// raid-night-poll (#64): offer a few start times for a raid, let members vote, and let the tick
// turn the winner into the raid. The poll itself is made by polls' poll-create, run as this leader.
import { groupSizeSchema, roleTargetsSchema } from '@vintage/comp-solver';
import { error, success, TIERS, type Tier, tierAllows } from '@vintage/guild-kit';
import {
  AKind,
  aKind,
  EVENT_KINDS,
  instanceOptional,
  sizeFits,
  sizeOptional,
  sizesText,
} from '@vintage/raids/contract';
import { z } from 'zod';
import { RAID_NIGHT_TAG } from '../contract';
import { candidateLines, startLabel } from '../domain/raid-night';
import { command } from '../store';

/** Epoch ms, or an ISO 8601 date-time with an offset (`2026-11-10T20:00:00-05:00`). */
const instantSchema = z
  .union([z.number().int().positive(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === 'number' ? value : Date.parse(value)));

const timeZoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'an IANA time zone, e.g. America/New_York' },
);

const invalid = (message: string, suggestion: string) =>
  error('INVALID_TIME', message, { suggestion, retryable: false });

export const raidNightPoll = command({
  name: 'raid-night-poll',
  description:
    'Ask the raid which night works: post a poll of 2–10 start times for a one-off raid (or ' +
    'another kind: dungeon, battleground, other, with optional roleTargets; other may leave out ' +
    'size for an open event and instance). When the poll closes, the coordinator creates the ' +
    'event at the winning time; a tie, a missed quorum, or no votes goes to the ops channel ' +
    'instead. Labels use timeZone (New York by default); the post shows each time in every ' +
    'reader’s own zone.',
  tier: 'leader',
  mutation: true,
  input: z
    .object({
      name: z.string().trim().min(1).max(60),
      // Both optional only for kind `other`, as raid-create has them (checked below).
      instance: z.string().trim().max(60).default(''),
      kind: z.enum(EVENT_KINDS).default('raid'),
      size: groupSizeSchema
        .nullable()
        .optional()
        .transform((v) => v ?? null),
      roleTargets: roleTargetsSchema.nullable().default(null),
      durationMinutes: z
        .number()
        .int()
        .min(30)
        .max(8 * 60)
        .default(180),
      startTimes: z.array(instantSchema).min(2).max(10),
      closesAt: instantSchema,
      timeZone: timeZoneSchema.default('America/New_York'),
      question: z.string().trim().min(1).max(300).optional(),
      eligibleTier: z
        .enum(TIERS)
        .refine((t: Tier) => tierAllows(t, 'member'))
        .default('raider'),
      quorum: z.number().int().min(1).nullable().default(null),
    })
    .superRefine((input, ctx) => {
      if (input.size === null && !sizeOptional(input.kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['size'],
          message: `${AKind(input.kind)} needs a size (${sizesText(input.kind)})`,
        });
      }
      if (!input.instance && !instanceOptional(input.kind)) {
        ctx.addIssue({
          code: 'custom',
          path: ['instance'],
          message: `${AKind(input.kind)} needs an instance, e.g. Molten Core`,
        });
      }
    }),
  handler: async (input, { caller, guildId, deps, now }) => {
    // The same checks raid-create makes, so the raid made from the winner can't be refused.
    if (!sizeFits(input.kind, input.size)) {
      return error('SIZE_NOT_ALLOWED', `${AKind(input.kind)} can't be ${input.size} players`, {
        suggestion: `Use a size of ${sizesText(input.kind)} for ${aKind(input.kind)}, or pick kind "other"`,
        retryable: false,
      });
    }
    const targets = input.roleTargets;
    if (
      targets &&
      input.size !== null &&
      targets.tank + targets.healer + targets.dps > input.size
    ) {
      return error('ROLE_TARGETS_TOO_BIG', `Role targets add up to more than ${input.size}`, {
        suggestion: 'Lower the tank, healer, or dps targets so they fit the size',
        retryable: false,
      });
    }
    const startTimes = [...new Set(input.startTimes)].sort((a, b) => a - b);
    if (startTimes.length < 2) {
      return invalid('The start times are all the same', 'Offer at least two different times');
    }
    if (input.closesAt <= now()) {
      return invalid('closesAt is in the past', 'Close the poll some time from now');
    }
    if (startTimes[0]! <= input.closesAt) {
      return invalid(
        'A start time is before the poll closes',
        'Close the poll before the earliest raid time',
      );
    }
    const labels = startTimes.map((t) => startLabel(t, input.timeZone));
    if (new Set(labels).size !== labels.length) {
      return invalid('Two start times fall in the same minute', 'Use times a minute or more apart');
    }

    const config = await deps.coordinator.getConfig(guildId);
    const created = await deps.coordinatorPolls.create(
      caller,
      {
        question: input.question ?? `When should we run ${input.name}?`,
        description: candidateLines(input.name, startTimes, input.kind),
        options: startTimes.map((t, i) => ({ label: labels[i]!, value: String(t) })),
        method: 'single',
        eligibleTier: input.eligibleTier,
        quorum: input.quorum,
        closesAt: input.closesAt,
        tags: [RAID_NIGHT_TAG],
      },
      config.signupChannelId,
    );
    if (!created.success) return created;
    const poll = created.data!;

    const raidNight = await deps.coordinator.insertRaidNight({
      guildId,
      pollId: poll.id,
      name: input.name,
      instance: input.instance,
      kind: input.kind,
      size: input.size,
      roleTargets: input.roleTargets,
      durationMinutes: input.durationMinutes,
      createdBy: caller.memberId ?? caller.surface,
      createdAt: now(),
      outcome: 'pending',
      raidEventId: null,
      detail: null,
    });
    const where = config.signupChannelId ? ' It is posted in the signup channel.' : '';
    return success(
      { poll, raidNight },
      { reasoning: `Poll open until the close time; the winner becomes ${input.name}.${where}` },
    );
  },
});
