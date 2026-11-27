// Public surface of the coordinator module. Other modules import only this file.

import type { GuildRank } from '@vintage/identity/contract';
import type {
  EventKind,
  LateMinutes,
  RaidAccess,
  RoleTargets,
  RosterState,
  SignupStatus,
} from '@vintage/raids/contract';
import type { Role } from '@vintage/wow-data';

/** Guild-wide coordinator settings. Timings live on each raids schedule (PLAN §6.2). */
export interface CoordinatorConfig {
  guildId: string;
  /** Where guild-raid signup posts, reminders, and final rosters go (e.g. #raid-signups). */
  signupChannelId: string | null;
  /** Where open-raid (pug) signup posts go; falls back to signupChannelId when null. */
  openSignupChannelId: string | null;
  /** Raid-leader and officer channel for digests, party drafts, change alerts, and import strings; falls back to opsChannelId. */
  leadsChannelId: string | null;
  /** Officer channel for errors, admin notices, and weekly assessment (e.g. #vintage-ops). */
  opsChannelId: string | null;
  /** Ranks expected to answer every raid; the non-responders among them get reminded. */
  expectedRanks: GuildRank[];
  /** DM non-responders at the last reminder. Members can still opt out in their prefs. */
  dmReminders: boolean;
  /**
   * Discord role ids the channel reminder pings instead of each non-responder. Empty: ping the
   * non-responders by name (the default). With roles, the reminder still lists who hasn't
   * answered, as plain names that don't notify.
   */
  reminderRoleIds: string[];
  /**
   * Only non-responders with one of these ranks get the reminder DM; null DMs every
   * non-responder (the default). `['officer']` keeps DMs to officers while testing.
   */
  dmRanks: GuildRank[] | null;
  /**
   * Keep a Discord server event (the Events list) in step with each posted raid. Off by default;
   * the bot needs the CREATE_EVENTS permission first (SETUP.md).
   */
  serverEvents: boolean;
  /** Post the weekly roster and recruitment check to the ops channel (Mondays from 16:00 UTC). Off until an officer turns it on. */
  weeklyAssessment: boolean;
  /** Open a short anonymous feedback survey when a raid completes (#65). Off by default. */
  postRaidFeedbackSurvey: boolean;
  /**
   * Once the leads get the party draft, DM everyone signed up as Tentative to ask whether they
   * can make it, with buttons that update their signup. Off until an officer turns it on.
   */
  tentativeCheck: boolean;
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
    openSignupChannelId: null,
    leadsChannelId: null,
    opsChannelId: null,
    expectedRanks: [...DEFAULT_EXPECTED_RANKS],
    dmReminders: true,
    reminderRoleIds: [],
    dmRanks: null,
    serverEvents: false,
    weeklyAssessment: false,
    postRaidFeedbackSurvey: false,
    tentativeCheck: false,
    paused: false,
    updatedAt: 0,
  };
}

/**
 * What triggered an action: `post`, `remind-72h`, `dm-24h`, `digest`, `tentative-check`,
 * `tentative-answer` (logged when the member answers that DM), `lock`, `final-roster`,
 * `import-string`, `server-event`, `server-event-cancel`, or `raid-summary`. Together with the event and target it is the idempotency key.
 */
export type CoordinatorRule = string;

/** How long after a raid starts its recorded export still gets a summary post (#221). */
export const SUMMARY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * The tentative-check DM's buttons: `tentative-check:<eventId>:<answer>`. `yes` answers Going,
 * `no` answers Absent, and `unsure` leaves the signup Tentative (apps/api/src/discord-tentative.ts).
 */
export const TENTATIVE_CHECK_PREFIX = 'tentative-check';
/** The log rule for a member's answer to the tentative-check DM; its detail says what they chose. */
export const TENTATIVE_ANSWER_RULE = 'tentative-answer';
export const TENTATIVE_ANSWERS = ['yes', 'no', 'unsure'] as const;
export type TentativeAnswer = (typeof TENTATIVE_ANSWERS)[number];

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
  /** The kind of event the winner becomes; nights from before kinds existed are raids. */
  kind: EventKind;
  /** Guild raid or open (pugs welcome); nights from before access existed are guild. */
  access: RaidAccess;
  /** Null: an open `other` event (no cap, no queue). */
  size: number | null;
  /** Carried to the event; null means the kind's default. */
  roleTargets: RoleTargets | null;
  durationMinutes: number;
  createdBy: string;
  createdAt: number;
  outcome: RaidNightOutcome;
  /** The raid created from the winner, once `created`. */
  raidEventId: string | null;
  /** Why it ended the way it did, in words, once resolved. */
  detail: string | null;
}

/**
 * Last announced state for one member on one raid, seeded at T-24h digest and updated after each
 * `#leads` change post (signup-improvements §4, row 9).
 */
export interface AnnouncedMemberState {
  guildId: string;
  eventId: string;
  memberId: string;
  signupId: string | null;
  characterName: string | null;
  class: string | null;
  spec: string | null;
  role: Role | null;
  status: SignupStatus | null;
  lateMinutes: LateMinutes | null;
  note: string | null;
  seated: boolean;
  group: number | null;
  roster: RosterState | null;
  updatedAt: number;
  updatedBy: string | null;
  absenceSummary: string | null;
  /** For the sentinel `__raid__` metadata row: last announced event size and comp targets. */
  eventSize?: number | null;
  eventRoleTargets?: RoleTargets | null;
  announcedAt: number;
}

/** Events the coordinator emits on the core event bus (PLAN §4.3). None yet. */
export type CoordinatorEvents = Record<never, never>;
