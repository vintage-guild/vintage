import { groupSizeSchema, type RoleTargets } from '@vintage/comp-solver';
import { type Caller, error, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  AKind,
  aKind,
  EVENT_KINDS,
  type EventKind,
  instanceOptional,
  type RaidEvent,
  sizeFits,
  sizeOptional,
  sizesText,
} from '../contract';

/** The kind of event; `raid` when left out. */
export const kindSchema = z.enum(EVENT_KINDS);

export const eventNotFound = () =>
  error('RAID_NOT_FOUND', 'No such raid', {
    suggestion: 'Use raid-list to find the raid id',
    retryable: false,
  });

export const scheduleNotFound = () =>
  error('SCHEDULE_NOT_FOUND', 'No such schedule', {
    suggestion: 'Use schedule-list to find the schedule id',
    retryable: false,
  });

export const signupNotFound = () =>
  error('SIGNUP_NOT_FOUND', 'No such signup', {
    suggestion: 'Use signup-list for the raid to find the signup id',
    retryable: false,
  });

export const notSignedIn = () =>
  error('NOT_SIGNED_IN', 'Sign in with Discord first', {
    suggestion: 'Sign in on the website, or link your Discord account',
    retryable: false,
  });

export const raidClosed = (event: RaidEvent) =>
  error('RAID_CLOSED', `${event.name} is ${event.status}`, {
    suggestion:
      event.status === 'locked'
        ? 'Signups are locked; ask a raid leader to change it'
        : 'Pick an upcoming raid with raid-list',
    retryable: false,
  });

/** Raid leaders and officers run the night: roster, schedules, overrides. */
export const isLeader = (caller: Caller) => tierAllows(caller.tier, 'leader');

/** A raid that can still change (not cancelled or completed). */
export const isLive = (event: RaidEvent) => event.status === 'open' || event.status === 'locked';

/** Epoch ms, or an ISO 8601 date-time with an offset (`2026-11-10T20:00:00-05:00`). */
export const instantSchema = z
  .union([z.number().int().positive(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === 'number' ? value : Date.parse(value)));

/** Players in an event: 1 to 40 here, then checked against the kind by `sizeForKind`. */
export const eventSizeSchema = groupSizeSchema;

/**
 * Size for create inputs: 1 to 40, or left out (null) for an open `other` event. Which kinds may
 * leave it out is `kindRules`' job.
 */
export const optionalSizeSchema = groupSizeSchema
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Instance for create inputs: free text, left out (empty) only for `other` (`kindRules`). */
export const optionalInstanceSchema = z.string().trim().max(60).default('');

/**
 * What the kind requires, as Zod issues so the schema stays the source of truth: every kind but
 * `other` needs a size and an instance. Whether a given size fits the kind is `sizeForKind`.
 */
export function kindRules(
  input: { kind: EventKind; size: number | null; instance: string },
  ctx: z.RefinementCtx,
): void {
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
}

/** A size the kind doesn't allow (a 7-player dungeon, a raid with none), or null when it fits. */
export function sizeForKind(kind: EventKind, size: number | null) {
  if (sizeFits(kind, size)) return null;
  const what = size === null ? 'have no size' : `be ${size} players`;
  return error('SIZE_NOT_ALLOWED', `${AKind(kind)} can't ${what}`, {
    suggestion: `Use a size of ${sizesText(kind)} for ${aKind(kind)}, or pick kind "other"`,
    retryable: false,
  });
}

/** Every kind but `other` names its instance (schedule-update checks the merged values). */
export function instanceForKind(kind: EventKind, instance: string) {
  if (instance || instanceOptional(kind)) return null;
  return error('INSTANCE_REQUIRED', `${AKind(kind)} needs an instance`, {
    suggestion: 'Give the instance, e.g. Molten Core, or pick kind "other"',
    retryable: false,
  });
}

/** A target total above the event size can never be met; an open event has no cap. */
export function targetsTooBig(size: number | null, targets: RoleTargets | null) {
  if (!targets || size === null || targets.tank + targets.healer + targets.dps <= size) return null;
  return error('ROLE_TARGETS_TOO_BIG', `Role targets add up to more than ${size}`, {
    suggestion: 'Lower the tank, healer, or dps targets so they fit the size',
    retryable: false,
  });
}
