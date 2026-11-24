import { fixedClock, makeCaller, previewAndConfirm, testRegistry } from '@vintage/testing';
import type { WishlistCandidateInterest, WishlistReader } from '@vintage/wishlist/contract';
import { describe, expect, it } from 'vitest';
import { type LootDeps, lootCommands } from '../src/commands';
import { createMemoryLootStore } from '../src/testing';

function fakeWishlistReader(byItem: Record<number, WishlistCandidateInterest[]>): WishlistReader {
  return {
    listForItem: async (guildId, itemId) => (guildId === 'g1' ? (byItem[itemId] ?? []) : []),
    listForCharacter: async () => [],
  };
}

describe('loot council candidates fed by wishlist contract (#27)', () => {
  it('ranks raid attendees by wishlist priority through WishlistReader without touching wishlist tables', async () => {
    const loot = createMemoryLootStore();
    const lootWishlist = fakeWishlistReader({
      17103: [
        {
          characterId: 'c-brin',
          memberId: 'm-brin',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          rank: 1,
          note: 'BiS mainhand',
        },
        {
          characterId: 'c-aeryn',
          memberId: 'm-aeryn',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          rank: 3,
          note: 'Nice upgrade',
        },
      ],
    });

    const deps: LootDeps = {
      loot,
      lootWishlist,
      lootRaids: {
        getRaidContext: async (guildId, eventId) =>
          guildId === 'g1' && eventId === 'raid-1'
            ? {
                eventId,
                name: 'Molten Core',
                lootMethodId: 'council',
                attendees: [
                  {
                    characterId: 'c-aeryn',
                    characterName: 'Aeryn',
                    memberId: 'm-aeryn',
                    class: 'priest',
                    spec: 'holy',
                    role: 'healer',
                  },
                  {
                    characterId: 'c-brin',
                    characterName: 'Brin',
                    memberId: 'm-brin',
                    class: 'paladin',
                    spec: 'holy',
                    role: 'healer',
                  },
                ],
              }
            : null,
      },
    };

    const clock = fixedClock(1_700_000_000_000);
    const registry = testRegistry<LootDeps>(lootCommands, clock);
    const officer = makeCaller('officer', { guildId: 'g1', memberId: 'm-officer' });

    const methods = await registry.execute(
      { name: 'loot-methods-list', caller: officer, input: {} },
      deps,
    );
    expect(methods.success).toBe(true);
    expect((methods.data as { methods: { id: string }[] }).methods.map((m) => m.id)).toContain(
      'council',
    );

    const cand = await registry.execute(
      {
        name: 'loot-candidates',
        caller: officer,
        input: {
          eventId: 'raid-1',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          roles: ['healer'],
        },
      },
      deps,
    );
    expect(cand.success).toBe(true);
    const data = cand.data as {
      methodId: string;
      candidates: {
        characterId: string;
        wishlistRank: number | null;
        wishlistNote: string | null;
        reason: string;
      }[];
    };
    expect(data.methodId).toBe('council');
    expect(data.candidates.map((c) => [c.characterId, c.wishlistRank])).toEqual([
      ['c-brin', 1],
      ['c-aeryn', 3],
    ]);
    expect(data.candidates[0]?.reason).toContain('Wishlist #1 (BiS mainhand)');

    // Recording an award under council succeeds through preview + confirm.
    const awarded = await previewAndConfirm(
      registry,
      {
        name: 'loot-award',
        caller: officer,
        input: {
          eventId: 'raid-1',
          itemId: 17103,
          itemName: 'Azuresong Mageblade',
          characterId: 'c-brin',
          intent: 'mainspec',
        },
      },
      deps,
    );
    expect(awarded.result.success).toBe(true);
  });
});
