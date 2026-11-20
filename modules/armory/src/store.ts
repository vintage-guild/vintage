import { commandsFor } from '@vintage/guild-kit';
import type { ArmoryLink, RosterEntry, RosterRecipe, RosterRecipes } from './contract';

/**
 * The armory module's data port. Commands depend on this, not on Convex: production wires it
 * to the module's Convex component, tests use the memory store in `./testing`.
 */
export interface ArmoryStore {
  /** Sorted by name, then surname. */
  listLinks(guildId: string): Promise<ArmoryLink[]>;
  getLink(guildId: string, linkId: string): Promise<ArmoryLink | null>;
  getLinkByCharacter(guildId: string, characterId: string): Promise<ArmoryLink | null>;
  getLinkBySlug(guildId: string, slug: string): Promise<ArmoryLink | null>;
  insertLink(link: Omit<ArmoryLink, 'id'>): Promise<ArmoryLink>;
  updateLink(
    guildId: string,
    linkId: string,
    patch: Partial<Omit<ArmoryLink, 'id' | 'guildId' | 'characterId'>>,
  ): Promise<ArmoryLink>;
  deleteLink(guildId: string, linkId: string): Promise<void>;
}

/** A registered character, as armory needs it. */
export interface ArmoryCharacter {
  id: string;
  memberId: string;
  name: string;
  class: string;
}

/**
 * What armory reads from identity. apps/api adapts identity's store to this; armory never
 * touches identity's tables (PLAN §4.3).
 */
export interface ArmoryCharacters {
  getCharacter(guildId: string, characterId: string): Promise<ArmoryCharacter | null>;
  listCharacters(guildId: string): Promise<ArmoryCharacter[]>;
}

/** Fetches from Blizzard outside the transaction (apps/api), then calls `armory-record`. */
export interface ArmoryEffects {
  fetch(guildId: string, linkIds: readonly string[]): Promise<void>;
}

/**
 * The guild-roster port. Commands depend on this, not on Convex; production wires it to the
 * same armory component's `rosterEntries` table, tests use the memory store in `./testing`.
 */
export interface RosterStore {
  /** Sorted by guild rank, then name. */
  listEntries(guildId: string): Promise<RosterEntry[]>;
  getEntryBySlug(guildId: string, slug: string): Promise<RosterEntry | null>;
  insertEntry(entry: Omit<RosterEntry, 'id'>): Promise<RosterEntry>;
  updateEntry(
    guildId: string,
    entryId: string,
    patch: Partial<Omit<RosterEntry, 'id' | 'guildId' | 'blizzardId'>>,
  ): Promise<RosterEntry>;
  /** Deletes the entry and its recipes. */
  deleteEntry(guildId: string, entryId: string): Promise<void>;
  /** Every entry's recipes, for `armory-recipe-search`; entries with none are left out. */
  listRecipes(guildId: string): Promise<RosterRecipes[]>;
  /** Replaces one entry's recipes. */
  setRecipes(guildId: string, entryId: string, recipes: RosterRecipe[]): Promise<void>;
}

/**
 * Fetches Blizzard's guild roster and enriches a batch outside the transaction (apps/api), then
 * calls `armory-guild-roster-record`.
 */
export interface RosterEffects {
  sync(guildId: string): Promise<void>;
}

/** Keys are prefixed so they never collide with another module's deps in apps/api. */
export interface ArmoryDeps {
  armory: ArmoryStore;
  armoryCharacters: ArmoryCharacters;
  armoryEffects: ArmoryEffects;
  armoryRoster: RosterStore;
  armoryRosterEffects: RosterEffects;
}

export const command = commandsFor<ArmoryDeps>();
