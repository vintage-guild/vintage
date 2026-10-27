import { agentConfigSet, agentPause, agentResume, agentStatus } from './admin';
import { agentAsk, agentCancel, agentRunGet, agentRuns } from './ask';
import { agentConfirm, agentDecline } from './confirm';

export { ASK_INSTRUCTIONS, type AskContext, askInput } from '../domain/instructions';
export {
  type AskCounts,
  type AskRefusal,
  BUDGET_WARNING_SHARE,
  BUSY_WINDOW_MS,
  dayStart,
  decisionsBudgetAlert,
  monthStart,
  refuseAsk,
} from '../domain/limits';
export {
  PROGRESS_LIMITS,
  type RunProgress,
  recordProgress,
} from '../domain/progress';
export {
  decideRoute,
  ROUTE_REPLIES,
  ROUTE_THRESHOLD,
  type Route,
  type RouteDecision,
  routeQuestion,
  routeRequest,
} from '../domain/router';
export {
  type PreparedChange,
  recordToolCall,
  type ToolCallKey,
  type ToolCallOutcome,
  type ToolReply,
} from '../domain/tool-calls';
export {
  type AgentButton,
  agentCustomId,
  MAX_CHANGES_SHOWN,
  parseAgentCustomId,
  type ReplyView,
  renderAgentReply,
  renderChangeResult,
} from '../render/discord';
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
  agentCancel,
  agentStatus,
  agentPause,
  agentResume,
  agentConfigSet,
] as const;
