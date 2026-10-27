// Recording one function call of an agent run: the confirmation it prepared, the ledger entry,
// and the stored result that makes a retried call return the same answer. The host runs the call
// itself (apps/api: the registry tools as the asking member); everything it writes goes here.
import { type AgentRun, type AgentToolCall, CONFIRM_WINDOW_MS } from '../contract';
import type { AgentStore } from '../store';

/** A change the call prepared for the member to confirm. */
export interface PreparedChange {
  command: string;
  input: unknown;
  confirmToken: string | null;
  preview: unknown;
  summary: string;
}

/** What running one function call produced. */
export interface ToolCallOutcome {
  success: boolean;
  output: string;
  error?: string;
  /** The guild command it ran or prepared. */
  command: string | null;
  confirmation: PreparedChange | null;
}

export interface ToolCallKey {
  guildId: string;
  runId: string;
  callId: string;
  name: string;
}

/** What the agent receives for the call. */
export interface ToolReply {
  success: boolean;
  output: string;
  error?: string;
}

const reply = (r: { success: boolean; output: string; error?: string | null }): ToolReply => ({
  success: r.success,
  output: r.output,
  ...(r.error ? { error: r.error } : {}),
});

/**
 * Run one call at most once. A call id already answered returns its stored result without
 * running again, so a retry never prepares a second confirmation. `execute` returns null when the
 * asking member can no longer act (left the guild); that answer is stored too.
 */
export async function recordToolCall(
  store: AgentStore,
  key: ToolCallKey,
  now: number,
  execute: (run: AgentRun) => Promise<ToolCallOutcome | null>,
): Promise<ToolReply> {
  const { guildId, runId, callId, name } = key;
  const stored = await store.getToolResult(guildId, runId, callId);
  if (stored) return reply(stored);

  const run = await store.getRun(guildId, runId);
  if (!run) return { success: false, output: '', error: 'This question is no longer on record' };

  const outcome = (run.memberId ? await execute(run) : null) ?? {
    success: false,
    output: '',
    error: 'The asking member is no longer in the guild',
    command: null,
    confirmation: null,
  };

  const confirmationIds = [...run.confirmationIds];
  if (outcome.confirmation && run.memberId) {
    const window = outcome.confirmation.confirmToken
      ? CONFIRM_WINDOW_MS.destructive
      : CONFIRM_WINDOW_MS.other;
    const saved = await store.insertConfirmation({
      guildId,
      runId,
      memberId: run.memberId,
      ...outcome.confirmation,
      status: 'pending',
      createdAt: now,
      expiresAt: now + window,
      result: null,
      finishedAt: null,
    });
    confirmationIds.push(saved.id);
  }
  const toolCalls: AgentToolCall[] = [
    ...run.toolCalls,
    { name, command: outcome.command, success: outcome.success },
  ];
  await store.updateRun(guildId, runId, { toolCalls, confirmationIds });
  await store.putToolResult({
    guildId,
    runId,
    callId,
    success: outcome.success,
    output: outcome.output,
    error: outcome.error ?? null,
  });
  return reply(outcome);
}
