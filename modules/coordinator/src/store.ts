import type { MessageData } from '@vintage/discord-kit';
import { commandsFor } from '@vintage/guild-kit';
import type { GuildRank } from '@vintage/identity/contract';
import type { RaidEvent, ScheduleTimings, Signup } from '@vintage/raids/contract';
import type { ActionStatus, CoordinatorAction, CoordinatorConfig } from './contract';

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

export interface CoordinatorDeps {
  coordinator: CoordinatorStore;
  tickSource: TickSource;
  scheduler: TickScheduler;
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
}

/** Everything the tick executor needs (PLAN §6.1). */
export interface TickPorts {
  store: CoordinatorStore;
  source: TickSource;
  raids: CoordinatorRaids;
  discord: CoordinatorDiscord;
}

export const command = commandsFor<CoordinatorDeps>();
