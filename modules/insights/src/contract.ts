// Public surface of the insights module. Other modules import only this file.
import type { FindingKind } from './domain/findings';

export type { FindingKind };

/** One imported run: what Vintage keeps of a Farsight summary (never the raw log or summary). */
export interface InsightRun {
  id: string;
  guildId: string;
  /** Farsight's run key: imports are idempotent on it. */
  runKey: string;
  zoneName: string;
  /** Epoch ms of the run's first event. */
  startedAt: number;
  durationSeconds: number;
  /** Character names in the run, realm stripped. */
  roster: string[];
  importedBy: string;
  createdAt: number;
  /** When the raiders' DMs were sent; null until an officer sends them. */
  sentAt: number | null;
}

/** One claim about one raider's play, with the evidence from the log. */
export interface InsightFinding {
  id: string;
  guildId: string;
  runId: string;
  character: string;
  /** The guild member who plays the character, when Vintage knows it. */
  memberId: string | null;
  kind: FindingKind;
  text: string;
  evidence: string;
  weight: number;
}

export interface InsightOptIn {
  guildId: string;
  memberId: string;
  dms: boolean;
  updatedAt: number;
}

export const INSIGHTS_COMMANDS = [
  'run-import',
  'insights-runs',
  'insights-get',
  'insights-optin-set',
  'insights-send',
] as const;
