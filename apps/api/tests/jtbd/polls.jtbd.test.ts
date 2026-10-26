// JTBD: polls (docs/jtbd/polls.md). A raider asks the raid a question in Discord and everyone
// answers from the post. Driven only through the Discord flow and commands.

import { messageText } from '@vintage/coordinator/testing';
import type { Caller } from '@vintage/guild-kit';
import type { Poll } from '@vintage/polls/contract';
import type { RaidEvent } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createHost,
  HOUR,
  type Host,
  OPS_CHANNEL,
  POLL_CHANNEL,
  ROLES,
  SIGNUP_CHANNEL,
} from './host';

interface Guild {
  host: Host;
  rook: Caller; // raid leader
  aeryn: Caller; // raider
  bram: Caller; // raider
  pip: Caller; // member
}

async function createGuild(): Promise<Guild> {
  const host = createHost();
  const join = (id: string, name: string, role: string) =>
    host.discordMember(`50000000000000000${id}`, name, [role]);
  return {
    host,
    rook: await join('2', 'Rook', ROLES.raidLeader),
    aeryn: await join('3', 'Aeryn', ROLES.raider),
    bram: await join('4', 'Bram', ROLES.raider),
    pip: await join('7', 'Pip', ROLES.member),
  };
}

const content = (r: unknown) => (r as { data?: { content?: string } }).data?.content ?? '';
const flags = (r: unknown) => (r as { data?: { flags?: number } }).data?.flags;
const EPHEMERAL = 64;

