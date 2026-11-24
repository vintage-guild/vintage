import { commandsFor } from '@vintage/guild-kit';
import type { WishlistEntry, WishlistEntryInput } from './contract';

export interface WishlistFilter {
  characterId?: string;
  itemId?: number;
  memberId?: string;
}

/** The wishlist module's data port. Production adapts it to the Convex component in apps/api. */
export interface WishlistStore {
  /** A character's wishlist entries, sorted by rank ascending. */
  listByCharacter(guildId: string, characterId: string): Promise<WishlistEntry[]>;
  /** All guild entries for one item, sorted by rank ascending then updatedAt ascending. */
  listByItem(guildId: string, itemId: number): Promise<WishlistEntry[]>;
  /** Guild entries matching optional filters, sorted by rank ascending. */
  listAll(guildId: string, filter?: WishlistFilter): Promise<WishlistEntry[]>;
  /** Atomically replaces a character's wishlist entries and returns the saved list. */
  replaceForCharacter(
    guildId: string,
    characterId: string,
    entries: WishlistEntryInput[],
  ): Promise<WishlistEntry[]>;
}

/** Character lookup port adapted from `identity` in `apps/api` (never identity tables). */
export interface WishlistCharacterInfo {
  id: string;
  memberId: string;
  name: string;
}

export interface WishlistCharacters {
  getCharacter(guildId: string, characterId: string): Promise<WishlistCharacterInfo | null>;
  listCharacters(guildId: string, filter?: { memberId?: string }): Promise<WishlistCharacterInfo[]>;
}

export interface WishlistDeps {
  wishlist: WishlistStore;
  wishlistCharacters: WishlistCharacters;
}

export const command = commandsFor<WishlistDeps>();
