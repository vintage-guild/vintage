import { roleTargetsSchema } from '@vintage/comp-solver';
import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { type RaidEvent, type Schedule, WEEKDAYS } from '../contract';
import { isValidTime, isValidTimeZone, occurrences } from '../domain/recurrence';
import { command } from '../store';
import {
  eventSizeSchema,
  instanceForKind,
  kindRules,
  kindSchema,
  scheduleNotFound,
  sizeForKind,
  targetsTooBig,
} from './shared';

const DAY_MS = 24 * 60 * 60 * 1000;

const timeSchema = z.string().refine(isValidTime, { message: 'Use 24-hour HH:MM, e.g. "20:00"' });
const timeZoneSchema = z
  .string()
  .refine(isValidTimeZone, { message: 'Use an IANA time zone, e.g. "America/New_York"' });
const weekdaysSchema = z.array(z.enum(WEEKDAYS)).min(1);
const reminderHoursSchema = z
  .array(
    z
      .number()
      .int()
      .min(1)
      .max(14 * 24),
  )
  .max(5);

const scheduleFields = {
  name: z.string().trim().min(1).max(60),
  // Empty and null only for kind `other` (kindRules on create, the merged check on update).
  instance: z.string().trim().max(60),
  kind: kindSchema,
  size: eventSizeSchema.nullable(),
  weekdays: weekdaysSchema,
  time: timeSchema,
  timeZone: timeZoneSchema,
  durationMinutes: z
    .number()
    .int()
    .min(30)
    .max(8 * 60),
  leadDays: z.number().int().min(1).max(28),
  reminderHours: reminderHoursSchema,
  lockHours: z.number().int().min(0).max(72),
  roleTargets: roleTargetsSchema.nullable(),
  lootMethodId: z.string().min(1).nullable(),
};

export const scheduleCreate = command({
  name: 'schedule-create',
  description:
    'Create a recurring raid night, e.g. Molten Core every Tuesday and Thursday at 20:00 New York ' +
    'time, or a weekly dungeon, battleground, or other event with kind (default raid; other may ' +
    'leave out size and instance). Events are created ahead of time by schedule-materialize.',
  tier: 'leader',
  mutation: true,
  input: z
    .object({
      ...scheduleFields,
      instance: scheduleFields.instance.default(''),
      kind: scheduleFields.kind.default('raid'),
      size: scheduleFields.size.default(null),
      durationMinutes: scheduleFields.durationMinutes.default(180),
      leadDays: scheduleFields.leadDays.default(7),
      reminderHours: scheduleFields.reminderHours.default([72, 24]),
      lockHours: scheduleFields.lockHours.default(2),
      roleTargets: scheduleFields.roleTargets.default(null),
      lootMethodId: scheduleFields.lootMethodId.default(null),
    })
    .superRefine(kindRules),
  handler: async (input, { guildId, deps }) => {
    const invalid =
      sizeForKind(input.kind, input.size) ?? targetsTooBig(input.size, input.roleTargets);
    if (invalid) return invalid;
    const schedule = await deps.raids.insertSchedule({
      guildId,
      name: input.name,
      instance: input.instance,
      kind: input.kind,
      size: input.size,
      recurrence: { weekdays: input.weekdays, time: input.time, timeZone: input.timeZone },
      durationMinutes: input.durationMinutes,
      timings: {
        leadDays: input.leadDays,
        reminderHours: [...input.reminderHours].sort((a, b) => b - a),
        lockHours: input.lockHours,
      },
      roleTargets: input.roleTargets,
      lootMethodId: input.lootMethodId,
      active: true,
      configVersion: 1,
    });
    return success(schedule, {
      reasoning: `${schedule.name}: ${input.weekdays.join('/')} at ${input.time} ${input.timeZone}`,
    });
  },
});

