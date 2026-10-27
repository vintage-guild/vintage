// In-memory InsightsStore and deps for tests. Same behavior contract as the component.
import type { InsightFinding, InsightOptIn, InsightRun } from './contract';
import type { InsightsDeps, InsightsStore } from './store';

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryInsightsStore(): InsightsStore & {
  runs: Map<string, InsightRun>;
  findings: InsightFinding[];
} {
  const runs = new Map<string, InsightRun>();
  const findings: InsightFinding[] = [];
  const optins = new Map<string, InsightOptIn>();
  let nextRun = 1;
  let nextFinding = 1;
  return {
    runs,
    findings,
    async insertRun(run) {
      const saved = { ...clone(run), id: `run-${nextRun++}` };
      runs.set(saved.id, saved);
      return clone(saved);
    },
    async getRun(guildId, runId) {
      const found = runs.get(runId);
      return found && found.guildId === guildId ? clone(found) : null;
    },
    async getRunByKey(guildId, runKey) {
      const found = [...runs.values()].find((r) => r.guildId === guildId && r.runKey === runKey);
      return found ? clone(found) : null;
    },
    async listRuns(guildId, limit) {
      return [...runs.values()]
        .filter((r) => r.guildId === guildId)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .slice(0, limit)
        .map(clone);
    },
    async markSent(guildId, runId, at) {
      const found = runs.get(runId);
      if (!found || found.guildId !== guildId) throw new Error(`run ${runId} not found`);
      const saved = { ...found, sentAt: at };
      runs.set(runId, saved);
      return clone(saved);
    },
    async insertFindings(list) {
      for (const f of list) findings.push({ ...clone(f), id: `finding-${nextFinding++}` });
    },
    async listFindings(guildId, runId) {
      return findings
        .filter((f) => f.guildId === guildId && f.runId === runId)
        .sort((a, b) => b.weight - a.weight)
        .map(clone);
    },
    async getOptIn(guildId, memberId) {
      const found = optins.get(`${guildId}|${memberId}`);
      return found ? clone(found) : null;
    },
    async setOptIn(optIn) {
      optins.set(`${optIn.guildId}|${optIn.memberId}`, clone(optIn));
      return clone(optIn);
    },
    async listOptedIn(guildId) {
      return [...optins.values()]
        .filter((o) => o.guildId === guildId && o.dms)
        .map((o) => o.memberId);
    },
  };
}

/** Memory deps: characters map to members by `owners`; sends are recorded. */
export function createMemoryInsightsDeps(owners: Record<string, string> = {}) {
  const sent: string[] = [];
  const deps = {
    insights: createMemoryInsightsStore(),
    characterOwners: {
      ownersOf: async (_g: string, names: readonly string[]) =>
        new Map(names.filter((n) => owners[n]).map((n) => [n, owners[n] as string])),
    },
    insightsEffects: {
      send: async (_g: string, runId: string) => {
        sent.push(runId);
      },
    },
  } satisfies InsightsDeps;
  return { deps, sent };
}
