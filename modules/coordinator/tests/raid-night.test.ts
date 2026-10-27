import type { Poll, PollResults } from '@vintage/polls/contract';
import { fixedClock, makeCaller, TEST_GUILD_ID, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { coordinatorCommands } from '../src/commands';
import type { RaidNight } from '../src/contract';
import { decideRaidNight, startLabel } from '../src/domain/raid-night';
import type { CoordinatorDeps, TickPorts } from '../src/store';
import {
  createFakeDiscord,
  createFakeRaids,
  createMemoryCoordinatorDeps,
  createStateSource,
  messageText,
} from '../src/testing';
import { runTick } from '../src/tick';

const G = TEST_GUILD_ID;
const HOUR = 60 * 60 * 1000;
const SIGNUPS = '400000000000000001';
const OPS = '400000000000000002';
/** Wed 4 Nov 2026, 18:00 New York. */
const NOW = Date.UTC(2026, 10, 4, 23);
/** Tue 10 Nov and Thu 12 Nov 2026, 20:00 New York (EST, after the DST change). */
const TUE = Date.UTC(2026, 10, 11, 1);
const THU = Date.UTC(2026, 10, 13, 1);

const leader = makeCaller('leader');

type Deps = ReturnType<typeof createMemoryCoordinatorDeps>;
let deps: Deps;
let clock: ReturnType<typeof fixedClock>;
let registry: ReturnType<typeof testRegistry<CoordinatorDeps>>;

beforeEach(async () => {
  clock = fixedClock(NOW);
  deps = createMemoryCoordinatorDeps(() => ({ guildId: G, events: [], members: [] }));
  registry = testRegistry<CoordinatorDeps>([...coordinatorCommands], clock);
  await deps.coordinator.setConfig(G, { signupChannelId: SIGNUPS, opsChannelId: OPS }, 0);
});

const ask = (input: Record<string, unknown> = {}, caller = leader) =>
  registry.execute(
    {
      name: 'raid-night-poll',
      input: {
        name: 'Onyxia',
        instance: "Onyxia's Lair",
        size: 40,
        startTimes: [THU, TUE],
        closesAt: NOW + 48 * HOUR,
        ...input,
      },
      caller,
    },
    deps,
  );

const code = (r: Awaited<ReturnType<typeof ask>>) => (r.success ? 'OK' : r.error?.code);

describe('startLabel', () => {
  it('names the time in the guild zone, short enough for a button', () => {
    expect(startLabel(TUE, 'America/New_York')).toBe('Tue 10 Nov, 8:00 PM EST');
    expect(startLabel(TUE, 'Europe/Berlin')).toBe('Wed 11 Nov, 2:00 AM GMT+1');
  });
});

describe('raid-night-poll', () => {
  it('opens a raid-night poll of the times, soonest first, posted in the signup channel', async () => {
    const result = await ask();
    expect(result.success).toBe(true);
    const [poll] = [...deps.coordinatorPolls.polls.values()];
    expect(poll).toMatchObject({
      question: 'When should we run Onyxia?',
      tags: ['raid-night'],
      eligibleTier: 'raider',
      closesAt: NOW + 48 * HOUR,
      createdBy: leader.memberId,
    });
    expect(poll?.options.map((o) => [o.label, o.value])).toEqual([
      ['Tue 10 Nov, 8:00 PM EST', String(TUE)],
      ['Thu 12 Nov, 8:00 PM EST', String(THU)],
    ]);
    expect(poll?.description).toContain(`<t:${TUE / 1000}:F>`);
    expect(deps.coordinatorPolls.posted).toEqual([{ pollId: poll?.id, channelId: SIGNUPS }]);
    expect([...deps.coordinator.raidNights.values()]).toEqual([
      expect.objectContaining({ pollId: poll?.id, name: 'Onyxia', size: 40, outcome: 'pending' }),
    ]);
  });

  it('is for raid leaders', async () => {
    expect(code(await ask({}, makeCaller('raider')))).toBe('COMMAND_NOT_FOUND');
  });

  it('checks the size and role targets against the kind, like raid-create', async () => {
    expect(code(await ask({ kind: 'dungeon', size: 10 }))).toBe('SIZE_NOT_ALLOWED');
    expect(code(await ask({ size: 15 }))).toBe('SIZE_NOT_ALLOWED');
    expect(
      code(await ask({ kind: 'dungeon', size: 5, roleTargets: { tank: 2, healer: 1, dps: 3 } })),
    ).toBe('ROLE_TARGETS_TOO_BIG');
    expect(code(await ask({ kind: 'battleground', size: 15 }))).toBe('OK');
  });

  it('refuses times before the poll closes, a past close, and one distinct time', async () => {
    expect(code(await ask({ closesAt: TUE + HOUR }))).toBe('INVALID_TIME');
    expect(code(await ask({ closesAt: NOW - 1 }))).toBe('INVALID_TIME');
    expect(code(await ask({ startTimes: [TUE, TUE] }))).toBe('INVALID_TIME');
    expect(code(await ask({ timeZone: 'Mars/Olympus' }))).toBe('VALIDATION_ERROR');
    expect(deps.coordinator.raidNights.size).toBe(0);
  });
});

describe('the tick settles raid nights', () => {
  let ports: TickPorts & { raids: ReturnType<typeof createFakeRaids> };
  let discord: ReturnType<typeof createFakeDiscord>;

  beforeEach(() => {
    discord = createFakeDiscord();
    ports = {
      store: deps.coordinator,
      raids: createFakeRaids(undefined, deps.coordinator),
      discord,
      polls: deps.coordinatorPolls,
      source: createStateSource(() => ({ guildId: G, events: [], members: [] }), deps.coordinator),
    };
  });

  async function pollFor(input: Record<string, unknown> = {}): Promise<Poll> {
    await ask(input);
    const poll = [...deps.coordinatorPolls.polls.values()].at(-1);
    if (!poll) throw new Error('no poll');
    return poll;
  }

  /** Close the poll the way polls would, with this result. */
  function close(poll: Poll, results: Partial<PollResults>) {
    deps.coordinatorPolls.polls.set(poll.id, {
      ...poll,
      status: 'closed',
      results: {
        method: 'single',
        ballots: 3,
        quorumMet: true,
        options: [],
        winners: ['o2'],
        rounds: null,
        ...results,
      },
    });
  }

  const night = (): RaidNight => [...deps.coordinator.raidNights.values()].at(-1)!;
  const tick = (at = NOW + 49 * HOUR) => runTick(ports, G, at);

  it('waits while the poll is open', async () => {
    await pollFor();
    expect((await tick(NOW + HOUR)).outcomes).toEqual([]);
    expect(night().outcome).toBe('pending');
  });

  it('creates the raid at the winning time, once', async () => {
    const poll = await pollFor();
    close(poll, { winners: ['o2'] });
    const report = await tick();
    expect(ports.raids.created).toEqual([{ id: 'raid_1', name: 'Onyxia', startsAt: THU }]);
    expect(report.outcomes[0]).toMatchObject({
      rule: 'raid-night',
      status: 'sent',
      detail: 'created raid raid_1 for Thu 12 Nov, 8:00 PM EST',
    });
    expect(night()).toMatchObject({ outcome: 'created', raidEventId: 'raid_1' });
    expect((await deps.coordinator.listActions(G, { eventIds: [poll.id] }))[0]).toMatchObject({
      status: 'sent',
    });

    await tick();
    expect(ports.raids.created).toHaveLength(1);
  });

  it('carries the kind and role targets to the event it makes', async () => {
    const poll = await pollFor({
      name: 'SM run',
      instance: 'Scarlet Monastery',
      kind: 'dungeon',
      size: 5,
      roleTargets: { tank: 1, healer: 1, dps: 3 },
    });
    expect(poll.description).toContain('The winning time becomes the dungeon.');
    close(poll, { winners: ['o2'] });
    await tick();
    expect(ports.raids.requests[0]).toMatchObject({
      kind: 'dungeon',
      size: 5,
      roleTargets: { tank: 1, healer: 1, dps: 3 },
    });
  });

  it('a raid night from before kinds still makes a raid', async () => {
    const poll = await pollFor();
    close(poll, { winners: ['o2'] });
    await tick();
    expect(ports.raids.requests[0]).toMatchObject({ kind: 'raid', size: 40, roleTargets: null });
  });

  it.each([
    ['a tie', { winners: ['o1', 'o2'] }, 'it tied between Tue 10 Nov, 8:00 PM EST and Thu 12 Nov'],
    ['a missed quorum', { quorumMet: false, ballots: 2 }, 'only 2 voted, short of the quorum'],
    ['no votes', { ballots: 0, winners: [] }, 'nobody voted'],
  ])('tells the ops channel instead of guessing on %s', async (_label, results, reason) => {
    const poll = await pollFor({ quorum: 5 });
    close(poll, results);
    await tick();
    expect(ports.raids.created).toEqual([]);
    expect(night().outcome).toBe('unresolved');
    const [ops] = discord.sent.filter((m) => m.to === OPS);
    expect(messageText(ops!.message)).toContain(reason);
    expect(messageText(ops!.message)).toContain('raid-night-poll');
  });

  it('does not create a raid whose winning time has passed', async () => {
    const poll = await pollFor();
    close(poll, { winners: ['o1'] });
    await tick(TUE + HOUR);
    expect(ports.raids.created).toEqual([]);
    expect(night().detail).toContain('has already passed');
  });

  it('marks a cancelled poll without acting on it', async () => {
    const poll = await pollFor();
    deps.coordinatorPolls.polls.set(poll.id, { ...poll, status: 'cancelled' });
    expect((await tick()).outcomes).toEqual([]);
    expect(night().outcome).toBe('cancelled');
  });

  it('retries after a failure without creating the raid twice', async () => {
    const poll = await pollFor();
    close(poll, { winners: ['o1'] });
    const working = ports.raids.createForRaidNight;
    ports.raids.createForRaidNight = async () => {
      throw new Error('raid-create failed: backend busy');
    };
    expect((await tick()).outcomes[0]).toMatchObject({ status: 'failed' });
    expect(night().outcome).toBe('pending');

    ports.raids.createForRaidNight = working;
    await tick();
    await tick();
    expect(ports.raids.created).toHaveLength(1);
    expect(night().outcome).toBe('created');
  });
});

describe('decideRaidNight', () => {
  it('reports a poll that vanished', () => {
    expect(decideRaidNight(null, NOW)).toEqual({
      kind: 'unresolved',
      reason: 'its poll no longer exists',
    });
  });
});
