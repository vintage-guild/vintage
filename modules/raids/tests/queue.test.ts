import type { Caller } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import {
  fixedClock,
  makeCaller,
  previewAndConfirm,
  TEST_GUILD_ID,
  testRegistry,
} from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { raidsCommands } from '../src/commands';
import type { RaidEvent, Signup } from '../src/contract';
import type { RaidsDeps } from '../src/store';
import { createMemoryRaidsDeps } from '../src/testing';

const G = TEST_GUILD_ID;
const MINUTE = 60 * 1000;

// Eleven raiders for a 10-person raid: p1 … p11, each with one warrior.
const PEOPLE = Array.from({ length: 11 }, (_, i) => `p${i + 1}`);
const MEMBERS: Member[] = PEOPLE.map((id) => ({
  id,
  guildId: G,
  discordId: `d-${id}`,
  displayName: id,
  roleIds: [],
  inServer: true,
  rank: 'raider',
  tier: 'raider',
  prefs: { dmOptOut: false },
  syncedAt: 0,
  rankSince: null,
}));
const CHARACTERS: Character[] = [
  ...PEOPLE.map((id) => ({
    id: `char-${id}`,
    guildId: G,
    memberId: id,
    name: id.toUpperCase(),
    class: 'warrior' as const,
    spec: 'fury',
    role: 'melee' as const,
    alsoRoles: [],
    isMain: true,
  })),
  {
    id: 'char-p1-alt',
    guildId: G,
    memberId: 'p1',
    name: 'P1alt',
    class: 'mage',
    spec: 'frost',
    role: 'ranged',
    alsoRoles: [],
    isMain: false,
  },
];

describe('signup queue', () => {
  let clock: ReturnType<typeof fixedClock>;
  let registry: ReturnType<typeof testRegistry<RaidsDeps>>;
  let deps: ReturnType<typeof createMemoryRaidsDeps>;
  let raid: RaidEvent;
  const leader = makeCaller('leader', { memberId: 'leader' });
  const as = (id: string): Caller => makeCaller('raider', { memberId: id });

  const answer = async (id: string, status: string, characterId = `char-${id}`) => {
    const result = await registry.execute(
      {
        name: 'signup-set',
        input: {
          eventId: raid.id,
          characterId,
          status,
          ...(status === 'late' ? { lateMinutes: 15 } : {}),
        },
        caller: as(id),
      },
      deps,
    );
    if (!result.success) throw new Error(JSON.stringify(result.error));
    clock.advance(MINUTE);
    return result as { data: Signup; reasoning?: string };
  };
  const signupOf = (id: string) => [...deps.raids.signups.values()].find((s) => s.memberId === id)!;

  beforeEach(async () => {
    clock = fixedClock();
    registry = testRegistry<RaidsDeps>([...raidsCommands], clock);
    deps = createMemoryRaidsDeps(MEMBERS, CHARACTERS);
    const created = await registry.execute(
      {
        name: 'raid-create',
        input: {
          name: 'ZG',
          instance: "Zul'Gurub",
          size: 10,
          startsAt: clock.now() + 3 * 24 * 60 * MINUTE,
        },
        caller: leader,
      },
      deps,
    );
    raid = created.data as RaidEvent;
  });

  it('never queues or auto-promotes signups past the raid size (seating is comp-based)', async () => {
    for (const id of PEOPLE.slice(0, 10)) await answer(id, 'accepted');
    const eleventh = await answer('p11', 'accepted');
    expect(eleventh.data).toMatchObject({ queued: false, promotedAt: null });
    expect(PEOPLE.slice(0, 10).every((id) => !signupOf(id).queued)).toBe(true);

    await answer('p3', 'declined');
    expect(signupOf('p11')).toMatchObject({ queued: false, promotedAt: null });
    expect(deps.events.emitted.filter((e) => e.type === 'signup-promoted')).toHaveLength(0);
  });

  it('roster-remove never auto-promotes anyone', async () => {
    for (const id of PEOPLE) await answer(id, 'accepted');
    await previewAndConfirm(
      registry,
      { name: 'roster-remove', input: { signupId: signupOf('p1').id }, caller: leader },
      deps,
    );
    expect(signupOf('p11')).toMatchObject({ queued: false, promotedAt: null });
    expect(deps.events.emitted.filter((e) => e.type === 'signup-promoted')).toHaveLength(0);
  });

  it('keeps signedUpAt as a record when changing answers (no place in line to lose)', async () => {
    await answer('p1', 'accepted');
    await answer('p2', 'accepted');
    const firstTime = signupOf('p1').signedUpAt;
    await answer('p1', 'tentative');
    await answer('p1', 'accepted');
    expect(signupOf('p1').signedUpAt).toBe(firstTime);
  });

  it('switching character or between accepted and late keeps signedUpAt', async () => {
    await answer('p1', 'accepted');
    const place = signupOf('p1').signedUpAt;
    await answer('p1', 'late');
    await answer('p1', 'accepted', 'char-p1-alt');
    expect(signupOf('p1')).toMatchObject({
      signedUpAt: place,
      characterId: 'char-p1-alt',
      status: 'accepted',
    });
  });

  it('signup-list returns queuePosition: null for all signups', async () => {
    for (const id of PEOPLE.slice(0, 10)) await answer(id, 'accepted');
    await answer('p11', 'late');
    const result = await registry.execute(
      { name: 'signup-list', input: { eventId: raid.id }, caller: as('p1') },
      deps,
    );
    const all = result.data as (Signup & { queuePosition: number | null })[];
    expect(all.every((s) => s.queuePosition === null)).toBe(true);
  });
});
