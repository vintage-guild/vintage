import type { SiteDeps, SiteStore, StoredRecruiting } from './store';

/** In-memory SiteStore for tests and local agents. Same behavior contract as the component. */
export function createMemorySiteStore(): SiteStore & { recruiting: Map<string, StoredRecruiting> } {
  const recruiting = new Map<string, StoredRecruiting>();
  return {
    recruiting,
    async getRecruiting(guildId) {
      const found = recruiting.get(guildId);
      return found ? structuredClone(found) : null;
    },
    async putRecruiting(record) {
      recruiting.set(record.guildId, structuredClone(record));
      return structuredClone(record);
    },
  };
}

export function createMemorySiteDeps(): SiteDeps & {
  site: ReturnType<typeof createMemorySiteStore>;
} {
  return { site: createMemorySiteStore() };
}
