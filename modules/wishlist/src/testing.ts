import type { WishlistCandidateInterest, WishlistEntry, WishlistReader } from './contract';
import type { WishlistCharacterInfo, WishlistDeps, WishlistStore } from './store';

const byRankThenUpdated = (a: WishlistEntry, b: WishlistEntry) =>
  a.rank - b.rank || a.updatedAt - b.updatedAt || a.itemId - b.itemId;

/** In-memory WishlistStore with the same ordering and guild-scoping behavior as the Convex component. */
export function createMemoryWishlistStore(): WishlistStore {
  const entries = new Map<string, WishlistEntry>();
  let seq = 1;

  return {
    async listByCharacter(guildId, characterId) {
      return [...entries.values()]
        .filter((e) => e.guildId === guildId && e.characterId === characterId)
        .sort(byRankThenUpdated);
    },

    async listByItem(guildId, itemId) {
      return [...entries.values()]
        .filter((e) => e.guildId === guildId && e.itemId === itemId)
        .sort(byRankThenUpdated);
    },

    async listAll(guildId, filter = {}) {
      return [...entries.values()]
        .filter((e) => {
          if (e.guildId !== guildId) return false;
          if (filter.characterId && e.characterId !== filter.characterId) return false;
          if (filter.memberId && e.memberId !== filter.memberId) return false;
          if (filter.itemId !== undefined && e.itemId !== filter.itemId) return false;
          return true;
        })
        .sort(byRankThenUpdated);
    },

    async replaceForCharacter(guildId, characterId, nextEntries) {
      for (const [id, existing] of entries) {
        if (existing.guildId === guildId && existing.characterId === characterId) {
          entries.delete(id);
        }
      }
      const saved: WishlistEntry[] = nextEntries.map((entry) => {
        const record: WishlistEntry = { ...entry, guildId, characterId, id: `wl-${seq++}` };
        entries.set(record.id, record);
        return record;
      });
      return saved.sort(byRankThenUpdated);
    },
  };
}

/** Adapts any WishlistStore into the cross-module WishlistReader contract. */
export function createWishlistReader(store: WishlistStore): WishlistReader {
  return {
    async listForItem(guildId, itemId): Promise<WishlistCandidateInterest[]> {
      const list = await store.listByItem(guildId, itemId);
      return list.map(({ characterId, memberId, itemId: id, itemName, rank, note }) => ({
        characterId,
        memberId,
        itemId: id,
        itemName,
        rank,
        note,
      }));
    },
    listForCharacter: (guildId, characterId) => store.listByCharacter(guildId, characterId),
  };
}

/** In-memory WishlistDeps for tests that only need wishlist commands wired into a registry. */
export function createMemoryWishlistDeps(
  characters: Record<string, WishlistCharacterInfo[]> = {},
): WishlistDeps {
  return {
    wishlist: createMemoryWishlistStore(),
    wishlistCharacters: {
      getCharacter: async (guildId, characterId) =>
        (characters[guildId] ?? []).find((c) => c.id === characterId) ?? null,
      listCharacters: async (guildId, filter) =>
        (characters[guildId] ?? []).filter(
          (c) => !filter?.memberId || c.memberId === filter.memberId,
        ),
    },
  };
}
