import { decodeRaidImport } from '@vintage/bridge-format';
import { DiscordRestError } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TickEvent, TickMember, TickPorts } from '../src/store';
import {
  createFakeDiscord,
  createFakeRaids,
  createMemoryCoordinatorStore,
  createStateSource,
} from '../src/testing';
import { runTick } from '../src/tick';

const HOUR = 3600 * 1000;
const G = 'guild-test';
const SIGNUPS = '100000000000000001';
const OPS = '100000000000000002';
const START = Date.UTC(2026, 10, 12, 1); // Wed 11 Nov 2026 20:00 EST

const member = (id: string, rank: TickMember['rank'], dmOptOut = false): TickMember => ({
  memberId: id,
  discordId: `20000000000000000${id.length}${id.charCodeAt(0)}`,
  displayName: id,
  rank,
  dmOptOut,
});

const MEMBERS = [
  member('aeryn', 'raider'),
  member('bram', 'flex-raider'),
  member('cade', 'raider', true),
  member('pip', 'member'), // not expected to answer
];

const signup = (memberId: string, overrides: Partial<Signup> = {}): Signup => ({
  id: `signup-${memberId}`,
  guildId: G,
  eventId: 'raid-1',
  memberId,
  characterId: `char-${memberId}`,
  characterName: memberId.charAt(0).toUpperCase() + memberId.slice(1),
  class: 'warrior',
  spec: 'protection',
  role: 'tank',
  status: 'accepted',
  note: null,
  signedUpAt: START - 100 * HOUR,
  updatedAt: START - 100 * HOUR,
  roster: 'pending',
  group: null,
  ...overrides,
});

