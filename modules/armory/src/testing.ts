import type { ArmoryLink } from './contract';
import type { ArmoryCharacter, ArmoryDeps, ArmoryStore } from './store';

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

export interface MemoryArmoryDeps extends ArmoryDeps {
  armory: ReturnType<typeof createMemoryArmoryStore>;
  /** Registered characters by guild; tests add and remove them. */
  characters: Map<string, ArmoryCharacter[]>;
  /** Every fetch asked for, in order. */
  fetches: { guildId: string; linkIds: string[] }[];
}

export function createMemoryArmoryDeps(): MemoryArmoryDeps {
  const characters = new Map<string, ArmoryCharacter[]>();
  const fetches: MemoryArmoryDeps['fetches'] = [];
  return {
    armory: createMemoryArmoryStore(),
    characters,
    fetches,
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
  };
}
