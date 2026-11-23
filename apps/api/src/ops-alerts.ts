// Deduplicated ops-channel alerts for background crons (#262): coordinator tick, poll sweep,
// and role sync. Pure orchestration over injectable ports so every path is tested without Convex.
import type { MessageData } from '@vintage/discord-kit';

/** At most one ops-channel post per failure kind per hour. */
export const OPS_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** Discord's message content limit. */
const MAX_CONTENT = 2000;

export type CronJob = 'coordinator' | 'poll-sweep' | 'role-sync';

export interface CronFailureAlert {
  job: CronJob;
  /** The failing step or rule, e.g. `schedule-materialize`, `raid-night`, `poll-sweep`, `member-sync`. */
  step: string;
  /** Human-readable raid, poll, or item label when one applies. */
  subject?: string;
  /** Stable identifier for per-item deduplication (e.g. eventId or pollId). */
  subjectId?: string;
  /** Short error description. */
  error: string;
  /** Explicit deduplication key override (e.g. from coordinator TickFailure). */
  key?: string;
  /** Pre-rendered Discord message when already formatted (e.g. coordinator renderFailure). */
  message?: MessageData;
}

export interface OpsAlertSnapshot {
  lastSentAt: number;
  lastError: string;
}

export interface OpsAlertDeps {
  getOpsChannel(guildId: string): Promise<string | null>;
  /**
   * Atomically claim the right to post for `(guildId, key)` if no alert was sent within
   * `cooldownMs`. Returns the prior state so a failed Discord post can restore it.
   */
  claim(
    guildId: string,
    key: string,
    now: number,
    cooldownMs: number,
    error: string,
  ): Promise<{ claimed: true; previous: OpsAlertSnapshot | null } | { claimed: false }>;
  /** Undo a claim when posting to Discord failed, so the next run can alert once Discord recovers. */
  release(guildId: string, key: string, previous: OpsAlertSnapshot | null): Promise<void>;
  post(channelId: string, message: MessageData): Promise<void>;
}

export type OpsAlertOutcome = 'sent' | 'deduplicated' | 'skipped' | 'failed';

export const describeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export function alertKey(alert: CronFailureAlert): string {
  if (alert.key) return alert.key;
  return alert.subjectId
    ? `${alert.job}:${alert.step}:${alert.subjectId}`
    : `${alert.job}:${alert.step}`;
}

/** Short, plain ops-channel error message. Never pings anyone. */
export function formatCronFailure(alert: CronFailureAlert): MessageData {
  if (alert.message) return alert.message;
  const forWhat = alert.subject ? ` for ${alert.subject}` : '';
  return {
    content: `[${alert.job}] \`${alert.step}\` failed${forWhat}: ${alert.error}`.slice(
      0,
      MAX_CONTENT,
    ),
    allowed_mentions: { parse: [] },
  };
}

/**
 * Post a deduplicated failure notice to the guild's ops channel. Never throws: if the ops channel
 * is unconfigured or Discord itself is unreachable, the failure stays in logs without breaking
 * the caller.
 */
export async function reportOpsAlert(
  deps: OpsAlertDeps,
  guildId: string,
  alert: CronFailureAlert,
  now: number,
  cooldownMs = OPS_ALERT_COOLDOWN_MS,
): Promise<OpsAlertOutcome> {
  let opsChannelId: string | null;
  try {
    opsChannelId = await deps.getOpsChannel(guildId);
  } catch (err) {
    console.error(`ops-alert: failed to read ops channel: ${describeError(err)}`);
    return 'failed';
  }
  if (!opsChannelId) return 'skipped';

  const key = alertKey(alert);
  let claimed: { claimed: true; previous: OpsAlertSnapshot | null } | { claimed: false };
  try {
    claimed = await deps.claim(guildId, key, now, cooldownMs, alert.error);
  } catch (err) {
    console.error(`ops-alert: failed to claim ${key}: ${describeError(err)}`);
    return 'failed';
  }
  if (!claimed.claimed) return 'deduplicated';

  try {
    await deps.post(opsChannelId, formatCronFailure(alert));
    return 'sent';
  } catch (err) {
    console.error(`ops-alert: failed to post ${key} to ops channel: ${describeError(err)}`);
    try {
      await deps.release(guildId, key, claimed.previous);
    } catch {
      // Best effort: never throw out of error reporting.
    }
    return 'failed';
  }
}

