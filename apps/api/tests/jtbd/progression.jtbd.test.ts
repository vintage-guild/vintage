// JTBD: progression (docs/jtbd/progression.md). A raid leader records first kills; every member
// reads the ledger the home page shows. Driven only through commands.
import type { Caller } from '@vintage/guild-kit';
import type { Progress } from '@vintage/progress/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHost, DAY, type Host, ROLES } from './host';

/** Thu 10 Dec 2026, 21:40 New York: the first raid week. */
const FIRST_KILL = Date.UTC(2026, 11, 11, 2, 40);
/** Sat 12 Dec 2026, noon New York: when the leader records it. */
const RAIDING = Date.UTC(2026, 11, 12, 17);
/** Three weeks before the raids unlock. */
const PRE_LAUNCH = Date.UTC(2026, 10, 18, 17);

interface Guild {
  host: Host;
  rook: Caller; // raid leader
  aeryn: Caller; // raider
  pip: Caller; // member
}

async function createGuild(start: number): Promise<Guild> {
  const host = createHost(start);
  const join = (id: string, name: string, role: string) =>
    host.discordMember(`50000000000000000${id}`, name, [role]);
  return {
    host,
    rook: await join('2', 'Rook', ROLES.raidLeader),
    aeryn: await join('3', 'Aeryn', ROLES.raider),
    pip: await join('7', 'Pip', ROLES.member),
  };
}

const ledger = (g: Guild, who: Caller) => g.host.ok<Progress>(who, 'progress-get');

describe('JTBD: progression', () => {
  let g: Guild;
  beforeEach(async () => {
    g = await createGuild(RAIDING);
  });

  it('J16 · a raid leader records a first kill and every member sees the ledger fill', async () => {
    // Before Dec 9 the ledger is closed and empty; the home page says "unlocks Dec 9".
    const early = await createGuild(PRE_LAUNCH);
    const before = await ledger(early, early.pip);
    expect(before).toMatchObject({ open: false, opensOn: '2026-12-09', killed: 0, total: 22 });
    expect(before.latest).toBeNull();

    // Raiding: still nothing down until someone records a kill.
    const empty = await ledger(g, g.pip);
    expect(empty).toMatchObject({ open: true, killed: 0 });
    expect(empty.raids.map((r) => [r.name, r.total, r.nextBossId])).toEqual([
      ['Barrow Deeps', 8, 'chillhowl'],
      ['Hyjal Summit', 13, 'bandalar'],
      ["Onyxia's Lair", 1, 'onyxia'],
    ]);

    // The raid leader records the kill with what dropped.
    const recorded = await g.host.ok<{ first: boolean }>(g.rook, 'kill-record', {
      raidId: 'barrow-deeps',
      bossId: 'chillhowl',
      killedAt: FIRST_KILL,
      loot: [
        { name: 'Frostfang Greaves', quality: 'epic' },
        { name: 'Howling Band', quality: 'rare' },
      ],
    });
    expect(recorded.first).toBe(true);

    // What a member sees: the slot filled with its date and loot, the next target, the callout.
    const after = await ledger(g, g.pip);
    expect(after).toMatchObject({ killed: 1, total: 22 });
    const barrow = after.raids[0]!;
    expect(barrow).toMatchObject({ killed: 1, nextBossId: 'elder-tangleclaw' });
    expect(barrow.bosses[0]).toMatchObject({
      name: 'Chillhowl',
      datamined: true,
      firstKillAt: FIRST_KILL,
      loot: [{ name: 'Frostfang Greaves', quality: 'epic' }, { quality: 'rare' }],
    });
    expect(after.latest).toMatchObject({
      raidName: 'Barrow Deeps',
      bossName: 'Chillhowl',
      killedAt: FIRST_KILL,
    });

    // Only leaders record; members read; the public gets nothing.
    const refused = await g.host.run(g.aeryn, 'kill-record', {
      raidId: 'barrow-deeps',
      bossId: 'elder-tangleclaw',
    });
    expect(refused).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });
    const anonymous = await g.host.run(await g.host.as('nobody'), 'progress-get');
    expect(anonymous).toMatchObject({ success: false, error: { code: 'COMMAND_NOT_FOUND' } });

    // A week later the same boss dies again: logged, but the ledger keeps the first date.
    g.host.clock.advance(7 * DAY);
    const again = await g.host.ok<{ first: boolean }>(g.rook, 'kill-record', {
      raidId: 'barrow-deeps',
      bossId: 'chillhowl',
    });
    expect(again.first).toBe(false);
    expect((await ledger(g, g.pip)).raids[0]!.bosses[0]!.firstKillAt).toBe(FIRST_KILL);
  });
});
