import { describe, expect, it } from 'vitest';
import {
  type CouncilState,
  councilMethod,
  DEFAULT_COUNCIL_CONFIG,
  defaultLootMethods,
  type LootItem,
  type MethodContext,
  type RaidAttendee,
} from '../src';

const attendees: RaidAttendee[] = [
  {
    characterId: 'c1',
    characterName: 'Aeryn',
    memberId: 'm1',
    class: 'priest',
    spec: 'holy',
    role: 'healer',
  },
  {
    characterId: 'c2',
    characterName: 'Brin',
    memberId: 'm2',
    class: 'paladin',
    spec: 'holy',
    role: 'healer',
  },
  {
    characterId: 'c3',
    characterName: 'Kael',
    memberId: 'm3',
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
  },
];

const item: LootItem = {
  itemId: 17103,
  itemName: 'Azuresong Mageblade',
  roles: ['healer', 'ranged'],
  classes: ['priest', 'paladin', 'mage', 'warlock'],
};

function ctx(
  overrides: Partial<MethodContext<typeof DEFAULT_COUNCIL_CONFIG, CouncilState>['raid']> = {},
  config = DEFAULT_COUNCIL_CONFIG,
): MethodContext<typeof DEFAULT_COUNCIL_CONFIG, CouncilState> {
  return {
    config,
    state: councilMethod.initialState(config),
    raid: {
      eventId: 'e1',
      attendees,
      recentAwards: [],
      now: 1_700_000_000_000,
      ...overrides,
    },
  };
}

describe('councilMethod', () => {
  it('is registered in defaultLootMethods', () => {
    expect(defaultLootMethods.has('council')).toBe(true);
    expect(defaultLootMethods.list().map((m) => m.id)).toContain('council');
  });

  it('ranks candidates by wishlist rank first, includes wishlist notes in reasons, and drops ineligible classes', () => {
    const ranked = councilMethod.candidates(
      item,
      ctx({
        wishlistByItem: {
          17103: [
            { characterId: 'c2', rank: 1, note: 'BiS mainhand' },
            { characterId: 'c1', rank: 3, note: 'Upgrade' },
          ],
        },
      }),
    );

    expect(ranked.map((c) => [c.characterId, c.tier, c.wishlistRank])).toEqual([
      ['c2', 'mainspec', 1],
      ['c1', 'mainspec', 3],
      ['c3', 'ineligible', null],
    ]);
    expect(ranked[0]?.reason).toContain('Wishlist #1 (BiS mainhand)');
    expect(ranked[0]?.wishlistNote).toBe('BiS mainhand');
    expect(ranked[1]?.reason).toContain('Wishlist #3 (Upgrade)');
  });

  it('penalizes recent mainspec wins and supports requireWishlist', () => {
    const withRecent = councilMethod.candidates(
      item,
      ctx(
        {
          wishlistByItem: {
            17103: [
              { characterId: 'c1', rank: 1, note: null },
              { characterId: 'c2', rank: 1, note: null },
            ],
          },
          recentAwards: [
            {
              id: 'a1',
              eventId: 'e1',
              itemId: 999,
              itemName: 'Ring',
              characterId: 'c1',
              characterName: 'Aeryn',
              memberId: 'm1',
              intent: 'mainspec',
              methodId: 'council',
              methodVersion: 1,
              configVersion: 0,
              roll: null,
              note: null,
              awardedAt: 1_700_000_000_000,
              awardedBy: 'officer',
            },
          ],
        },
        { ...DEFAULT_COUNCIL_CONFIG, recentWinPenalty: 30 },
      ),
    );
    expect(withRecent[0]?.characterId).toBe('c2');
    expect(withRecent[1]?.reason).toContain('1 MS win tonight');

    const reqWishlist = councilMethod.candidates(
      item,
      ctx(
        { wishlistByItem: { 17103: [{ characterId: 'c2', rank: 1, note: null }] } },
        { ...DEFAULT_COUNCIL_CONFIG, requireWishlist: true },
      ),
    );
    expect(reqWishlist.find((c) => c.characterId === 'c2')?.tier).toBe('mainspec');
    expect(reqWishlist.find((c) => c.characterId === 'c1')?.tier).toBe('offspec');
  });
});
