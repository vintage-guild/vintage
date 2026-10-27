import { type Caller, type CommandResult, commandsFor } from '@vintage/guild-kit';
import type {
  AgentConfig,
  AgentConfirmation,
  AgentRun,
  AgentSessionRecord,
  RunKind,
  RunStatus,
} from './contract';

export interface RunFilter {
  memberId?: string;
  kind?: RunKind;
  statuses?: RunStatus[];
  /** createdAt at or after. */
  since?: number;
  limit?: number;
}

export interface StoredToolResult {
  guildId: string;
  runId: string;
  callId: string;
  success: boolean;
  output: string;
  error: string | null;
}

/** The agent module's data port. Production wires the `agent` component; tests use `./testing`. */
export interface AgentStore {
  /** The saved config, or the defaults. */
  getConfig(guildId: string): Promise<AgentConfig>;
  setConfig(
    guildId: string,
    patch: Partial<Omit<AgentConfig, 'guildId' | 'updatedAt' | 'updatedBy'>>,
    now: number,
    updatedBy: string | null,
  ): Promise<AgentConfig>;

  insertRun(run: Omit<AgentRun, 'id'>): Promise<AgentRun>;
  getRun(guildId: string, runId: string): Promise<AgentRun | null>;
  updateRun(
    guildId: string,
    runId: string,
    patch: Partial<Omit<AgentRun, 'id' | 'guildId' | 'createdAt'>>,
  ): Promise<AgentRun>;
  /** Newest first. */
  listRuns(guildId: string, filter?: RunFilter): Promise<AgentRun[]>;
  countRuns(guildId: string, filter: RunFilter): Promise<number>;

  getSession(guildId: string, threadKey: string): Promise<AgentSessionRecord | null>;
  putSession(record: AgentSessionRecord): Promise<void>;
  deleteSession(guildId: string, threadKey: string): Promise<void>;
  /** Sessions last used before `before`, for the sweep. */
  listIdleSessions(guildId: string, before: number): Promise<AgentSessionRecord[]>;

  insertConfirmation(confirmation: Omit<AgentConfirmation, 'id'>): Promise<AgentConfirmation>;
  getConfirmation(guildId: string, confirmationId: string): Promise<AgentConfirmation | null>;
  updateConfirmation(
    guildId: string,
    confirmationId: string,
    patch: Partial<Pick<AgentConfirmation, 'status' | 'result' | 'finishedAt'>>,
  ): Promise<AgentConfirmation>;
  listConfirmations(guildId: string, runId: string): Promise<AgentConfirmation[]>;
  /** Pending confirmations whose window has closed. */
  listExpiredConfirmations(guildId: string, now: number): Promise<AgentConfirmation[]>;

  /**
   * Per-guild usage counters (`usageKey`). Decisions calls are counted here, not by scanning
   * the ledger, so the monthly cap is one read however many calls a month makes.
   */
  getUsage(guildId: string, key: string): Promise<number>;
  /** Add one and return the new count. */
  bumpUsage(guildId: string, key: string): Promise<number>;

  /** A function call's stored result: the idempotency key for tool retries. */
  getToolResult(guildId: string, runId: string, callId: string): Promise<StoredToolResult | null>;
  putToolResult(result: StoredToolResult): Promise<void>;
}

/** Starts a queued run outside the current transaction (it calls OpenAI). */
export interface AgentQueue {
  enqueue(guildId: string, runId: string): Promise<void>;
}

/** Runs a confirmed command through the registry as the member who confirmed it. */
export interface AgentCommandRunner {
  run(
    caller: Caller,
    name: string,
    input: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<unknown>>;
}

export interface AgentDeps {
  agent: AgentStore;
  agentQueue: AgentQueue;
  agentRunner: AgentCommandRunner;
}

export const command = commandsFor<AgentDeps>();
