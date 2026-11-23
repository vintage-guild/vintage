// Ops-channel cron failure alerts (#262): hourly deduplication, rollback on Discord outage,
// and wrappers for poll sweep, poll post refresh, and role sync.
import { describe, expect, it, vi } from 'vitest';
import {
  alertKey,
  createMemoryOpsAlertDeps,
  formatCronFailure,
  OPS_ALERT_COOLDOWN_MS,
  reportOpsAlert,
  runPollRefreshWithAlerts,
  runPollSweepWithAlerts,
  runRoleSyncWithAlerts,
} from '../src/ops-alerts';

const GUILD = 'vintage-test';
const OPS = '100000000000000002';
const HOUR = OPS_ALERT_COOLDOWN_MS;
const T0 = Date.UTC(2026, 10, 12, 20, 0);

describe('reportOpsAlert', () => {
  it('posts a formatted failure without mentions and deduplicates within an hour', async () => {
    const { deps, sent } = createMemoryOpsAlertDeps({ opsChannelId: OPS });
    const alert = {
      job: 'coordinator' as const,
      step: 'schedule-materialize',
      error: 'database unavailable',
    };

    expect(await reportOpsAlert(deps, GUILD, alert, T0)).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.channelId).toBe(OPS);
    expect(sent[0]?.message.content).toBe(
      '[coordinator] `schedule-materialize` failed: database unavailable',
    );
    expect(sent[0]?.message.allowed_mentions).toEqual({ parse: [] });

    // Same failure kind within the cooldown window is suppressed.
    expect(await reportOpsAlert(deps, GUILD, alert, T0 + 5 * 60_000)).toBe('deduplicated');
    expect(await reportOpsAlert(deps, GUILD, alert, T0 + HOUR - 1)).toBe('deduplicated');
    expect(sent).toHaveLength(1);

    // Once the cooldown elapses, the ongoing failure notifies again.
    expect(await reportOpsAlert(deps, GUILD, alert, T0 + HOUR)).toBe('sent');
    expect(sent).toHaveLength(2);
  });

  it('tracks different failure kinds and different raids independently', async () => {
    const { deps, sent } = createMemoryOpsAlertDeps({ opsChannelId: OPS });

    expect(
      await reportOpsAlert(
        deps,
        GUILD,
        { job: 'coordinator', step: 'lock', subject: '**MC**', subjectId: 'r1', error: 'err1' },
        T0,
      ),
    ).toBe('sent');
    expect(
      await reportOpsAlert(
        deps,
        GUILD,
        { job: 'coordinator', step: 'lock', subject: '**Ony**', subjectId: 'r2', error: 'err2' },
        T0 + 60_000,
      ),
    ).toBe('sent');
    expect(
      await reportOpsAlert(
        deps,
        GUILD,
        { job: 'poll-sweep', step: 'poll-sweep', error: 'err3' },
        T0 + 60_000,
      ),
    ).toBe('sent');

    expect(sent).toHaveLength(3);
    expect(sent[0]?.message.content).toContain('**MC**');
    expect(sent[1]?.message.content).toContain('**Ony**');
    expect(sent[2]?.message.content).toContain('[poll-sweep]');
  });

  it('skips cleanly when no ops channel is configured', async () => {
    const { deps, sent } = createMemoryOpsAlertDeps({ opsChannelId: null });
    expect(
      await reportOpsAlert(deps, GUILD, { job: 'role-sync', step: 'sync', error: '500' }, T0),
    ).toBe('skipped');
    expect(sent).toEqual([]);
  });

  it('restores the dedupe slot when Discord rejects the ops post, and never throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    const { deps, sent } = createMemoryOpsAlertDeps({
      opsChannelId: OPS,
      post: async () => {
        if (fail) throw new Error('Discord 503');
      },
    });
    const alert = { job: 'role-sync' as const, step: 'sync-all-members', error: 'Discord 500' };

    expect(await reportOpsAlert(deps, GUILD, alert, T0)).toBe('failed');
    expect(sent).toHaveLength(0);

    // Once Discord recovers 5 minutes later, the alert still goes through immediately.
    fail = false;
    expect(await reportOpsAlert(deps, GUILD, alert, T0 + 5 * 60_000)).toBe('sent');
    expect(sent).toHaveLength(1);
    errSpy.mockRestore();
  });

  it('truncates oversized errors to Discord’s 2000-char limit and derives stable keys', () => {
    const huge = 'x'.repeat(2500);
    const msg = formatCronFailure({ job: 'poll-sweep', step: 'poll-sweep', error: huge });
    expect(msg.content?.length).toBe(2000);
    expect(msg.allowed_mentions).toEqual({ parse: [] });
    expect(alertKey({ job: 'poll-sweep', step: 'poll-refresh', subjectId: 'p1', error: 'e' })).toBe(
      'poll-sweep:poll-refresh:p1',
    );
  });
});

