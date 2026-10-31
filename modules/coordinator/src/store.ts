import type { DecisionsPort } from '@vintage/decisions';
import type { MessageData, ScheduledEventData } from '@vintage/discord-kit';
import { type Caller, type CommandResult, commandsFor } from '@vintage/guild-kit';
import type { GuildRank } from '@vintage/identity/contract';
import type { Poll } from '@vintage/polls/contract';
import type {
  EventKind,
  RaidEvent,
  RaidRecord,
  RoleTargets,
  ScheduleTimings,
  Signup,
} from '@vintage/raids/contract';
import type { ClassNeed } from '@vintage/site/contract';
import type {
  ActionStatus,
  CoordinatorAction,
  CoordinatorConfig,
  RaidNight,
  RaidNightOutcome,
} from './contract';

export interface ActionKey {
  guildId: string;
  eventId: string;
  rule: string;
  target: string;
}

/** The coordinator's own data: config and the action log. */
export interface CoordinatorStore {
  /** The guild's config, or the defaults when none was saved. */
  getConfig(guildId: string): Promise<CoordinatorConfig>;
  setConfig(
    guildId: string,
    patch: Partial<Omit<CoordinatorConfig, 'guildId' | 'updatedAt'>>,
    now: number,
  ): Promise<CoordinatorConfig>;
  /** Newest first. */
  listActions(
    guildId: string,
    filter?: { eventIds?: string[]; limit?: number },
  ): Promise<CoordinatorAction[]>;
  /**
   * Atomically take the right to perform an action. Returns null when it was already sent or
   * skipped, or another tick claimed it in the last `staleMs`. A failed or stale claim is retaken
   * (`retry: true`).
   */
  claimAction(
    key: ActionKey,
    now: number,
    staleMs: number,
  ): Promise<{ action: CoordinatorAction; retry: boolean } | null>;
  completeAction(
    guildId: string,
    actionId: string,
    result: {
      status: Exclude<ActionStatus, 'pending'>;
      discordMessageId?: string | null;
      detail?: string | null;
      renderHash?: string | null;
    },
    now: number,
  ): Promise<CoordinatorAction>;
  setRenderHash(guildId: string, actionId: string, renderHash: string): Promise<void>;

  /** Oldest first. */
  listRaidNights(guildId: string, filter?: { outcome?: RaidNightOutcome }): Promise<RaidNight[]>;
  insertRaidNight(raidNight: Omit<RaidNight, 'id'>): Promise<RaidNight>;
  updateRaidNight(
    guildId: string,
    raidNightId: string,
    patch: Partial<Pick<RaidNight, 'outcome' | 'raidEventId' | 'detail'>>,
  ): Promise<RaidNight>;
}

/** A guild member as the coordinator sees them. */
export interface TickMember {
  memberId: string;
  discordId: string;
  displayName: string;
  rank: GuildRank | null;
  dmOptOut: boolean;
}

export interface TickEvent {
  event: RaidEvent;
  /** The schedule's timings, or the raids defaults for one-off raids. */
  timings: ScheduleTimings;
  signups: Signup[];
}

/** A drop as the raid summary shows it; apps/api reads it from the loot module. */
export interface TickDrop {
  itemId: number;
  itemName: string | null;
  count: number;
  looter: string;
}

/** A raid with a recorded addon export (raid-export-record), for its summary post (#221). */
export interface TickRecorded {
  /** The raid; its signups and timings don't matter to the summary. */
  tick: TickEvent;
  record: RaidRecord;
  /** Who came, as the game named them, sorted by name. */
  attended: string[];
  /** What dropped, in the order it was looted. */
  drops: TickDrop[];
}

/** Everything one tick needs, read in one go. */
export interface TickState {
  guildId: string;
  config: CoordinatorConfig;
  /** Upcoming open or locked raids, soonest first. */
  events: TickEvent[];
  members: TickMember[];
  /** Actions logged for those raids (and for `cancelled`). */
  actions: CoordinatorAction[];
  /**
   * Upcoming raids that were cancelled, so their Discord server events can be cancelled too.
   * Absent means none (sources that predate server events).
   */
  cancelled?: TickEvent[];
  /**
   * Raids that started in the last `SUMMARY_WINDOW_MS` and have a recorded export, for their
   * summary posts. Absent means none (sources that predate the summary).
   */
  recorded?: TickRecorded[];
}

/** Reads raids, identity, and the coordinator's log. apps/api adapts this over the stores. */
export interface TickSource {
  load(guildId: string, now: number): Promise<TickState>;
}

/** Starts a tick outside the current transaction (it calls Discord). */
export interface TickScheduler {
  runTickNow(guildId: string): Promise<void>;
}

/**
 * What the coordinator asks of polls. apps/api runs these as polls commands through the registry:
 * `create` as the leader who asked (poll-create, then the post in Discord), `get` as the system.
 * The coordinator never touches polls tables (PLAN §4.3).
 */
export interface CoordinatorPolls {
  create(
    caller: Caller,
    input: Record<string, unknown>,
    channelId: string | null,
  ): Promise<CommandResult<Poll>>;
  get(guildId: string, pollId: string): Promise<Poll | null>;
}

export interface CoordinatorDeps {
  coordinator: CoordinatorStore;
  tickSource: TickSource;
  scheduler: TickScheduler;
  coordinatorPolls: CoordinatorPolls;
}

/** What a tick does to Discord. */
export interface CoordinatorDiscord {
  post(channelId: string, message: MessageData): Promise<{ id: string }>;
  edit(channelId: string, messageId: string, message: MessageData): Promise<void>;
  dm(discordUserId: string, message: MessageData): Promise<{ id: string }>;
  remove(channelId: string, messageId: string): Promise<void>;
  /** Create an EXTERNAL server event in the guild's Discord server (needs CREATE_EVENTS). */
  createEvent(event: ScheduledEventData): Promise<{ id: string }>;
  /** Change a server event: new details, or `status` to cancel it. */
  editEvent(discordEventId: string, patch: Partial<ScheduledEventData>): Promise<void>;
}

/** What a tick asks raids to do; apps/api runs these as raids commands with the system caller. */
export interface CoordinatorRaids {
  materialize(guildId: string): Promise<void>;
  lock(guildId: string, eventId: string): Promise<void>;
  /**
   * raid-create as the system caller, and mark the raid night `created` with the new raid, in one
   * transaction: a retry after a failure can never create the raid twice.
   */
  createForRaidNight(
    guildId: string,
    raidNightId: string,
    raid: {
      name: string;
      instance: string;
      kind: EventKind;
      size: number | null;
      roleTargets: RoleTargets | null;
      startsAt: number;
      durationMinutes: number;
    },
    detail: string,
  ): Promise<{ id: string }>;
}

/** Everything the tick executor needs (PLAN §6.1). */
export interface TickPorts {
  store: CoordinatorStore;
  source: TickSource;
  raids: CoordinatorRaids;
  discord: CoordinatorDiscord;
  polls: Pick<CoordinatorPolls, 'get'>;
  /** Labels signup notes for the digest (#132). Absent or null: notes stay raw. */
  decisions?: DecisionsPort | null;
  /** Where server events link to: the signup card (needs the Discord server id), else the site. */
  links?: { discordGuildId: string | null; siteUrl: string | null };
  /** The site's recruiting needs, for the weekly assessment (#130). Absent: none listed. */
  recruiting?: { needs(guildId: string): Promise<ClassNeed[]> };
  /** Rewords the assessment's facts (AI); null or a throw keeps the facts as written. */
  wording?: { write(instructions: string, facts: string): Promise<string | null> };
}

export const command = commandsFor<CoordinatorDeps>();
