// Public surface of the coordinator module. Other modules import only this file.

import type { GuildRank } from '@vintage/identity/contract';

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
] as const;
export type CoordinatorCommandName = (typeof COORDINATOR_COMMANDS)[number];

/** Events the coordinator emits on the core event bus (PLAN §4.3). None yet. */
export type CoordinatorEvents = Record<never, never>;
