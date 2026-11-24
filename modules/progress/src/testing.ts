import type { Kill } from './contract';
import type { ProgressDeps, ProgressStore } from './store';

/** In-memory ProgressStore for tests and local agents. Same behavior contract as the component. */
export function createMemoryProgressStore(): ProgressStore & { kills: Map<string, Kill> } {
  const kills = new Map<string, Kill>();
  let seq = 0;
  return {
    kills,
    async listKills(guildId, filter = {}) {
      return [...kills.values()]
        .filter(
          (k) =>
            k.guildId === guildId && (filter.raidId === undefined || k.raidId === filter.raidId),
        )
        .sort((a, b) => a.killedAt - b.killedAt || a.recordedAt - b.recordedAt);
    },
    async getKill(guildId, killId) {
      const kill = kills.get(killId);
      return kill && kill.guildId === guildId ? kill : null;
    },
    async insertKill(input) {
      const kill = { ...input, id: `kill_${++seq}` };
      kills.set(kill.id, kill);
      return kill;
    },
    async deleteKill(guildId, killId) {
      const kill = kills.get(killId);
      if (kill && kill.guildId === guildId) kills.delete(killId);
    },
  };
}

export function createMemoryProgressDeps(): ProgressDeps & {
  progress: ReturnType<typeof createMemoryProgressStore>;
} {
  return { progress: createMemoryProgressStore() };
}
