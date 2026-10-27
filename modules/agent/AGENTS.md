# agent module

The hosted guild agent (PLAN §3.10, epic #126): a member asks in plain words, the OpenAI Agents
API answers with that member's own commands, and anything that would change data waits for the
member to confirm. This module owns the agent's data and commands; the runtime lives in
`packages/agent-runtime` and the Convex action in `apps/api/convex/agent.ts`. Maturity:
**official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `AgentConfig` and defaults, `AgentRun` (the ledger), `AgentConfirmation`, `AgentSessionRecord`, windows (`CONFIRM_WINDOW_MS`, `SESSION_REUSE_MS`), `isAgentCommand`, `threadKeyOf` |
| `src/store.ts` | `AgentStore` port, `AgentQueue` (schedules a run), `AgentCommandRunner` (runs a confirmed command), `AgentDeps`, `command` |
| `src/domain/limits.ts` | Pure: UTC day and month starts, `refuseAsk` (pause, busy, daily and monthly caps) |
| `src/domain/instructions.ts` | `ASK_INSTRUCTIONS` (the agent's standing rules) and `askInput` (surface, time, member, question) |
| `src/commands/` | `agent-ask`, `agent-run-get`, `agent-runs` (member); `agent-confirm`, `agent-decline` (member, own changes only); `agent-status`, `agent-pause`, `agent-resume`, `agent-config-set` (officer) |
| `src/testing.ts` | Memory store and deps (a recording queue and runner) |
| `convex/` | The `agent` component: `config`, `runs`, `sessions`, `confirmations`, `toolResults` |

## Rules

- **The agent never changes data.** Its `afd-call` tool turns every mutation into a pending
  confirmation; destructive commands carry their real dryRun preview and confirm token. Only
  the member who asked can run it (`agent-confirm`), within 5 minutes for destructive changes
  and 30 for others. Officers cannot confirm someone else's change.
- **Tokens never leave the store.** `agent-run-get` and `agent-confirm` answer
  `ConfirmationView` (no `confirmToken`), and runs are shown without their session id.
- **The agent never sees `agent-*` commands** (`isAgentCommand`), so it can't ask itself, raise
  its own caps, or confirm its own changes.
- **Caps count questions, not dollars.** The Agents API returns null token usage, so
  `agent-ask` refuses with `AGENT_PAUSED`, `AGENT_BUSY` (a question of yours queued or running in
  the last 5 minutes), `AGENT_DAILY_LIMIT` (per member, UTC day), or `AGENT_MONTHLY_LIMIT` (per
  guild, UTC month). Decisions calls have their own monthly cap, checked in apps/api.
- **Pause stops everything AI.** `agent-pause` refuses new questions, makes a queued run fail
  when it starts, and refuses Decisions calls, whose consumers fall back to their templates.
- **One answer per run.** The action claims a run by moving it from `queued` to `running`; a
  retried schedule finds it running and does nothing. Tool results are stored per call id, so
  a retried function call returns the same result and never makes a second confirmation.
- **Sessions are per conversation.** `threadKey` is `<surface>:<thread>:<member>`; a follow-up
  within 30 minutes reuses the Agents API session, and the hourly sweep deletes sessions idle
  for an hour. A failed run drops its session so the next question starts clean.
- **Everything is in the ledger.** Every question, wording job, and Decisions call is a run
  with its tool calls and confirmations (`agent-runs`). Prompts are visible to officers.
- **`guildId` on every row**, read through guild-scoped indexes.
