// signup-suggest's guess and signup-set's spec for one raid (#148, character-choice §1–2).
import type { Caller } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import { fixedClock, makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { raidsCommands } from '../src/commands';
import {
  type RaidEvent,
  rolesNeeded,
  type Signup,
  type SignupGuess,
  type SignupStatus,
} from '../src/contract';
import type { RaidsDeps } from '../src/store';
import { createMemoryRaidsDeps } from '../src/testing';

const DAY = 24 * 3600 * 1000;
const G = TEST_GUILD_ID;

const member = (id: string): Member => ({
  id,
  guildId: G,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
});

const character = (
  id: string,
  memberId: string,
  cls: Character['class'],
  spec: string,
  role: Character['role'],
  isMain = false,
): Character => ({
  id,
  guildId: G,
  memberId,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  class: cls,
  spec,
  role,
  isMain,
});

const MEMBERS = ['fen', 'solo', 'pair', 'none'].map(member);
const CHARACTERS = [
  character('oak', 'fen', 'druid', 'feral-tank', 'tank'),
  character('ash', 'fen', 'priest', 'holy', 'healer', true),
  character('elm', 'fen', 'mage', 'frost', 'ranged'),
  character('lone', 'solo', 'rogue', 'combat', 'melee'),
  character('left', 'pair', 'warrior', 'arms', 'melee'),
  character('right', 'pair', 'hunter', 'survival', 'ranged'),
];

describe('signup-suggest and a spec for one raid', () => {
  let clock: ReturnType<typeof fixedClock>;
  let registry: ReturnType<typeof testRegistry<RaidsDeps>>;
  let deps: ReturnType<typeof createMemoryRaidsDeps>;
  const as = (memberId: string, tier: Caller['tier'] = 'raider') => makeCaller(tier, { memberId });
  const run = (name: string, input: unknown, caller: Caller) =>
    registry.execute({ name, input, caller }, deps);
  const ok = async <T>(name: string, input: unknown, caller: Caller): Promise<T> => {
    const result = await run(name, input, caller);
    if (!result.success) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.data as T;
  };
  const suggest = (eventId: string, who = 'fen') =>
    ok<SignupGuess | null>('signup-suggest', { eventId }, as(who));

  /** An event in the store, `daysAgo` before now (negative: upcoming). */
  let seq = 0;
  const event = (overrides: Partial<RaidEvent> = {}) =>
    deps.raids.insertEvent({
      guildId: G,
      scheduleId: 'mc',
      name: 'Raid night',
      instance: 'Molten Core',
      kind: 'raid',
      size: 40,
      startsAt: clock.now() + 2 * DAY,
      durationMinutes: 180,
      status: 'open',
      roleTargets: null,
      lootMethodId: null,
      configVersion: 1,
      ...overrides,
    });
  /** A past night the member brought `characterId` to, as `spec`. */
  const night = async (
    daysAgo: number,
    characterId: string,
    opts: { spec?: string; status?: SignupStatus; event?: Partial<RaidEvent> } = {},
  ) => {
    const c = CHARACTERS.find((x) => x.id === characterId)!;
    const past = await event({ startsAt: clock.now() - daysAgo * DAY, ...opts.event });
    // Signup order is insertion order, not raid order, so the window must sort by raid.
    const at = clock.now() - 60 * DAY + ++seq;
    await deps.raids.insertSignup({
      guildId: G,
      eventId: past.id,
      memberId: c.memberId,
      characterId,
      characterName: c.name,
      class: c.class,
      spec: opts.spec ?? c.spec,
      role: c.role,
      status: opts.status ?? 'accepted',
      note: null,
      signedUpAt: at,
      updatedAt: at,
      roster: 'pending',
      group: null,
      queued: false,
      promotedAt: null,
    });
    return past;
  };

  beforeEach(() => {
    clock = fixedClock();
    registry = testRegistry<RaidsDeps>([...raidsCommands], clock);
    deps = createMemoryRaidsDeps(MEMBERS, CHARACTERS);
    seq = 0;
  });

  describe('signup-suggest', () => {
    it('falls back to the main, then the only character, then no guess', async () => {
      const raid = await event();
      expect(await suggest(raid.id)).toEqual({
        characterId: 'ash',
        characterName: 'Ash',
        spec: 'holy',
        role: 'healer',
        reason: 'your main',
      });
      expect(await suggest(raid.id, 'solo')).toMatchObject({
        characterId: 'lone',
        reason: 'your only character',
      });
      expect(await suggest(raid.id, 'pair')).toBeNull();
      expect(await suggest(raid.id, 'none')).toBeNull();
    });

    it("uses this raid's own signup first, with its spec", async () => {
      const raid = await event();
      await night(7, 'elm');
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'tentative', spec: 'feral' },
        as('fen'),
      );
      expect(await suggest(raid.id)).toEqual({
        characterId: 'oak',
        characterName: 'Oak',
        spec: 'feral',
        role: 'melee',
        reason: 'your signup for this raid',
      });
    });

    it('picks the character brought most to the last 5 nights of the same schedule', async () => {
      const raid = await event();
      // Outside the window of 5 though signed up last, and another schedule: neither counts.
      await night(42, 'elm');
      await night(7, 'oak');
      await night(14, 'elm');
      await night(21, 'oak');
      await night(28, 'oak');
      await night(35, 'elm');
      await night(49, 'elm');
      await night(3, 'elm', { event: { scheduleId: 'bwl', instance: 'Blackwing Lair' } });
      expect(await suggest(raid.id)).toMatchObject({
        characterId: 'oak',
        spec: 'feral-tank',
        role: 'tank',
        reason: '3 of your last 5 Molten Core nights',
      });
    });

    it('says "your last N nights" when one character came to all of them', async () => {
      const raid = await event();
      await night(7, 'elm');
      await night(14, 'elm');
      await night(21, 'elm');
      expect(await suggest(raid.id)).toMatchObject({
        characterId: 'elm',
        reason: 'your last 3 Molten Core nights',
      });
      const other = await event({ scheduleId: 'zg', instance: "Zul'Gurub" });
      await night(7, 'oak', { event: { scheduleId: 'zg', instance: "Zul'Gurub" } });
      expect(await suggest(other.id)).toMatchObject({
        characterId: 'oak',
        reason: "your last Zul'Gurub night",
      });
    });

    it('gives a tie to the most recent night, and keeps the spec from it', async () => {
      const raid = await event();
      await night(7, 'oak', { spec: 'feral' });
      await night(14, 'elm');
      await night(21, 'oak');
      await night(28, 'elm');
      expect(await suggest(raid.id)).toMatchObject({
        characterId: 'oak',
        spec: 'feral',
        role: 'melee',
        reason: '2 of your last 4 Molten Core nights',
      });
    });

    it('skips declined answers and characters that were deleted', async () => {
      const raid = await event();
      await night(7, 'elm', { status: 'declined' });
      await night(14, 'elm', { status: 'declined' });
      await night(21, 'oak');
      deps.raids.signups.set('ghost', {
        ...[...deps.raids.signups.values()][0]!,
        id: 'ghost',
        characterId: 'gone',
        status: 'accepted',
        signedUpAt: clock.now() - 1,
      });
      expect(await suggest(raid.id)).toMatchObject({ characterId: 'oak' });
    });

    it("falls through to the series when this raid's signup character was deleted", async () => {
      const raid = await event();
      await night(7, 'elm');
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted' },
        as('fen'),
      );
      deps.members = {
        ...deps.members,
        listCharacters: async (g, memberId) =>
          CHARACTERS.filter((c) => c.guildId === g && c.memberId === memberId && c.id !== 'oak'),
      };
      expect(await suggest(raid.id)).toMatchObject({
        characterId: 'elm',
        reason: 'your last Molten Core night',
      });
    });

    it('for a one-off raid, looks at raids in the same instance', async () => {
      const oneOff = await event({ scheduleId: null });
      await night(7, 'elm', { event: { scheduleId: null } });
      await night(14, 'oak', { event: { scheduleId: null, instance: 'Onyxia’s Lair' } });
      expect(await suggest(oneOff.id)).toMatchObject({ characterId: 'elm' });
      const open = await event({ scheduleId: null, instance: '', kind: 'other', size: null });
      await night(3, 'elm', { event: { scheduleId: null, instance: '', kind: 'other' } });
      expect(await suggest(open.id)).toMatchObject({ reason: 'your main' });
    });

    it('needs a signed-in recruit and a real raid', async () => {
      const raid = await event();
      expect(
        (await run('signup-suggest', { eventId: raid.id }, as('fen', 'member'))).error?.code,
      ).toBe('COMMAND_NOT_FOUND');
      expect(
        (
          await run(
            'signup-suggest',
            { eventId: raid.id },
            makeCaller('recruit', { memberId: undefined }),
          )
        ).error?.code,
      ).toBe('NOT_SIGNED_IN');
      expect((await run('signup-suggest', { eventId: 'nope' }, as('fen'))).error?.code).toBe(
        'RAID_NOT_FOUND',
      );
    });
  });

  it("the store lists a member's signups latest first, up to the limit", async () => {
    await night(14, 'oak');
    await night(7, 'elm');
    await night(21, 'ash');
    const listed = await deps.raids.listSignupsByMember(G, 'fen', 2);
    expect(listed.map((s) => s.characterId)).toEqual(['ash', 'elm']);
    expect(await deps.raids.listSignupsByMember(G, 'solo', 5)).toEqual([]);
  });

  describe('signup-set with a spec', () => {
    it('sets spec and role on the signup only; the saved character keeps its spec', async () => {
      const raid = await event();
      const signup = await ok<Signup>(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted', spec: 'restoration' },
        as('fen'),
      );
      expect(signup).toMatchObject({ spec: 'restoration', role: 'healer' });
      expect(await deps.members.getCharacter(G, 'oak')).toMatchObject({
        spec: 'feral-tank',
        role: 'tank',
      });
    });

    it('refuses a spec from another class', async () => {
      const raid = await event();
      const result = await run(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted', spec: 'protection' },
        as('fen'),
      );
      expect(result.error?.code).toBe('INVALID_SPEC');
      expect(result.error?.suggestion).toMatch(/druid spec/);
      expect(await deps.raids.getSignupByMember(G, raid.id, 'fen')).toBeNull();
    });

    it('keeps the spec when the answer changes and clears it when the character changes', async () => {
      const raid = await event();
      const set = (input: Record<string, unknown>) =>
        ok<Signup>('signup-set', { eventId: raid.id, ...input }, as('fen'));
      await set({ characterId: 'oak', status: 'accepted', spec: 'balance' });
      expect(await set({ characterId: 'oak', status: 'late' })).toMatchObject({
        spec: 'balance',
        role: 'ranged',
        status: 'late',
      });
      expect(await set({ characterId: 'elm', status: 'late' })).toMatchObject({
        spec: 'frost',
        role: 'ranged',
      });
      expect(await set({ characterId: 'oak', status: 'late' })).toMatchObject({
        spec: 'feral-tank',
        role: 'tank',
      });
    });

    it('a spec change alone is a change: signup-changed goes out so the post refreshes', async () => {
      const raid = await event();
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted' },
        as('fen'),
      );
      deps.events.emitted.length = 0;
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted', spec: 'feral' },
        as('fen'),
      );
      expect(deps.events.emitted.map((e) => e.type)).toEqual(['signup-changed']);
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted' },
        as('fen'),
      );
      expect(deps.events.emitted).toHaveLength(1);
    });
  });

  describe('rolesNeeded', () => {
    it('lists the roles with fewer going than the targets, ignoring queued and tentative', async () => {
      const raid = await event({
        size: 5,
        kind: 'dungeon',
        roleTargets: { tank: 1, healer: 1, dps: 3 },
      });
      expect(rolesNeeded(raid, [])).toEqual(['tank', 'healer', 'dps']);
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'oak', status: 'accepted' },
        as('fen'),
      );
      await ok(
        'signup-set',
        { eventId: raid.id, characterId: 'lone', status: 'tentative' },
        as('solo'),
      );
      const signups = await deps.raids.listSignups(G, raid.id);
      expect(rolesNeeded(raid, signups)).toEqual(['healer', 'dps']);
      expect(
        rolesNeeded(
          raid,
          signups.map((s) => ({ ...s, queued: true })),
        ),
      ).toEqual(['tank', 'healer', 'dps']);
    });
  });
});
