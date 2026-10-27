# Officers' assistant: Random in a side panel

**Status:** proposed (2026-10-26). **Owner modules:** agent (commands and runs), ui-kit (the
panel), apps/web (the quarters shell). **Epic:** #126, which listed site chat as a later non-goal;
this is that follow-on.

Officers already ask Random in Discord with `/random ask`. The same agent belongs beside the work:
a side panel in the officers' quarters that stays open as they move between tabs, sees which tab
and raid they're on, and can run any command an officer can, with every change confirmed. "Lock
Thursday's roster and bench the late ones" should take one message and two Confirm clicks, not
three tabs.

## Today

| Piece | Where | State |
|---|---|---|
| Asking, with a thread for follow-ups | `agent-ask { question, thread }` | ✅ used by Discord; `threadKey` is `<surface>:<thread>:<member>` |
| A run's status, answer, and pending changes | `agent-run-get` | ✅ |
| Confirming or dropping a prepared change | `agent-confirm`, `agent-decline` | ✅ checked live in Discord (J26) |
| Caps, the ledger, the kill switch | `agent-status`, `agent-runs`, `agent-pause` | ✅ |
| Any officer command as a tool | `afd-discover`, `afd-detail`, `afd-call` over the registry | ✅ tier-checked as the asking member |
| What a run records per tool call | `AgentToolCall { name, command, success }` | ⚠️ no input, no timing, only after the turn |
| Progress during a turn | the runtime polls the session | ❌ nothing a surface can show until the answer |
| Page context | none | ❌ "bench the late ones" can't know which raid |
| A thread's history | `agent-runs` filters by member and kind | ❌ not by thread, so a reload loses the conversation |
| Stopping a turn | the runtime can cancel | ❌ no command |
| Chat UI | `vendor/violet-elements/dist/conversation/` | ✅ vendored, unused: thread, message, message text, reasoning block, tool-call card, tool-result card, approval card, composer, suggestions, source citation, media, status |

## What the backend gives us

The Agents API covers what a good panel needs; Vintage uses less of it today.

- **Tools:** every function call comes back to our server to run (`required_actions`), so we know
  when each starts, how it ends, and what it returned.
- **Progress:** each session has an event stream (`/agents/sessions/{id}/events?stream=true`):
  `turn.created`, `turn.in_progress`, `turn.item.added`, `turn.output_text.delta`, and
  `turn.completed` / `failed` / `cancelled`. Assistant messages carry a `phase` of `commentary`
  or `final_answer`, so progress notes and the answer arrive apart.
- **Stop:** `agent.session.input.cancel`, which `packages/agent-runtime` already sends.
- **Not exposed:** reasoning text. The API reports reasoning tokens only, so there is no "thinking"
  transcript to show; the reasoning block stays unused.

**Transport:** Convex, not a socket. A Convex action reads the session's event stream and writes
progress to the run, throttled; the panel reads the run through a reactive Convex query. The
conversation lives on the server, so it survives tab changes, reloads, and a dropped connection
with no heartbeat, reconnect, or replay code. (Lushly streams over one HTTP request; fabric-zero
runs a WebSocket with heartbeats and replay. Both keep state in the browser that Convex keeps for
us.)

## References

- **Lushly's assistant panel** (Bloodfen's app, on the same Violet elements). Its panel, part
  templates, tool labels, and markdown element have no dependency on its chat SDK (TanStack AI) and
  port with a restyle. Only its controller (`chat.ts`, `chat-approval.ts`, `chat-messages.ts`) is
  tied to TanStack; Vintage replaces it with a mapper from agent runs. Its markdown uses `marked`
  and `DOMPurify` with a tag allowlist, `https:` links only, and a second allowlist pass on the DOM.
- **fabric-zero's copilot** (a work repository): behavior only, in our own words and code. Nothing
  is copied from it.

## Design

### The panel

`<vintage-agent-panel>` in ui-kit, composed from the Violet conversation elements and styled only
by design tokens (`vintage-design-tokens` skill). It lives in the quarters' shell outside the tab
content, so switching tabs hides nothing. Open or closed and the thread id are kept per browser tab
(`sessionStorage`); the conversation itself is on the server.

What a turn shows, in order:

