// The tentative check (`tentativeCheck`): once the leads get the party draft, Tentative signups
// get a DM asking if they can make it, with three answer buttons.
import type { MessageData } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type Signup } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TickEvent, TickMember, TickPorts } from '../src/store';
import {
  createFakeDiscord,
  createFakePolls,
  createFakeRaids,
  createMemoryCoordinatorStore,
  createStateSource,
} from '../src/testing';
import { runTick } from '../src/tick';

const HOUR = 3600 * 1000;
const G = 'guild-test';
const SIGNUPS = '100000000000000001';
const OPS = '100000000000000002';
const START = Date.UTC(2026, 10, 12, 1);

const member = (id: string, rank: TickMember['rank'], dmOptOut = false): TickMember => ({
  memberId: id,
  discordId: `3000000000000000${id.length}${id.charCodeAt(0)}`,
  displayName: id,
  rank,
  dmOptOut,
});

const MEMBERS = [
  member('aeryn', 'raider'),
  member('bram', 'raider'),
  member('cade', 'raider', true),
  member('dax', 'officer'),
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

describe('the tentative check', () => {
  let event: RaidEvent;
  let signups: Signup[];
  let store: ReturnType<typeof createMemoryCoordinatorStore>;
  let discord: ReturnType<typeof createFakeDiscord>;
  let ports: TickPorts;

  const tick = (at: number) => runTick(ports, G, at);
  const checks = () =>
    discord.sent.filter((s) => s.kind === 'dm' && s.message.content?.includes('Tentative on'));

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
    signups = [
      signup('aeryn'),
      signup('bram', { status: 'tentative', note: 'work might run late' }),
      signup('cade', { status: 'tentative' }),
      signup('dax'),
    ];
    store = createMemoryCoordinatorStore();
    discord = createFakeDiscord();
    const raids = createFakeRaids(() => {
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

  it('is off by default', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    await tick(START - 23 * HOUR);
    expect(checks()).toEqual([]);
  });

  it('DMs Tentative signups once after the party draft, with three answer buttons', async () => {
    await store.setConfig(G, { tentativeCheck: true }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 30 * HOUR);
    expect(checks()).toEqual([]); // no draft yet
    await tick(START - 24 * HOUR); // the party draft goes to the leads
    const draft = discord.sent.find((s) => s.message.embeds?.[0]?.title?.startsWith('Party draft'));
    expect(draft?.to).toBe(OPS);
    await tick(START - 23 * HOUR);
    await tick(START - 22 * HOUR);
    const sent = checks();
    // Cade turned DMs off.
    expect(sent.map((d) => d.to)).toEqual([member('bram', 'raider').discordId]);
    expect(sent[0]?.message.content).toContain('Tentative on Bram');
    expect(customIds(sent[0]!.message)).toEqual([
      'tentative-check:raid-1:yes',
      'tentative-check:raid-1:no',
      'tentative-check:raid-1:unsure',
    ]);
    const actions = await store.listActions(G);
    expect(actions.find((a) => a.rule === 'tentative-check')?.target).toBe('bram');
  });

  it('leaves out anyone who turned Tentative after the draft', async () => {
    await store.setConfig(G, { tentativeCheck: true }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    signups = signups.map((s) =>
      s.memberId === 'aeryn'
        ? { ...s, status: 'tentative', updatedAt: START - 23.5 * HOUR, updatedBy: 'aeryn' }
        : s,
    );
    await tick(START - 23 * HOUR);
    expect(checks().map((d) => d.to)).toEqual([member('bram', 'raider').discordId]);
  });

  it('still asks someone a leader seated after the draft', async () => {
    await store.setConfig(G, { tentativeCheck: true }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    signups = signups.map((s) =>
      s.memberId === 'bram'
        ? { ...s, roster: 'rostered', group: 1, updatedAt: START - 23.5 * HOUR, updatedBy: 'rook' }
        : s,
    );
    await tick(START - 23 * HOUR);
    expect(checks().map((d) => d.to)).toEqual([member('bram', 'raider').discordId]);
  });

  it('sends nothing once signups lock', async () => {
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    await store.setConfig(G, { tentativeCheck: true }, 0);
    await tick(START - 2 * HOUR);
    await tick(START - HOUR);
    expect(checks()).toEqual([]);
  });

  it('follows dmRanks while testing', async () => {
    await store.setConfig(G, { tentativeCheck: true, dmRanks: ['officer'] }, 0);
    await tick(START - 100 * HOUR);
    await tick(START - 24 * HOUR);
    await tick(START - 23 * HOUR);
    expect(checks()).toEqual([]);
  });
});
