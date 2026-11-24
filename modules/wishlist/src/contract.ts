// Public surface of the wishlist module (PLAN §3.11, #27). Other modules import only this file.

/** One ranked item on a character's wishlist. */
export interface WishlistEntry {
  id: string;
  guildId: string;
  characterId: string;
  memberId: string;
  itemId: number;
  itemName: string | null;
  /** 1-based priority rank (1 = highest priority). */
  rank: number;
  note: string | null;
  updatedAt: number;
  updatedBy: string;
}

/** An entry to persist; the store assigns its id. */
export type WishlistEntryInput = Omit<WishlistEntry, 'id'>;

/** Wishlist entry enriched with the character's current display name. */
export interface WishlistEntryView extends WishlistEntry {
  characterName: string | null;
}

/** Cross-module read shape exposed to `loot` via `/contract` (never tables). */
export interface WishlistCandidateInterest {
  characterId: string;
  memberId: string;
  itemId: number;
  itemName: string | null;
  rank: number;
  note: string | null;
}

/** Read-only port other modules (such as `loot`) depend on through `@vintage/wishlist/contract`. */
export interface WishlistReader {
  /** Everyone in the guild who wishlisted `itemId`, ordered by rank ascending. */
  listForItem(guildId: string, itemId: number): Promise<WishlistCandidateInterest[]>;
  /** One character's wishlist, ordered by rank ascending. */
  listForCharacter(guildId: string, characterId: string): Promise<WishlistEntry[]>;
}

export const WISHLIST_COMMANDS = ['wishlist-set', 'wishlist-get', 'wishlist-list'] as const;
export type WishlistCommandName = (typeof WISHLIST_COMMANDS)[number];

/** Events wishlist emits on the core event bus (PLAN §4.3). None yet. */
export type WishlistEvents = Record<never, never>;
