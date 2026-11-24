# wishlist module

Owns per-character wishlists (`WishlistEntry`) so raiders and recruits can rank wanted items per
character and loot council candidates can factor those rankings in without touching wishlist
tables (PLAN §3.11, #27). Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `WishlistEntry`, `WishlistCandidateInterest`, `WishlistReader`, `WISHLIST_COMMANDS`. The only cross-module import |
| `src/store.ts` | `WishlistStore`, `WishlistCharacters`, `WishlistDeps`, and `command = commandsFor<WishlistDeps>()` |
| `src/commands/wishlist.ts` | `wishlist-set`, `wishlist-get`, `wishlist-list` |
| `src/testing.ts` | Memory store with the same sorting and guild-scoping behavior as the Convex component |
| `convex/` | The `wishlist` Convex component (`entries` table) |

## Rules

- Every record carries `guildId` and is read through a guild-scoped index.
- Other modules (like `loot`) read wishlist interest only through `WishlistReader` from `@vintage/wishlist/contract`, never from this component's tables.
- Character ownership is read through `WishlistCharacters` (wired from `identity` in `apps/api`), never from identity tables.
- Only the character's owner (tier `recruit`+) or an `officer` may update a character's wishlist (`wishlist-set`); non-owners receive `CHARACTER_NOT_FOUND`.
