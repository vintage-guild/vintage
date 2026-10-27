import {
  DiscordRestError,
  type LayoutComponent,
  layoutText,
  type MessageData,
  type ScheduledEventData,
  ScheduledEventStatus,
  UNKNOWN_SCHEDULED_EVENT,
} from '@vintage/discord-kit';
import type { Poll } from '@vintage/polls/contract';
import {
  type CoordinatorAction,
  type CoordinatorConfig,
  defaultConfig,
  type RaidNight,
} from './contract';
import type {
  CoordinatorDeps,
  CoordinatorDiscord,
  CoordinatorPolls,
  CoordinatorRaids,
  CoordinatorStore,
  TickSource,
  TickState,
} from './store';

/** In-memory CoordinatorStore. Same behavior contract as the Convex component. */
export function createMemoryCoordinatorStore(): CoordinatorStore & {
  configs: Map<string, CoordinatorConfig>;
  actions: Map<string, CoordinatorAction>;
  raidNights: Map<string, RaidNight>;
} {
  const configs = new Map<string, CoordinatorConfig>();
  const actions = new Map<string, CoordinatorAction>();
  const raidNights = new Map<string, RaidNight>();
  let seq = 0;

  return {
    configs,
    actions,
    raidNights,
    async getConfig(guildId) {
      return configs.get(guildId) ?? defaultConfig(guildId);
    },
    async setConfig(guildId, patch, now) {
      const next = { ...(await this.getConfig(guildId)), ...patch, guildId, updatedAt: now };
      configs.set(guildId, next);
      return next;
    },
    async listActions(guildId, filter = {}) {
      const ids = filter.eventIds && new Set(filter.eventIds);
      return [...actions.values()]
        .filter((a) => a.guildId === guildId && (!ids || ids.has(a.eventId)))
        .sort((a, b) => b.claimedAt - a.claimedAt || b.id.localeCompare(a.id))
        .slice(0, filter.limit ?? Number.POSITIVE_INFINITY);
    },
    async claimAction(key, now, staleMs) {
      const existing = [...actions.values()].find(
        (a) =>
          a.guildId === key.guildId &&
          a.eventId === key.eventId &&
          a.rule === key.rule &&
          a.target === key.target,
      );
      if (existing) {
        const settled = existing.status === 'sent' || existing.status === 'skipped';
        const fresh = existing.status === 'pending' && now - existing.claimedAt < staleMs;
        if (settled || fresh) return null;
        const retaken = {
          ...existing,
          status: 'pending' as const,
          claimedAt: now,
          finishedAt: null,
        };
        actions.set(existing.id, retaken);
        return { action: retaken, retry: true };
      }
      const action: CoordinatorAction = {
        ...key,
        id: `action_${++seq}`,
        status: 'pending',
        discordMessageId: null,
        detail: null,
        renderHash: null,
        claimedAt: now,
        finishedAt: null,
      };
      actions.set(action.id, action);
      return { action, retry: false };
    },
    async completeAction(guildId, actionId, result, now) {
      const current = actions.get(actionId);
      if (!current || current.guildId !== guildId) throw new Error('action not found');
      const done: CoordinatorAction = {
        ...current,
        status: result.status,
        discordMessageId: result.discordMessageId ?? current.discordMessageId,
        detail: result.detail ?? null,
        renderHash: result.renderHash ?? current.renderHash,
        finishedAt: now,
      };
      actions.set(actionId, done);
      return done;
    },
    async setRenderHash(guildId, actionId, renderHash) {
      const current = actions.get(actionId);
      if (current && current.guildId === guildId) actions.set(actionId, { ...current, renderHash });
    },
    async listRaidNights(guildId, filter = {}) {
      return [...raidNights.values()]
        .filter((n) => n.guildId === guildId && (!filter.outcome || n.outcome === filter.outcome))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async insertRaidNight(input) {
      const night = { ...input, id: `night_${++seq}` };
      raidNights.set(night.id, night);
      return night;
    },
    async updateRaidNight(guildId, raidNightId, patch) {
      const current = raidNights.get(raidNightId);
      if (!current || current.guildId !== guildId) throw new Error('raid night not found');
      const next = { ...current, ...patch };
      raidNights.set(raidNightId, next);
      return next;
    },
  };
}

export interface SentMessage {
  kind: 'post' | 'edit' | 'dm' | 'remove';
  to: string;
  messageId: string;
  message: MessageData;
}

/** A Discord server event as the fake server holds it. */
export interface FakeServerEvent {
  id: string;
  data: ScheduledEventData;
  status: number;
}

/**
 * Records what the coordinator sends. `failWith` makes upcoming calls throw. Server events live
 * in `serverEvents` (current state) and `eventCalls` (each create or edit); `deleteEvent`
 * removes one the way a member deleting it in Discord would, so the next edit gets 10070.
 */
export function createFakeDiscord(): CoordinatorDiscord & {
  sent: SentMessage[];
  failWith: Error | null;
  serverEvents: Map<string, FakeServerEvent>;
  eventCalls: { kind: 'create' | 'edit'; id: string; data: Partial<ScheduledEventData> }[];
  deleteEvent(id: string): void;
} {
  let seq = 0;
  const fake = {
    sent: [] as SentMessage[],
    failWith: null as Error | null,
    serverEvents: new Map<string, FakeServerEvent>(),
    eventCalls: [] as { kind: 'create' | 'edit'; id: string; data: Partial<ScheduledEventData> }[],
    deleteEvent(id: string) {
      fake.serverEvents.delete(id);
    },
    async createEvent(data: ScheduledEventData) {
      if (fake.failWith) throw fake.failWith;
      const id = `sev_${++seq}`;
      fake.serverEvents.set(id, {
        id,
        data,
        status: data.status ?? ScheduledEventStatus.SCHEDULED,
      });
      fake.eventCalls.push({ kind: 'create', id, data });
      return { id };
    },
    async editEvent(id: string, patch: Partial<ScheduledEventData>) {
      if (fake.failWith) throw fake.failWith;
      const current = fake.serverEvents.get(id);
      if (!current) {
        throw new DiscordRestError('PATCH', `/scheduled-events/${id}`, 404, {
          code: UNKNOWN_SCHEDULED_EVENT,
          message: 'Unknown Guild Scheduled Event',
        });
      }
      const { status, ...data } = patch;
      fake.serverEvents.set(id, {
        id,
        data: { ...current.data, ...data },
        status: status ?? current.status,
      });
      fake.eventCalls.push({ kind: 'edit', id, data: patch });
    },
    async post(channelId: string, message: MessageData) {
      if (fake.failWith) throw fake.failWith;
      const id = `msg_${++seq}`;
      fake.sent.push({ kind: 'post', to: channelId, messageId: id, message });
      return { id };
    },
    async edit(channelId: string, messageId: string, message: MessageData) {
      if (fake.failWith) throw fake.failWith;
      fake.sent.push({ kind: 'edit', to: channelId, messageId, message });
    },
    async remove(channelId: string, messageId: string) {
      if (fake.failWith) throw fake.failWith;
      fake.sent.push({ kind: 'remove', to: channelId, messageId, message: {} });
    },
    async dm(discordUserId: string, message: MessageData) {
      if (fake.failWith) throw fake.failWith;
      const id = `dm_${++seq}`;
      fake.sent.push({ kind: 'dm', to: discordUserId, messageId: id, message });
      return { id };
    },
  };
  return fake;
}

/**
 * Records materialize/lock/create calls; `onLock` lets a test change the state like raids would.
 * `createForRaidNight` marks the night in `store`, like the one Convex mutation does.
 */
export function createFakeRaids(
  onLock?: (eventId: string) => void,
  store?: CoordinatorStore,
): CoordinatorRaids & {
  calls: string[];
  created: { id: string; name: string; startsAt: number }[];
} {
  const calls: string[] = [];
  const created: { id: string; name: string; startsAt: number }[] = [];
  return {
    calls,
    created,
    async createForRaidNight(guildId, raidNightId, raid, detail) {
      const id = `raid_${created.length + 1}`;
      created.push({ id, name: raid.name, startsAt: raid.startsAt });
      calls.push(`create:${raid.name}`);
      await store?.updateRaidNight(guildId, raidNightId, {
        outcome: 'created',
        raidEventId: id,
        detail,
      });
      return { id };
    },
    async materialize() {
      calls.push('materialize');
    },
    async lock(_guildId, eventId) {
      calls.push(`lock:${eventId}`);
      onLock?.(eventId);
    },
  };
}

/** A TickSource over a mutable state object, with the store's actions merged in on each load. */
export function createStateSource(
  state: () => Omit<TickState, 'actions' | 'config'>,
  store: CoordinatorStore,
): TickSource {
  return {
    async load(guildId) {
      const base = state();
      const eventIds = [...base.events, ...(base.cancelled ?? [])].map((t) => t.event.id);
      return {
        ...base,
        guildId,
        config: await store.getConfig(guildId),
        actions: await store.listActions(guildId, { eventIds }),
      };
    },
  };
}

/**
 * A polls port over plain Poll objects. `create` makes an open poll (options o1, o2, …) and
 * remembers the channel; tests close one by editing `polls` the way polls would.
 */
export function createFakePolls(): CoordinatorPolls & {
  polls: Map<string, Poll>;
  posted: { pollId: string; channelId: string | null }[];
} {
  const polls = new Map<string, Poll>();
  const posted: { pollId: string; channelId: string | null }[] = [];
  return {
    polls,
    posted,
    async create(caller, input, channelId) {
      const options = (input.options as { label: string; value: string }[]).map((o, i) => ({
        id: `o${i + 1}`,
        label: o.label,
        emoji: null,
        value: o.value,
      }));
      const poll: Poll = {
        id: `poll_${polls.size + 1}`,
        guildId: caller.guildId,
        question: String(input.question),
        description: (input.description as string | undefined) ?? null,
        options,
        method: 'single',
        maxChoices: null,
        eligibleTier: (input.eligibleTier as Poll['eligibleTier']) ?? 'raider',
        anonymous: false,
        resultsVisible: 'live',
        quorum: (input.quorum as number | null) ?? null,
        status: 'open',
        opensAt: null,
        closesAt: (input.closesAt as number) ?? null,
        createdBy: caller.memberId ?? caller.surface,
        closedBy: null,
        createdAt: 0,
        closedAt: null,
        tags: (input.tags as string[]) ?? [],
        configVersion: 1,
        results: null,
      };
      polls.set(poll.id, poll);
      posted.push({ pollId: poll.id, channelId });
      return { success: true, data: poll };
    },
    async get(_guildId, pollId) {
      return polls.get(pollId) ?? null;
    },
  };
}

export function createMemoryCoordinatorDeps(
  state: () => Omit<TickState, 'actions' | 'config'>,
): CoordinatorDeps & {
  coordinator: ReturnType<typeof createMemoryCoordinatorStore>;
  coordinatorPolls: ReturnType<typeof createFakePolls>;
  ticks: string[];
} {
  const coordinator = createMemoryCoordinatorStore();
  const ticks: string[] = [];
  return {
    coordinator,
    ticks,
    tickSource: createStateSource(state, coordinator),
    coordinatorPolls: createFakePolls(),
    scheduler: {
      runTickNow: async (guildId) => {
        ticks.push(guildId);
      },
    },
  };
}

/** Everything a member would read in a message: content, embeds, and V2 text displays. */
export function messageText(message: MessageData): string {
  const embeds = (message.embeds ?? []).flatMap((e) => [
    e.title ?? '',
    e.description ?? '',
    ...(e.fields ?? []).map((f) => `${f.name}\n${f.value}`),
    e.footer?.text ?? '',
  ]);
  const layout = layoutText((message.components ?? []) as LayoutComponent[]);
  return [message.content ?? '', ...embeds, layout].filter(Boolean).join('\n');
}

/** Button labels anywhere in a message (action rows at the top level or inside containers). */
export function buttonLabels(message: MessageData): string[] {
  const labels: string[] = [];
  const walk = (components: unknown[]) => {
    for (const c of components as { type: number; label?: string; components?: unknown[] }[]) {
      if (c.type === 2 && c.label) labels.push(c.label);
      if (c.components) walk(c.components);
    }
  };
  walk(message.components ?? []);
  return labels;
}
