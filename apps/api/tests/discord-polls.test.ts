import {
  ApplicationCommandOptionType,
  type Interaction,
  type InteractionResponse,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { pollsCommands } from '@vintage/polls/commands';
import type { Poll } from '@vintage/polls/contract';
import { createMemoryPollsDeps } from '@vintage/polls/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInput,
  handlePollInteraction,
  type PollPorts,
  splitOptions,
} from '../src/discord-polls';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
const CHANNEL = '400000000000000009';
const HOUR = 60 * 60 * 1000;

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
const MEMBERS = [member('aeryn', 'raider'), member('kol', 'raider'), member('tam', 'recruit')];

type Deps = ReturnType<typeof createMemoryPollsDeps>;
let deps: Deps;
let clock: ReturnType<typeof fixedClock>;
let posted: { pollId: string; channelId: string }[];
let refreshed: string[];
let ports: PollPorts;

beforeEach(() => {
  clock = fixedClock();
  deps = createMemoryPollsDeps(MEMBERS);
  posted = [];
  refreshed = [];
  const registry = testRegistry<Deps>([...pollsCommands], clock);
  ports = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => MEMBERS.find((m) => m.discordId === discordId) ?? null,
    run: (caller, name, input, confirmToken) =>
      registry.execute({ name, input, caller, ...(confirmToken ? { confirmToken } : {}) }, deps),
    post: async (pollId, channelId) => void posted.push({ pollId, channelId }),
    refresh: async (pollId) => void refreshed.push(pollId),
    now: clock.now,
  };
});

const base = (who: string, extra: Partial<Interaction>): Interaction => ({
  id: 'i1',
  application_id: 'app',
  token: 'tok',
  type: InteractionType.MESSAGE_COMPONENT,
  guild_id: DISCORD_GUILD,
  channel_id: CHANNEL,
  member: { user: { id: `d-${who}`, username: who }, roles: [] },
  ...extra,
});

const T = ApplicationCommandOptionType;
const slash = (who: string, options: Record<string, string | number | boolean>) =>
  base(who, {
    type: InteractionType.APPLICATION_COMMAND,
    data: {
      name: 'vintage',
      options: [
        {
          name: 'poll',
          type: T.SUB_COMMAND_GROUP,
          options: [
            {
              name: 'create',
              type: T.SUB_COMMAND,
              options: Object.entries(options).map(([name, value]) => ({
                name,
                value,
                type:
                  typeof value === 'number'
                    ? T.INTEGER
                    : typeof value === 'boolean'
                      ? T.BOOLEAN
                      : T.STRING,
              })),
            },
          ],
        },
      ],
    },
  });

const click = (who: string, customId: string, values?: string[]) =>
  base(who, { data: { custom_id: customId, ...(values ? { values } : {}) } });

const handle = (i: Interaction) => handlePollInteraction(i, ports);

/** The text and flags of a reply or message update. */
function said(response: InteractionResponse | null) {
  if (!response || !('data' in response) || !response.data) throw new Error('no message');
  return response.data as { content?: string; flags?: number; components?: unknown[] };
}

async function createPoll(options: Record<string, string | number | boolean> = {}) {
  await handle(
    slash('aeryn', { question: 'Which night?', options: 'Tuesday; Thursday', ...options }),
  );
  const poll = [...deps.polls.polls.values()].at(-1);
  if (!poll) throw new Error('no poll created');
  return poll as Poll;
}

describe('parsing the slash command', () => {
  it('splits options on ; | and new lines', () => {
    expect(splitOptions('Tuesday; Thursday | Friday\nSunday;;')).toEqual([
      'Tuesday',
      'Thursday',
      'Friday',
      'Sunday',
    ]);
  });

  it('defaults to a 24-hour single-choice poll for raiders, with live results', () => {
    expect(createInput({ question: 'q', options: 'a;b' }, 0)).toMatchObject({
      method: 'single',
      eligibleTier: 'raider',
      anonymous: false,
      resultsVisible: 'live',
      closesAt: 24 * HOUR,
    });
  });
});

