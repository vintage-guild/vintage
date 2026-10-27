import { agentCustomId } from '@vintage/agent/commands';
import type { AgentDelivery } from '@vintage/agent/contract';
import { type Interaction, InteractionType } from '@vintage/discord-kit';
import type { Caller, CommandResult, Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { describe, expect, it } from 'vitest';
import { type AgentDiscordPorts, handleAgentInteraction } from '../src/discord-agent';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
const CHANNEL = '400000000000000009';

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
});

function ports(answer: CommandResult<unknown> = { success: true, data: { runId: 'r1' } }) {
  const asked: { caller: Caller; input: unknown; delivery: AgentDelivery }[] = [];
  const ran: { caller: Caller; name: string; input: unknown }[] = [];
  const p: AgentDiscordPorts = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (id) => (id === 'd-kol' ? member('kol', 'raider') : null),
    ask: async (caller, input, delivery) => {
      asked.push({ caller, input, delivery });
      return answer;
    },
    run: async (caller, name, input) => {
      ran.push({ caller, name, input });
      return name === 'agent-confirm'
        ? { success: true, data: {} }
        : {
            success: false,
            error: {
              code: 'CONFIRMATION_CLOSED',
              message: 'That change is already done',
              retryable: false,
            },
          };
    },
  };
  return { p, asked, ran };
}

const base = {
  id: 'i1',
  application_id: 'app-1',
  token: 'tok-1',
  version: 1,
  guild_id: DISCORD_GUILD,
  channel_id: CHANNEL,
  member: { user: { id: 'd-kol', username: 'kol' } },
};

const askCommand = (question: string, overrides: Partial<Interaction> = {}) =>
  ({
    ...base,
    type: InteractionType.APPLICATION_COMMAND,
    data: {
      name: 'random',
      options: [
        { name: 'ask', type: 1, options: [{ name: 'question', type: 3, value: question }] },
      ],
    },
    ...overrides,
  }) as unknown as Interaction;

const click = (customId: string, content = 'Your signup will change. **Change 1:** signup-set') =>
  ({
    ...base,
    type: InteractionType.MESSAGE_COMPONENT,
    data: { custom_id: customId, component_type: 2 },
    message: { id: 'm1', content },
  }) as unknown as Interaction;

describe('/random ask', () => {
  it('queues the question as the member and answers with a private deferred reply', async () => {
    const { p, asked } = ports();
    const response = await handleAgentInteraction(askCommand('  when is raid?  '), p);
    expect(response).toEqual({ type: 5, data: { flags: 64 } });
    expect(asked).toEqual([
      {
        caller: {
          surface: 'discord',
          guildId: GUILD,
          tier: 'raider',
          memberId: 'kol',
          discordId: 'd-kol',
        },
        input: { question: 'when is raid?', thread: CHANNEL },
        delivery: { kind: 'discord', applicationId: 'app-1', token: 'tok-1' },
      },
    ]);
  });

  it('answers a refusal right away, with its suggestion', async () => {
    const { p } = ports({
      success: false,
      error: {
        code: 'AGENT_DAILY_LIMIT',
        message: 'You have asked 20 questions today (limit 20)',
        suggestion: 'The limit resets at midnight UTC',
        retryable: false,
      },
    });
    const response = await handleAgentInteraction(askCommand('q'), p);
    expect(response).toMatchObject({
      type: 4,
      data: {
        content: 'You have asked 20 questions today (limit 20). The limit resets at midnight UTC.',
        flags: 64,
      },
    });
  });

  it('refuses other servers and people Random does not know, and ignores other interactions', async () => {
    const { p, asked } = ports();
    const elsewhere = await handleAgentInteraction(
      askCommand('q', { guild_id: '999' } as never),
      p,
    );
    expect(JSON.stringify(elsewhere)).toMatch(/only answers questions in the Vintage guild/);
    const stranger = await handleAgentInteraction(
      askCommand('q', { member: { user: { id: 'd-nobody', username: 'x' } } } as never),
      p,
    );
    expect(JSON.stringify(stranger)).toMatch(/I don't know you yet/);
    const poll = await handleAgentInteraction(
      {
        ...base,
        type: InteractionType.APPLICATION_COMMAND,
        data: { name: 'random', options: [{ name: 'poll', type: 2, options: [] }] },
      } as unknown as Interaction,
      p,
    );
    expect(poll).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('Confirm and Drop buttons', () => {
  it('Confirm runs agent-confirm as the clicker and replaces the buttons', async () => {
    const { p, ran } = ports();
    const response = await handleAgentInteraction(click(agentCustomId('ok', 'c1')), p);
    expect(ran).toEqual([
      expect.objectContaining({ name: 'agent-confirm', input: { confirmationId: 'c1' } }),
    ]);
    expect(ran[0]?.caller.memberId).toBe('kol');
    expect(response).toMatchObject({
      type: 7,
      data: {
        components: [],
        content: expect.stringMatching(/\*\*Change 1:\*\* signup-set\n\nDone\.$/),
      },
    });
  });

  it('Drop runs agent-decline and says why when it could not', async () => {
    const { p, ran } = ports();
    const response = await handleAgentInteraction(click(agentCustomId('no', 'c1')), p);
    expect(ran[0]?.name).toBe('agent-decline');
    expect(JSON.stringify(response)).toMatch(/Not done: That change is already done/);
  });
});
