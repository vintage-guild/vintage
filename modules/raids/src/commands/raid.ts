import { roleTargetsSchema, type SignupStatus } from '@vintage/comp-solver';
import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  accessOf,
  normalizeShortCode,
  RAID_ACCESS,
  RAID_STATUSES,
  type RaidEvent,
  type Schedule,
  type Signup,
  sizeLabel,
} from '../contract';
import { locksAt, timingsFor } from '../domain/timings';
import { command } from '../store';
import {
  eventNotFound,
  instantSchema,
  isLive,
  kindRules,
  kindSchema,
  notesSchema,
  optionalInstanceSchema,
  optionalSizeSchema,
  raidClosed,
  sizeForKind,
  targetsTooBig,
} from './shared';

const DAY_MS = 24 * 60 * 60 * 1000;

const inPast = () =>
  error('RAID_IN_PAST', 'That time has already passed', {
    suggestion: 'Pick a future start time',
    retryable: false,
  });

/** Signup counts by status, for summaries anyone in the guild may see. */
function countByStatus(signups: Signup[]): Record<SignupStatus, number> {
  const counts = { accepted: 0, late: 0, tentative: 0, bench: 0, declined: 0 };
  for (const s of signups) counts[s.status]++;
  return counts;
}

export const raidCreate = command({
  name: 'raid-create',
  description:
    'Create a one-off event (not from a schedule), open for signups: a raid (10, 20 or 40), a ' +
    'dungeon (5), a battleground (10, 15 or 40), or another event (kind other, e.g. a ' +
    'levelling group: size 1 to 40 or none for open with no cap or queue; instance optional). ' +
    'roleTargets default to the kind: raid comps by size, 1 tank/1 healer/3 dps for dungeons, ' +
    'no tank for battlegrounds, none for other. notes (up to 500 characters) say what to bring ' +
    'and when to be on; members see them on the signup card.',
  tier: 'leader',
  mutation: true,
  input: z
    .object({
      name: z.string().trim().min(1).max(60),
      instance: optionalInstanceSchema,
      kind: kindSchema.default('raid'),
      access: z.enum(RAID_ACCESS).default('guild'),
      size: optionalSizeSchema,
      startsAt: instantSchema,
      durationMinutes: z
        .number()
        .int()
        .min(30)
        .max(8 * 60)
        .default(180),
      roleTargets: roleTargetsSchema.nullable().default(null),
      lootMethodId: z.string().min(1).nullable().default(null),
      notes: notesSchema.default(null),
    })
    .superRefine(kindRules),
  handler: async (input, { guildId, deps, now }) => {
    const invalid =
      sizeForKind(input.kind, input.size) ?? targetsTooBig(input.size, input.roleTargets);
    if (invalid) return invalid;
    if (input.startsAt <= now()) return inPast();
    const event = await deps.raids.insertEvent({
      guildId,
      scheduleId: null,
      ...input,
      status: 'open',
      rosterApprovedAt: null,
      rosterApprovedBy: null,
      configVersion: 1,
    });
    return success(event, {
      reasoning: `${event.name} (${sizeLabel(event.kind, event.size)}) is open for signups`,
    });
  },
});

const GROUP_SIZE = 5;

async function clearOutOfRangeGroups(
  deps: {
    raids: {
      listSignups: (g: string, e: string) => Promise<Signup[]>;
      updateSignup: (g: string, id: string, p: { group: null }) => Promise<unknown>;
    };
  },
  guildId: string,
  eventId: string,
  nextSize: number,
) {
  const maxGroup = Math.max(1, Math.ceil(nextSize / GROUP_SIZE));
  const signups = await deps.raids.listSignups(guildId, eventId);
  for (const s of signups) {
    if (s.group !== null && s.group > maxGroup) {
      await deps.raids.updateSignup(guildId, s.id, { group: null });
    }
  }
}

function raidUpdateReasoning(
  updated: { name: string; kind: RaidEvent['kind']; size: number | null },
  input: { startsAt?: number; notes?: string | null; size?: number | null; roleTargets?: unknown },
): string {
  const what = [
    input.startsAt === undefined ? null : 'moved',
    input.notes === undefined ? null : 'notes saved',
    input.size === undefined ? null : `resized (${sizeLabel(updated.kind, updated.size)})`,
    input.roleTargets === undefined ? null : 'comp updated',
  ];
  return `${updated.name} ${what.filter(Boolean).join(', ')}; signups kept`;
}

