import { type Caller, error, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import type { RaidEvent } from '../contract';

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
