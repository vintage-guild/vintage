# agent module

The hosted guild agent (PLAN §3.10, epic #126): a member asks in plain words, the OpenAI Agents
API answers with that member's own commands, and anything that would change data waits for the
member to confirm. This module owns the agent's data and commands; the runtime lives in
`packages/agent-runtime` and the Convex action in `apps/api/convex/agent.ts`. Maturity:
**official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `AgentConfig` and defaults, `AgentRun` (the ledger, with `context`, `notes`, `draft`, `cancelRequested`), `AgentToolCall` (with summary, error, and times), `PageContext`, `AgentConfirmation`, `AgentSessionRecord`, windows (`CONFIRM_WINDOW_MS`, `SESSION_REUSE_MS`), `isAgentCommand`, `threadKeyOf` |
| `src/store.ts` | `AgentStore` port, `AgentQueue` (schedules a run), `AgentCommandRunner` (runs a confirmed command), `AgentDeps`, `command` |
| `src/domain/limits.ts` | Pure: UTC day and month starts, `refuseAsk` (pause, busy, daily and monthly caps) |
| `src/domain/router.ts` | The `/ask` router (#133): one Decisions question, `ROUTE_THRESHOLD` from `tests/fixtures/questions.json` |
| `src/render/discord.ts` | The private Discord reply: the answer, one Confirm/Drop row per prepared change (`agent:ok:<id>`, `agent:no:<id>`), the click's outcome |
| `src/domain/instructions.ts` | `ASK_INSTRUCTIONS` (the agent's standing rules) and `askInput` (surface, time, member, page context, question) |
| `src/domain/progress.ts` | `recordProgress`: a running run's notes and draft, bounded (`PROGRESS_LIMITS`) |
| `src/commands/` | `agent-ask`, `agent-run-get`, `agent-runs`, `agent-cancel` (member); `agent-confirm`, `agent-decline` (member, own changes only); `agent-status`, `agent-pause`, `agent-resume`, `agent-config-set` (officer) |
| `src/testing.ts` | Memory store and deps (a recording queue and runner) |
| `convex/` | The `agent` component: `config`, `runs`, `sessions`, `confirmations`, `toolResults` |

## Rules

- **The agent never changes data.** Its `afd-call` tool turns every mutation into a pending
  confirmation; destructive commands carry their real dryRun preview and confirm token. Only
  the member who asked can run it (`agent-confirm`), within 5 minutes for destructive changes
  and 30 for others. Officers cannot confirm someone else's change.
- **Tokens never leave the store.** `agent-run-get` and `agent-confirm` answer
  `ConfirmationView` (no `confirmToken`), and runs are shown without their session id. A run's
  `error` is a member-safe reason (`publicTurnError`); the raw error, which can carry session ids
  and upstream response bodies, goes to the Convex logs only.
- **The agent never sees `agent-*` commands** (`isAgentCommand`), so it can't ask itself, raise
  its own caps, or confirm its own changes.
- **Caps count questions, not dollars.** The Agents API returns null token usage, so
  `agent-ask` refuses with `AGENT_PAUSED`, `AGENT_BUSY` (a question of yours queued or running in
  the last 5 minutes), `AGENT_DAILY_LIMIT` (per member, UTC day), or `AGENT_MONTHLY_LIMIT` (per
  guild, UTC month). Decisions calls have their own monthly cap, checked in apps/api; the call
  that reaches 80% of it, and the one that reaches it, each post one note to the officers' ops
  channel (`decisionsBudgetAlert`, `decisions:budgetAlert`), since labels and triage stop
  quietly once it is used up (#145).
- **Pause stops everything AI.** `agent-pause` refuses new questions, makes a queued run fail
  when it starts, and refuses Decisions calls, whose consumers fall back to their templates.
- **One answer per run.** The action claims a run by moving it from `queued` to `running`; a
  retried schedule finds it running and does nothing. Tool results are stored per call id, so
  a retried function call returns the same result and never makes a second confirmation.
- **Sessions are per conversation.** `threadKey` is `<surface>:<thread>:<member>`; a follow-up
  within 30 minutes reuses the Agents API session, and the hourly sweep deletes sessions idle
  for an hour. A failed run deletes its session at OpenAI and drops the record, and a restarted
  conversation deletes the session it replaced, so no session outlives the map.
- **The router fails open.** Off-topic questions, and officer actions from anyone below leader,
  get a fixed reply without a turn; below `ROUTE_THRESHOLD`, on a refusal, or with no key, the
  question goes to the agent. Tier checks stay in guild-kit. Re-score the fixture with
  `pnpm --filter @vintage/agent exec tsx scripts/score-questions.ts` when the choices change.
- **How-to questions read the help pages.** `ASK_INSTRUCTIONS` points the agent at `help-get`
  (registered in apps/api, public, read-only), so "how do I make a raid?" is answered from the
  same page `/random help` shows that member.
- **Discord replies are private.** `/random ask` defers an ephemeral reply; the action edits it
  with the answer through the interaction token (passed to the scheduled run, never stored,
  valid 15 minutes). A missed delivery leaves the answer in the ledger.
- **Page context is a fact, not an instruction.** `agent-ask` takes an optional `context` (the
  page, and the raid, application, poll, member, character, or run selected on it). It is stored
  on the run and reaches the agent as header lines with the labels quoted, next to surface and
  time.
- **Progress is written while a run runs, never after.** The action follows the Agents API event
  stream and `recordProgress` writes the run's `notes` (commentary) and `draft` (the answer
  so far), throttled and bounded; a run that already ended is left alone. `finish` clears the
  draft. A dropped stream loses only progress: tool calls and the answer come from polling.
- **Tool rows are recorded as they happen.** Each `afd-call` adds its command, a readable
  `summary` (ids left out), its error, and when the loop first saw it and when it finished.
- **Stop is the asker's.** `agent-cancel` cancels a queued run outright and flags a running one;
  the action checks the flag on every poll, cancels the turn upstream, and ends the run
  `cancelled`. Its session is dropped like a failed one's. Officers can stop anyone's question.
- **Everything is in the ledger.** Every question, wording job, and Decisions call is a run
  with its tool calls and confirmations (`agent-runs`). Prompts are visible to officers.
- **`guildId` on every row**, read through guild-scoped indexes.
