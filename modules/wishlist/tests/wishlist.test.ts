import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { type WishlistCharacterInfo, type WishlistDeps, wishlistCommands } from '../src/commands';
import { createMemoryWishlistStore, createWishlistReader } from '../src/testing';

function setup() {
  const wishlist = createMemoryWishlistStore();
  const characters: Record<string, WishlistCharacterInfo[]> = {
    'guild-1': [
      { id: 'c-aeryn', memberId: 'm-aeryn', name: 'Aeryn' },
      { id: 'c-kael', memberId: 'm-aeryn', name: 'Kael' },
      { id: 'c-vex', memberId: 'm-vex', name: 'Vex' },
    ],
    'guild-2': [{ id: 'c-other', memberId: 'm-other', name: 'Other' }],
  };
  const deps: WishlistDeps = {
    wishlist,
    wishlistCharacters: {
      getCharacter: async (guildId, characterId) =>
        (characters[guildId] ?? []).find((c) => c.id === characterId) ?? null,
      listCharacters: async (guildId, filter) =>
        (characters[guildId] ?? []).filter(
          (c) => !filter?.memberId || c.memberId === filter.memberId,
        ),
    },
  };
  const clock = fixedClock(1_700_000_000_000);
  const registry = testRegistry<WishlistDeps>(wishlistCommands, clock);
  return { deps, wishlist, clock, registry };
}

describe('wishlist module', () => {
  it('lets recruits and raiders rank items per character and read them back in rank order', async () => {
    const { deps, registry } = setup();
    const aeryn = makeCaller('raider', { guildId: 'guild-1', memberId: 'm-aeryn' });

    const setRes = await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: {
          characterId: 'c-aeryn',
          items: [
            { itemId: 18803, itemName: "Finkle's Lava Dredger", rank: 2, note: 'Offspec' },
            { itemId: 17103, itemName: 'Azuresong Mageblade', rank: 1, note: 'BiS weapon' },
          ],
        },
      },
      deps,
    );
    expect(setRes.success).toBe(true);
    expect(
      (setRes.data as { entries: { itemId: number; rank: number; note: string | null }[] }).entries,
    ).toMatchObject([
      { itemId: 17103, rank: 1, note: 'BiS weapon' },
      { itemId: 18803, rank: 2, note: 'Offspec' },
    ]);

    const getRes = await registry.execute(
      { name: 'wishlist-get', caller: aeryn, input: { characterId: 'c-aeryn' } },
      deps,
    );
    expect(getRes.success).toBe(true);
    expect((getRes.data as { characterName: string; entries: unknown[] }).characterName).toBe(
      'Aeryn',
    );
    expect((getRes.data as { entries: { itemId: number }[] }).entries.map((e) => e.itemId)).toEqual(
      [17103, 18803],
    );
  });

  it('rejects editing another member’s character unless officer, and enforces recruit floor', async () => {
    const { deps, registry } = setup();
    const aeryn = makeCaller('raider', { guildId: 'guild-1', memberId: 'm-aeryn' });
    const member = makeCaller('member', { guildId: 'guild-1', memberId: 'm-aeryn' });
    const officer = makeCaller('officer', { guildId: 'guild-1', memberId: 'm-vex' });

    // Member tier cannot call wishlist-set.
    const lowTier = await registry.execute(
      { name: 'wishlist-set', caller: member, input: { characterId: 'c-aeryn', items: [] } },
      deps,
    );
    expect(lowTier.success).toBe(false);
    expect(lowTier.error?.code).toBe('COMMAND_NOT_FOUND');

    // Raider cannot edit another member's character.
    const notOwner = await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: { characterId: 'c-vex', items: [{ itemId: 19019, itemName: 'Thunderfury' }] },
      },
      deps,
    );
    expect(notOwner.success).toBe(false);
    expect(notOwner.error?.code).toBe('CHARACTER_NOT_FOUND');

    // Officer can update any character in the guild.
    const byOfficer = await registry.execute(
      {
        name: 'wishlist-set',
        caller: officer,
        input: {
          characterId: 'c-aeryn',
          items: [{ itemId: 17103, itemName: 'Azuresong Mageblade' }],
        },
      },
      deps,
    );
    expect(byOfficer.success).toBe(true);
  });

  it('rejects duplicate items or duplicate explicit ranks, and supports clearing', async () => {
    const { deps, registry } = setup();
    const aeryn = makeCaller('recruit', { guildId: 'guild-1', memberId: 'm-aeryn' });

    const dupItem = await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: {
          characterId: 'c-aeryn',
          items: [{ itemId: 100 }, { itemId: 100 }],
        },
      },
      deps,
    );
    expect(dupItem.error?.code).toBe('DUPLICATE_ITEM');

    const dupRank = await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: {
          characterId: 'c-aeryn',
          items: [
            { itemId: 100, rank: 1 },
            { itemId: 200, rank: 1 },
          ],
        },
      },
      deps,
    );
    expect(dupRank.error?.code).toBe('DUPLICATE_RANK');

    await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: { characterId: 'c-aeryn', items: [{ itemId: 100 }] },
      },
      deps,
    );
    const cleared = await registry.execute(
      { name: 'wishlist-set', caller: aeryn, input: { characterId: 'c-aeryn', items: [] } },
      deps,
    );
    expect(cleared.success).toBe(true);
    expect((cleared.data as { entries: unknown[] }).entries).toEqual([]);
  });

  it('lists guild entries filtered by itemId, characterId, or memberId and exposes WishlistReader', async () => {
    const { deps, wishlist, registry } = setup();
    const aeryn = makeCaller('raider', { guildId: 'guild-1', memberId: 'm-aeryn' });
    const vex = makeCaller('officer', { guildId: 'guild-1', memberId: 'm-vex' });
    const other = makeCaller('raider', { guildId: 'guild-2', memberId: 'm-other' });

    await registry.execute(
      {
        name: 'wishlist-set',
        caller: aeryn,
        input: {
          characterId: 'c-aeryn',
          items: [
            { itemId: 19364, itemName: 'Ashkandi', rank: 2 },
            { itemId: 17103, itemName: 'Azuresong Mageblade', rank: 1 },
          ],
        },
      },
      deps,
    );
    await registry.execute(
      {
        name: 'wishlist-set',
        caller: vex,
        input: {
          characterId: 'c-vex',
          items: [{ itemId: 19364, itemName: 'Ashkandi', rank: 1, note: 'Main tank 2h' }],
        },
      },
      deps,
    );
    await registry.execute(
      {
        name: 'wishlist-set',
        caller: other,
        input: { characterId: 'c-other', items: [{ itemId: 19364, rank: 1 }] },
      },
      deps,
    );

    const byItem = await registry.execute(
      { name: 'wishlist-list', caller: aeryn, input: { itemId: 19364 } },
      deps,
    );
    expect(byItem.success).toBe(true);
    expect(
      (byItem.data as { entries: { characterName: string; rank: number }[] }).entries,
    ).toMatchObject([
      { characterName: 'Vex', rank: 1 },
      { characterName: 'Aeryn', rank: 2 },
    ]);

    const reader = createWishlistReader(wishlist);
    const interest = await reader.listForItem('guild-1', 19364);
    expect(interest).toMatchObject([
      { characterId: 'c-vex', rank: 1, note: 'Main tank 2h' },
      { characterId: 'c-aeryn', rank: 2, note: null },
    ]);
  });
});