1. **The question**, with a chip for the page context it was sent with ("Tonight · Molten Core").
2. **"Working on it"** until the first activity, then an elapsed timer that stays on the finished
   turn ("12s").
3. **Tool rows** for guild commands, not the three generic tools: a verb that changes tense with
   the one input that tells it apart ("Reading signups for Thursday's Molten Core…" → "Read
   signups…"), and a failed state with the error. Two or more fold into "Ran 3 commands".
   `afd-discover` and `afd-detail` show as one quiet "Looking up commands" row.
4. **Progress notes** from `commentary` messages, in muted text.
5. **The answer**, as markdown.
6. **Approval cards**, one per prepared change: the agent's sentence, the change line
   (`summarize`, ids left out), **Confirm** (`agent-confirm`) and **Drop** (`agent-decline`).
   Confirmed changes collapse to "Done"; dropped ones to "Dropped".

The composer sends with Enter, adds a line with Shift+Enter, and turns its send button into
**Stop** during a turn (Escape does the same). Starter prompts change with the tab ("Who hasn't
answered for tonight?" on Tonight, "Summarize the open applications" on Applications).

### Page context

Every send carries what the officer is looking at: the tab, and the raid, application, or poll
selected on it. It goes to the agent as a short header, like `askInput`'s surface and time today,
never as instructions. The composer shows it as a removable chip, so the officer can ask about
something else.

### Keeping changes deliberate

Vintage confirms every change, not only destructive ones, and the panel keeps that (PLAN §3.10).
One card per change keeps "bench five people" five decisions. A "Confirm all" may come later, once
officers have used it.

After a confirmed change, the panel emits an event and the open tab reloads its data, so the
roster or the application shows what just happened.

### Accessibility

- The message list is a polite live log; only tool rows with real progress announce.
- The timer has its announcements off and a label that says what it times.
- Errors use `role="alert"`.
- Focus returns to the composer when the element holding it goes away.
- Alt+A opens and closes the panel. Escape stops a turn, and steps aside for open menus, dialogs,
  and text composition.

### Cost

Officers will ask more often in a side panel than in Discord. The panel's header shows this month's
use against the guild cap (`agent-status`), one click from `agent-config-set`, and `agent-pause`
still stops everything.

## Phases

| # | Phase | Issue | Touches | Done when |
|---|---|---|---|---|
| 1 | Backend: context, history, progress, stop | #167 | agent module, agent-runtime, apps/api, manifest | `agent-ask` takes `context`; `agent-runs` filters by `thread`; runs carry tool calls with input summaries and start and finish times, commentary notes, and partial text, while the turn runs; `agent-cancel` stops a turn |
| 2 | The panel in the quarters | #168 | ui-kit, apps/web | `<vintage-agent-panel>` from Violet elements, a safe markdown element, the run-to-parts mapper, the shell slot, tab-aware prompts and context chips, happy-dom tests, and the dev fixtures answering through a fake agent |
| 3 | Live check and the job | #169 | docs/jtbd, apps/api/tests/jtbd | A new JTBD job ("Ask Random beside the work and confirm its changes") with a scenario test, and a live run on production in the test server |

Phase 1 changes commands (`agent-ask` input, `agent-runs` input, a new `agent-cancel`), so it
updates `commands.manifest.json`; the new inputs are optional, so it isn't breaking. Phase 2 needs
phase 1. Phase 3 needs both.

## Not now

- A list of past conversations (one thread per browser tab is enough to start).
- An undo bar, a slash menu, @-mentions, follow-up chips, and a plan mode.
- Members' chat on the public site (same panel, `member` tier, later).
- Attachments (a Farsight upload from the panel would be the first).

## Decisions

| Date | Decision |
|---|---|
| 2026-10-26 | Our own panel on Violet's vendored conversation elements, not ChatKit: ChatKit's server SDK is Python only and assumes the Agents SDK, and its hosted path ends with Agent Builder on 2026-11-30. |
| 2026-10-26 | Progress reaches the browser through Convex (an action reads the Agents API event stream, the panel reads the run reactively), not a socket or SSE to the browser. |
| 2026-10-26 | Every change stays confirmed in the panel, one card per change. |
| 2026-10-26 | fabric-zero informs behavior only; no code from it. Lushly's panel code may be ported (Bloodfen's). |
