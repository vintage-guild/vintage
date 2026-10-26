import type { MessageData } from '@vintage/discord-kit';
import { type CoordinatorAction, type CoordinatorConfig, defaultConfig } from './contract';
import type {
  CoordinatorDeps,
  CoordinatorDiscord,
  CoordinatorRaids,
  CoordinatorStore,
  TickSource,
  TickState,
} from './store';

/** In-memory CoordinatorStore. Same behavior contract as the Convex component. */
export function createMemoryCoordinatorStore(): CoordinatorStore & {
  configs: Map<string, CoordinatorConfig>;
  actions: Map<string, CoordinatorAction>;
} {
  const configs = new Map<string, CoordinatorConfig>();
  const actions = new Map<string, CoordinatorAction>();
  let seq = 0;

  return {
    configs,
    actions,
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
  };
}

export interface SentMessage {
  kind: 'post' | 'edit' | 'dm';
  to: string;
  messageId: string;
  message: MessageData;
}

/** Records what the coordinator sends. `failNext` makes upcoming calls throw. */
export function createFakeDiscord(): CoordinatorDiscord & {
  sent: SentMessage[];
  failWith: Error | null;
} {
  let seq = 0;
  const fake = {
    sent: [] as SentMessage[],
    failWith: null as Error | null,
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
    async dm(discordUserId: string, message: MessageData) {
      if (fake.failWith) throw fake.failWith;
      const id = `dm_${++seq}`;
      fake.sent.push({ kind: 'dm', to: discordUserId, messageId: id, message });
      return { id };
    },
  };
  return fake;
}

/** Records materialize/lock calls; `onLock` lets a test change the state like raids would. */
export function createFakeRaids(onLock?: (eventId: string) => void): CoordinatorRaids & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
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
      const eventIds = base.events.map((t) => t.event.id);
      return {
        ...base,
        guildId,
        config: await store.getConfig(guildId),
        actions: await store.listActions(guildId, { eventIds }),
      };
    },
  };
}

export function createMemoryCoordinatorDeps(
  state: () => Omit<TickState, 'actions' | 'config'>,
): CoordinatorDeps & {
  coordinator: ReturnType<typeof createMemoryCoordinatorStore>;
  ticks: string[];
} {
  const coordinator = createMemoryCoordinatorStore();
  const ticks: string[] = [];
  return {
    coordinator,
    ticks,
    tickSource: createStateSource(state, coordinator),
    scheduler: {
      runTickNow: async (guildId) => {
        ticks.push(guildId);
      },
    },
  };
}
