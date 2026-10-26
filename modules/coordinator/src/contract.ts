// Public surface of the coordinator module. Other modules import only this file.

import type { GuildRank } from '@vintage/identity/contract';
import type { RaidSize } from '@vintage/raids/contract';

/** Guild-wide coordinator settings. Timings live on each raids schedule (PLAN §6.2). */
export interface CoordinatorConfig {
  guildId: string;
  /** Where signup posts, reminders, and final rosters go (e.g. #raid-signups). */
  signupChannelId: string | null;
  /** Officer channel for digests, addon strings, and failures (e.g. #vintage-ops). */
  opsChannelId: string | null;
  /** Ranks expected to answer every raid; the non-responders among them get reminded. */
  expectedRanks: GuildRank[];
  /** DM non-responders at the last reminder. Members can still opt out in their prefs. */
  dmReminders: boolean;
  /** Paused: ticks do nothing until resumed. */
  paused: boolean;
  updatedAt: number;
}

export const DEFAULT_EXPECTED_RANKS: GuildRank[] = [
  'officer',
  'raid-leader',
  'raider',
  'flex-raider',
];

export function defaultConfig(guildId: string): CoordinatorConfig {
  return {
    guildId,
    signupChannelId: null,
    opsChannelId: null,
    expectedRanks: [...DEFAULT_EXPECTED_RANKS],
    dmReminders: true,
    paused: false,
    updatedAt: 0,
  };
}

/**
 * What triggered an action: `post`, `remind-72h`, `dm-24h`, `digest`, `lock`, `final-roster`,
 * or `import-string`. Together with the event and target it is the idempotency key.
 */
export type CoordinatorRule = string;

export const ACTION_STATUSES = ['pending', 'sent', 'skipped', 'failed'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** One thing the coordinator did (or decided not to do), and why: the answer to "why did the bot ping me?". */
export interface CoordinatorAction {
  id: string;
  guildId: string;
  eventId: string;
  rule: CoordinatorRule;
  /** A Discord channel id, a member id (DMs), or the event id (lock). */
  target: string;
  status: ActionStatus;
  discordMessageId: string | null;
  /** Why it was skipped or failed, or a short note. */
  detail: string | null;
  /** For the signup post: hash of what was last rendered, so edits happen only on change. */
  renderHash: string | null;
  claimedAt: number;
  finishedAt: number | null;
}

export const COORDINATOR_COMMANDS = [
  'coordinator-status',
  'coordinator-pause',
  'coordinator-resume',
  'coordinator-run',
  'coordinator-config-set',
  'coordinator-log',
  'coordinator-repost',
  'raid-night-poll',
  'addon-import-get',
] as const;
export type CoordinatorCommandName = (typeof COORDINATOR_COMMANDS)[number];

/** The polls tag the coordinator owns: polls it opened to pick a raid night. */
export const RAID_NIGHT_TAG = 'raid-night';

export const RAID_NIGHT_OUTCOMES = ['pending', 'created', 'unresolved', 'cancelled'] as const;
/**
 * `pending` until its poll closes; then `created` (the winning time became a raid),
 * `unresolved` (a tie, no quorum, no votes, or the time had passed; officers are told), or
 * `cancelled` (the poll was cancelled).
 */
export type RaidNightOutcome = (typeof RAID_NIGHT_OUTCOMES)[number];

/**
 * A raid-night poll: the raid to create once members pick a time. The poll holds the candidate
 * start times (each option's `value`); this holds everything else about the raid.
 */
export interface RaidNight {
  id: string;
  guildId: string;
  pollId: string;
  name: string;
  instance: string;
  size: RaidSize;
  durationMinutes: number;
  createdBy: string;
  createdAt: number;
  outcome: RaidNightOutcome;
  /** The raid created from the winner, once `created`. */
  raidEventId: string | null;
  /** Why it ended the way it did, in words, once resolved. */
  detail: string | null;
}

/** Events the coordinator emits on the core event bus (PLAN §4.3). None yet. */
export type CoordinatorEvents = Record<never, never>;
