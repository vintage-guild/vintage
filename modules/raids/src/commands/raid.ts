import { roleTargetsSchema, type SignupStatus } from '@vintage/comp-solver';
import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import { kindNoun, RAID_STATUSES, type Signup } from '../contract';
import { command } from '../store';
import {
  eventNotFound,
  eventSizeSchema,
  instantSchema,
  isLive,
  kindSchema,
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
    'dungeon (5), a battleground (10, 15 or 40), or another event (1 to 40). roleTargets ' +
    'default to the kind: raid comps by size, 1 tank/1 healer/3 dps for dungeons, no tank ' +
    'for battlegrounds, none for other.',
  tier: 'leader',
  mutation: true,
  input: z.object({
    name: z.string().trim().min(1).max(60),
    instance: z.string().trim().min(1).max(60),
    kind: kindSchema.default('raid'),
    size: eventSizeSchema,
    startsAt: instantSchema,
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(8 * 60)
      .default(180),
    roleTargets: roleTargetsSchema.nullable().default(null),
    lootMethodId: z.string().min(1).nullable().default(null),
  }),
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
      configVersion: 1,
    });
    return success(event, {
      reasoning: `${event.name} (${event.size}-player ${kindNoun(event.kind)}) is open for signups`,
    });
  },
});

export const raidReschedule = command({
  name: 'raid-reschedule',
  description: 'Move a raid to a new start time. Signups and roster are kept.',
  tier: 'leader',
  mutation: true,
  input: z.object({ eventId: z.string().min(1), startsAt: instantSchema }),
  handler: async ({ eventId, startsAt }, { guildId, deps, now }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    if (!isLive(event)) return raidClosed(event);
    if (startsAt <= now()) return inPast();
    const updated = await deps.raids.updateEvent(guildId, eventId, { startsAt });
    return success(updated, { reasoning: `${updated.name} moved; signups kept` });
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
    'One raid with signup counts and your own signup. Recruits and up see the full signup list.',
  tier: 'member',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { caller, guildId, deps }) => {
    const event = await deps.raids.getEvent(guildId, eventId);
    if (!event) return eventNotFound();
    const signups = await deps.raids.listSignups(guildId, eventId);
    const mine = signups.find((s) => s.memberId === caller.memberId) ?? null;
    const canSeeList = tierAllows(caller.tier, 'recruit');
    return success({
      event,
      counts: countByStatus(signups),
      mine,
      ...(canSeeList ? { signups } : {}),
    });
  },
});

export const raidList = command({
  name: 'raid-list',
  description:
    'Raids in a time window, soonest first. Defaults to open and locked raids in the next 14 days.',
  tier: 'member',
  input: z.object({
    from: instantSchema.optional(),
    to: instantSchema.optional(),
    statuses: z.array(z.enum(RAID_STATUSES)).min(1).default(['open', 'locked']),
    scheduleId: z.string().min(1).optional(),
  }),
  handler: async ({ from, to, statuses, scheduleId }, { caller, guildId, deps, now }) => {
    const start = from ?? now();
    const events = await deps.raids.listEvents(guildId, {
      from: start,
      to: to ?? start + 14 * DAY_MS,
      statuses,
      ...(scheduleId ? { scheduleId } : {}),
    });
    const withCounts = await Promise.all(
      events.map(async (event) => {
        const signups = await deps.raids.listSignups(guildId, event.id);
        const mine = signups.find((s) => s.memberId === caller.memberId);
        return { event, counts: countByStatus(signups), myStatus: mine?.status ?? null };
      }),
    );
    return success(withCounts, {
      reasoning: `${events.length} raid${events.length === 1 ? '' : 's'}`,
    });
  },
});