describe('/vintage poll create', () => {
  it('creates the poll as the member and posts it in this channel', async () => {
    const response = await handle(
      slash('aeryn', {
        question: 'Which night?',
        options: 'Tuesday; Thursday',
        hours: 48,
        anonymous: true,
      }),
    );
    const poll = [...deps.polls.polls.values()][0];
    expect(poll).toMatchObject({
      question: 'Which night?',
      createdBy: 'aeryn',
      anonymous: true,
      status: 'open',
      closesAt: clock.now() + 48 * HOUR,
    });
    expect(poll?.options.map((o) => o.label)).toEqual(['Tuesday', 'Thursday']);
    expect(posted).toEqual([{ pollId: poll?.id, channelId: CHANNEL }]);
    expect(said(response)).toMatchObject({ flags: MessageFlags.EPHEMERAL });
    expect(said(response).content).toContain('going up in this channel');
  });

  it('tells a recruit they need the Raider rank', async () => {
    const response = await handle(slash('tam', { question: 'q', options: 'a;b' }));
    expect(said(response).content).toContain('needs the Raider rank');
    expect(posted).toEqual([]);
  });

  it('explains an invalid poll in the command’s words', async () => {
    const response = await handle(slash('aeryn', { question: 'q', options: 'only one' }));
    expect(said(response).content).toMatch(/^That poll isn't valid\. options:/);
  });

  it('passes the raid-leader rule through from poll-create', async () => {
    const response = await handle(
      slash('aeryn', { question: 'q', options: 'a;b', audience: 'member' }),
    );
    expect(said(response).content).toContain('Only raid leaders can create polls for members');
  });
});

describe('voting from the post', () => {
  it('casts, changes, and takes back a vote, refreshing the post each time', async () => {
    const poll = await createPoll();
    const first = await handle(click('kol', `poll:v:${poll.id}:o1`));
    expect(said(first).content).toContain('You voted for **Tuesday**');
    await handle(click('kol', `poll:v:${poll.id}:o2`));
    expect((await deps.polls.getVoteByMember(GUILD, poll.id, 'kol'))?.choices).toEqual(['o2']);
    const back = await handle(click('kol', `poll:x:${poll.id}`));
    expect(said(back).content).toBe('Your vote is taken back.');
    expect(refreshed).toEqual([poll.id, poll.id, poll.id]);
    expect(said(await handle(click('kol', `poll:x:${poll.id}`))).content).toBe(
      "You haven't voted on this poll.",
    );
  });

  it('takes several options from the select on a multi poll', async () => {
    const poll = await createPoll({ method: 'multi', options: 'a; b; c' });
    await handle(click('kol', `poll:s:${poll.id}`, ['o1', 'o3']));
    expect((await deps.polls.getVoteByMember(GUILD, poll.id, 'kol'))?.choices).toEqual([
      'o1',
      'o3',
    ]);
  });

  it('hides a raider poll from a recruit', async () => {
    const poll = await createPoll();
    const response = await handle(click('tam', `poll:v:${poll.id}:o1`));
    expect(said(response).content).toContain('No such poll');
    expect(refreshed).toEqual([]);
  });
});

describe('closing from the post', () => {
  it('previews first, then closes on the confirm click', async () => {
    const poll = await createPoll();
    await handle(click('kol', `poll:v:${poll.id}:o2`));
    refreshed = [];

    const preview = said(await handle(click('aeryn', `poll:c:${poll.id}`)));
    expect(preview.content).toContain('Close **Which night?** now? Thursday wins with 1 ballot.');
    expect(JSON.stringify(preview.components)).toContain(`poll:cc:${poll.id}`);
    expect(deps.polls.polls.get(poll.id)?.status).toBe('open');

    const done = await handle(click('aeryn', `poll:cc:${poll.id}`));
    expect(done?.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
    expect(said(done).content).toContain('Closed **Which night?**. Thursday wins');
    expect(deps.polls.polls.get(poll.id)).toMatchObject({ status: 'closed', closedBy: 'aeryn' });
    expect(refreshed).toEqual([poll.id]);
  });

  it('keeps a hidden tally out of the close replies', async () => {
    const poll = await createPoll({ results: 'after-close' });
    await handle(click('kol', `poll:v:${poll.id}:o2`));
    const preview = said(await handle(click('aeryn', `poll:c:${poll.id}`)));
    expect(preview.content).toContain('1 ballot cast; the poll keeps the result hidden from you.');
    expect(preview.content).not.toContain('Thursday');
  });

  it('refuses someone who neither made the poll nor leads raids', async () => {
    const poll = await createPoll();
    const response = await handle(click('kol', `poll:c:${poll.id}`));
    expect(said(response).content).toContain('Only the poll creator or a raid leader');
    const confirm = await handle(click('kol', `poll:cc:${poll.id}`));
    expect(said(confirm).content).toContain('Only the poll creator or a raid leader');
    expect(deps.polls.polls.get(poll.id)?.status).toBe('open');
  });
});

describe('scope', () => {
  it('ignores interactions that are not poll controls', async () => {
    expect(await handle(click('kol', 'signup:e1:accepted'))).toBeNull();
  });

  it('refuses other servers and members it does not know', async () => {
    const poll = await createPoll();
    const elsewhere = { ...click('kol', `poll:v:${poll.id}:o1`), guild_id: '999' };
    expect(said(await handle(elsewhere)).content).toContain('only runs polls in the Vintage guild');
    expect(said(await handle(click('stranger', `poll:v:${poll.id}:o1`))).content).toContain(
      "I don't know you yet",
    );
  });
});
