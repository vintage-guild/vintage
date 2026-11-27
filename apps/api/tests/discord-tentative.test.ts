import { type Interaction, InteractionType } from '@vintage/discord-kit';
import { type Caller, error, success } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupStatus } from '@vintage/raids/contract';
import { describe, expect, it } from 'vitest';
import { handleTentativeInteraction, type TentativePorts } from '../src/discord-tentative';

const DISCORD_GUILD = '700000000000000001';

const BRAM: Member = {
  id: 'm_bram',
  guildId: 'g1',
  discordId: 'd_bram',
  displayName: 'Bram',
  rank: 'raider',
  tier: 'raider',
  roleIds: [],
  rankSince: null,
  inServer: true,
  prefs: { dmOptOut: false },
  syncedAt: 0,
};

const EVENT: RaidEvent = {
  id: 'evt_mc',
  guildId: 'g1',
  scheduleId: null,
  name: 'Molten Core',
  instance: 'Molten Core',
  kind: 'raid',
  access: 'guild',
  size: 10,
  roleTargets: null,
  startsAt: Date.UTC(2026, 11, 2, 20, 0),
  durationMinutes: 180,
  status: 'open',
  notes: null,
  lootMethodId: null,
  configVersion: 1,
  rosterApprovedAt: null,
  rosterApprovedBy: null,
};

const TENTATIVE: Signup = {
  id: 's_bram',
  guildId: 'g1',
  eventId: 'evt_mc',
  memberId: 'm_bram',
  characterId: 'c_bram',
  characterName: 'Brakka',
  class: 'warrior',
  spec: 'protection',
  role: 'tank',
  alsoRoles: [],
  status: 'tentative',
  lateMinutes: null,
  note: 'work might run late',
  signedUpAt: 0,
  updatedAt: 0,
  updatedBy: 'm_bram',
  roster: 'pending',
  group: null,
  queued: false,
  promotedAt: null,
};

/** A click on the DM's button: no guild id, the user at the top level. */
const click = (customId: string, overrides: Partial<Interaction> = {}): Interaction =>
  ({
    id: 'i1',
    application_id: 'app',
    type: InteractionType.MESSAGE_COMPONENT,
    token: 't',
    version: 1,
    user: { id: 'd_bram', username: 'bram' },
    data: { custom_id: customId, component_type: 2 },
    ...overrides,
  }) as Interaction;

function setup(signup: Signup | null = TENTATIVE) {
  const calls: { caller: Caller; input: unknown }[] = [];
  const logged: [eventId: string, memberId: string, detail: string][] = [];
  let changed = 0;
  const ports: TentativePorts = {
    discordGuildId: DISCORD_GUILD,
    guildId: 'g1',
    memberByDiscordId: async (id) => (id === BRAM.discordId ? BRAM : null),
    event: async (id) => (id === EVENT.id ? EVENT : null),
    signup: async () => signup,
    signupSet: async (caller, input) => {
      calls.push({ caller, input });
      return success({ ...TENTATIVE, status: input.status as SignupStatus });
    },
    afterChange: async () => {
      changed++;
    },
    logAnswer: async (eventId, memberId, detail) => {
      logged.push([eventId, memberId, detail]);
    },
  };
  return { ports, calls, logged, changed: () => changed };
}

const text = (res: unknown) =>
  (res as { data?: { content?: string; components?: unknown[] } }).data;

describe('the tentative-check DM buttons', () => {
  it('ignores other buttons', async () => {
    const { ports } = setup();
    expect(await handleTentativeInteraction(click('signup:evt_mc:accepted'), ports)).toBeNull();
    expect(
      await handleTentativeInteraction(click('tentative-check:evt_mc:maybe'), ports),
    ).toBeNull();
  });

  it('answers Going for "I can make it", clears the reason, and drops the buttons', async () => {
    const { ports, calls, logged, changed } = setup();
    const res = await handleTentativeInteraction(click('tentative-check:evt_mc:yes'), ports);
    expect(logged).toEqual([['evt_mc', 'm_bram', 'Can make it, now Going']]);
    expect(calls).toEqual([
      {
        caller: expect.objectContaining({ memberId: 'm_bram', tier: 'raider', surface: 'discord' }),
        input: { eventId: 'evt_mc', characterId: 'c_bram', status: 'accepted', note: null },
      },
    ]);
    expect(changed()).toBe(1);
    expect(res?.type).toBe(7); // UPDATE_MESSAGE: the DM is rewritten
    expect(text(res)?.content).toBe("Thanks! You're Going for Molten Core on Brakka.");
    expect(text(res)?.components).toEqual([]);
  });

  it('answers Absent for "I can\'t make it" and keeps the reason', async () => {
    const { ports, calls, logged } = setup();
    const res = await handleTentativeInteraction(click('tentative-check:evt_mc:no'), ports);
    expect(logged).toEqual([['evt_mc', 'm_bram', 'Can’t make it, now Absent']]);
    expect(calls[0]?.input).toEqual({
      eventId: 'evt_mc',
      characterId: 'c_bram',
      status: 'declined',
    });
    expect(text(res)?.content).toMatch(/You're Absent for Molten Core/);
  });

  it('changes nothing for "Still don\'t know"', async () => {
    const { ports, calls, logged, changed } = setup();
    const res = await handleTentativeInteraction(click('tentative-check:evt_mc:unsure'), ports);
    expect(logged).toEqual([['evt_mc', 'm_bram', 'Still doesn’t know, stays Tentative']]);
    expect(calls).toEqual([]);
    expect(changed()).toBe(0);
    expect(text(res)?.content).toMatch(/still Tentative/);
  });

  it('leaves an answer changed since the DM alone', async () => {
    const { ports, calls, logged } = setup({ ...TENTATIVE, status: 'declined' });
    const res = await handleTentativeInteraction(click('tentative-check:evt_mc:yes'), ports);
    expect(calls).toEqual([]);
    expect(logged).toEqual([]);
    expect(text(res)?.content).toMatch(/you're Absent/);
  });

  it('refuses unknown people and clicks from another server', async () => {
    const { ports, calls } = setup();
    const stranger = await handleTentativeInteraction(
      click('tentative-check:evt_mc:yes', { user: { id: 'd_other', username: 'x' } } as never),
      ports,
    );
    expect(text(stranger)?.content).toMatch(/don't know you/);
    const elsewhere = await handleTentativeInteraction(
      click('tentative-check:evt_mc:yes', { guild_id: '999999999999999999' } as never),
      ports,
    );
    expect(text(elsewhere)?.content).toMatch(/only takes signups/);
    expect(calls).toEqual([]);
  });

  it('says why when signup-set refuses, such as a locked raid', async () => {
    const { ports, logged } = setup();
    ports.signupSet = async () =>
      error('SIGNUPS_LOCKED', 'Signups for Molten Core are locked') as never;
    const res = await handleTentativeInteraction(click('tentative-check:evt_mc:yes'), ports);
    expect(logged).toEqual([]);
    expect(text(res)?.content).toBe(
      "I couldn't change your signup. Signups for Molten Core are locked. Use the signup post instead.",
    );
  });
});
