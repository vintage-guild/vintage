import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  ABSENCE_MAX_AHEAD_DAYS,
  ABSENCE_MAX_DAYS,
  ABSENCE_OPEN_MAX,
  ABSENCE_REASON_MAX,
  type Absence,
  type AbsenceCoverage,
  absenceCovers,
  LATE_MINUTES,
  type LateMinutes,
  localDateOf,
  parseCalendarDate,
  resolveAbsenceCoverage,
  resolveGuildClock,
  WEEKDAYS,
  type WeeklyNight,
} from '../contract';
import { command, type RaidsDeps } from '../store';
import { eventNotFound, isLeader, notSignedIn } from './shared';

const reasonSchema = z
  .string()
  .trim()
  .max(ABSENCE_REASON_MAX, { message: `Keep the reason to ${ABSENCE_REASON_MAX} characters` })
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const lateMinutesSchema = z.union([z.literal(5), z.literal(15), z.literal(30)]);

const weeklyNightInputSchema = z.object({
  day: z.enum(WEEKDAYS),
  type: z.enum(['away', 'late']),
  lateMinutes: lateMinutesSchema.nullable().optional(),
});

const absenceNotFound = () =>
  error('ABSENCE_NOT_FOUND', 'No such absence', {
    suggestion: 'Use absence-list to see active absences',
    retryable: false,
  });

const invalidDate = (detail: string) =>
  error('INVALID_DATE', detail, {
    suggestion: 'Use YYYY-MM-DD dates with the end date on or after the start date',
    retryable: false,
  });

const needsLeader = () =>
  error('FORBIDDEN', 'Only raid leaders and officers can manage someone else’s absences', {
    retryable: false,
  });

interface StillSignedUp {
  eventId: string;
  name: string;
  startsAt: number;
  status: string;
  coverage: Exclude<AbsenceCoverage, null>;
}

/** Find upcoming open/locked raids covered by `absence` where the member has a conflicting signup. */
async function findStillSignedUp(
  deps: RaidsDeps,
  guildId: string,
  memberId: string,
  absence: Absence,
  now: number,
): Promise<StillSignedUp[]> {
  const events = await deps.raids.listEvents(guildId, {
    from: now,
    statuses: ['open', 'locked'],
  });
  const out: StillSignedUp[] = [];
  for (const event of events) {
    const cov = absenceCovers(absence, event.startsAt);
    if (!cov) continue;
    const signup = await deps.raids.getSignupByMember(guildId, event.id, memberId);
    if (!signup) continue;
    if (cov === 'away' && signup.status !== 'declined') {
      out.push({
        eventId: event.id,
        name: event.name,
        startsAt: event.startsAt,
        status: signup.status,
        coverage: cov,
      });
    } else if (cov !== 'away' && signup.status === 'accepted') {
      out.push({
        eventId: event.id,
        name: event.name,
        startsAt: event.startsAt,
        status: signup.status,
        coverage: cov,
      });
    }
  }
  return out;
}

/** Sort a member's active absences: upcoming date ranges by `from`, then weekly rule. */
function sortMemberAbsences(absences: Absence[]): Absence[] {
  return [...absences].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dates' ? -1 : 1;
    if (a.kind === 'dates' && b.kind === 'dates') {
      return (a.from ?? '').localeCompare(b.from ?? '') || a.createdAt - b.createdAt;
    }
    return a.createdAt - b.createdAt;
  });
}

