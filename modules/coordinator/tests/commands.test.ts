import { DEFAULT_TIMINGS, type RaidEvent } from '@vintage/raids/contract';
import { fixedClock, makeCaller, testRegistry } from '@vintage/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { coordinatorCommands } from '../src/commands';
import type { CoordinatorDeps } from '../src/store';
import { createMemoryCoordinatorDeps } from '../src/testing';

const CHANNEL = '100000000000000001';

describe('coordinator commands', () => {
  const clock = fixedClock();
  const registry = testRegistry<CoordinatorDeps>([...coordinatorCommands], clock);
  const leader = makeCaller('leader');
  const officer = makeCaller('officer');
  let deps: ReturnType<typeof createMemoryCoordinatorDeps>;
  const event: RaidEvent = {
    id: 'raid-1',
    guildId: 'guild-test',
    scheduleId: null,
    name: 'MC',
    instance: 'Molten Core',
    size: 40,
    startsAt: clock.now() + 50 * 3600 * 1000,
    durationMinutes: 180,
    status: 'open',
    roleTargets: null,
    lootMethodId: null,
    configVersion: 1,
  };

  const run = (name: string, input: unknown, caller = leader) =>
    registry.execute({ name, input, caller }, deps);

  beforeEach(() => {
    deps = createMemoryCoordinatorDeps(() => ({
      guildId: 'guild-test',
      events: [{ event, timings: DEFAULT_TIMINGS, signups: [] }],
      members: [],
    }));
  });

  it('reports unconfigured until an officer sets the signup channel', async () => {
    expect(await run('coordinator-status', {})).toMatchObject({
      success: true,
      reasoning: expect.stringMatching(/Not configured/),
      data: {
        config: { dmReminders: true, paused: false },
        upcoming: [{ eventId: 'raid-1', dueNow: [] }],
      },
    });
    expect(await run('coordinator-config-set', { signupChannelId: CHANNEL }, leader)).toMatchObject(
      {
        error: { code: 'COMMAND_NOT_FOUND' },
      },
    );
    await run('coordinator-config-set', { signupChannelId: CHANNEL, dmReminders: false }, officer);
    expect(await run('coordinator-status', {})).toMatchObject({
      reasoning: expect.stringMatching(/Running; 1 upcoming raid/),
      data: {
        config: { signupChannelId: CHANNEL, dmReminders: false },
        upcoming: [{ dueNow: ['post'] }],
      },
    });
  });

  it('rejects channel ids that are not Discord snowflakes', async () => {
    expect(
      await run('coordinator-config-set', { signupChannelId: '#raid-signups' }, officer),
    ).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('pauses, refuses to run while paused, and resumes', async () => {
    await run('coordinator-pause', {});
    expect(await run('coordinator-run', {})).toMatchObject({
      error: { code: 'COORDINATOR_PAUSED' },
    });
    expect(deps.ticks).toEqual([]);
    await run('coordinator-resume', {});
    expect(await run('coordinator-run', {})).toMatchObject({ success: true });
    expect(deps.ticks).toEqual(['guild-test']);
  });

  it('shows the action log to members', async () => {
    const claimed = await deps.coordinator.claimAction(
      { guildId: 'guild-test', eventId: 'raid-1', rule: 'post', target: CHANNEL },
      1,
      1000,
    );
    await deps.coordinator.completeAction('guild-test', claimed!.action.id, { status: 'sent' }, 2);
    expect(await run('coordinator-log', { eventId: 'raid-1' }, makeCaller('member'))).toMatchObject(
      {
        success: true,
        data: [{ rule: 'post', status: 'sent', target: CHANNEL }],
      },
    );
  });

  it('keeps control commands from raiders', async () => {
    for (const name of ['coordinator-status', 'coordinator-pause', 'coordinator-run']) {
      expect(await run(name, {}, makeCaller('raider'))).toMatchObject({
        error: { code: 'COMMAND_NOT_FOUND' },
      });
    }
  });
});