describe('cron alert wrappers', () => {
  it('reports poll sweep and poll refresh failures with hourly deduplication', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps, sent } = createMemoryOpsAlertDeps({ opsChannelId: OPS });
    const report = (alert: Parameters<typeof reportOpsAlert>[2], at = T0) =>
      reportOpsAlert(deps, GUILD, alert, at);

    const ok = await runPollSweepWithAlerts(async () => ({ opened: ['p1'], closed: [] }), report);
    expect(ok).toEqual({ opened: ['p1'], closed: [] });
    expect(sent).toHaveLength(0);

    const failed = await runPollSweepWithAlerts(
      async () => {
        throw new Error('poll-sweep failed: DB down');
      },
      report,
      () => T0,
    );
    expect(failed).toEqual({ failed: 'poll-sweep failed: DB down' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.content).toContain(
      '[poll-sweep] `poll-sweep` failed: poll-sweep failed: DB down',
    );

    // Second failure 5m later is deduplicated.
    await runPollSweepWithAlerts(
      async () => {
        throw new Error('poll-sweep failed: DB down');
      },
      report,
      () => T0 + 5 * 60_000,
    );
    expect(sent).toHaveLength(1);

    // Per-poll refresh failure alerts with the poll id.
    const refreshFailed = await runPollRefreshWithAlerts(
      'poll_42',
      async () => {
        throw new Error('Discord 403 Missing Access');
      },
      report,
      () => T0,
    );
    expect(refreshFailed).toEqual({ failed: 'Discord 403 Missing Access' });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.message.content).toContain('poll `poll_42`');
    expect(sent[1]?.message.content).toContain('Discord 403 Missing Access');
    errSpy.mockRestore();
  });

  it('reports both thrown role-sync errors and partial member-sync failures', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps, sent } = createMemoryOpsAlertDeps({ opsChannelId: OPS });
    const report = (alert: Parameters<typeof reportOpsAlert>[2], at = T0) =>
      reportOpsAlert(deps, GUILD, alert, at);

    // Clean run sends nothing.
    const clean = await runRoleSyncWithAlerts(
      async () => ({ inServer: 10, departed: 0, synced: 10, failed: [] }),
      report,
      () => T0,
    );
    expect(clean).toEqual({ inServer: 10, departed: 0, synced: 10, failed: [] });
    expect(sent).toHaveLength(0);

    // Partial member-sync failure alerts ops once per hour.
    const partial = await runRoleSyncWithAlerts(
      async () => ({
        inServer: 10,
        departed: 0,
        synced: 8,
        failed: [
          { discordId: '123', code: 'VALIDATION_ERROR' },
          { discordId: '456', code: 'VALIDATION_ERROR' },
        ],
      }),
      report,
      () => T0,
    );
    expect('failed' in partial && Array.isArray(partial.failed)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.content).toContain(
      '[role-sync] `member-sync` failed: 2 member syncs failed (e.g. 123: VALIDATION_ERROR)',
    );

    // Thrown directory error alerts ops under its own key.
    const crashed = await runRoleSyncWithAlerts(
      async () => {
        throw new Error('Discord returned no guild members; refusing to mark everyone as departed');
      },
      report,
      () => T0,
    );
    expect(crashed).toEqual({
      failed: 'Discord returned no guild members; refusing to mark everyone as departed',
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.message.content).toContain('[role-sync] `sync-all-members` failed');
    errSpy.mockRestore();
  });
});