export const scheduleUpdate = command({
  name: 'schedule-update',
  description:
    'Change a schedule (time, days, kind, size, timings, comp targets) or pause it with active: false. ' +
    'Raids already created keep their time; use raid-reschedule for those.',
  tier: 'leader',
  mutation: true,
  input: z.object({
    scheduleId: z.string().min(1),
    ...z.object(scheduleFields).partial().shape,
    active: z.boolean().optional(),
  }),
  handler: async ({ scheduleId, ...input }, { guildId, deps }) => {
    const current = await deps.raids.getSchedule(guildId, scheduleId);
    if (!current) return scheduleNotFound();
    // The merged schedule must still make sense: null size means open, so it isn't `??`.
    const kind = input.kind ?? current.kind;
    const size = input.size === undefined ? current.size : input.size;
    const invalid =
      sizeForKind(kind, size) ??
      instanceForKind(kind, input.instance ?? current.instance) ??
      targetsTooBig(
        size,
        input.roleTargets === undefined ? current.roleTargets : input.roleTargets,
      );
    if (invalid) return invalid;

    const { weekdays, time, timeZone, leadDays, reminderHours, lockHours, ...rest } = input;
    const patch: Partial<Schedule> = {
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
      recurrence: {
        weekdays: weekdays ?? current.recurrence.weekdays,
        time: time ?? current.recurrence.time,
        timeZone: timeZone ?? current.recurrence.timeZone,
      },
      timings: {
        leadDays: leadDays ?? current.timings.leadDays,
        reminderHours: [...(reminderHours ?? current.timings.reminderHours)].sort((a, b) => b - a),
        lockHours: lockHours ?? current.timings.lockHours,
      },
      configVersion: current.configVersion + 1,
    };
    const updated = await deps.raids.updateSchedule(guildId, scheduleId, patch);
    return success(updated, {
      reasoning: `${updated.name} is now version ${updated.configVersion}`,
    });
  },
});

export const scheduleList = command({
  name: 'schedule-list',
  description: 'List raid schedules (active ones unless includeInactive).',
  tier: 'member',
  input: z.object({ includeInactive: z.boolean().default(false) }),
  handler: async ({ includeInactive }, { guildId, deps }) =>
    success(await deps.raids.listSchedules(guildId, includeInactive ? {} : { active: true })),
});

export const scheduleMaterialize = command({
  name: 'schedule-materialize',
  description:
    'Create the raid events each active schedule needs over its lead window (default 7 days). ' +
    'Safe to run repeatedly: an occurrence that already has an event, even a cancelled one, is skipped.',
  tier: 'leader',
  mutation: true,
  input: z.object({ scheduleId: z.string().min(1).optional() }),
  handler: async ({ scheduleId }, { guildId, deps, now }) => {
    let schedules: Schedule[];
    if (scheduleId) {
      const one = await deps.raids.getSchedule(guildId, scheduleId);
      if (!one) return scheduleNotFound();
      schedules = one.active ? [one] : [];
    } else {
      schedules = await deps.raids.listSchedules(guildId, { active: true });
    }

    const from = now();
    const created: RaidEvent[] = [];
    for (const schedule of schedules) {
      const to = from + schedule.timings.leadDays * DAY_MS;
      const existing = new Set(
        (await deps.raids.listEvents(guildId, { scheduleId: schedule.id, from, to })).map(
          (e) => e.startsAt,
        ),
      );
      for (const startsAt of occurrences(schedule.recurrence, from, to)) {
        if (existing.has(startsAt)) continue;
        created.push(
          await deps.raids.insertEvent({
            guildId,
            scheduleId: schedule.id,
            name: schedule.name,
            instance: schedule.instance,
            kind: schedule.kind,
            size: schedule.size,
            startsAt,
            durationMinutes: schedule.durationMinutes,
            status: 'open',
            roleTargets: schedule.roleTargets,
            lootMethodId: schedule.lootMethodId,
            configVersion: schedule.configVersion,
          }),
        );
      }
    }
    return success(
      { created },
      {
        reasoning: created.length
          ? `Created ${created.length} raid${created.length === 1 ? '' : 's'}`
          : 'Every upcoming raid already exists',
      },
    );
  },
});
