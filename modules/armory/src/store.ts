import { commandsFor } from '@vintage/guild-kit';
import type { ArmoryLink } from './contract';

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

/** Keys are prefixed so they never collide with another module's deps in apps/api. */
export interface ArmoryDeps {
  armory: ArmoryStore;
  armoryCharacters: ArmoryCharacters;
  armoryEffects: ArmoryEffects;
}

export const command = commandsFor<ArmoryDeps>();
