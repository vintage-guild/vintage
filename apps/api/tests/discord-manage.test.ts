import { coordinatorCommands } from '@vintage/coordinator/commands';
import { createMemoryCoordinatorDeps } from '@vintage/coordinator/testing';
import {
  type Interaction,
  type InteractionResponse,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from '@vintage/discord-kit';
import type { Caller, Tier } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { raidsCommands } from '@vintage/raids/commands';
import type { RaidEvent } from '@vintage/raids/contract';
import { createMemoryRaidsDeps } from '@vintage/raids/testing';
import { fixedClock, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  handleManageInteraction,
  type ManagePorts,
  NEEDS_LEADER_MANAGE,
  NOTHING_CHANGED,
  parseManageId,
} from '../src/discord-manage';

const GUILD = 'guild-test';
const DISCORD_GUILD = '600000000000000001';
/** Mon 26 Oct 2026, 12:00 New York. */
const NOW = Date.UTC(2026, 9, 26, 16);
/** Tue 10 Nov 2026, 20:00 New York (EST). */
const TUE_8PM = Date.UTC(2026, 10, 11, 1);
/** Wed 11 Nov 2026, 20:00 New York (EST). */
const WED_8PM = Date.UTC(2026, 10, 12, 1);

const member = (id: string, tier: Tier): Member => ({
  id,
  guildId: GUILD,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  inServer: true,
  rank: null,
  tier,
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});

type Deps = ReturnType<typeof createMemoryRaidsDeps> &
  ReturnType<typeof createMemoryCoordinatorDeps>;
let deps: Deps;
let ticks: number;
let ports: ManagePorts;
let raid: RaidEvent;
const members = [member('rook', 'leader'), member('aeryn', 'raider')];
const caller = (m: Member): Caller => ({
  surface: 'discord',
  guildId: GUILD,
  tier: m.tier,
  memberId: m.id,
  discordId: m.discordId,
});

beforeEach(async () => {
  deps = {
    ...createMemoryRaidsDeps(members),
    ...createMemoryCoordinatorDeps(() => ({ guildId: GUILD, events: [], members: [] })),
  };
  const registry = testRegistry<Deps>([...raidsCommands, ...coordinatorCommands], fixedClock(NOW));
  ticks = 0;
  ports = {
    discordGuildId: DISCORD_GUILD,
    guildId: GUILD,
    memberByDiscordId: async (discordId) => members.find((m) => m.discordId === discordId) ?? null,
    run: (who, name, input, confirmToken) =>
      registry.execute({ name, input, caller: who, confirmToken }, deps),
    afterChange: async () => {
      ticks++;
    },
    now: () => NOW,
  };
  const made = await ports.run(caller(members[0]!), 'raid-create', {
    name: 'Raid night',
    instance: 'Molten Core',
    size: 40,
    startsAt: TUE_8PM,
  });
  expect(made.success).toBe(true);
  raid = made.data as RaidEvent;
});

const click = (who: string, customId: string): Interaction => ({
  id: 'i',
  application_id: 'app',
  token: 'token',
  type: InteractionType.MESSAGE_COMPONENT,
  guild_id: DISCORD_GUILD,
  member: { user: { id: `d-${who}`, username: who }, roles: [] },
  data: { custom_id: customId, component_type: 2 },
});

const submit = (who: string, customId: string, date: string, time: string): Interaction =>
  ({
    id: 'i',
    application_id: 'app',
    token: 'token',
    type: InteractionType.MODAL_SUBMIT,
    guild_id: DISCORD_GUILD,
    member: { user: { id: `d-${who}`, username: who }, roles: [] },
    data: {
      custom_id: customId,
      components: [
        { type: 18, component: { type: 3, custom_id: 'date', values: [date] } },
        { type: 18, component: { type: 3, custom_id: 'time', values: [time] } },
      ],
    },
  }) as unknown as Interaction;

/** The message part of a response (a reply or an update). */
const dataOf = (r: InteractionResponse | null) =>
  (r && 'data' in r ? r.data : undefined) as { content?: string; flags?: number } | undefined;
const content = (r: InteractionResponse | null) => dataOf(r)?.content ?? '';
const customIds = (r: InteractionResponse | null) =>
  JSON.stringify(dataOf(r) ?? {}).match(/manage:[a-z]+:[A-Za-z0-9_-]+/g) ?? [];

const event = async () => deps.raids.getEvent(GUILD, raid.id);

describe('parseManageId', () => {
  it('reads the menu and each step, and nothing else', () => {
    expect(parseManageId('manage:ev1')).toEqual({ step: 'menu', eventId: 'ev1' });
    expect(parseManageId('manage:move:ev1')).toEqual({ step: 'move', eventId: 'ev1' });
    expect(parseManageId('manage:explode:ev1')).toBeNull();
    expect(parseManageId('manage:move:ev 1')).toBeNull();
    expect(parseManageId('signup:ev1:accepted')).toBeNull();
    expect(parseManageId(undefined)).toBeNull();
  });
});

describe('the Manage button', () => {
  it('ignores interactions that are not its own', async () => {
    expect(await handleManageInteraction(click('rook', 'roster:x'), ports)).toBeNull();
  });

  it('tells a raider privately that it needs a raid leader', async () => {
    const r = await handleManageInteraction(click('aeryn', `manage:${raid.id}`), ports);
    expect(r?.type).toBe(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE);
    expect(dataOf(r)?.flags).toBe(MessageFlags.EPHEMERAL);
    expect(content(r)).toBe(NEEDS_LEADER_MANAGE);
    // A raider can't reach a later step by crafting its id either.
    const confirm = await handleManageInteraction(
      click('aeryn', `manage:confirm:${raid.id}`),
      ports,
    );
    expect(content(confirm)).toBe(NEEDS_LEADER_MANAGE);
    expect((await event())?.status).toBe('open');
  });

  it('refuses clicks from another server', async () => {
    const r = await handleManageInteraction(
      { ...click('rook', `manage:${raid.id}`), guild_id: '999' },
      ports,
    );
    expect(content(r)).toMatch(/only runs raids in the Vintage guild server/);
  });

  it('shows a leader a private menu with Move and Cancel', async () => {
    const r = await handleManageInteraction(click('rook', `manage:${raid.id}`), ports);
    expect(dataOf(r)?.flags).toBe(MessageFlags.EPHEMERAL);
    expect(content(r)).toContain('**Raid night**');
    expect(customIds(r)).toEqual([`manage:move:${raid.id}`, `manage:cancel:${raid.id}`]);
  });

  it('Move opens a form on the event’s own day and time, and moves it', async () => {
    const form = await handleManageInteraction(click('rook', `manage:move:${raid.id}`), ports);
    expect(form?.type).toBe(InteractionResponseType.MODAL);
    const json = JSON.stringify(form);
    expect(json).toContain(`"custom_id":"manage:when:${raid.id}"`);
    expect(json).toMatch(/"value":"2026-11-10","default":true/);
    expect(json).toMatch(/"value":"20:00"[^}]*"default":true/);

    const r = await handleManageInteraction(
      submit('rook', `manage:when:${raid.id}`, '2026-11-11', '20:00'),
      ports,
    );
    expect(r?.type).toBe(InteractionResponseType.UPDATE_MESSAGE);
    expect(content(r)).toMatch(/^Moved \*\*Raid night\*\*/);
    expect((await event())?.startsAt).toBe(WED_8PM);
    expect(ticks).toBe(1);
  });

  it('Move to the same time changes nothing', async () => {
    const r = await handleManageInteraction(
      submit('rook', `manage:when:${raid.id}`, '2026-11-10', '20:00'),
      ports,
    );
    expect(content(r)).toBe(NOTHING_CHANGED);
    expect(ticks).toBe(0);
  });

  it('Cancel asks first, and Keep it leaves the event alone', async () => {
    const ask = await handleManageInteraction(click('rook', `manage:cancel:${raid.id}`), ports);
    expect(content(ask)).toMatch(/^Cancel \*\*Raid night\*\*.*Nobody has signed up yet/);
    expect(customIds(ask)).toEqual([`manage:confirm:${raid.id}`, `manage:keep:${raid.id}`]);
    expect((await event())?.status).toBe('open');

    const keep = await handleManageInteraction(click('rook', `manage:keep:${raid.id}`), ports);
    expect(content(keep)).toBe(NOTHING_CHANGED);
    expect((await event())?.status).toBe('open');
  });

  it('Yes, cancel it cancels the event and starts a tick', async () => {
    const r = await handleManageInteraction(click('rook', `manage:confirm:${raid.id}`), ports);
    expect(content(r)).toMatch(/^Cancelled \*\*Raid night\*\*/);
    expect((await event())?.status).toBe('cancelled');
    expect(ticks).toBe(1);

    // The menu on a cancelled event says so instead of offering changes.
    const again = await handleManageInteraction(click('rook', `manage:${raid.id}`), ports);
    expect(content(again)).toMatch(/is cancelled, so it can’t be changed/);
  });
});
