import type { AnyGuildCommand } from '@vintage/guild-kit';
import type { WishlistDeps } from '../store';
import { wishlistGet, wishlistList, wishlistSet } from './wishlist';

export type {
  WishlistCharacterInfo,
  WishlistCharacters,
  WishlistDeps,
  WishlistFilter,
  WishlistStore,
} from '../store';
export { MAX_WISHLIST_ITEMS, wishlistGet, wishlistList, wishlistSet } from './wishlist';

export const wishlistCommands: readonly AnyGuildCommand<WishlistDeps>[] = [
  wishlistSet,
  wishlistGet,
  wishlistList,
];
