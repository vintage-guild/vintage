import { DiscordRestError, ScheduledEventStatus } from '@vintage/discord-kit';
import { DEFAULT_TIMINGS, type RaidEvent } from '@vintage/raids/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { planTick } from '../src/domain/plan';
import { MAX_SERVER_EVENTS, renderServerEvent, signupLink } from '../src/domain/server-event';
import type { TickEvent, TickPorts } from '../src/store';
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
const DISCORD_GUILD = '100000000000000009';
const SIGNUPS = '100000000000000001';
const OPS = '100000000000000002';
const START = Date.UTC(2026, 10, 12, 1);

const raid = (id: string, overrides: Partial<RaidEvent> = {}): RaidEvent => ({
  id,
  guildId: G,
  scheduleId: null,
  name: 'MC nights',
  instance: 'Molten Core',
  kind: 'raid',
  size: 40,
  startsAt: START,
  durationMinutes: 180,
  status: 'open',
  roleTargets: null,
  lootMethodId: null,
  configVersion: 1,
  ...overrides,
});

const asTick = (event: RaidEvent): TickEvent => ({ event, timings: DEFAULT_TIMINGS, signups: [] });

describe('renderServerEvent', () => {
  it('maps the raid to an EXTERNAL event inside Discord limits', () => {
    const link = signupLink(
      { discordGuildId: DISCORD_GUILD, siteUrl: null },
      { channelId: SIGNUPS, messageId: 'msg_1' },
    );
    const data = renderServerEvent(asTick(raid('r1')), link);
    expect(data).toEqual({
      name: 'MC nights',
      scheduled_start_time: '2026-11-12T01:00:00.000Z',
      scheduled_end_time: '2026-11-12T04:00:00.000Z',
      description: expect.stringContaining(
        `https://discord.com/channels/${DISCORD_GUILD}/${SIGNUPS}/msg_1`,
      ),
      entity_metadata: { location: 'Molten Core' },
    });
    expect(data.description).toContain('not a signup');
    expect(data.description).toContain('40-player raid: Molten Core.');
  });

  it('an open "other" event with no instance reads cleanly', () => {
    const data = renderServerEvent(
      asTick(raid('r1', { kind: 'other', size: null, name: 'Westfall levelling', instance: '' })),
      null,
    );
    expect(data.name).toBe('Event · Westfall levelling');
    expect(data.description).toMatch(/^Open event\.\n/);
    expect(data.entity_metadata.location).toBe('Event');
  });

  it('names the kind for dungeons, battlegrounds, and other events', () => {
    const cases = [
      ['dungeon', 5, 'Dungeon · MC nights', '5-player dungeon'],
      ['battleground', 15, 'Battleground · MC nights', '15-player battleground'],
      ['other', 3, 'Event · MC nights', '3-player event'],
    ] as const;
    for (const [kind, size, name, words] of cases) {
      const data = renderServerEvent(asTick(raid('r1', { kind, size })), null);
      expect(data.name).toBe(name);
      expect(data.description).toContain(words);
      expect(data.description).toContain(`Sign up on the ${words.split(' ')[1]} card`);
    }
  });

  it('clips long names, locations, and descriptions', () => {
    const long = 'x'.repeat(1500);
    const data = renderServerEvent(asTick(raid('r1', { name: long, instance: long })), long);
    expect(data.name).toHaveLength(100);
    expect(data.entity_metadata.location).toHaveLength(100);
    expect(data.description!.length).toBeLessThanOrEqual(1000);
  });

  it('links to the site without a Discord server id, and to nothing without either', () => {
    const post = { channelId: SIGNUPS, messageId: 'msg_1' };
    expect(signupLink({ discordGuildId: null, siteUrl: 'https://vintageguild.gg/' }, post)).toBe(
      'https://vintageguild.gg',
    );
    expect(signupLink(undefined, post)).toBeNull();
    expect(renderServerEvent(asTick(raid('r1')), null).description).toContain(
      'raid card in Discord',
    );
  });
});

