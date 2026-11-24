import { error, success, tierAllows } from '@vintage/guild-kit';
import { z } from 'zod';
import type { WishlistEntryInput, WishlistEntryView } from '../contract';
import { command } from '../store';

export const MAX_WISHLIST_ITEMS = 50;

const wishlistItemSchema = z.object({
  itemId: z.number().int().positive(),
  itemName: z.string().trim().min(1).max(160).nullable().optional(),
  rank: z.number().int().min(1).max(MAX_WISHLIST_ITEMS).optional(),
  note: z.string().trim().max(240).nullable().optional(),
});

type RawWishlistItem = z.infer<typeof wishlistItemSchema>;

function characterNotFound(characterId: string) {
  return error('CHARACTER_NOT_FOUND', `No character found with id "${characterId}"`, {
    suggestion: 'Check your characters with character-list',
    retryable: false,
  });
}

function normalizeItems(items: readonly RawWishlistItem[]):
  | { entries: { itemId: number; itemName: string | null; rank: number; note: string | null }[] }
  | {
      failure: ReturnType<typeof error>;
    } {
  const seenItems = new Set<number>();
  const seenExplicitRanks = new Set<number>();
  for (const item of items) {
    if (seenItems.has(item.itemId)) {
      return {
        failure: error(
          'DUPLICATE_ITEM',
          `Item #${item.itemId} appears more than once in the wishlist`,
          {
            suggestion: 'List each itemId at most once and rank it with its priority',
            retryable: false,
          },
        ),
      };
    }
    seenItems.add(item.itemId);
    if (item.rank !== undefined) {
      if (seenExplicitRanks.has(item.rank)) {
        return {
          failure: error('DUPLICATE_RANK', `Rank #${item.rank} is assigned to more than one item`, {
            suggestion: 'Give each item a distinct rank or omit ranks to use list order',
            retryable: false,
          }),
        };
      }
      seenExplicitRanks.add(item.rank);
    }
  }

  const ordered = items
    .map((item, index) => ({
      itemId: item.itemId,
      itemName: item.itemName?.trim() || null,
      sortRank: item.rank ?? index + 1,
      explicitRank: item.rank,
      index,
      note: item.note?.trim() || null,
    }))
    .sort((a, b) => a.sortRank - b.sortRank || a.index - b.index);

  return {
    entries: ordered.map((item, index) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      rank: item.explicitRank ?? index + 1,
      note: item.note,
    })),
  };
}

export const wishlistSet = command({
  name: 'wishlist-set',
  description:
    'Replace a character’s ranked wishlist of wanted items (pass an empty array to clear). ' +
    'Recruits and up may edit their own characters; officers may edit any character.',
  tier: 'recruit',
  mutation: true,
  input: z.object({
    characterId: z.string().min(1),
    items: z.array(wishlistItemSchema).max(MAX_WISHLIST_ITEMS),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    const character = await deps.wishlistCharacters.getCharacter(guildId, input.characterId);
    const isOfficer = tierAllows(caller.tier, 'officer');
    if (!character || (!isOfficer && caller.memberId !== character.memberId)) {
      return characterNotFound(input.characterId);
    }

    const normalized = normalizeItems(input.items);
    if ('failure' in normalized) return normalized.failure;

    const updatedAt = now();
    const updatedBy = caller.memberId ?? caller.discordId ?? 'system';
    const records: WishlistEntryInput[] = normalized.entries.map((entry) => ({
      guildId,
      characterId: character.id,
      memberId: character.memberId,
      itemId: entry.itemId,
      itemName: entry.itemName,
      rank: entry.rank,
      note: entry.note,
      updatedAt,
      updatedBy,
    }));

    const entries = await deps.wishlist.replaceForCharacter(guildId, character.id, records);
    return success(
      {
        characterId: character.id,
        characterName: character.name,
        memberId: character.memberId,
        entries,
      },
      {
        reasoning: entries.length
          ? `Saved ${entries.length} wishlist item${entries.length === 1 ? '' : 's'} for ${character.name}`
          : `Cleared wishlist for ${character.name}`,
      },
    );
  },
});

export const wishlistGet = command({
  name: 'wishlist-get',
  description: 'Read one character’s ranked wishlist, highest priority first.',
  tier: 'member',
  input: z.object({
    characterId: z.string().min(1),
  }),
  handler: async ({ characterId }, { guildId, deps }) => {
    const character = await deps.wishlistCharacters.getCharacter(guildId, characterId);
    if (!character) return characterNotFound(characterId);

    const entries = await deps.wishlist.listByCharacter(guildId, character.id);
    return success(
      {
        characterId: character.id,
        characterName: character.name,
        memberId: character.memberId,
        entries,
      },
      {
        reasoning: entries.length
          ? `${character.name} has ${entries.length} wishlisted item${entries.length === 1 ? '' : 's'}`
          : `${character.name} has no wishlisted items`,
      },
    );
  },
});

export const wishlistList = command({
  name: 'wishlist-list',
  description:
    'List guild wishlist entries, optionally filtered by character, member, or itemId (for loot council review).',
  tier: 'member',
  input: z.object({
    characterId: z.string().min(1).optional(),
    memberId: z.string().min(1).optional(),
    itemId: z.number().int().positive().optional(),
  }),
  handler: async (filter, { guildId, deps }) => {
    const [raw, characters] = await Promise.all([
      deps.wishlist.listAll(guildId, filter),
      deps.wishlistCharacters.listCharacters(guildId),
    ]);
    const nameByChar = new Map(characters.map((c) => [c.id, c.name]));
    const entries: WishlistEntryView[] = raw.map((e) => ({
      ...e,
      characterName: nameByChar.get(e.characterId) ?? null,
    }));

    return success(
      { entries },
      {
        reasoning: entries.length
          ? `${entries.length} wishlist entr${entries.length === 1 ? 'y' : 'ies'}`
          : 'No matching wishlist entries',
      },
    );
  },
});
