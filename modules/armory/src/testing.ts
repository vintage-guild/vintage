import type { ArmoryLink, RosterEntry } from './contract';
import type { ArmoryCharacter, ArmoryDeps, ArmoryStore, RosterStore } from './store';

/** Code-point order, like the component's `by_guild_name` index (not the locale's). */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (a: ArmoryLink, b: ArmoryLink) =>
  compare(a.name, b.name) || compare(a.surname, b.surname);

/** In-memory ArmoryStore for tests and local agents. Same behavior contract as the component. */
export function createMemoryArmoryStore(): ArmoryStore & { links: Map<string, ArmoryLink> } {
  const links = new Map<string, ArmoryLink>();
  let seq = 0;
  const find = (guildId: string, match: (l: ArmoryLink) => boolean) =>
    [...links.values()].find((l) => l.guildId === guildId && match(l)) ?? null;
  return {
    links,
    async listLinks(guildId) {
      return [...links.values()].filter((l) => l.guildId === guildId).sort(byName);
    },
    async getLink(guildId, linkId) {
      return find(guildId, (l) => l.id === linkId);
    },
    async getLinkByCharacter(guildId, characterId) {
      return find(guildId, (l) => l.characterId === characterId);
    },
    async getLinkBySlug(guildId, slug) {
      return find(guildId, (l) => l.slug === slug);
    },
    async insertLink(input) {
      const link = { ...input, id: `armory_${++seq}` };
      links.set(link.id, link);
      return link;
    },
    async updateLink(guildId, linkId, patch) {
      const link = find(guildId, (l) => l.id === linkId);
      if (!link) throw new Error(`No armory link ${linkId}`);
      const updated = { ...link, ...patch };
      links.set(linkId, updated);
      return updated;
    },
    async deleteLink(guildId, linkId) {
      if (find(guildId, (l) => l.id === linkId)) links.delete(linkId);
    },
  };
}

const byRank = (a: RosterEntry, b: RosterEntry) =>
  a.guildRank - b.guildRank || compare(a.name, b.name);

/** In-memory RosterStore for tests. Same behavior contract as the component. */
export function createMemoryRosterStore(): RosterStore & { entries: Map<string, RosterEntry> } {
  const entries = new Map<string, RosterEntry>();
  let seq = 0;
  return {
    entries,
    async listEntries(guildId) {
      return [...entries.values()].filter((e) => e.guildId === guildId).sort(byRank);
    },
    async getEntryBySlug(guildId, slug) {
      return [...entries.values()].find((e) => e.guildId === guildId && e.slug === slug) ?? null;
    },
    async insertEntry(input) {
      const entry = { ...input, id: `roster_${++seq}` };
      entries.set(entry.id, entry);
      return entry;
    },
    async updateEntry(guildId, entryId, patch) {
      const entry = entries.get(entryId);
      if (!entry || entry.guildId !== guildId) throw new Error(`No roster entry ${entryId}`);
      const updated = { ...entry, ...patch };
      entries.set(entryId, updated);
      return updated;
    },
    async deleteEntry(guildId, entryId) {
      const entry = entries.get(entryId);
      if (entry && entry.guildId === guildId) entries.delete(entryId);
    },
  };
}

export interface MemoryArmoryDeps extends ArmoryDeps {
  armory: ReturnType<typeof createMemoryArmoryStore>;
  armoryRoster: ReturnType<typeof createMemoryRosterStore>;
  /** Registered characters by guild; tests add and remove them. */
  characters: Map<string, ArmoryCharacter[]>;
  /** Every fetch asked for, in order. */
  fetches: { guildId: string; linkIds: string[] }[];
  /** Every roster sync asked for, in order. */
  rosterSyncs: string[];
}

export function createMemoryArmoryDeps(): MemoryArmoryDeps {
  const characters = new Map<string, ArmoryCharacter[]>();
  const fetches: MemoryArmoryDeps['fetches'] = [];
  const rosterSyncs: MemoryArmoryDeps['rosterSyncs'] = [];
  return {
    armory: createMemoryArmoryStore(),
    armoryRoster: createMemoryRosterStore(),
    characters,
    fetches,
    rosterSyncs,
    armoryCharacters: {
      async getCharacter(guildId, characterId) {
        return (characters.get(guildId) ?? []).find((c) => c.id === characterId) ?? null;
      },
      async listCharacters(guildId) {
        return [...(characters.get(guildId) ?? [])];
      },
    },
    armoryEffects: {
      async fetch(guildId, linkIds) {
        fetches.push({ guildId, linkIds: [...linkIds] });
      },
    },
    armoryRosterEffects: {
      async sync(guildId) {
        rosterSyncs.push(guildId);
      },
    },
  };
}
