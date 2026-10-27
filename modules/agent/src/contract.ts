// Public surface of the agent module. Other modules import only this file.

/** Reasoning effort a run asks for. Mirrors the Agents API's values. */
export const AGENT_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;
export type AgentEffortLevel = (typeof AGENT_EFFORTS)[number];

/**
 * Defaults from the #128 spike and model-routing.md: Terra 6.1 at medium for questions, Terra at
 * low for short wording jobs, Luna only behind the Decisions API.
 */
export const DEFAULT_ASK_MODEL = 'gpt-6.1-terra';
export const DEFAULT_ASK_EFFORT: AgentEffortLevel = 'medium';
export const WORDING_EFFORT: AgentEffortLevel = 'low';

export interface AgentConfig {
  guildId: string;
  /** Officers' kill switch: no questions, no wording, no decisions while paused. */
  paused: boolean;
  model: string;
  effort: AgentEffortLevel;
  /**
   * Caps count questions, not dollars: the Agents API returns null token usage (#128). At Terra
   * medium one question with a tool call costs well under a cent.
   */
  memberDailyAsks: number;
  guildMonthlyAsks: number;
  guildMonthlyDecisions: number;
  updatedAt: number;
  updatedBy: string | null;
}

export function defaultAgentConfig(guildId: string): AgentConfig {
  return {
    guildId,
    paused: false,
    model: DEFAULT_ASK_MODEL,
    effort: DEFAULT_ASK_EFFORT,
    memberDailyAsks: 20,
    guildMonthlyAsks: 1000,
    guildMonthlyDecisions: 20000,
    updatedAt: 0,
    updatedBy: null,
  };
}

/** `ask`: a member's question. `wording`: a system job's copy. `decision`: a Decisions call. */
export const RUN_KINDS = ['ask', 'wording', 'decision'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

/** `cancelled`: stopped by the member (agent-cancel) before it answered. */
export const RUN_STATUSES = ['queued', 'running', 'answered', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface AgentToolCall {
  /** The function tool (afd-discover, afd-detail, afd-call). */
  name: string;
  /** The guild command it ran or prepared, when there was one. */
  command: string | null;
  success: boolean;
  /** The command and its input in one readable line, ids left out (`summarize`); null otherwise. */
  summary: string | null;
  /** What went wrong, when it failed. */
  error: string | null;
  /** When the turn loop first saw the call, and when its result was recorded (ms). */
  startedAt: number | null;
  finishedAt: number | null;
}

/** What the asker was looking at: a page, and the thing selected on it. */
export const CONTEXT_KINDS = ['raid', 'application', 'poll', 'member', 'character', 'run'] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];

export interface PageContext {
  /** Where the question was asked: "Officers' quarters · Tonight". */
  page: string;
  selection?: { kind: ContextKind; id: string; label: string };
}

/** One entry in the ledger: who asked what, which commands ran, and how it ended (PLAN §3.11). */
export interface AgentRun {
  id: string;
  guildId: string;
  kind: RunKind;
  /** The asking member; null for system jobs. */
  memberId: string | null;
  surface: string;
  /** Conversation key for session reuse: `<surface>:<thread>:<member>`. */
  threadKey: string | null;
  /** What a Decisions call or wording job was for (`note-triage`); a router label for asks. */
  label: string | null;
  /** The question, or a short description of the job. At most 2,000 characters. */
  prompt: string;
  status: RunStatus;
  answer: string | null;
  error: string | null;
  model: string | null;
  sessionId: string | null;
  toolCalls: AgentToolCall[];
  confirmationIds: string[];
  /** Asks only: what the member was looking at when they asked. */
  context: PageContext | null;
  /** The agent's progress notes so far (`commentary` messages), in order. */
  notes: string[];
  /** The answer while it is being written; null before it starts and once the run ends. */
  draft: string | null;
  /** Set by agent-cancel on a running ask; the turn stops at its next poll. */
  cancelRequested: boolean;
  /** Input tokens when the API reports them (Decisions does; the Agents API returns null). */
  inputTokens: number | null;
  createdAt: number;
  finishedAt: number | null;
}

export const CONFIRMATION_STATUSES = ['pending', 'done', 'failed', 'declined', 'expired'] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

/** A change the agent prepared. Nothing runs until the member who asked presses Confirm. */
export interface AgentConfirmation {
  id: string;
  guildId: string;
  runId: string;
  memberId: string;
  command: string;
  input: unknown;
  /** Destructive commands only: the registry's token from the dryRun preview. Never shown. */
  confirmToken: string | null;
  preview: unknown;
  /** One line: what pressing Confirm does. */
  summary: string;
  status: ConfirmationStatus;
  createdAt: number;
  expiresAt: number;
  /** The command's result once it ran (or failed). */
  result: unknown;
  finishedAt: number | null;
}

/** A confirmation as surfaces see it: never the token. */
export type ConfirmationView = Omit<AgentConfirmation, 'confirmToken'>;

/** Destructive tokens last 5 minutes (guild-kit); other prepared changes last 30. */
export const CONFIRM_WINDOW_MS = { destructive: 5 * 60 * 1000, other: 30 * 60 * 1000 };

/** A saved Agents API session, reused for follow-ups in the same thread for a while. */
export interface AgentSessionRecord {
  guildId: string;
  threadKey: string;
  memberId: string;
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Where a finished run's answer goes besides the ledger. Discord: edit the deferred reply to the
 * interaction (its token is valid for 15 minutes and is passed to the scheduled run, never stored).
 */
export type AgentDelivery = { kind: 'discord'; applicationId: string; token: string };

/** Follow-ups within this window reuse the session; older ones start fresh and are swept. */
export const SESSION_REUSE_MS = 30 * 60 * 1000;

export const AGENT_COMMANDS = [
  'agent-ask',
  'agent-run-get',
  'agent-runs',
  'agent-confirm',
  'agent-decline',
  'agent-cancel',
  'agent-status',
  'agent-pause',
  'agent-resume',
  'agent-config-set',
] as const;
export type AgentCommandName = (typeof AGENT_COMMANDS)[number];

/** The agent never sees or prepares its own commands. */
export const isAgentCommand = (name: string) => name.startsWith('agent-');

/** Usage counter key for a calendar month (UTC): `decision:2026-10`. */
export function usageKey(kind: RunKind, now: number): string {
  return `${kind}:${new Date(now).toISOString().slice(0, 7)}`;
}

export function threadKeyOf(surface: string, thread: string | undefined, memberId: string) {
  return `${surface}:${thread ?? 'default'}:${memberId}`;
}

export const toConfirmationView = (c: AgentConfirmation): ConfirmationView => {
  const { confirmToken: _token, ...view } = c;
  return view;
};
