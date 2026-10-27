// The agent runtime port. OpenAI hosts the loop and the durable session (Agents API, PLAN §3.10);
// Vintage starts turns, answers the function tools it declared, and reads the final answer.

/** Reasoning effort the Agents API accepts. */
export type AgentEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** A function tool the agent may call. Vintage runs it; the agent only sees its output. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface StartTurnRequest {
  /** Resume this session, or null to create one. */
  sessionId: string | null;
  model: string;
  effort: AgentEffort;
  /** Appended to the harness's base instructions. Used only when a session is created. */
  instructions: string;
  tools: readonly AgentToolDefinition[];
  input: string;
  /** Up to 16 string pairs, stored on the session (guildId, memberId, runId). */
  metadata: Record<string, string>;
}

/** A function call the session is waiting on. */
export interface FunctionCall {
  turnId: string;
  callId: string;
  name: string;
  arguments: unknown;
}

export type SessionStatus = 'idle' | 'in_progress' | 'requires_action' | 'failed';

export interface SessionState {
  status: SessionStatus;
  /** Function calls only; other required actions (computer use) are never enabled. */
  functionCalls: FunctionCall[];
  error: string | null;
}

export interface ToolResult {
  turnId: string;
  callId: string;
  success: boolean;
  /** What the agent reads. Keep it short and JSON-shaped. */
  output: string;
  error?: string;
}

export type TurnStatus =
  | 'queued'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TurnAnswer {
  /** The latest turn, or null before the session has one. */
  turnId: string | null;
  turnStatus: TurnStatus | null;
  /** The final answer's text, or the last assistant message when there is no final answer. */
  text: string | null;
  error: string | null;
}

export interface AgentRuntime {
  /** Create a session with this input, or send the input to an idle session. Returns its id. */
  start(request: StartTurnRequest): Promise<{ sessionId: string }>;
  state(sessionId: string): Promise<SessionState>;
  submitToolResults(sessionId: string, results: readonly ToolResult[]): Promise<void>;
  /** The latest turn's outcome and final text. Call once the session is idle or failed. */
  answer(sessionId: string): Promise<TurnAnswer>;
  /**
   * The latest turn's id. Read before sending a follow-up: the API accepts input before the new
   * turn starts, so until a newer turn appears the session still reports the previous one.
   */
  latestTurnId(sessionId: string): Promise<string | null>;
  cancel(sessionId: string): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
