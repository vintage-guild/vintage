import type { MessageData } from '@vintage/discord-kit';
import { type Caller, type CommandResult, commandsFor } from '@vintage/guild-kit';
import type { GuildRank } from '@vintage/identity/contract';
import type { Poll } from '@vintage/polls/contract';
import type { RaidEvent, RaidSize, ScheduleTimings, Signup } from '@vintage/raids/contract';
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

/** Everything one tick needs, read in one go. */
export interface TickState {
  guildId: string;
  config: CoordinatorConfig;
  /** Upcoming open or locked raids, soonest first. */
  events: TickEvent[];
  members: TickMember[];
  /** Actions logged for those raids. */
  actions: CoordinatorAction[];
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
      size: RaidSize;
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
}

export const command = commandsFor<CoordinatorDeps>();
