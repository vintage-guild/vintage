import type { Caller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { progressCommands } from '../src/commands';
import {
  findBoss,
  type Kill,
  LAUNCH_BOSS_COUNT,
  LAUNCH_RAIDS,
  type Progress,
  RAIDS_OPEN_AT,
} from '../src/contract';
import type { ProgressDeps } from '../src/store';
import { createMemoryProgressDeps } from '../src/testing';

const DAY = 24 * 60 * 60 * 1000;
/** Thu 17 Dec 2026, 22:00 New York: the second raid week. */
const RAIDING = Date.UTC(2026, 11, 18, 3);

const leader = makeCaller('leader');
const raider = makeCaller('raider');
const member = makeCaller('member');

let clock: ReturnType<typeof fixedClock>;
let deps: ReturnType<typeof createMemoryProgressDeps>;
let registry: ReturnType<typeof testRegistry<ProgressDeps>>;

beforeEach(() => {
  clock = fixedClock(RAIDING);
  deps = createMemoryProgressDeps();
  registry = testRegistry<ProgressDeps>([...progressCommands], clock);
});

const run = (name: string, input: unknown, caller: Caller) =>
  registry.execute({ name, input, caller }, deps);

const code = (result: Awaited<ReturnType<typeof run>>) =>
  result.success ? 'OK' : result.error?.code;

const progress = async (caller: Caller = member) => {
  const result = await run('progress-get', {}, caller);
  if (!result.success) throw new Error(`progress-get failed: ${result.error?.code}`);
  return result.data as Progress;
};

describe('the launch raids', () => {
  it('are three raids with twenty-two bosses, the datamined ones flagged', () => {
    expect(LAUNCH_RAIDS.map((r) => [r.name, r.size, r.bosses.length])).toEqual([
      ['Barrow Deeps', 10, 8],
      ['Hyjal Summit', 20, 13],
      ["Onyxia's Lair", 40, 1],
    ]);
    expect(LAUNCH_BOSS_COUNT).toBe(22);
    const datamined = LAUNCH_RAIDS.flatMap((r) => r.bosses.filter((b) => b.datamined));
    expect(datamined).toHaveLength(21);
    expect(LAUNCH_RAIDS[2]!.bosses[0]).toMatchObject({ name: 'Onyxia', datamined: false });
    const ids = LAUNCH_RAIDS.flatMap((r) => r.bosses.map((b) => `${r.id}/${b.id}`));
    expect(new Set(ids).size).toBe(ids.length);
    // Encounter ids wait for the Forever spike (Nov 4–6); names stay unique so matching works.
    expect(LAUNCH_RAIDS.flatMap((r) => r.bosses.filter((b) => b.encounterId !== null))).toEqual([]);
    const names = LAUNCH_RAIDS.flatMap((r) => r.bosses.map((b) => b.name.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('findBoss', () => {
  const where = (
    encounter: Parameters<typeof findBoss>[0],
    raids?: Parameters<typeof findBoss>[1],
  ) => {
    const found = findBoss(encounter, raids);
    return found && `${found.raid.id}/${found.boss.id}`;
  };

  it('matches a game encounter by name, ignoring case and punctuation', () => {
    expect(where({ name: 'Chillhowl' })).toBe('barrow-deeps/chillhowl');
    expect(where({ name: 'DELLYNAR SONGWOOD', encounterId: 3101 })).toBe('barrow-deeps/dellynar');
    expect(where({ name: 'Time Lost Battalion' })).toBe('hyjal-summit/time-lost-battalion');
    expect(where({ name: 'Onyxia' })).toBe('onyxias-lair/onyxia');
    expect(where({ name: 'Ragnaros' })).toBeNull();
  });

  it('prefers the encounter id once a boss has one', () => {
    const [barrow] = LAUNCH_RAIDS;
    const raids = [
      { ...barrow!, bosses: barrow!.bosses.map((b, i) => ({ ...b, encounterId: 3000 + i })) },
    ];
    expect(where({ name: 'Something renamed', encounterId: 3002 }, raids)).toBe(
      'barrow-deeps/khalith',
    );
    // An id that's another boss's wins over the name; an unknown id matches nothing.
    expect(where({ name: 'Chillhowl', encounterId: 3004 }, raids)).toBe('barrow-deeps/amethrax');
    expect(where({ name: 'Chillhowl', encounterId: 9999 }, raids)).toBeNull();
    // An attempt the game kept the id of falls back to the name.
    expect(where({ name: 'Chillhowl' }, raids)).toBe('barrow-deeps/chillhowl');
  });
});

describe('progress-get', () => {
  it('before the raids open: every slot empty, nothing latest, open false', async () => {
    clock = fixedClock(RAIDS_OPEN_AT - 30 * DAY);
    registry = testRegistry<ProgressDeps>([...progressCommands], clock);
    const view = await progress();
    expect(view).toMatchObject({ open: false, opensAt: RAIDS_OPEN_AT, killed: 0, total: 22 });
    expect(view.latest).toBeNull();
    expect(view.raids.map((r) => r.nextBossId)).toEqual(['chillhowl', 'bandalar', 'onyxia']);
    expect(view.raids.flatMap((r) => r.bosses).every((b) => b.firstKillAt === null)).toBe(true);
  });

  it('is public and omits recorder ids, notes, and guild ids', async () => {
    await run(
      'kill-record',
      {
        raidId: 'barrow-deeps',
        bossId: 'chillhowl',
        killedAt: Date.parse('2026-12-10T21:40:00-05:00'),
        loot: [{ name: 'Frostfang Greaves', quality: 'epic' }],
        note: 'officers-only note',
      },
      leader,
    );
    const pub = await run('progress-get', {}, makeCaller('public'));
    expect(code(pub)).toBe('OK');
    expect(code(await run('progress-get', {}, member))).toBe('OK');
    const view = pub.data as Progress;
    expect(view).toMatchObject({ killed: 1, total: 22 });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('officers-only note');
    expect(serialized).not.toContain('member-leader');
    expect(serialized).not.toContain('recordedBy');
    expect(serialized).not.toContain('recordedAt');
    expect(serialized).not.toContain('guild-test');
  });
});

describe('kill-record', () => {
  it('a leader records a first kill with loot and the ledger fills', async () => {
    const result = await run(
      'kill-record',
      {
        raidId: 'barrow-deeps',
        bossId: 'chillhowl',
        killedAt: '2026-12-10T21:40:00-05:00',
        loot: [
          { name: 'Frostfang Greaves', quality: 'epic' },
          { name: 'Howling Band', quality: 'rare' },
        ],
      },
      leader,
    );
    expect(result).toMatchObject({
      success: true,
      data: { first: true, kill: { bossId: 'chillhowl', recordedBy: 'member-leader' } },
      reasoning: 'First kill of Chillhowl in Barrow Deeps',
    });

    const view = await progress();
    expect(view).toMatchObject({ open: true, killed: 1, total: 22 });
    const barrow = view.raids[0]!;
    expect(barrow).toMatchObject({ killed: 1, nextBossId: 'elder-tangleclaw' });
    expect(barrow.bosses[0]).toMatchObject({
      firstKillAt: Date.parse('2026-12-10T21:40:00-05:00'),
      loot: [{ name: 'Frostfang Greaves', quality: 'epic' }, { quality: 'rare' }],
    });
    expect(view.latest).toMatchObject({
      raidName: 'Barrow Deeps',
      bossName: 'Chillhowl',
      killedAt: Date.parse('2026-12-10T21:40:00-05:00'),
    });
  });

  it('later kills of the same boss keep the first as the ledger entry', async () => {
    const first = Date.parse('2026-12-10T21:40:00-05:00');
    await run('kill-record', { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: first }, leader);
    const again = await run(
      'kill-record',
      { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: first + 7 * DAY },
      leader,
    );
    expect(again).toMatchObject({ success: true, data: { first: false } });
    const view = await progress();
    expect(view.raids[2]!.bosses[0]!.firstKillAt).toBe(first);
    expect(view.killed).toBe(1);
    expect(await deps.progress.listKills('guild-test')).toHaveLength(2);
  });

  it('the same kill again changes nothing and says so', async () => {
    const at = Date.parse('2026-12-10T21:40:00-05:00');
    const input = { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: at };
    const first = await run('kill-record', input, leader);
    expect(first).toMatchObject({ success: true, data: { first: true, duplicate: false } });
    const again = await run('kill-record', input, leader);
    expect(again).toMatchObject({
      success: true,
      data: { first: true, duplicate: true, kill: { id: (first.data as { kill: Kill }).kill.id } },
      reasoning: 'Onyxia at that time is already recorded; nothing changed',
    });
    expect(await deps.progress.listKills('guild-test')).toHaveLength(1);
    // A later kill isn't the same kill, and the earlier one stays the ledger entry.
    const later = await run('kill-record', { ...input, killedAt: at + DAY }, leader);
    expect(later).toMatchObject({ data: { first: false, duplicate: false } });
    const repeat = await run('kill-record', { ...input, killedAt: at + DAY }, leader);
    expect(repeat).toMatchObject({ data: { first: false, duplicate: true } });
  });

  it('the latest first kill wins the callout, across raids', async () => {
    const base = Date.parse('2026-12-10T21:00:00-05:00');
    await run(
      'kill-record',
      { raidId: 'hyjal-summit', bossId: 'bandalar', killedAt: base },
      leader,
    );
    await run(
      'kill-record',
      { raidId: 'barrow-deeps', bossId: 'chillhowl', killedAt: base + DAY },
      leader,
    );
    expect((await progress()).latest).toMatchObject({ bossName: 'Chillhowl' });
  });

  it('defaults the kill time to now', async () => {
    const result = await run('kill-record', { raidId: 'onyxias-lair', bossId: 'onyxia' }, leader);
    expect((result.data as { kill: Kill }).kill.killedAt).toBe(RAIDING);
  });

  it('refuses kills in the future or before the raids open', async () => {
    const future = await run(
      'kill-record',
      { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: RAIDING + DAY },
      leader,
    );
    expect(code(future)).toBe('INVALID_TIME');
    const early = await run(
      'kill-record',
      { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: RAIDS_OPEN_AT - 1 },
      leader,
    );
    expect(code(early)).toBe('INVALID_TIME');
    expect(await deps.progress.listKills('guild-test')).toHaveLength(0);
  });

  it('refuses an unknown boss or raid', async () => {
    expect(
      code(await run('kill-record', { raidId: 'onyxias-lair', bossId: 'nefarian' }, leader)),
    ).toBe('BOSS_NOT_FOUND');
    expect(code(await run('kill-record', { raidId: 'naxxramas', bossId: 'onyxia' }, leader))).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('is a leader command', async () => {
    const input = { raidId: 'onyxias-lair', bossId: 'onyxia' };
    expect(code(await run('kill-record', input, raider))).toBe('COMMAND_NOT_FOUND');
    expect(code(await run('kill-record', input, makeCaller('officer')))).toBe('OK');
  });

  it('scopes kills to the guild', async () => {
    await run('kill-record', { raidId: 'onyxias-lair', bossId: 'onyxia' }, leader);
    const elsewhere = makeCaller('member', { guildId: 'guild-other' });
    expect((await progress(elsewhere)).killed).toBe(0);
  });
});

describe('kill-list and kill-remove (#242)', () => {
  const officer = makeCaller('officer');

  it('kill-list returns every kill newest first with recorder and first flag, leader+ only', async () => {
    const first = Date.parse('2026-12-10T21:40:00-05:00');
    const second = first + 7 * DAY;
    await run(
      'kill-record',
      { raidId: 'barrow-deeps', bossId: 'chillhowl', killedAt: first, note: 'first pull' },
      leader,
    );
    await run(
      'kill-record',
      { raidId: 'barrow-deeps', bossId: 'chillhowl', killedAt: second, note: 'farm kill' },
      officer,
    );
    await run(
      'kill-record',
      { raidId: 'onyxias-lair', bossId: 'onyxia', killedAt: first + DAY },
      leader,
    );

    expect(code(await run('kill-list', {}, raider))).toBe('COMMAND_NOT_FOUND');

    const listed = await run('kill-list', { raidId: 'barrow-deeps', bossId: 'chillhowl' }, leader);
    expect(listed.success).toBe(true);
    const { kills } = listed.data as {
      kills: {
        id: string;
        killedAt: number;
        recordedBy: string;
        bossName: string;
        raidName: string;
        first: boolean;
      }[];
    };
    expect(kills.map((k) => [k.killedAt, k.first, k.recordedBy])).toEqual([
      [second, false, 'member-officer'],
      [first, true, 'member-leader'],
    ]);
    expect(kills[0]).toMatchObject({ bossName: 'Chillhowl', raidName: 'Barrow Deeps' });
  });

  it('kill-remove is officer-only, previews ledger shift, and moves first kill on confirm', async () => {
    const first = Date.parse('2026-12-10T21:40:00-05:00');
    const second = first + 7 * DAY;
    const r1 = await run(
      'kill-record',
      { raidId: 'barrow-deeps', bossId: 'chillhowl', killedAt: first },
      leader,
    );
    const r2 = await run(
      'kill-record',
      { raidId: 'barrow-deeps', bossId: 'chillhowl', killedAt: second },
      leader,
    );
    const firstId = (r1.data as { kill: Kill }).kill.id;
    const secondId = (r2.data as { kill: Kill }).kill.id;

    // Leaders cannot remove kills.
    expect(code(await run('kill-remove', { killId: firstId }, leader))).toBe('COMMAND_NOT_FOUND');

    // Preview does not delete and reports that the first kill will move to the second kill.
    const preview = await run('kill-remove', { killId: firstId }, officer);
    expect(preview.success).toBe(true);
    expect(await deps.progress.listKills('guild-test')).toHaveLength(2);
    expect(preview.data).toMatchObject({
      confirmToken: expect.any(String),
      preview: {
        willRemove: {
          id: firstId,
          bossName: 'Chillhowl',
          raidName: 'Barrow Deeps',
          killedAt: first,
        },
        wasFirstKill: true,
        nextFirstKillAt: second,
      },
    });

    // Confirm removes the first kill and shifts the ledger to the second kill.
    const { confirmToken } = preview.data as { confirmToken: string };
    const confirmed = await registry.execute(
      { name: 'kill-remove', input: { killId: firstId }, caller: officer, confirmToken },
      deps,
    );
    expect(confirmed).toMatchObject({
      success: true,
      data: { removed: { id: firstId }, wasFirstKill: true, nextFirstKillAt: second },
    });
    expect((await progress()).raids[0]!.bosses[0]!.firstKillAt).toBe(second);

    // Removing the last remaining kill returns the boss to unkilled.
    const lastPreview = await run('kill-remove', { killId: secondId }, officer);
    expect(lastPreview.data).toMatchObject({
      preview: { wasFirstKill: true, nextFirstKillAt: null },
    });
    const lastToken = (lastPreview.data as { confirmToken: string }).confirmToken;
    await registry.execute(
      {
        name: 'kill-remove',
        input: { killId: secondId },
        caller: officer,
        confirmToken: lastToken,
      },
      deps,
    );
    expect((await progress()).raids[0]!.bosses[0]!.firstKillAt).toBeNull();
    expect(code(await run('kill-remove', { killId: secondId }, officer))).toBe('KILL_NOT_FOUND');
  });
});
