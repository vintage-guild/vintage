import { DiscordRestError } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent, type RaidRecord } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { bossesLine, durationText, renderRaidSummary } from '../src/domain/summary';
import type { TickPorts, TickRecorded } from '../src/store';
import {
  createFakeDiscord,
  createFakePolls,
  createFakeRaids,
  createMemoryCoordinatorStore,
  createStateSource,
  messageText,
} from '../src/testing';
import { runTick } from '../src/tick';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const G = 'guild-test';
const SIGNUPS = '100000000000000001';
const OPS = '100000000000000002';
/** Thu 10 Dec 2026, 20:00 New York. */
const START = Date.UTC(2026, 11, 11, 1);

const event: RaidEvent = {
  id: 'raid-1',
  guildId: G,
  scheduleId: null,
  name: 'Barrow nights',
  instance: 'Barrow Deeps',
  kind: 'raid',
  size: 10,
  startsAt: START,
  durationMinutes: 180,
  status: 'completed',
  roleTargets: null,
  lootMethodId: null,
  notes: null,
  configVersion: 1,
};

const record = (overrides: Partial<RaidRecord> = {}): RaidRecord => ({
  id: 'record-1',
  guildId: G,
  eventId: event.id,
  exportKey: 'Aeryn@1',
  exporter: 'Aeryn',
  exportedAt: START + 3 * HOUR,
  addonVersion: '0.2.0',
  snapshots: 3,
  attended: 3,
  drops: 2,
  recordedAt: START + 4 * HOUR,
  recordedBy: 'officer-1',
  bosses: {
    killed: 6,
    total: 8,
    wipes: 14,
    firstPullAt: START + 10 * MIN,
    lastEndAt: START + 10 * MIN + 2 * HOUR + 41 * MIN,
  },
  ...overrides,
});

const recorded = (overrides: Partial<TickRecorded> = {}): TickRecorded => ({
  tick: { event, timings: DEFAULT_TIMINGS, signups: [] },
  record: record(),
  attended: ['Aeryn', 'Bramble', 'Doran-Stonemaul'],
  stoodBy: [],
  drops: [
    { itemId: 16_800, itemName: 'Arcanist Boots', count: 1, looter: 'Bramble' },
    { itemId: 17_011, itemName: null, count: 2, looter: 'Doran-Stonemaul' },
  ],
  ...overrides,
});

describe('the raid summary', () => {
  it('reads the night as bosses down out of the raid, wipes, and time', () => {
    expect(bossesLine(record().bosses!)).toBe('Bosses: 6/8, 14 wipes, 2h 41m');
    expect(
      bossesLine({ killed: 1, total: null, wipes: 1, firstPullAt: 0, lastEndAt: 45 * MIN }),
    ).toBe('Bosses: 1 killed, 1 wipe, 45m');
    expect(durationText(2 * HOUR)).toBe('2h');
    expect(durationText(2 * HOUR + 29_999)).toBe('2h');
    expect(durationText(0)).toBe('0m');
  });

  it('puts the bosses first, then who came and what dropped', () => {
    const message = renderRaidSummary(recorded());
    const [summary] = message.embeds!;
    expect(summary!.title).toBe('Raid summary · Barrow nights · Barrow Deeps');
    expect(summary!.description!.split('\n')[0]).toBe('**Bosses: 6/8, 14 wipes, 2h 41m**');
    expect(summary!.description).toContain('from Aeryn’s export');
    expect(summary!.fields).toEqual([
      { name: 'Came · 3', value: 'Aeryn, Bramble, Doran-Stonemaul' },
      {
        name: 'Loot · 2',
        value: 'Arcanist Boots → Bramble\nItem 17011 ×2 → Doran-Stonemaul',
      },
    ]);
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });

  it('lists who stood by apart from who came', () => {
    const [summary] = renderRaidSummary(recorded({ stoodBy: ['Cade', 'Fenna'] })).embeds!;
    expect(summary!.fields![0]).toEqual({
      name: 'Came · 3',
      value: 'Aeryn, Bramble, Doran-Stonemaul',
    });
    expect(summary!.fields![1]).toEqual({ name: 'Stood by · 2', value: 'Cade, Fenna' });
  });

  it('leaves the bosses out for an export without them, and caps long lists', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Raider${i}`);
    const message = renderRaidSummary(
      recorded({ record: record({ bosses: null }), attended: many, drops: [] }),
    );
    const [summary] = message.embeds!;
    expect(summary!.description).not.toContain('Bosses');
    expect(summary!.fields![0]).toMatchObject({ name: 'Came · 50' });
    expect(summary!.fields![0]!.value).toMatch(/Raider44, \+5 more$/);
    expect(summary!.fields![1]).toEqual({ name: 'Loot · 0', value: 'Nothing dropped' });
  });
});

describe('runTick: the raid summary', () => {
  let store: ReturnType<typeof createMemoryCoordinatorStore>;
  let discord: ReturnType<typeof createFakeDiscord>;
  let ports: TickPorts;
  let raids: TickRecorded[];
  const tick = (at = START + 5 * HOUR) => runTick(ports, G, at);
  const summaries = () => discord.sent.filter((m) => m.to === SIGNUPS);

  beforeEach(async () => {
    store = createMemoryCoordinatorStore();
    discord = createFakeDiscord();
    raids = [];
    ports = {
      store,
      raids: createFakeRaids(),
      discord,
      polls: createFakePolls(),
      source: createStateSource(
        () => ({ guildId: G, events: [], members: [], recorded: raids }),
        store,
      ),
    };
    await store.setConfig(G, { signupChannelId: SIGNUPS, opsChannelId: OPS }, 0);
  });

  it('posts once the raid has a record, to the signup channel, and only once', async () => {
    await tick();
    expect(discord.sent).toEqual([]);
    raids = [recorded()];
    await tick();
    await tick();
    expect(summaries().map((m) => m.kind)).toEqual(['post']);
    expect(messageText(summaries()[0]!.message)).toContain('Bosses: 6/8, 14 wipes, 2h 41m');
    const [action] = await store.listActions(G);
    expect(action).toMatchObject({ rule: 'raid-summary', target: SIGNUPS, status: 'sent' });
  });

  it('edits the post in place when a different export replaces the record', async () => {
    raids = [recorded()];
    await tick();
    const posted = summaries()[0]!;
    raids = [
      recorded({
        record: record({
          exportKey: 'Aeryn@2',
          bosses: { ...record().bosses!, killed: 7, wipes: 15 },
        }),
      }),
    ];
    await tick();
    await tick();
    const edits = summaries().filter((m) => m.kind === 'edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.messageId).toBe(posted.messageId);
    expect(messageText(edits[0]!.message)).toContain('Bosses: 7/8, 15 wipes');
  });

  it('posts again if someone deleted the summary in Discord', async () => {
    raids = [recorded()];
    await tick();
    discord.edit = async () => {
      throw new DiscordRestError('PATCH', '/channels/x/messages/y', 404, {
        code: 10008,
        message: 'Unknown Message',
      });
    };
    raids = [recorded({ attended: ['Aeryn'] })];
    await tick(); // the edit fails: the summary is marked for posting again
    await tick();
    expect(summaries().filter((m) => m.kind === 'post')).toHaveLength(2);
  });

  it('posts nothing while paused', async () => {
    await store.setConfig(G, { paused: true }, 0);
    raids = [recorded()];
    await tick();
    expect(discord.sent).toEqual([]);
  });
});
