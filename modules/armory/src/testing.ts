import type {
  ArmoryLink,
  ProfessionCatalog,
  RecipeDetail,
  RosterEntry,
  RosterRecipe,
} from './contract';
import type { ArmoryCharacter, ArmoryDeps, ArmoryStore, CatalogStore, RosterStore } from './store';

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
export function createMemoryRosterStore(): RosterStore & {
  entries: Map<string, RosterEntry>;
  /** Recipes by entry id. */
  recipes: Map<string, { guildId: string; recipes: RosterRecipe[] }>;
} {
  const entries = new Map<string, RosterEntry>();
  const recipes = new Map<string, { guildId: string; recipes: RosterRecipe[] }>();
  let seq = 0;
  return {
    entries,
    recipes,
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
      if (entry && entry.guildId === guildId) {
        entries.delete(entryId);
        recipes.delete(entryId);
      }
    },
    async listRecipes(guildId) {
      return [...recipes]
        .filter(([, r]) => r.guildId === guildId && r.recipes.length > 0)
        .map(([entryId, r]) => ({ entryId, recipes: r.recipes }));
    },
    async setRecipes(guildId, entryId, list) {
      const entry = entries.get(entryId);
      if (!entry || entry.guildId !== guildId) throw new Error(`No roster entry ${entryId}`);
      recipes.set(entryId, { guildId, recipes: [...list] });
    },
  };
}

/** In-memory CatalogStore for tests. One row per guild and profession, like the component. */
export function createMemoryCatalogStore(): CatalogStore & {
  rows: ProfessionCatalog[];
  details: RecipeDetail[];
} {
  const rows: ProfessionCatalog[] = [];
  const details: RecipeDetail[] = [];
  let seq = 0;
  return {
    rows,
    details,
    async listRecipeItems(guildId) {
      return details
        .filter((d) => d.guildId === guildId)
        .map((d) => ({ recipeId: d.recipeId, itemId: d.itemId }));
    },
    async getRecipeDetail(guildId, recipeId) {
      return details.find((d) => d.guildId === guildId && d.recipeId === recipeId) ?? null;
    },
    async putRecipeDetails(list) {
      for (const detail of list) {
        const at = details.findIndex(
          (d) => d.guildId === detail.guildId && d.recipeId === detail.recipeId,
        );
        const row = { ...detail, id: details[at]?.id ?? `detail_${++seq}` };
        if (at >= 0) details[at] = row;
        else details.push(row);
      }
    },
    async listCatalog(guildId) {
      return rows
        .filter((r) => r.guildId === guildId)
        .sort((a, b) => compare(a.profession, b.profession));
    },
    async putCatalog(catalog) {
      const at = rows.findIndex(
        (r) => r.guildId === catalog.guildId && r.profession === catalog.profession,
      );
      if (at >= 0) rows[at] = { ...catalog, id: rows[at]?.id ?? `catalog_${++seq}` };
      else rows.push({ ...catalog, id: `catalog_${++seq}` });
    },
  };
}

export interface MemoryArmoryDeps extends ArmoryDeps {
  armory: ReturnType<typeof createMemoryArmoryStore>;
  armoryRoster: ReturnType<typeof createMemoryRosterStore>;
  armoryCatalog: ReturnType<typeof createMemoryCatalogStore>;
  /** Registered characters by guild; tests add and remove them. */
  characters: Map<string, ArmoryCharacter[]>;
  /** Every fetch asked for, in order. */
  fetches: { guildId: string; linkIds: string[] }[];
  /** Every roster sync asked for, in order. */
  rosterSyncs: string[];
  /** Every catalog sync asked for, in order. */
  catalogSyncs: string[];
}

export function createMemoryArmoryDeps(): MemoryArmoryDeps {
  const characters = new Map<string, ArmoryCharacter[]>();
  const fetches: MemoryArmoryDeps['fetches'] = [];
  const rosterSyncs: MemoryArmoryDeps['rosterSyncs'] = [];
  const catalogSyncs: MemoryArmoryDeps['catalogSyncs'] = [];
  return {
    armory: createMemoryArmoryStore(),
    armoryRoster: createMemoryRosterStore(),
    armoryCatalog: createMemoryCatalogStore(),
    characters,
    fetches,
    rosterSyncs,
    catalogSyncs,
    armoryCatalogEffects: {
      async sync(guildId) {
        catalogSyncs.push(guildId);
      },
    },
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