describe('runTick', () => {
  let event: RaidEvent;
  let signups: Signup[];
  let store: ReturnType<typeof createMemoryCoordinatorStore>;
  let discord: ReturnType<typeof createFakeDiscord>;
  let raids: ReturnType<typeof createFakeRaids>;
  let ports: TickPorts;

  const tick = (at: number) => runTick(ports, G, at);
  const sentKinds = () => discord.sent.map((s) => `${s.kind}:${s.to}`);
  const statuses = async () =>
    Object.fromEntries(
      (await store.listActions(G)).map((a) => [`${a.rule}|${a.target}`, a.status]),
    );

  beforeEach(async () => {
    event = {
      id: 'raid-1',
      guildId: G,
      scheduleId: 'sched-1',
      name: 'MC nights',
      instance: 'Molten Core',
      size: 10,
      startsAt: START,
      durationMinutes: 180,
      status: 'open',
      roleTargets: null,
      lootMethodId: null,
      configVersion: 1,
    };
    signups = [signup('aeryn')];
    store = createMemoryCoordinatorStore();
    discord = createFakeDiscord();
    raids = createFakeRaids(() => {
      event = { ...event, status: 'locked' };
    });
    const events = (): TickEvent[] => [{ event, timings: DEFAULT_TIMINGS, signups }];
    ports = {
      store,
      raids,
      discord,
      source: createStateSource(() => ({ guildId: G, events: events(), members: MEMBERS }), store),
    };
    await store.setConfig(G, { signupChannelId: SIGNUPS, opsChannelId: OPS }, 0);
  });

  it('does nothing while paused or unconfigured', async () => {
    await store.setConfig(G, { paused: true }, 0);
    expect(await tick(START - 100 * HOUR)).toEqual({ skipped: 'paused', outcomes: [] });
    await store.setConfig(G, { paused: false, signupChannelId: null }, 0);
    expect((await tick(START - 100 * HOUR)).skipped).toBe('no signup channel configured');
    expect(discord.sent).toEqual([]);
  });

  it('materializes, then posts the signup message once with answer buttons', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 99 * HOUR);
    expect(raids.calls).toEqual(['materialize', 'materialize']);
    expect(sentKinds()).toEqual([`post:${SIGNUPS}`]);
    const [post] = discord.sent;
    expect(post!.message.embeds?.[0]?.title).toBe('MC nights — Molten Core');
    const buttons = post!.message.components?.[0]?.components.map((c) =>
      'custom_id' in c ? c.custom_id : '',
    );
    expect(buttons).toEqual([
      'signup:raid-1:accepted',
      'signup:raid-1:tentative',
      'signup:raid-1:bench',
      'signup:raid-1:declined',
    ]);
  });

  it('edits the post only when signups change', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 99 * HOUR);
    expect(discord.sent.filter((s) => s.kind === 'edit')).toHaveLength(0);
    signups = [...signups, signup('bram', { class: 'priest', spec: 'holy', role: 'healer' })];
    await tick(START - 98 * HOUR);
    const edits = discord.sent.filter((s) => s.kind === 'edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.messageId).toBe(discord.sent[0]!.messageId);
    await tick(START - 97 * HOUR);
    expect(discord.sent.filter((s) => s.kind === 'edit')).toHaveLength(1);
  });

  it('pings only expected non-responders at 72h, and never twice', async () => {
    await tick(START - 100 * HOUR); // post
    await tick(START - 72 * HOUR);
    await tick(START - 71 * HOUR);
    const reminders = discord.sent.filter(
      (s) => s.kind === 'post' && s.message.content?.includes('Still waiting'),
    );
    expect(reminders).toHaveLength(1);
    const pinged = reminders[0]!.message.allowed_mentions?.users;
    // Bram and Cade are raiders without a signup; Pip is a member (not expected); Aeryn answered.
    expect(pinged).toEqual([
      member('bram', 'flex-raider').discordId,
      member('cade', 'raider').discordId,
    ]);
    expect((await statuses())[`remind-72h|${SIGNUPS}`]).toBe('sent');
  });

  it('at 24h also DMs non-responders who allow DMs, and posts the officer digest', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 72 * HOUR);
    await tick(START - 24 * HOUR);
    const dms = discord.sent.filter((s) => s.kind === 'dm');
    expect(dms.map((d) => d.to)).toEqual([member('bram', 'flex-raider').discordId]); // Cade opted out
    const digest = discord.sent.find(
      (s) => s.to === OPS && s.message.content?.includes('confirmed'),
    );
    expect(digest?.message.content).toMatch(/1\/10 confirmed/);
    expect(digest?.message.content).toMatch(/Not answered \(2\): bram, cade/);
  });

  it('skips DMs when they are turned off', async () => {
    await store.setConfig(G, { dmReminders: false }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    expect(discord.sent.filter((s) => s.kind === 'dm')).toEqual([]);
  });

  it('sends only the latest reminder when several came due at once', async () => {
    await tick(START - 30 * HOUR); // post: the raid was created late
    await tick(START - 20 * HOUR); // both 72h and 24h are due
    const s = await statuses();
    expect(s[`remind-72h|${SIGNUPS}`]).toBe('skipped');
    expect(s[`remind-24h|${SIGNUPS}`]).toBe('sent');
    expect(discord.sent.filter((m) => m.message.content?.includes('Still waiting'))).toHaveLength(
      1,
    );
  });

  it('logs a reminder as skipped when everyone answered', async () => {
    signups = ['aeryn', 'bram', 'cade'].map((m) => signup(m));
    await tick(START - 100 * HOUR);
    await tick(START - 72 * HOUR);
    expect((await statuses())[`remind-72h|${SIGNUPS}`]).toBe('skipped');
    expect(discord.sent.filter((m) => m.message.content?.includes('Still waiting'))).toEqual([]);
  });

  it('locks at T-2h, posts the final roster and the addon import string', async () => {
    signups = [
      signup('aeryn', { roster: 'rostered', group: 1 }),
      signup('bram', {
        class: 'priest',
        spec: 'holy',
        role: 'healer',
        roster: 'rostered',
        group: 1,
      }),
      signup('cade', { status: 'tentative' }),
    ];
    await tick(START - 100 * HOUR);
    await tick(START - 2 * HOUR);
    expect(raids.calls).toContain('lock:raid-1');
    const final = discord.sent.find(
      (s) => s.to === SIGNUPS && s.message.content?.includes('locked'),
    );
    expect(final?.message.content).toMatch(/Final roster \(2\/10\)/);

    const imported = discord.sent.find(
      (s) => s.to === OPS && s.message.content?.includes('Addon import'),
    );
    const encoded = imported!.message.content!.split('```\n')[1]!.split('\n```')[0]!;
    const decoded = decodeRaidImport(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.roster.map((r) => r.characterId)).toEqual(['char-aeryn', 'char-bram']);
      expect(decoded.value.groups).toEqual([
        { group: 1, characterIds: ['char-aeryn', 'char-bram'] },
      ]);
    }

    // Running it again changes nothing (apart from refreshing the now-locked post).
    const before = discord.sent.filter((s) => s.kind !== 'edit').length;
    await tick(START - 1 * HOUR);
    expect(discord.sent.filter((s) => s.kind !== 'edit').length).toBe(before);
    expect(raids.calls.filter((c) => c.startsWith('lock')).length).toBe(1);
  });

  it('stops once the raid has started', async () => {
    await tick(START + HOUR);
    expect(discord.sent).toEqual([]);
  });

  it('two overlapping ticks never send the same action twice', async () => {
    await Promise.all([tick(START - 100 * HOUR), tick(START - 100 * HOUR)]);
    expect(discord.sent.filter((s) => s.kind === 'post')).toHaveLength(1);
  });

  it('records a failure, reports it to officers once, and retries next tick', async () => {
    await tick(START - 100 * HOUR); // post works
    const realPost = discord.post;
    discord.post = async (channelId, message) => {
      if (channelId === SIGNUPS) throw new Error('Discord down');
      return realPost(channelId, message);
    };
    const report = await tick(START - 72 * HOUR);
    expect(report.outcomes.find((o) => o.rule === 'remind-72h')).toMatchObject({
      status: 'failed',
    });
    expect((await statuses())[`remind-72h|${SIGNUPS}`]).toBe('failed');

    await tick(START - 71 * HOUR); // still failing: retried, but not reported again
    const reports = discord.sent.filter(
      (m) => m.to === OPS && m.message.content?.includes('could not'),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message.content).toMatch(/remind-72h.*Discord down/);

    discord.post = realPost;
    await tick(START - 70 * HOUR);
    expect((await statuses())[`remind-72h|${SIGNUPS}`]).toBe('sent');
  });

  it('skips a DM to someone who does not accept DMs', async () => {
    await tick(START - 100 * HOUR);
    const original = discord.dm;
    discord.dm = async () => {
      throw new DiscordRestError('POST', '/channels/x/messages', 403, {
        code: 50007,
        message: 'Cannot send messages to this user',
      });
    };
    await tick(START - 24 * HOUR);
    discord.dm = original;
    expect((await statuses())[`dm-24h|bram`]).toBe('skipped');
  });
});
