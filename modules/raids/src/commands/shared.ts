import { groupSizeSchema, type RoleTargets } from '@vintage/comp-solver';
import { type Caller, error, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import {
  AKind,
  aKind,
  EVENT_KINDS,
  type EventKind,
  type RaidEvent,
  sizeFits,
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

/** A size the kind doesn't allow (a 7-player dungeon), or null when it fits. */
export function sizeForKind(kind: EventKind, size: number) {
  if (sizeFits(kind, size)) return null;
  return error('SIZE_NOT_ALLOWED', `${AKind(kind)} can't be ${size} players`, {
    suggestion: `Use a size of ${sizesText(kind)} for ${aKind(kind)}, or pick kind "other"`,
    retryable: false,
  });
}

/** A target total above the event size can never be met. */
export function targetsTooBig(size: number, targets: RoleTargets | null) {
  if (!targets || targets.tank + targets.healer + targets.dps <= size) return null;
  return error('ROLE_TARGETS_TOO_BIG', `Role targets add up to more than ${size}`, {
    suggestion: 'Lower the tank, healer, or dps targets so they fit the size',
    retryable: false,
  });
}
