import { decodeRaidImport } from '@vintage/bridge-format';
import { createFakeDecisions } from '@vintage/decisions/testing';
import { DiscordRestError, type MessageData } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TickEvent, TickMember, TickPorts } from '../src/store';
import {
  buttonLabels,
  createFakeDiscord,
  createFakePolls,
  createFakeRaids,
  createMemoryCoordinatorStore,
  createStateSource,
  messageText,
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
  alsoRoles: [],
  status: 'accepted',
  lateMinutes: null,
  note: null,
  signedUpAt: START - 100 * HOUR,
  updatedAt: START - 100 * HOUR,
  updatedBy: null,
  roster: 'pending',
  group: null,
  queued: false,
  promotedAt: null,
  ...overrides,
});

/** Every button custom id in a message, wherever its action row sits. */
function customIds(message: MessageData): string[] {
  const ids: string[] = [];
  const walk = (components: unknown[]) => {
    for (const c of components as { custom_id?: string; components?: unknown[] }[]) {
      if (c.custom_id) ids.push(c.custom_id);
      if (c.components) walk(c.components);
    }
  };
  walk(message.components ?? []);
  return ids;
}

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
      kind: 'raid',
      access: 'guild',
      size: 10,
      startsAt: START,
      durationMinutes: 180,
      status: 'open',
      roleTargets: null,
      lootMethodId: null,
      notes: null,
      rosterApprovedAt: null,
      rosterApprovedBy: null,
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
      polls: createFakePolls(),
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
    expect(post!.message.flags).toBeUndefined();
    expect(post!.message.embeds?.[0]?.title).toBe('MC nights · Molten Core');
    expect(customIds(post!.message)).toEqual([
      'signup:raid-1:accepted',
      'signup:raid-1:late',
      'signup:raid-1:tentative',
      'signup:raid-1:bench',
      'signup:raid-1:declined',
    ]); // no Roster: an empty card hides no one
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

  it('edits the post when the raid notes change', async () => {
    await tick(START - 100 * HOUR);
    event = { ...event, notes: 'Fire resist and flasks.' };
    await tick(START - 99 * HOUR);
    const edits = discord.sent.filter((s) => s.kind === 'edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.messageId).toBe(discord.sent[0]!.messageId);
    expect(JSON.stringify(edits[0])).toContain('> Fire resist and flasks.');
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

  it('links the DM straight to the signup post', async () => {
    const DISCORD_GUILD = '600000000000000001';
    ports = { ...ports, links: { discordGuildId: DISCORD_GUILD, siteUrl: null } };
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    const post = discord.sent.find((s) => s.to === SIGNUPS && s.kind !== 'edit');
    const [dm] = discord.sent.filter((s) => s.kind === 'dm');
    expect(dm?.message.content).toContain(
      `https://discord.com/channels/${DISCORD_GUILD}/${SIGNUPS}/${post?.messageId}`,
    );
  });

  it('pings the configured roles instead of each non-responder', async () => {
    const ROLE = '300000000000000001';
    await store.setConfig(G, { reminderRoleIds: [ROLE] }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 72 * HOUR);
    const [reminder] = discord.sent.filter((s) => s.message.content?.includes('Still waiting'));
    expect(reminder?.message.content).toContain(`<@&${ROLE}>`);
    expect(reminder?.message.content).toMatch(/Still waiting on 2: bram, cade/);
    expect(reminder?.message.content).not.toContain('<@2');
    expect(reminder?.message.allowed_mentions).toEqual({ parse: [], roles: [ROLE] });
  });

  it('DMs nobody when no non-responder has a dmRanks rank', async () => {
    await store.setConfig(G, { dmRanks: ['officer'] }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    expect(discord.sent.filter((s) => s.kind === 'dm')).toEqual([]);
  });

  it('DMs only the non-responders whose rank is in dmRanks', async () => {
    await store.setConfig(G, { dmRanks: ['officer', 'flex-raider'] }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    expect(discord.sent.filter((s) => s.kind === 'dm').map((d) => d.to)).toEqual([
      member('bram', 'flex-raider').discordId,
    ]);
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
    expect(s[`remind-30h|${SIGNUPS}`]).toBe('sent');
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
      (s) => s.to === SIGNUPS && messageText(s.message).includes('Final roster'),
    );
    expect(messageText(final!.message)).toMatch(/Final roster · MC nights[\s\S]*2\/10/);

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
    await tick(START - 30 * HOUR);
    discord.dm = original;
    expect((await statuses())[`dm-30h|bram`]).toBe('skipped');
  });

  it('routes open raids to openSignupChannelId with no reminders, and routes digests to leadsChannelId at digestHours', async () => {
    const OPEN_CH = '100000000000000099';
    const LEADS_CH = '100000000000000088';
    await store.setConfig(G, { openSignupChannelId: OPEN_CH, leadsChannelId: LEADS_CH }, 0);
    event = { ...event, access: 'open' };

    await tick(START - 100 * HOUR); // post goes to openSignupChannelId
    expect(discord.sent[0]?.to).toBe(OPEN_CH);

    await tick(START - 72 * HOUR); // no reminder for open raids
    await tick(START - 30 * HOUR); // no reminder or DM for open raids
    expect(discord.sent.filter((s) => s.kind === 'dm')).toEqual([]);
    expect(discord.sent.filter((s) => s.message.content?.includes('Still waiting'))).toEqual([]);

    await tick(START - 24 * HOUR); // digest goes to leadsChannelId at digestHours (24h)
    const digest = discord.sent.find(
      (s) => s.to === LEADS_CH && s.message.content?.includes('confirmed'),
    );
    expect(digest).toBeDefined();
  });

  it('shows 4 role columns with spec icons, late minutes, inline tentative reasons, and standby', async () => {
    signups = [
      signup('aeryn'),
      signup('bram', {
        class: 'priest',
        spec: 'holy',
        role: 'healer',
        status: 'late',
        lateMinutes: 15,
      }),
      signup('cade', { status: 'tentative', note: 'maybe' }),
      signup('pip', { class: 'mage', spec: 'frost', role: 'ranged', status: 'bench' }),
    ];
    await tick(START - 100 * HOUR);
    const message = discord.sent[0]!.message;
    const text = messageText(message);
    expect(text).toMatch(/<:head_tank:\d+> Tanks 1\/2\n<:spec_warrior_protection:\d+> Aeryn/);
    expect(text).toMatch(
      /<:head_healer:\d+> Healers 1\/3\n<:spec_priest_holy:\d+> Bram <:status_late:\d+> 15m/,
    );
    expect(text).toMatch(/Melee 0\n—/);
    expect(text).toMatch(/Ranged 0\n—/);
    const em = String.fromCharCode(0x2003);
    expect(text).toContain(`**1** going${em}<:status_late:`);
    expect(text).toContain(`**1** late${em}<:status_tentative:`);
    expect(text).toMatch(
      /\n-# <:info_open:\d+> Signups open · lock \d+h before · 10-person raid\n/,
    );
    expect(text).toMatch(/\*\*Standby\*\* <:spec_mage_frost:\d+> Pip/);
    expect(text).toMatch(/\*\*Tentative\*\* <:spec_warrior_protection:\d+> Cade(?! \(maybe\))/);
    expect(text).not.toContain('(maybe)');
    expect(buttonLabels(message)).toEqual(['Accept', 'Late', 'Tentative', 'Standby', 'Absent']);
  });

  it('posts T-24h party draft to leads, posts parties on approval, and promotes in place at lock', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    const draft = discord.sent.find(
      (s) => s.to === OPS && s.message.embeds?.[0]?.title?.startsWith('Party draft'),
    );
    expect(draft).toBeDefined();
    // Leader approves the roster: party post goes to SIGNUPS.
    event = { ...event, rosterApprovedAt: START - 20 * HOUR, rosterApprovedBy: 'rook' };
    await tick(START - 20 * HOUR);
    const partyPost = discord.sent.find(
      (s) => s.to === SIGNUPS && s.message.embeds?.[0]?.title?.startsWith('Parties ·'),
    );
    expect(partyPost).toBeDefined();
    // At lock (T-2h), the approved party post is edited in place into Final roster (no separate post).
    await tick(START - 2 * HOUR);
    const lockEdit = discord.sent.find(
      (s) =>
        s.kind === 'edit' &&
        s.messageId === partyPost!.messageId &&
        s.message.embeds?.[0]?.title?.startsWith('Final roster ·'),
    );
    expect(lockEdit).toBeDefined();
    const separateFinals = discord.sent.filter(
      (s) => s.kind === 'post' && s.message.embeds?.[0]?.title?.startsWith('Final roster ·'),
    );
    expect(separateFinals).toHaveLength(0);
  });

  it('reposts a card deleted in Discord and removes the old message on repost', async () => {
    await tick(START - 100 * HOUR);
    const first = discord.sent[0]!;
    signups = [signup('bram', { class: 'priest', spec: 'holy', role: 'healer' })];
    discord.edit = async () => {
      throw new DiscordRestError('PATCH', '/channels/x/messages/y', 404, {
        code: 10008,
        message: 'Unknown Message',
      });
    };
    await tick(START - 99 * HOUR); // the edit fails: the post is marked for reposting
    await tick(START - 98 * HOUR); // a fresh card goes out and the old message is removed
    expect(discord.sent.filter((m) => m.kind === 'post' && m.to === SIGNUPS)).toHaveLength(2);
    expect(discord.sent.find((m) => m.kind === 'remove')?.messageId).toBe(first.messageId);
  });

  it('lists late, tentative, and bench reasons in the officer digest', async () => {
    signups = [
      signup('aeryn'),
      signup('bram', { status: 'late', note: 'after work' }),
      signup('cade', { status: 'bench', note: 'happy to sit' }),
    ];
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    const digest = discord.sent.find(
      (m) => m.to === OPS && m.message.content?.includes('confirmed'),
    )!;
    expect(digest.message.content).toMatch(/Tanks \d · Healers \d · DPS \d/);
    expect(digest.message.content).toMatch(/Late \(1\): Bram \(after work\)/);
    expect(digest.message.content).toMatch(/Bench \(1\): Cade \(happy to sit\)/);
  });

  it('lifts notes that need an officer and swap offers when the notes are labeled', async () => {
    signups = [
      signup('aeryn', { note: 'can I bring my alt Kol instead?' }),
      signup('bram', { status: 'late', note: 'after work' }),
      signup('cade', { note: 'happy to go heals if short' }),
    ];
    ports.decisions = createFakeDecisions({
      kind_0: { choice: 'swap', confidence: 0.95 },
      officer_0: { predicate: 0.9 },
      kind_1: { choice: 'late', confidence: 0.99 },
      officer_1: { predicate: 0 },
      kind_2: { choice: 'swap', confidence: 0.9 },
      officer_2: { predicate: 0.05 },
    });
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    const digest = discord.sent.find(
      (m) => m.to === OPS && m.message.content?.includes('confirmed'),
    )!;
    expect(digest.message.content).toMatch(
      /\*\*Needs an officer\*\* \(1\): Aeryn \(can I bring my alt Kol instead\?\)/,
    );
    expect(digest.message.content).toMatch(
      /Offers to swap \(1\): Cade \(happy to go heals if short\)/,
    );
    expect(digest.message.content).toMatch(/Late \(1\): Bram \(after work\)/);
  });

  it('posts the weekly roster check once a week when turned on, worded or not', async () => {
    const assessments = () =>
      discord.sent.filter(
        (m) => m.to === OPS && m.message.content?.includes('Weekly roster check'),
      );
    // START - 100h is Saturday 7 Nov: this week's slot (Mon 2 Nov 16:00 UTC) has passed.
    await tick(START - 100 * HOUR);
    expect(assessments()).toEqual([]); // off by default
    await store.setConfig(G, { weeklyAssessment: true }, 0);
    ports.recruiting = {
      needs: async () => [{ wowClass: 'priest', specs: 'holy', need: 'medium' }],
    };
    ports.wording = { write: async () => null };
    await tick(START - 99 * HOUR);
    await tick(START - 98 * HOUR);
    expect(assessments()).toHaveLength(1);
    expect(assessments()[0]?.message.content).toMatch(/Recruiting now: Priest \(holy\) medium/);
    const ids = JSON.stringify(assessments()[0]?.message.components ?? []);
    expect(ids).toContain('recruit:hi:priest');
    // A new week, worded this time.
    ports.wording = { write: async () => 'Healers are thin.' };
    signups = [];
    event = { ...event, startsAt: START + 7 * 24 * HOUR };
    await tick(START + 5 * 24 * HOUR);
    expect(assessments()).toHaveLength(2);
    expect(assessments()[1]?.message.content).toBe('**Weekly roster check**\nHealers are thin.');
  });

  it('prints notes raw, as before, when labeling fails', async () => {
    signups = [signup('aeryn'), signup('bram', { status: 'late', note: 'after work' })];
    const fake = createFakeDecisions();
    fake.failNext();
    ports.decisions = fake;
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    const digest = discord.sent.find(
      (m) => m.to === OPS && m.message.content?.includes('confirmed'),
    )!;
    expect(digest.message.content).toMatch(/Late \(1\): Bram \(after work\)/);
    expect(digest.message.content).not.toMatch(/Needs an officer|Offers to swap/);
    expect(fake.requests).toHaveLength(1);
  });

  it('does not send queue auto-promotion notices (seats are the leaders call)', async () => {
    await tick(START - 100 * HOUR);
    signups = [signup('bram', { promotedAt: START - 99 * HOUR })];
    await tick(START - 99 * HOUR);
    const notices = discord.sent.filter((m) => m.message.content?.includes('a spot opened up'));
    expect(notices).toHaveLength(0);
  });

  it('passes siteUrl to signup posts and party drafts for Raid page and quarters buttons (#320)', async () => {
    ports = {
      ...ports,
      links: { discordGuildId: '600000000000000001', siteUrl: 'https://vintageguild.gg/' },
    };
    await tick(START - 100 * HOUR);
    await tick(START - 99 * HOUR); // repeat tick: render hash matches, no spurious edit
    expect(discord.sent.filter((s) => s.kind === 'edit')).toHaveLength(0);
    const post = discord.sent.find((s) => s.kind === 'post' && s.to === SIGNUPS)!;
    expect(JSON.stringify(post.message.components)).toContain(
      'https://vintageguild.gg/raids/raid-1',
    );
    expect(buttonLabels(post.message)).toContain('Raid page');

    await tick(START - 24 * HOUR);
    const draft = discord.sent.find(
      (s) => s.to === OPS && s.message.embeds?.[0]?.title?.startsWith('Party draft'),
    )!;
    expect(JSON.stringify(draft.message.components)).toContain(
      'https://vintageguild.gg/officers/roster',
    );
    expect(buttonLabels(draft.message)).toContain('Edit in the quarters');
  });
});
