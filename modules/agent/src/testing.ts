// In-memory AgentStore and deps for tests and local agents. Same behavior contract as the
// component: guild-scoped, runs newest first, config defaults until saved.
import type { Caller, CommandResult } from '@vintage/guild-kit';
import {
  type AgentConfig,
  type AgentConfirmation,
  type AgentRun,
  type AgentSessionRecord,
  defaultAgentConfig,
} from './contract';
import type { AgentDeps, AgentStore, RunFilter, StoredToolResult } from './store';

const matches = (run: AgentRun, f: RunFilter) =>
  (f.memberId === undefined || run.memberId === f.memberId) &&
  (f.kind === undefined || run.kind === f.kind) &&
  (f.statuses === undefined || f.statuses.includes(run.status)) &&
  (f.since === undefined || run.createdAt >= f.since);

export function createMemoryAgentStore(): AgentStore & {
  runs: Map<string, AgentRun>;
  confirmations: Map<string, AgentConfirmation>;
  sessions: Map<string, AgentSessionRecord>;
  toolResults: Map<string, StoredToolResult>;
} {
  const configs = new Map<string, AgentConfig>();
  const runs = new Map<string, AgentRun>();
  const confirmations = new Map<string, AgentConfirmation>();
  const sessions = new Map<string, AgentSessionRecord>();
  const toolResults = new Map<string, StoredToolResult>();
  const usage = new Map<string, number>();
  let nextRun = 1;
  let nextConfirmation = 1;
  // A one-argument wrapper: `.map(structuredClone)` would pass the index as clone options.
  const clone = <T>(value: T): T => structuredClone(value);
  const sessionKey = (guildId: string, threadKey: string) => `${guildId}|${threadKey}`;

  const guildRuns = (guildId: string, f: RunFilter = {}) =>
    [...runs.values()]
      .filter((r) => r.guildId === guildId && matches(r, f))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));

  return {
    runs,
    confirmations,
    sessions,
    toolResults,
    async getConfig(guildId) {
      return clone(configs.get(guildId) ?? defaultAgentConfig(guildId));
    },
    async setConfig(guildId, patch, now, updatedBy) {
      const next = {
        ...(configs.get(guildId) ?? defaultAgentConfig(guildId)),
        ...patch,
        guildId,
        updatedAt: now,
        updatedBy,
      };
      configs.set(guildId, next);
      return clone(next);
    },
    async insertRun(run) {
      const saved = { ...clone(run), id: `run-${nextRun++}` };
      runs.set(saved.id, saved);
      return clone(saved);
    },
    async getRun(guildId, runId) {
      const run = runs.get(runId);
      return run && run.guildId === guildId ? clone(run) : null;
    },
    async updateRun(guildId, runId, patch) {
      const run = runs.get(runId);
      if (!run || run.guildId !== guildId) throw new Error(`run ${runId} not found`);
      const next = { ...run, ...clone(patch) };
      runs.set(runId, next);
      return clone(next);
    },
    async listRuns(guildId, filter = {}) {
      return guildRuns(guildId, filter)
        .slice(0, filter.limit ?? 50)
        .map(clone);
    },
    async countRuns(guildId, filter) {
      return guildRuns(guildId, filter).length;
    },
    async getSession(guildId, threadKey) {
      const found = sessions.get(sessionKey(guildId, threadKey));
      return found ? clone(found) : null;
    },
    async putSession(record) {
      sessions.set(sessionKey(record.guildId, record.threadKey), clone(record));
    },
    async deleteSession(guildId, threadKey) {
      sessions.delete(sessionKey(guildId, threadKey));
    },
    async listIdleSessions(guildId, before) {
      return [...sessions.values()]
        .filter((s) => s.guildId === guildId && s.lastUsedAt < before)
        .map(clone);
    },
    async insertConfirmation(confirmation) {
      const saved = { ...clone(confirmation), id: `confirm-${nextConfirmation++}` };
      confirmations.set(saved.id, saved);
      return clone(saved);
    },
    async getConfirmation(guildId, confirmationId) {
      const found = confirmations.get(confirmationId);
      return found && found.guildId === guildId ? clone(found) : null;
    },
    async updateConfirmation(guildId, confirmationId, patch) {
      const found = confirmations.get(confirmationId);
      if (!found || found.guildId !== guildId) {
        throw new Error(`confirmation ${confirmationId} not found`);
      }
      const next = { ...found, ...clone(patch) };
      confirmations.set(confirmationId, next);
      return clone(next);
    },
    async listConfirmations(guildId, runId) {
      return [...confirmations.values()]
        .filter((c) => c.guildId === guildId && c.runId === runId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(clone);
    },
    async listExpiredConfirmations(guildId, now) {
      return [...confirmations.values()]
        .filter((c) => c.guildId === guildId && c.status === 'pending' && c.expiresAt < now)
        .map(clone);
    },
    async getUsage(guildId, key) {
      return usage.get(`${guildId}|${key}`) ?? 0;
    },
    async bumpUsage(guildId, key) {
      const next = (usage.get(`${guildId}|${key}`) ?? 0) + 1;
      usage.set(`${guildId}|${key}`, next);
      return next;
    },
    async getToolResult(guildId, runId, callId) {
      const found = toolResults.get(`${guildId}|${runId}|${callId}`);
      return found ? clone(found) : null;
    },
    async putToolResult(result) {
      toolResults.set(`${result.guildId}|${result.runId}|${result.callId}`, clone(result));
    },
  };
}

export type RunnerCall = { caller: Caller; name: string; input: unknown; confirmToken?: string };

/**
 * Memory deps. The queue records what was enqueued; the runner records calls and answers with
 * `respond` (default: success echoing the input).
 */
export function createMemoryAgentDeps(
  respond: (call: RunnerCall) => CommandResult<unknown> = (call) => ({
    success: true,
    data: call.input,
  }),
) {
  const enqueued: { guildId: string; runId: string }[] = [];
  const ran: RunnerCall[] = [];
  const deps = {
    agent: createMemoryAgentStore(),
    agentQueue: {
      enqueue: async (guildId: string, runId: string) => {
        enqueued.push({ guildId, runId });
      },
    },
    agentRunner: {
      run: async (caller: Caller, name: string, input: unknown, confirmToken?: string) => {
        const call = { caller, name, input, ...(confirmToken ? { confirmToken } : {}) };
        ran.push(call);
        return respond(call);
      },
    },
  } satisfies AgentDeps;
  return { deps, enqueued, ran };
}
