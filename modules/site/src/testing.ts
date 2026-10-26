import type { SiteDeps, SiteStore, StoredProfile, StoredRecruiting } from './store';

/** In-memory SiteStore for tests and local agents. Same behavior contract as the component. */
export function createMemorySiteStore(): SiteStore & {
  recruiting: Map<string, StoredRecruiting>;
  profiles: Map<string, StoredProfile>;
} {
  const recruiting = new Map<string, StoredRecruiting>();
  const profiles = new Map<string, StoredProfile>();
  return {
    recruiting,
    profiles,
    async getProfile(guildId) {
      const found = profiles.get(guildId);
      return found ? structuredClone(found) : null;
    },
    async putProfile(record) {
      profiles.set(record.guildId, structuredClone(record));
      return structuredClone(record);
    },
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
