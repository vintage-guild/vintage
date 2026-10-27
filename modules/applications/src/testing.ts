// In-memory ApplicationsStore and deps for tests and local agents. Same behavior contract as the
// component: guild-scoped, newest first, config defaults until saved.
import { type Application, type ApplicationsConfig, defaultApplicationsConfig } from './contract';
import type { ApplicationEffects, ApplicationsDeps, ApplicationsStore } from './store';

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryApplicationsStore(): ApplicationsStore & {
  rows: Map<string, Application>;
} {
  const rows = new Map<string, Application>();
  const configs = new Map<string, ApplicationsConfig>();
  let next = 1;
  return {
    rows,
    async insert(application) {
      const saved = { ...clone(application), id: `app-${next++}` };
      rows.set(saved.id, saved);
      return clone(saved);
    },
    async get(guildId, applicationId) {
      const found = rows.get(applicationId);
      return found && found.guildId === guildId ? clone(found) : null;
    },
    async update(guildId, applicationId, patch) {
      const found = rows.get(applicationId);
      if (!found || found.guildId !== guildId)
        throw new Error(`application ${applicationId} not found`);
      const saved = { ...found, ...clone(patch) };
      rows.set(applicationId, saved);
      return clone(saved);
    },
    async list(guildId, filter = {}) {
      return [...rows.values()]
        .filter(
          (a) =>
            a.guildId === guildId &&
            (filter.discordId === undefined || a.discordId === filter.discordId) &&
            (filter.statuses === undefined || filter.statuses.includes(a.status)) &&
            (filter.since === undefined || a.createdAt >= filter.since),
        )
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, filter.limit ?? 100)
        .map(clone);
    },
    async getConfig(guildId) {
      return clone(configs.get(guildId) ?? defaultApplicationsConfig(guildId));
    },
    async setConfig(guildId, patch, now) {
      const saved = {
        ...(configs.get(guildId) ?? defaultApplicationsConfig(guildId)),
        ...patch,
        updatedAt: now,
      };
      configs.set(guildId, saved);
      return clone(saved);
    },
  };
}

export type EffectCall = { effect: keyof ApplicationEffects; applicationId: string };

/** Memory deps; the effects record what was scheduled, in order. */
export function createMemoryApplicationsDeps() {
  const effects: EffectCall[] = [];
  const record =
    (effect: keyof ApplicationEffects) => async (_guildId: string, applicationId: string) => {
      effects.push({ effect, applicationId });
    };
  const deps = {
    applications: createMemoryApplicationsStore(),
    applicationEffects: {
      submitted: record('submitted'),
      accepted: record('accepted'),
      replied: record('replied'),
      changed: record('changed'),
    },
  } satisfies ApplicationsDeps;
  return { deps, effects };
}
