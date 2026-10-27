// Pure rules for whether a question may run now: the kill switch, one question at a time per
// member, and the daily and monthly caps. Windows are UTC calendar days and months.
import type { AgentConfig } from '../contract';

export const dayStart = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export const monthStart = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** A queued or running question older than this is treated as stuck and no longer blocks. */
export const BUSY_WINDOW_MS = 5 * 60 * 1000;

export interface AskCounts {
  /** The member's questions or runs still queued or running inside BUSY_WINDOW_MS. */
  memberInFlight: number;
  memberToday: number;
  guildThisMonth: number;
}

export type AskRefusal =
  | { code: 'AGENT_PAUSED'; message: string; suggestion: string }
  | { code: 'AGENT_BUSY'; message: string; suggestion: string }
  | { code: 'AGENT_DAILY_LIMIT'; message: string; suggestion: string }
  | { code: 'AGENT_MONTHLY_LIMIT'; message: string; suggestion: string };

export function refuseAsk(config: AgentConfig, counts: AskCounts): AskRefusal | null {
  if (config.paused) {
    return {
      code: 'AGENT_PAUSED',
      message: 'The guild agent is paused by an officer',
      suggestion: 'Use the website or the bot commands directly, or ask an officer to resume it',
    };
  }
  if (counts.memberInFlight > 0) {
    return {
      code: 'AGENT_BUSY',
      message: 'Your last question is still being answered',
      suggestion: 'Wait for that answer, then ask again',
    };
  }
  if (counts.memberToday >= config.memberDailyAsks) {
    return {
      code: 'AGENT_DAILY_LIMIT',
      message: `You have asked ${counts.memberToday} questions today (limit ${config.memberDailyAsks})`,
      suggestion: 'The limit resets at midnight UTC',
    };
  }
  if (counts.guildThisMonth >= config.guildMonthlyAsks) {
    return {
      code: 'AGENT_MONTHLY_LIMIT',
      message: `The guild has used this month's ${config.guildMonthlyAsks} questions`,
      suggestion: 'An officer can raise the limit with agent-config-set',
    };
  }
  return null;
}

/** When the month's Decisions calls cross this share of the cap, officers hear about it. */
export const BUDGET_WARNING_SHARE = 0.8;

/**
 * Which budget alert this call's count crosses, if any (#145): `warning` at 80% of the guild's
 * monthly Decisions cap, `used-up` at the cap. Exactly at the crossing, so each fires once a
 * month however many calls follow.
 */
export function decisionsBudgetAlert(used: number, cap: number): 'warning' | 'used-up' | null {
  if (cap <= 0) return null;
  if (used === cap) return 'used-up';
  if (used === Math.ceil(cap * BUDGET_WARNING_SHARE) && used < cap) return 'warning';
  return null;
}