export const absenceAdd = command({
  name: 'absence-add',
  description:
    'Mark yourself (or, as a raid leader, another member) absent for a date range in the guild ' +
    'clock (`YYYY-MM-DD`, inclusive; `to` defaults to `from`). Never changes existing signups; ' +
    'returns `stillSignedUp` for covered raids where they already answered.',
  tier: 'recruit',
  mutation: true,
  input: z.object({
    from: z.string().trim().min(1),
    to: z.string().trim().min(1).optional(),
    reason: reasonSchema,
    memberId: z.string().min(1).optional(),
  }),
  handler: async ({ from, to, reason, memberId }, { caller, guildId, deps, now }) => {
    const leader = isLeader(caller);
    const targetMemberId = memberId ?? caller.memberId;
    if (!targetMemberId) return notSignedIn();
    if (memberId && memberId !== caller.memberId && !leader) return needsLeader();

    const fromDate = parseCalendarDate(from);
    if (!fromDate) return invalidDate(`"${from}" is not a valid YYYY-MM-DD date`);
    const toRaw = to ?? from;
    const toDate = parseCalendarDate(toRaw);
    if (!toDate) return invalidDate(`"${toRaw}" is not a valid YYYY-MM-DD date`);
    if (toDate.epochDay < fromDate.epochDay) {
      return invalidDate(`End date ${toRaw} is before start date ${from}`);
    }

    const at = now();
    const clock = resolveGuildClock(await deps.raids.listSchedules(guildId));
    const todayStr = localDateOf(at, clock.zone);
    const today = parseCalendarDate(todayStr)!;

    if (fromDate.epochDay < today.epochDay) {
      return error('ABSENCE_IN_PAST', 'That date has passed', {
        suggestion: `Pick ${todayStr} or later`,
        retryable: false,
      });
    }
    const spanDays = toDate.epochDay - fromDate.epochDay + 1;
    if (spanDays > ABSENCE_MAX_DAYS) {
      return error('ABSENCE_TOO_LONG', `Keep it to ${ABSENCE_MAX_DAYS} days`, {
        suggestion: 'Add another absence for the rest',
        retryable: false,
      });
    }
    if (fromDate.epochDay - today.epochDay > ABSENCE_MAX_AHEAD_DAYS) {
      return error('ABSENCE_TOO_FAR', 'Pick a date in the next 6 months', {
        retryable: false,
      });
    }

    const active = await deps.raids.listAbsences(guildId, {
      memberId: targetMemberId,
      activeOnly: true,
    });
    const openDates = active.filter((a) => a.kind === 'dates' && (a.to ?? '') >= todayStr);
    if (openDates.length >= ABSENCE_OPEN_MAX) {
      return error('TOO_MANY_ABSENCES', `You have ${ABSENCE_OPEN_MAX} already`, {
        suggestion: 'Remove one first with absence-remove',
        retryable: false,
      });
    }

    const absence = await deps.raids.insertAbsence({
      guildId,
      memberId: targetMemberId,
      kind: 'dates',
      from,
      to: toRaw,
      nights: null,
      timeZone: clock.zone,
      reason,
      createdBy: caller.memberId ?? caller.discordId ?? 'system',
      createdAt: at,
      endedAt: null,
    });
    await deps.events.emit(guildId, 'absence-changed', {
      absenceId: absence.id,
      memberId: targetMemberId,
      kind: 'dates',
      action: 'added',
    });
    const stillSignedUp = await findStillSignedUp(deps, guildId, targetMemberId, absence, at);
    return success(
      { absence, stillSignedUp },
      { reasoning: from === toRaw ? `Absent on ${from}` : `Absent ${from} to ${toRaw}` },
    );
  },
});

/** Validate and normalize weekly nights, or return a refusal error. */
function parseWeeklyNights(
  nights: z.infer<typeof weeklyNightInputSchema>[],
): { nights: WeeklyNight[] } | { failure: ReturnType<typeof error> } {
  const seen = new Set<string>();
  const normalized: WeeklyNight[] = [];
  for (const n of nights) {
    if (seen.has(n.day)) {
      return {
        failure: error('DUPLICATE_NIGHT', `Duplicate weekday "${n.day}"`, {
          suggestion: 'Pick each weekday as absent or late, not both',
          retryable: false,
        }),
      };
    }
    seen.add(n.day);
    if (n.type === 'late') {
      if (
        n.lateMinutes === undefined ||
        n.lateMinutes === null ||
        !(LATE_MINUTES as readonly number[]).includes(n.lateMinutes)
      ) {
        return {
          failure: error(
            'LATE_MINUTES_REQUIRED',
            `Late night "${n.day}" needs lateMinutes (5, 15, or 30)`,
            { retryable: false },
          ),
        };
      }
      normalized.push({ day: n.day, type: 'late', lateMinutes: n.lateMinutes as LateMinutes });
    } else {
      normalized.push({ day: n.day, type: 'away', lateMinutes: null });
    }
  }
  return { nights: normalized };
}

/** Resolve target memberId for an absence command, enforcing leader tier for others. */
function resolveTargetMember(
  memberId: string | undefined,
  caller: {
    memberId?: string;
    tier: 'public' | 'member' | 'recruit' | 'raider' | 'leader' | 'officer';
  },
  leader: boolean,
): { targetMemberId: string } | { failure: ReturnType<typeof error> } {
  const targetMemberId = memberId ?? caller.memberId;
  if (!targetMemberId) return { failure: notSignedIn() };
  if (memberId && memberId !== caller.memberId && !leader) return { failure: needsLeader() };
  return { targetMemberId };
}

/** List every member covered by an active absence for a specific raid. */
async function listCoveredForEvent(
  deps: RaidsDeps,
  guildId: string,
  eventId: string,
  callerMemberId: string | undefined,
  leader: boolean,
) {
  const event = await deps.raids.getEvent(guildId, eventId);
  if (!event) return eventNotFound();
  const all = await deps.raids.listAbsences(guildId, { activeOnly: true });
  const byMember = new Map<string, Absence[]>();
  for (const a of all) {
    const list = byMember.get(a.memberId) ?? [];
    list.push(a);
    byMember.set(a.memberId, list);
  }
  const covered: {
    memberId: string;
    displayName: string;
    coverage: Exclude<AbsenceCoverage, null>;
    absenceId: string;
    kind: Absence['kind'];
    reason: string | null;
  }[] = [];
  for (const [mId, list] of byMember) {
    const resolved = resolveAbsenceCoverage(list, event.startsAt);
    if (!resolved.coverage || !resolved.absence) continue;
    const member = await deps.members.getMember(guildId, mId);
    covered.push({
      memberId: mId,
      displayName: member?.displayName ?? mId,
      coverage: resolved.coverage,
      absenceId: resolved.absence.id,
      kind: resolved.absence.kind,
      reason: leader || mId === callerMemberId ? resolved.absence.reason : null,
    });
  }
  covered.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return success({ eventId, covered });
}

