import { agentConfigSet, agentPause, agentResume, agentStatus } from './admin';
import { agentAsk, agentRunGet, agentRuns } from './ask';
import { agentConfirm, agentDecline } from './confirm';

export { ASK_INSTRUCTIONS, type AskContext, askInput } from '../domain/instructions';
export {
  type AskCounts,
  type AskRefusal,
  BUSY_WINDOW_MS,
  dayStart,
  monthStart,
  refuseAsk,
} from '../domain/limits';
export {
  type PreparedChange,
  recordToolCall,
  type ToolCallKey,
  type ToolCallOutcome,
  type ToolReply,
} from '../domain/tool-calls';
export type {
  AgentCommandRunner,
  AgentDeps,
  AgentQueue,
  AgentStore,
  RunFilter,
  StoredToolResult,
} from '../store';

/** Every agent command, registered by apps/api through guild-kit. */
export const agentCommands = [
  agentAsk,
  agentRunGet,
  agentRuns,
  agentConfirm,
  agentDecline,
  agentStatus,
  agentPause,
  agentResume,
  agentConfigSet,
] as const;