export const raidUpdate = command({
  name: 'raid-update',
  description:
    'Update a raid after it exists: move its start time, change its notes (what to bring, when to ' +
    'be on; empty or null clears them), change its size (nullable for kind other), or change its ' +
    'comp roleTargets (null resets to the kind default). Give at least one. Allowed while open or ' +
    'locked, including after start; completed and cancelled raids refuse. Signups and approved seats are kept.',
  tier: 'leader',
  mutation: true,
  input: z
    .object({
      eventId: z.string().min(1),
      startsAt: instantSchema.optional(),
      notes: notesSchema.optional(),
      size: optionalSizeSchema.optional(),
      roleTargets: roleTargetsSchema.nullable().optional(),
    })
    .refine(
      (i) =>
        i.startsAt !== undefined ||
        i.notes !== undefined ||
        i.size !== undefined ||
        i.roleTargets !== undefined,
      {
        message: 'Give at least one of startsAt, notes, size, or roleTargets',
      },
    ),
  handler: async (input, { caller, guildId, deps, now }) => {
    const { eventId, startsAt, notes, size, roleTargets } = input;
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    if (!isLive(event)) return raidClosed(event);
    if (startsAt !== undefined && startsAt <= now()) return inPast();
    const nextSize = size === undefined ? event.size : size;
    const nextTargets = roleTargets === undefined ? event.roleTargets : roleTargets;
    const invalid = sizeForKind(event.kind, nextSize) ?? targetsTooBig(nextSize, nextTargets);
    if (invalid) return invalid;

    const updated = await deps.raids.updateEvent(guildId, eventId, {
      ...(startsAt === undefined ? {} : { startsAt }),
      ...(notes === undefined ? {} : { notes }),
      ...(size === undefined ? {} : { size }),
      ...(roleTargets === undefined ? {} : { roleTargets }),
      updatedAt: now(),
      updatedBy: caller.memberId ?? caller.discordId ?? null,
    });

    // Before approval, shrinking a raid clears manual group numbers above the new group count.
    // After approval, seats and groups stay for leaders to move or bench.
    if (event.rosterApprovedAt === null && size !== undefined && nextSize !== null) {
      await clearOutOfRangeGroups(deps, guildId, eventId, nextSize);
    }

    return success(updated, { reasoning: raidUpdateReasoning(updated, input) });
  },
});

export const raidCancel = command({
  name: 'raid-cancel',
  description: 'Cancel a raid. Shows a preview first; confirm to cancel. Signups stay for history.',
  tier: 'leader',
  destructive: true,
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps, dryRun }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    if (!isLive(event)) return raidClosed(event);
    const signups = await deps.raids.listSignups(guildId, eventId);
    const affected = signups.filter((s) => s.status !== 'declined').length;
    if (dryRun) {
      return success(
        { willCancel: event, signups: affected },
        { reasoning: `Cancels ${event.name}; ${affected} people signed up` },
      );
    }
    const cancelled = await deps.raids.updateEvent(guildId, eventId, { status: 'cancelled' });
    return success({ cancelled, signups: affected });
  },
});

export const raidComplete = command({
  name: 'raid-complete',
  description:
    'Mark a raid as done after it started. Records attendance (the roster, or accepted signups ' +
    'when no roster was set) and starts post-raid work.',
  tier: 'leader',
  mutation: true,
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps, now }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    if (!isLive(event)) return raidClosed(event);
    if (event.startsAt > now()) {
      return error('RAID_NOT_STARTED', `${event.name} hasn't started yet`, {
        suggestion: 'Complete it after the raid, or use raid-cancel if it is not happening',
        retryable: false,
      });
    }
    const signups = await deps.raids.listSignups(guildId, eventId);
    const rostered = signups.filter((s) => s.roster === 'rostered');
    const attending = rostered.length
      ? rostered
      : signups.filter((s) => s.status === 'accepted' || s.status === 'late');
    const attendees = attending.map(({ memberId, characterId }) => ({ memberId, characterId }));
    const completed = await deps.raids.updateEvent(guildId, eventId, { status: 'completed' });
    await deps.events.emit(guildId, 'raid-completed', {
      eventId,
      scheduleId: event.scheduleId,
      startsAt: event.startsAt,
      attendees,
    });
    return success(
      { completed, attendees },
      { reasoning: `${event.name} completed with ${attendees.length} attending` },
    );
  },
});