describe('server events in the tick', () => {
  let events: RaidEvent[];
  let cancelled: RaidEvent[];
  let store: ReturnType<typeof createMemoryCoordinatorStore>;
  let discord: ReturnType<typeof createFakeDiscord>;
  let ports: TickPorts;

  const tick = (at = START - 100 * HOUR) => runTick(ports, G, at);
  const action = async (rule: string, eventId = 'r1') =>
    (await store.listActions(G)).find((a) => a.rule === rule && a.eventId === eventId);

  beforeEach(async () => {
    events = [raid('r1')];
    cancelled = [];
    store = createMemoryCoordinatorStore();
    discord = createFakeDiscord();
    ports = {
      store,
      raids: createFakeRaids(),
      discord,
      polls: createFakePolls(),
      links: { discordGuildId: DISCORD_GUILD, siteUrl: null },
      source: createStateSource(
        () => ({
          guildId: G,
          events: events.map(asTick),
          cancelled: cancelled.map(asTick),
          members: [],
        }),
        store,
      ),
    };
    await store.setConfig(G, { signupChannelId: SIGNUPS, opsChannelId: OPS }, 0);
  });

  it('is off by default', async () => {
    await tick();
    await tick();
    expect(discord.eventCalls).toEqual([]);
  });

  it('creates one event after the post, storing its Discord id, and is idempotent', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick(); // the post goes out first
    expect(discord.eventCalls).toEqual([]);
    await tick();
    await tick();
    expect(discord.eventCalls.map((c) => c.kind)).toEqual(['create']);
    const [created] = discord.serverEvents.values();
    expect(created!.data.description).toContain(
      `https://discord.com/channels/${DISCORD_GUILD}/${SIGNUPS}/msg_1`,
    );
    expect(await action('server-event')).toMatchObject({
      status: 'sent',
      target: 'r1',
      discordMessageId: created!.id,
    });
  });

  it('edits the event when the raid moves or is renamed, once per change', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick();
    await tick();
    events = [raid('r1', { startsAt: START + 24 * HOUR, name: 'MC (moved)' })];
    await tick();
    await tick();
    const edits = discord.eventCalls.filter((c) => c.kind === 'edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.data).toMatchObject({
      name: 'MC (moved)',
      scheduled_start_time: '2026-11-13T01:00:00.000Z',
    });
  });

  it('cancels the event when the raid is cancelled, once', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick();
    await tick();
    cancelled = [raid('r1', { status: 'cancelled' })];
    events = [];
    await tick();
    await tick();
    const [ev] = discord.serverEvents.values();
    expect(ev!.status).toBe(ScheduledEventStatus.CANCELED);
    expect(discord.eventCalls.map((c) => c.kind)).toEqual(['create', 'edit']);
    expect(await action('server-event-cancel')).toMatchObject({ status: 'sent' });
  });

  it('leaves the event alone once the raid has started or completed', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick();
    await tick();
    events = [raid('r1', { status: 'completed' })];
    await tick();
    await tick(START + HOUR);
    expect(discord.eventCalls.map((c) => c.kind)).toEqual(['create']);
  });

  it('recreates an event someone deleted in Discord', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick();
    await tick();
    const [first] = discord.serverEvents.keys();
    discord.deleteEvent(first!);
    events = [raid('r1', { name: 'Renamed' })];
    expect((await tick()).outcomes).toContainEqual(
      expect.objectContaining({ rule: 'server-event-update', status: 'failed' }),
    );
    await tick();
    expect(discord.eventCalls.map((c) => c.kind)).toEqual(['create', 'create']);
    expect([...discord.serverEvents.values()].map((e) => e.data.name)).toEqual(['Renamed']);
  });

  it('names the missing permission, tells officers once, and retries', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    await tick();
    const create = discord.createEvent;
    discord.createEvent = async () => {
      throw new DiscordRestError('POST', '/guilds/x/scheduled-events', 403, {
        code: 50013,
        message: 'Missing Permissions',
      });
    };
    await tick();
    await tick();
    expect(await action('server-event')).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining('Create Events permission'),
    });
    expect(discord.sent.filter((s) => s.to === OPS)).toHaveLength(1);
    discord.createEvent = create;
    await tick();
    expect(await action('server-event')).toMatchObject({ status: 'sent' });
  });

  it('stops creating at MAX_SERVER_EVENTS', async () => {
    await store.setConfig(G, { serverEvents: true }, 0);
    events = Array.from({ length: MAX_SERVER_EVENTS + 5 }, (_, i) =>
      raid(`r${i}`, { startsAt: START + i * HOUR }),
    );
    await tick();
    await tick();
    await tick();
    expect(discord.eventCalls.filter((c) => c.kind === 'create')).toHaveLength(MAX_SERVER_EVENTS);
  });
});

describe('planTick server events', () => {
  it('plans nothing without the hash, even with the toggle on', async () => {
    const store = createMemoryCoordinatorStore();
    await store.setConfig(G, { signupChannelId: SIGNUPS, serverEvents: true }, 0);
    const config = await store.getConfig(G);
    const post = {
      id: 'a1',
      guildId: G,
      eventId: 'r1',
      rule: 'post',
      target: SIGNUPS,
      status: 'sent' as const,
      discordMessageId: 'msg_1',
      detail: null,
      renderHash: 'h',
      claimedAt: 0,
      finishedAt: 0,
    };
    const state = {
      guildId: G,
      config,
      events: [asTick(raid('r1'))],
      members: [],
      actions: [post],
    };
    const now = START - 100 * HOUR;
    expect(planTick(state, now, () => 'h').map((a) => a.kind)).not.toContain('server-event');
    expect(
      planTick(
        state,
        now,
        () => 'h',
        () => 'e',
      ).map((a) => a.kind),
    ).toContain('server-event');
  });
});