export type ReportAlert = (alert: CronFailureAlert, now?: number) => Promise<OpsAlertOutcome>;

/** Run the poll sweep mutation, catching and reporting failures to the ops channel. */
export async function runPollSweepWithAlerts<T>(
  run: () => Promise<T>,
  report: ReportAlert,
  now: () => number = Date.now,
): Promise<T | { failed: string }> {
  try {
    return await run();
  } catch (err) {
    const error = describeError(err);
    console.error(`Poll sweep failed: ${error}`);
    await report({ job: 'poll-sweep', step: 'poll-sweep', error }, now());
    return { failed: error };
  }
}

/** Refresh one poll's Discord posts, reporting per-poll failures without crashing the action. */
export async function runPollRefreshWithAlerts(
  pollId: string,
  run: () => Promise<{ edited: number } | { skipped: string }>,
  report: ReportAlert,
  now: () => number = Date.now,
): Promise<{ edited: number } | { skipped: string } | { failed: string }> {
  try {
    return await run();
  } catch (err) {
    const error = describeError(err);
    console.error(`Poll post refresh failed (${pollId}): ${error}`);
    await report(
      {
        job: 'poll-sweep',
        step: 'poll-refresh',
        subject: `poll \`${pollId}\``,
        subjectId: pollId,
        error,
      },
      now(),
    );
    return { failed: error };
  }
}

export interface RoleSyncResultLike {
  failed: unknown[];
}

/** Run role sync, reporting thrown errors and partial member-sync failures to the ops channel. */
export async function runRoleSyncWithAlerts<T extends RoleSyncResultLike>(
  run: () => Promise<T>,
  report: ReportAlert,
  now: () => number = Date.now,
): Promise<T | { failed: string }> {
  try {
    const summary = await run();
    if (summary.failed.length > 0) {
      const first = summary.failed[0] as { discordId?: string; code?: string } | undefined;
      const sample = first?.discordId ? ` (e.g. ${first.discordId}: ${first.code ?? 'error'})` : '';
      const error = `${summary.failed.length} member sync${summary.failed.length === 1 ? '' : 's'} failed${sample}`;
      console.error(`Role sync partial failure: ${error}`);
      await report({ job: 'role-sync', step: 'member-sync', error }, now());
    }
    return summary;
  } catch (err) {
    const error = describeError(err);
    console.error(`Role sync failed: ${error}`);
    await report({ job: 'role-sync', step: 'sync-all-members', error }, now());
    return { failed: error };
  }
}

/** In-memory OpsAlertDeps for unit tests. */
export function createMemoryOpsAlertDeps(options: {
  opsChannelId: string | null;
  post?: (channelId: string, message: MessageData) => Promise<void>;
}) {
  const rows = new Map<string, OpsAlertSnapshot>();
  const sent: { channelId: string; message: MessageData }[] = [];
  const deps: OpsAlertDeps = {
    getOpsChannel: async () => options.opsChannelId,
    claim: async (guildId, key, now, cooldownMs, error) => {
      const id = `${guildId}|${key}`;
      const existing = rows.get(id) ?? null;
      if (existing && now - existing.lastSentAt < cooldownMs) return { claimed: false };
      rows.set(id, { lastSentAt: now, lastError: error });
      return { claimed: true, previous: existing };
    },
    release: async (guildId, key, previous) => {
      const id = `${guildId}|${key}`;
      if (previous) rows.set(id, previous);
      else rows.delete(id);
    },
    post: async (channelId, message) => {
      if (options.post) {
        await options.post(channelId, message);
      }
      sent.push({ channelId, message });
    },
  };
  return { deps, rows, sent };
}