describe('JTBD: polls', () => {
  let g: Guild;
  let ui: Host['pollUi'];
  beforeEach(async () => {
    g = await createGuild();
    ui = g.host.pollUi;
  });

  /** Aeryn's poll, found the way a member would: the open polls she may vote on. */
  async function aerynsPoll(options: Record<string, string | number | boolean> = {}) {
    const created = await ui.create(g.aeryn.discordId!, {
      question: 'Which night for the Onyxia run?',
      options: 'Tuesday; Thursday',
      ...options,
    });
    const [poll] = await g.host.ok<Poll[]>(g.aeryn, 'poll-list');
    if (!poll) throw new Error('no open poll');
    return { created, poll };
  }

  it('J17 · a raider asks the raid a question and sees the answer on the post', async () => {
    // Create: a private reply, and the post goes up in this channel with a button per option.
    const { created, poll } = await aerynsPoll();
    expect(flags(created)).toBe(EPHEMERAL);
    expect(content(created)).toMatch(/going up in this channel/);
    expect(ui.pollPosts.get(poll.id)?.channelId).toBe(POLL_CHANNEL);
    expect(ui.postText(poll.id)).toContain('## Which night for the Onyxia run?');
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).toContain(`poll:v:${poll.id}:o1`);

    // Vote: a private answer, the post's counts move, and changing a vote never makes two.
    const voted = await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    expect(flags(voted)).toBe(EPHEMERAL);
    expect(content(voted)).toMatch(/You voted for \*\*Tuesday\*\*/);
    await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o2`);
    await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
    expect(ui.postText(poll.id)).toMatch(/\*\*Thursday\*\*\n`█+` 2 · 100%/);
    expect(ui.postText(poll.id)).toContain('2 of 3 voted');

    // A Member is below the poll's audience: a private "no such poll", and nothing moves.
    const refused = await ui.click(g.pip.discordId!, `poll:v:${poll.id}:o1`);
    expect(content(refused)).toMatch(/No such poll/);
    expect(ui.postText(poll.id)).toContain('2 of 3 voted');

    // Someone who didn't create it and doesn't lead raids can't close it.
    const notTheirs = await ui.click(g.bram.discordId!, `poll:c:${poll.id}`);
    expect(content(notTheirs)).toMatch(/Only the poll creator or a raid leader/);

    // Close: a private preview first, then the confirm marks the winner and drops the buttons.
    const preview = await ui.click(g.aeryn.discordId!, `poll:c:${poll.id}`);
    expect(content(preview)).toMatch(/Thursday wins with 2 ballots/);
    expect(JSON.stringify(preview)).toContain(`poll:cc:${poll.id}`);
    expect(ui.postText(poll.id)).not.toContain('**closed**');
    await ui.click(g.aeryn.discordId!, `poll:cc:${poll.id}`);
    expect(ui.postText(poll.id)).toContain('**Thursday** ✓');
    expect(ui.postText(poll.id)).toContain('**closed**');
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).not.toContain('poll:v:');

    // A late click is refused.
    const late = await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    expect(content(late)).toMatch(/not taking votes/);
  });

  it('J17 · a hidden, anonymous poll shows how many voted but no counts or names', async () => {
    const { poll } = await aerynsPoll({ anonymous: true, results: 'after-close' });
    await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o1`);
    const text = ui.postText(poll.id) ?? '';
    expect(text).toContain('1 of 3 voted');
    expect(text).toContain('results show at close');
    expect(text).not.toContain('█');
    expect(text).not.toContain('Bram');
  });

  it('J17 · pick-any polls answer from a menu', async () => {
    const { poll } = await aerynsPoll({ method: 'multi', options: 'Tue; Wed; Thu' });
    expect(JSON.stringify(ui.pollPosts.get(poll.id)?.message)).toContain(`poll:s:${poll.id}`);
    await ui.pick(g.bram.discordId!, `poll:s:${poll.id}`, ['o1', 'o3']);
    expect(ui.postText(poll.id)).toMatch(/\*\*Thu\*\*\n`█+` 1 · 100%/);
  });

  describe('J18 · pick the raid night by vote', () => {
    /** Tue 3 Nov and Thu 5 Nov 2026, 20:00 New York (EST). */
    const TUE = Date.UTC(2026, 10, 4, 1);
    const THU = Date.UTC(2026, 10, 6, 1);

    async function askWhichNight() {
      await g.host.configureCoordinator();
      const { poll } = await g.host.ok<{ poll: Poll }>(g.rook, 'raid-night-poll', {
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startTimes: [TUE, THU],
        closesAt: g.host.clock.now() + 48 * HOUR,
      });
      return poll;
    }

    async function closeAndTick() {
      g.host.clock.advance(49 * HOUR);
      await g.host.ok(g.host.system, 'poll-sweep');
      await g.host.tick();
    }

    const raids = async () =>
      (await g.host.ok<{ event: RaidEvent }[]>(g.aeryn, 'raid-list')).map((r) => r.event);

    it('J18 · a raid leader asks which night works, and the winner becomes the raid', async () => {
      // The poll goes up in the signup channel with the two times, labelled in New York time.
      const poll = await askWhichNight();
      expect(ui.pollPosts.get(poll.id)?.channelId).toBe(SIGNUP_CHANNEL);
      expect(ui.postText(poll.id)).toContain('Thu 5 Nov, 8:00 PM EST');
      expect(ui.postText(poll.id)).toContain(`<t:${THU / 1000}:F>`);

      // Raiders vote from the post; Thursday wins two to one.
      await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o2`);
      await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
      await ui.click(g.rook.discordId!, `poll:v:${poll.id}:o1`);
      expect(await raids()).toEqual([]);

      // The poll closes, and the next tick makes the raid and posts its signup message.
      await closeAndTick();
      const [raid] = await raids();
      expect(raid).toMatchObject({
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startsAt: THU,
      });
      expect(
        g.host.sentTo(SIGNUP_CHANNEL).some((m) => messageText(m.message).includes('Onyxia')),
      ).toBe(true);

      // Ticking again never makes a second raid.
      await g.host.tick();
      expect(await raids()).toHaveLength(1);
    });

    it('J18 · a tie goes to the officers instead of a guess', async () => {
      const poll = await askWhichNight();
      await ui.click(g.aeryn.discordId!, `poll:v:${poll.id}:o1`);
      await ui.click(g.bram.discordId!, `poll:v:${poll.id}:o2`);
      await closeAndTick();
      expect(await raids()).toEqual([]);
      const [note] = g.host.sentTo(OPS_CHANNEL);
      expect(messageText(note!.message)).toContain('closed without a raid for **Onyxia**: it tied');
    });

    it('J18 · only raid leaders can start one', async () => {
      await g.host.configureCoordinator();
      const tried = await g.host.run(g.aeryn, 'raid-night-poll', {
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startTimes: [TUE, THU],
        closesAt: g.host.clock.now() + 48 * HOUR,
      });
      expect(tried).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
    });
  });
});
