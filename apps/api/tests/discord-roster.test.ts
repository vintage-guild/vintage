import { type Interaction, InteractionType } from '@vintage/discord-kit';
import { describe, expect, it } from 'vitest';
import { formatRosterAudit, handleRosterInteraction } from '../src/discord-roster';
import { createHost, DISCORD_GUILD, GUILD, ROLES } from './jtbd/host';

function slash(discordId: string, section?: string): Interaction {
  return {
    id: 'i1',
    application_id: 'app',
    token: 'tok',
    type: InteractionType.APPLICATION_COMMAND,
    guild_id: DISCORD_GUILD,
    member: { user: { id: discordId, username: discordId }, roles: [] },
    data: {
      name: 'vintage',
      options: [
        {
          name: 'roster',
          type: 2,
          options: [
            {
              name: 'audit',
              type: 1,
              options: section ? [{ name: 'section', type: 3, value: section }] : [],
            },
          ],
        },
      ],
    },
  };
}

describe('/vintage roster audit (#353)', () => {
  it('returns an ephemeral mismatch report to officers and refuses raid leaders', async () => {
    const host = createHost();
    const officer = await host.discordMember('500000000000000001', 'Ana', [ROLES.officer]);
    const leader = await host.discordMember('500000000000000002', 'Rook', [ROLES.raidLeader]);
    const recruit = await host.discordMember('500000000000000003', 'Dara', [ROLES.recruit]);

    await host.ok(recruit, 'character-add', {
      name: 'Dara Leaf',
      class: 'priest',
      spec: 'holy',
    });
    await host.deps.armoryRoster.insertEntry({
      guildId: GUILD,
      blizzardId: 42,
      name: 'Dara',
      surname: 'Leaf',
      slug: 'dara-leaf',
      level: 60,
      guildRank: 3, // Raider in-game, Recruit on Discord
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

    const ports = {
      discordGuildId: DISCORD_GUILD,
      guildId: GUILD,
      memberByDiscordId: (id: string) => host.deps.identity.getMemberByDiscordId(GUILD, id),
      run: (caller: typeof officer, name: string, input: unknown) => host.run(caller, name, input),
    };

    // Raid leader is privately refused.
    const denied = await handleRosterInteraction(slash(leader.discordId!), ports);
    expect(denied).toMatchObject({
      data: {
        flags: 64,
        content: expect.stringContaining('needs the Officer rank'),
      },
    });

    // Officer receives a private report naming Dara's mismatch.
    const ok = await handleRosterInteraction(slash(officer.discordId!), ports);
    const content = (ok as { data?: { content?: string; flags?: number } }).data?.content ?? '';
    expect((ok as { data?: { flags?: number } }).data?.flags).toBe(64);
    expect(content).toContain('**Roster rank audit**');
    expect(content).toContain('**Dara** — Discord: Recruit → In-game: **Raider** (Dara Leaf)');
    expect(content).toContain('Mismatches: **1**');

    // section:unlinked lists officers/leaders without matched in-game characters.
    const unlinked = await handleRosterInteraction(slash(officer.discordId!, 'unlinked'), ports);
    const unlinkedText = (unlinked as { data?: { content?: string } }).data?.content ?? '';
    expect(unlinkedText).toContain('**Discord role, not matched in-game');
    expect(unlinkedText).toContain('**Ana**');
  });

  it('truncates oversized audit output cleanly within Discord’s 2,000 character limit', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      memberId: `m${i}`,
      discordId: `d${i}`,
      displayName: `LongRaiderNameNumber${i}`,
      discordRank: 'recruit',
      expectedRank: 'raider',
      characterName: `LongCharacterName${i} Surname`,
      inGameRank: 3,
      inGameRankName: 'Raider',
    }));
    const text = formatRosterAudit({
      section: 'all',
      summary: {
        discordMembersChecked: 60,
        inGameCharacters: 60,
        matchedMembers: 60,
        mismatches: 60,
        discordWithoutInGame: 0,
        inGameWithoutDiscord: 0,
        leftDiscordStillInGame: 0,
      },
      mismatches: many,
      discordWithoutInGame: [],
      inGameWithoutDiscord: [],
      leftDiscordStillInGame: [],
    });
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).toContain('… and 48 more');
  });
});
