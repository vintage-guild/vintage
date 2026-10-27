import { commandsFor } from '@vintage/guild-kit';
import type { InsightFinding, InsightOptIn, InsightRun } from './contract';

/** The insights module's data port. Production: the component; tests: `./testing`. */
export interface InsightsStore {
  insertRun(run: Omit<InsightRun, 'id'>): Promise<InsightRun>;
  getRun(guildId: string, runId: string): Promise<InsightRun | null>;
  getRunByKey(guildId: string, runKey: string): Promise<InsightRun | null>;
  /** Newest first. */
  listRuns(guildId: string, limit: number): Promise<InsightRun[]>;
  markSent(guildId: string, runId: string, at: number): Promise<InsightRun>;
  insertFindings(findings: Omit<InsightFinding, 'id'>[]): Promise<void>;
  listFindings(guildId: string, runId: string): Promise<InsightFinding[]>;
  getOptIn(guildId: string, memberId: string): Promise<InsightOptIn | null>;
  setOptIn(optIn: InsightOptIn): Promise<InsightOptIn>;
  /** Members who opted in to DMs. */
  listOptedIn(guildId: string): Promise<string[]>;
}

/** Which guild member plays each character name (identity's characters, matched by name). */
export interface CharacterOwners {
  ownersOf(guildId: string, names: readonly string[]): Promise<Map<string, string>>;
}

/** Sends a run's DMs outside the transaction (apps/api: gate, word, DM). */
export interface InsightsEffects {
  send(guildId: string, runId: string): Promise<void>;
}

export interface InsightsDeps {
  insights: InsightsStore;
  characterOwners: CharacterOwners;
  insightsEffects: InsightsEffects;
}

export const command = commandsFor<InsightsDeps>();
