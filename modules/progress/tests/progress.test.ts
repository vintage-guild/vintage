import type { Caller } from '@vintage/guild-kit';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { progressCommands } from '../src/commands';
import {
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

  it('is for members, not the public', async () => {
    expect(code(await run('progress-get', {}, makeCaller('public')))).toBe('COMMAND_NOT_FOUND');
    expect(code(await run('progress-get', {}, member))).toBe('OK');
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
