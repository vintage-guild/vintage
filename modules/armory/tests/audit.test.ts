import { makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import {
  type ArmoryDeps,
  armoryCommands,
  auditRosterRanks,
  expectedDiscordRank,
  ranksCompatible,
} from '../src/commands';
import type { RosterEntry, RosterRankAudit } from '../src/contract';
import { createMemoryArmoryDeps } from '../src/testing';

const entry = (over: Partial<RosterEntry> & { name: string; guildRank: number }): RosterEntry => {
  const surname = over.surname ?? 'Iron';
  return {
    id: `r_${over.name.toLowerCase()}`,
    guildId: TEST_GUILD_ID,
    blizzardId: Math.floor(Math.random() * 100_000),
    surname,
    slug: `${over.name.toLowerCase()}-${surname.toLowerCase()}`,
    level: 60,
    status: 'found',
    className: 'Warrior',
    raceName: 'Human',
    activeSpec: null,
    professions: [],
    avatarUrl: null,
    profileUrl: null,
    error: null,
    checkedAt: 1,
    ...over,
  };
};

describe('auditRosterRanks (#353)', () => {
  it('maps in-game ranks cleanly and accepts raid-leader for in-game Raider and Officer', () => {
    expect(expectedDiscordRank(0)).toBe('officer');
    expect(expectedDiscordRank(1)).toBe('officer');
    expect(expectedDiscordRank(3)).toBe('raider');
    expect(expectedDiscordRank(4)).toBe('flex-raider');
    expect(expectedDiscordRank(5)).toBe('member');
    expect(expectedDiscordRank(6)).toBe('recruit');

    expect(ranksCompatible('raid-leader', 3)).toBe(true);
    expect(ranksCompatible('raid-leader', 1)).toBe(true);
    expect(ranksCompatible('raid-leader', 6)).toBe(false);
    expect(ranksCompatible('recruit', 3)).toBe(false);
  });

  it('picks highest-standing character across alts (Recruit beats Members & Alts) and separates all four buckets', () => {
    const members = [
      // Matched Officer with an alt in Members & Alts -> OK
      { id: 'm1', discordId: 'd1', displayName: 'Ana', rank: 'officer', inServer: true },
      // Matched Raid Leader who is Raider (3) in-game -> OK
      { id: 'm2', discordId: 'd2', displayName: 'Rook', rank: 'raid-leader', inServer: true },
      // Promoted to Raider (3) in-game, still Recruit on Discord -> mismatch
      { id: 'm3', discordId: 'd3', displayName: 'Dara', rank: 'recruit', inServer: true },
      // Recruit (6) main + Members & Alts (5) alt, Recruit on Discord -> OK (Recruit > Members & Alts)
      { id: 'm4', discordId: 'd4', displayName: 'Wren', rank: 'recruit', inServer: true },
      // Active Discord Raider with no character on the in-game roster -> discordWithoutInGame
      { id: 'm5', discordId: 'd5', displayName: 'Ghost', rank: 'raider', inServer: true },
      // Discord-only Friend -> ignored (not a guild role)
      { id: 'm6', discordId: 'd6', displayName: 'Pal', rank: 'friend', inServer: true },
      // Left Discord, still in-game -> leftDiscordStillInGame
      { id: 'm7', discordId: 'd7', displayName: 'Former', rank: null, inServer: false },
    ];
    const characters = [
      { id: 'c1', memberId: 'm1', name: 'Ana Iron', class: 'paladin' },
      { id: 'c1_alt', memberId: 'm1', name: 'Anaalt Iron', class: 'mage' },
      { id: 'c2', memberId: 'm2', name: 'Rook Ash', class: 'warrior' },
      { id: 'c3', memberId: 'm3', name: 'Dara Leaf', class: 'priest' },
      { id: 'c4', memberId: 'm4', name: 'Wren Vale', class: 'rogue' },
      { id: 'c4_alt', memberId: 'm4', name: 'Wrenbank Vale', class: 'warlock' },
      { id: 'c5', memberId: 'm5', name: 'Ghost', class: 'hunter' },
      { id: 'c7', memberId: 'm7', name: 'Former Oak', class: 'druid' },
    ];
    const entries = [
      entry({ name: 'Ana', surname: 'Iron', guildRank: 1 }),
      entry({ name: 'Anaalt', surname: 'Iron', guildRank: 5 }),
      entry({ name: 'Rook', surname: 'Ash', guildRank: 3 }),
      entry({ name: 'Dara', surname: 'Leaf', guildRank: 3 }),
      entry({ name: 'Wren', surname: 'Vale', guildRank: 6 }),
      entry({ name: 'Wrenbank', surname: 'Vale', guildRank: 5 }),
      entry({ name: 'Former', surname: 'Oak', guildRank: 3 }),
      // Unlinked in-game character
      entry({ name: 'Mystery', surname: 'Blade', guildRank: 4 }),
    ];

    const report = auditRosterRanks(members, entries, [], characters, 'all');
    expect(report.summary).toEqual({
      discordMembersChecked: 5,
      inGameCharacters: 8,
      matchedMembers: 4,
      mismatches: 1,
      discordWithoutInGame: 1,
      inGameWithoutDiscord: 1,
      leftDiscordStillInGame: 1,
    });
    expect(report.mismatches).toEqual([
      {
        memberId: 'm3',
        discordId: 'd3',
        displayName: 'Dara',
        discordRank: 'recruit',
        expectedRank: 'raider',
        characterName: 'Dara Leaf',
        inGameRank: 3,
        inGameRankName: 'Raider',
      },
    ]);
    expect(report.discordWithoutInGame).toEqual([
      {
        memberId: 'm5',
        discordId: 'd5',
        displayName: 'Ghost',
        discordRank: 'raider',
        registeredCharacters: ['Ghost'],
      },
    ]);
    expect(report.inGameWithoutDiscord).toEqual([
      expect.objectContaining({
        name: 'Mystery',
        surname: 'Blade',
        inGameRank: 4,
        inGameRankName: 'Flex Raider',
      }),
    ]);
    expect(report.leftDiscordStillInGame).toEqual([
      {
        memberId: 'm7',
        discordId: 'd7',
        displayName: 'Former',
        characters: ['Former Oak'],
      },
    ]);
  });
});

describe('roster-rank-audit command (#353)', () => {
  const registry = testRegistry<ArmoryDeps>([...armoryCommands]);

  it('is officer-only and filters sections while always returning full summary counts', async () => {
    const deps = createMemoryArmoryDeps();
    deps.auditMembers.set(TEST_GUILD_ID, [
      { id: 'm1', discordId: 'd1', displayName: 'Dara', rank: 'recruit', inServer: true },
      { id: 'm2', discordId: 'd2', displayName: 'Ghost', rank: 'raider', inServer: true },
    ]);
    deps.characters.set(TEST_GUILD_ID, [
      { id: 'c1', memberId: 'm1', name: 'Dara Leaf', class: 'priest' },
    ]);
    await deps.armoryRoster.insertEntry({
      guildId: TEST_GUILD_ID,
      blizzardId: 101,
      name: 'Dara',
      surname: 'Leaf',
      slug: 'dara-leaf',
      level: 60,
      guildRank: 3,
      status: 'found',
      className: 'Priest',
      raceName: 'Human',
      activeSpec: null,
      professions: [],
      avatarUrl: null,
      profileUrl: null,
      error: null,
      checkedAt: 1,
    });

    // Leaders cannot run roster-rank-audit.
    expect(
      await registry.execute(
        { name: 'roster-rank-audit', input: {}, caller: makeCaller('leader') },
        deps,
      ),
    ).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });

    // Officer gets the mismatches section with full summary.
    const res = await registry.execute(
      {
        name: 'roster-rank-audit',
        input: { section: 'mismatches' },
        caller: makeCaller('officer'),
      },
      deps,
    );
    expect(res.success).toBe(true);
    const data = res.data as RosterRankAudit;
    expect(data.summary).toMatchObject({ mismatches: 1, discordWithoutInGame: 1 });
    expect(data.mismatches).toHaveLength(1);
    expect(data.discordWithoutInGame).toHaveLength(0);
  });
});