export const raidGet = command({
  name: 'raid-get',
  description:
    'One raid (by eventId or case-insensitive shortCode) with signup counts, when signups lock, ' +
    'and your own signup. Recruits and up see the full signup list; Friends see open raids only.',
  tier: 'friend',
  input: z
    .object({
      eventId: z.string().min(1).optional(),
      shortCode: z.string().trim().min(1).optional(),
    })
    .refine((i) => i.eventId !== undefined || i.shortCode !== undefined, {
      message: 'Give eventId or shortCode',
    }),
  handler: async ({ eventId, shortCode }, { caller, guildId, deps }) => {
    const normalizedCode = shortCode === undefined ? undefined : normalizeShortCode(shortCode);
    const event =
      eventId !== undefined
        ? await deps.raids.getEvent(guildId, eventId)
        : await deps.raids.getEventByShortCode(guildId, normalizedCode!);
    if (!event) return eventNotFound();
    if (
      eventId !== undefined &&
      normalizedCode !== undefined &&
      event.shortCode !== normalizedCode
    ) {
      return eventNotFound();
    }
    const open = accessOf(event) === 'open';
    if (!open && !tierAllows(caller.tier, 'member')) return eventNotFound();
    const signups = await deps.raids.listSignups(guildId, event.id);
    const mine = signups.find((s) => s.memberId === caller.memberId) ?? null;
    const canSeeList = open || tierAllows(caller.tier, 'recruit');
    const schedule = event.scheduleId
      ? await deps.raids.getSchedule(guildId, event.scheduleId)
      : null;
    return success({
      event,
      locksAt: locksAt(event, timingsFor(schedule)),
      counts: countByStatus(signups),
      mine,
      ...(canSeeList ? { signups } : {}),
    });
  },
});

export const raidList = command({
  name: 'raid-list',
  description:
    'Raids in a time window, soonest first, with signup counts, your own answer, and when ' +
    'signups lock. Defaults to open and locked raids in the next 14 days. Friends see open raids only.',
  tier: 'friend',
  input: z.object({
    from: instantSchema.optional(),
    to: instantSchema.optional(),
    statuses: z.array(z.enum(RAID_STATUSES)).min(1).default(['open', 'locked']),
    scheduleId: z.string().min(1).optional(),
  }),
  handler: async ({ from, to, statuses, scheduleId }, { caller, guildId, deps, now }) => {
    const start = from ?? now();
    const allEvents = await deps.raids.listEvents(guildId, {
      from: start,
      to: to ?? start + 14 * DAY_MS,
      statuses,
      ...(scheduleId ? { scheduleId } : {}),
    });
    const events = tierAllows(caller.tier, 'member')
      ? allEvents
      : allEvents.filter((e) => accessOf(e) === 'open');
    // Each schedule once, however many of its raids are in the window.
    const schedules = new Map<string, Promise<Schedule | null>>();
    const scheduleOf = (id: string | null) => {
      if (!id) return Promise.resolve(null);
      if (!schedules.has(id)) schedules.set(id, deps.raids.getSchedule(guildId, id));
      return schedules.get(id) ?? Promise.resolve(null);
    };
    const withCounts = await Promise.all(
      events.map(async (event) => {
        const [signups, schedule] = await Promise.all([
          deps.raids.listSignups(guildId, event.id),
          scheduleOf(event.scheduleId),
        ]);
        const mine = signups.find((s) => s.memberId === caller.memberId);
        return {
          event,
          counts: countByStatus(signups),
          myStatus: mine?.status ?? null,
          locksAt: locksAt(event, timingsFor(schedule)),
        };
      }),
    );
    return success(withCounts, {
      reasoning: `${events.length} raid${events.length === 1 ? '' : 's'}`,
    });
  },
});
