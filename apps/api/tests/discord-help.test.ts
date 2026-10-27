import {
  ApplicationCommandOptionType,
  type CommandInteractionOption,
  type Interaction,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { fixedClock, testRegistry } from '@vintage/testing';
import { describe, expect, it } from 'vitest';
import { type HelpPorts, handleHelpInteraction, UNKNOWN_MEMBER_NOTE } from '../src/discord-help';
import { commands, type VintageDeps } from '../src/registry';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
const T = ApplicationCommandOptionType;

const member = (id: string, tier: Tier): Member => ({
  id,
  guildId: GUILD,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});
const MEMBERS = [member('rook', 'leader'), member('aeryn', 'raider')];

const registry = testRegistry<VintageDeps>(commands, fixedClock(0));
const ports: HelpPorts = {
  discordGuildId: DISCORD_GUILD,
  guildId: GUILD,
  memberByDiscordId: async (discordId) => MEMBERS.find((m) => m.discordId === discordId) ?? null,
  run: (caller, name, input) => registry.execute({ name, input, caller }, {} as VintageDeps),
};

function slash(
  options: CommandInteractionOption[],
  user = 'd-aeryn',
  guildId = DISCORD_GUILD,
): Interaction {
  return {
    id: 'i1',
    application_id: 'app',
    type: InteractionType.APPLICATION_COMMAND,
    token: 'tok',
    version: 1,
    guild_id: guildId,
    member: { user: { id: user, username: user }, roles: [] },
    data: { id: 'c1', name: 'random', options },
  } as unknown as Interaction;
}

const helpTopic = (topic?: string) => [
  {
    name: 'help',
    type: T.SUB_COMMAND,
    options: topic ? [{ name: 'topic', type: T.STRING, value: topic }] : [],
  },
];
const groupHelp = (group: string) => [
  { name: group, type: T.SUB_COMMAND_GROUP, options: [{ name: 'help', type: T.SUB_COMMAND }] },
];

const embedOf = (response: Awaited<ReturnType<typeof handleHelpInteraction>>) => {
  const data = (response as { data?: unknown } | null)?.data as {
    embeds?: { title: string; description: string }[];
    flags?: number;
  };
  expect(data.flags).toBe(MessageFlags.EPHEMERAL);
  return data.embeds?.[0] as { title: string; description: string };
};

describe('/random help', () => {
  it('shows the overview privately, for the reader’s rank', async () => {
    const page = embedOf(await handleHelpInteraction(slash(helpTopic()), ports));
    expect(page.title).toBe('Random help');
    expect(page.description).toContain('You can use `/random poll create`.');
    expect(page.description).toContain('-# Raid leaders and officers can:');
  });

  it('opens one topic', async () => {
    const page = embedOf(await handleHelpInteraction(slash(helpTopic('polls')), ports));
    expect(page.title).toBe('Random help: Polls');
    expect(page.description).toContain('**`/random poll create`** · Post a poll in this channel');
  });

  it('/random event help opens the events page, with the commands a raid leader can use', async () => {
    const page = embedOf(await handleHelpInteraction(slash(groupHelp('event'), 'd-rook'), ports));
    expect(page.title).toBe('Random help: Events');
    expect(page.description).toContain('**`/random event create`**');
  });

  it('someone Random does not know yet gets the role-sync note and what anyone can do', async () => {
    const page = embedOf(await handleHelpInteraction(slash(helpTopic(), 'd-stranger'), ports));
    expect(page.description.startsWith(UNKNOWN_MEMBER_NOTE)).toBe(true);
    expect(page.description).toContain('You can use `/random apply`, `/random recruiting`.');
    expect(page.description).not.toContain('You can use `/random poll create`');
  });

  it('refuses other servers, and leaves other commands to their flows', async () => {
    const elsewhere = await handleHelpInteraction(slash(helpTopic(), 'd-aeryn', 'other'), ports);
    expect((elsewhere as { data?: unknown } | null)?.data).toMatchObject({
      content: expect.stringContaining('Vintage guild'),
    });
    const create = [
      {
        name: 'poll',
        type: T.SUB_COMMAND_GROUP,
        options: [{ name: 'create', type: T.SUB_COMMAND }],
      },
    ];
    expect(await handleHelpInteraction(slash(create), ports)).toBeNull();
  });
});