export const absenceWeeklySet = command({
  name: 'absence-weekly-set',
  description:
    'Set or clear your weekly absent and late nights (one weekly rule per member; replacing ' +
    'soft-closes the previous rule; `[]` clears it). Raid leaders may set another member’s rule. ' +
    'Returns `stillSignedUp` for covered raids.',
  tier: 'recruit',
  mutation: true,
  input: z.object({
    nights: z.array(weeklyNightInputSchema),
    reason: reasonSchema,
    memberId: z.string().min(1).optional(),
  }),
  handler: async ({ nights, reason, memberId }, { caller, guildId, deps, now }) => {
    const target = resolveTargetMember(memberId, caller, isLeader(caller));
    if ('failure' in target) return target.failure;
    const parsed = parseWeeklyNights(nights);
    if ('failure' in parsed) return parsed.failure;
    const normalized = parsed.nights;
    const { targetMemberId } = target;

    const at = now();
    const existing = await deps.raids.listAbsences(guildId, {
      memberId: targetMemberId,
      activeOnly: true,
    });
    const oldWeekly = existing.filter((a) => a.kind === 'weekly');
    for (const old of oldWeekly) {
      await deps.raids.endAbsence(guildId, old.id, at);
    }

    if (normalized.length === 0) {
      if (oldWeekly[0]) {
        await deps.events.emit(guildId, 'absence-changed', {
          absenceId: oldWeekly[0].id,
          memberId: targetMemberId,
          kind: 'weekly',
          action: 'removed',
        });
      }
      return success({ absence: null, stillSignedUp: [] }, { reasoning: 'Weekly nights cleared' });
    }

    const clock = resolveGuildClock(await deps.raids.listSchedules(guildId));
    // Late nights carry no reason (signup-improvements row 31); reason applies only when away nights exist.
    const hasAway = normalized.some((n) => n.type === 'away');
    const absence = await deps.raids.insertAbsence({
      guildId,
      memberId: targetMemberId,
      kind: 'weekly',
      from: null,
      to: null,
      nights: normalized,
      timeZone: clock.zone,
      reason: hasAway ? reason : null,
      createdBy: caller.memberId ?? caller.discordId ?? 'system',
      createdAt: at,
      endedAt: null,
    });
    await deps.events.emit(guildId, 'absence-changed', {
      absenceId: absence.id,
      memberId: targetMemberId,
      kind: 'weekly',
      action: 'weekly-set',
    });
    const stillSignedUp = await findStillSignedUp(deps, guildId, targetMemberId, absence, at);
    return success(
      { absence, stillSignedUp },
      {
        reasoning: `Weekly rule set (${normalized.length} night${normalized.length === 1 ? '' : 's'})`,
      },
    );
  },
});

export const absenceRemove = command({
  name: 'absence-remove',
  description:
    'Remove one of your active absences (soft-closes it with `endedAt`). Raid leaders may remove ' +
    'anyone’s.',
  tier: 'recruit',
  mutation: true,
  input: z.object({
    absenceId: z.string().min(1),
  }),
  handler: async ({ absenceId }, { caller, guildId, deps, now }) => {
    const leader = isLeader(caller);
    if (!caller.memberId && !leader) return notSignedIn();
    const existing = await deps.raids.getAbsence(guildId, absenceId);
    if (!existing || existing.endedAt !== null) return absenceNotFound();
    if (existing.memberId !== caller.memberId && !leader) return absenceNotFound();

    const removed = await deps.raids.endAbsence(guildId, absenceId, now());
    await deps.events.emit(guildId, 'absence-changed', {
      absenceId: removed.id,
      memberId: removed.memberId,
      kind: removed.kind,
      action: 'removed',
    });
    return success({ removed }, { reasoning: 'Absence removed' });
  },
});

export const absenceList = command({
  name: 'absence-list',
  description:
    'List active absences: yours with no filter, another member’s with `memberId` (leaders only), ' +
    'or everyone covered for a raid with `eventId` (names for all, reasons for leaders only).',
  tier: 'recruit',
  input: z.object({
    memberId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
  }),
  handler: async ({ memberId, eventId }, { caller, guildId, deps }) => {
    const leader = isLeader(caller);
    if (eventId) return listCoveredForEvent(deps, guildId, eventId, caller.memberId, leader);
    const target = resolveTargetMember(memberId, caller, leader);
    if ('failure' in target) return target.failure;
    const absences = sortMemberAbsences(
      await deps.raids.listAbsences(guildId, { memberId: target.targetMemberId, activeOnly: true }),
    );
    return success({ absences });
  },
});
