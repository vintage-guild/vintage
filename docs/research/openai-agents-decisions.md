# OpenAI Agents API and Decisions API: where they fit Vintage

Research note, 2026-10-26. Vintage's plan (PLAN §3.10) commits to a hosted guild agent on the
OpenAI Agents **SDK** running inside Convex Node actions. Since that was written OpenAI shipped
a hosted Agents **API** (2026-09-10), a Decisions API (GA 2026-10-22), and a new model line
(GPT-6 Astra, Sol, Luna, 6.1 Sol, 6.1 Terra). This note records what shipped, forms an opinion
on where each piece adds value for a guild platform whose policy is "deterministic triggers, AI
only for wording, officers decide", folds in what the GM asked for, and proposes a first
application set to try.

Sources: OpenAI's announcements, changelog, pricing page, and developer docs, plus two
third-party walkthroughs where the docs were thin. Third-party figures are marked as such.

## 1. What shipped, in order

### 2026-09-10 (the Agents API sweep)

| Item | What it is | Status |
|---|---|---|
| **Agents API** | The Codex harness as a managed service: OpenAI runs the model and tool loop, keeps a durable session, compacts context, coordinates subagents, and recovers. Your app sends input, answers function tools, and reads events, items, and artifacts. | Public beta, `OpenAI-Beta: agents=v1`; no fee beyond tokens, tools, and sandbox minutes |
| **OpenAI-hosted sandbox** | A per-session Linux container (Python, Node, CLI tools) with files, packages, setup commands, network rules, and downloadable artifacts. Same infrastructure as Codex. | Beta; billed per container size per 20 minutes, 5-minute minimum |
| **Sandbox partners** | First-class self-hosted environments at Blaxel, Cloudflare, Daytona, DigitalOcean, E2B, Modal, Oracle, Runloop, and **Vercel**. | Available |
| **GPT-Live 1** | Full-duplex voice model with a backend agent doing the reasoning; $0.05 per minute, billed per second. | GA |
| API key lifetimes | Project keys can expire; admins can enforce a maximum lifetime. | GA |

### Afterward

| Date | Item |
|---|---|
| 09-22 | GPT-6 Sol and GPT-6 Luna (text + image); better prompt caching for GPT-6 |
| 09-29 (DevDay) | GPT-6.1 Sol ("near-Astra at a fifth of the price"); computer use in the Agents API (hosted browser, your app approves sites and sign-ins); multi-agent delegation in beta for 6.1 Sol; Ultrafast tier for Astra; **Decisions API** limited preview; Bedrock Managed Agents; Dots (always-on agents in ChatGPT); MCP Events proposal |
| 10-06 | Decisions API public beta; usage tiers collapse to Build, Launch, Grow |
| 10-09 | Sandbox pre-warming; sandbox compute billed only during active turns |
| 10-15 | GPT-Live gets native Decisions triggers (act on transcript deltas) |
| 10-16 | Hosted sandboxes get the Artifact SDK and skills for spreadsheets, decks, and Word docs; Ultrafast in the Agents API via `agent.service_tier` |
| 10-20 | 12-hour prompt caching option (writes at 2.5x input) |
| 10-22 | **Decisions API GA**: shared-input caching, images in questions, `input_json`, 400 questions per request |
| 10-26 | **GPT-6.1 Terra**: fast vision, computer use, and "clearer, more natural writing" at half of 6.1 Sol's price |

### Models and prices (standard tier, per 1M tokens, from the pricing page)

| Model | Input | Cached | Output | Where it fits for us |
|---|---|---|---|---|
| gpt-6-astra | $10.00 | $1.00 | $50.00 | Not at runtime |
| gpt-6.1-sol | $2.00 | $0.10 | $10.00 | Log analysis, comp and strategy reasoning; the only model with multi-agent in beta |
| gpt-6.1-terra | $1.00 | $0.05 | $5.00 | Member-facing answers and copy (writing quality is its pitch) |
| gpt-6-luna | $0.10 | $0.01 | $0.50 | Default `/ask` model if the Agents API accepts it; cheap classification |
| Decisions API | $0.10 | $0.01 | free | Bounded questions only |

`docs/operations/model-routing.md` still names `gpt-5.6-luna` and `gpt-5.6-sol`. Those are a
generation behind and should move to `gpt-6-luna`, `gpt-6.1-terra`, and `gpt-6.1-sol` when we
touch the agent. Verify first that the Agents API accepts Luna and Terra; every documented
example uses Astra or Sol.

## 2. The Agents API in one page

**Objects.** An *agent* (model, instructions, tools, MCP servers; inline or saved by id). An
*environment*: `none` (no files or shell; still thinks, calls functions, searches, uses MCP),
`openai_hosted` (managed sandbox), or `self_hosted` (your box runs `codex exec-server`). A
*session* is one agent in one environment, durable across *turns*; status `idle`,
`in_progress`, `requires_action`, or `failed`. *Events* stream live and are not replayed;
*items* are the saved record. *Artifacts* are files written to `/workspace/outputs`. *Vaults*
hold credentials matched to MCP server URLs.

**Tools.**
- *Function tools* run in **your** code: the session pauses in `requires_action`, your handler
  runs, you post a `tool_result` with the same `call_id`. Output must be a string. If your
  handler never answers, the agent waits forever. Idempotency is on you.
- *Remote MCP* is called by the harness directly (or from the sandbox with
  `connection_origin: 'environment'`). `allowed_tools` restricts the surface.
- Built-ins: web search, programmatic tool calling (the model scripts many calls in an isolated
  runtime; on by default), tool search (`defer_loading` for big tool sets), computer use.
- *Skills* are `SKILL.md` folders loaded lazily; *plugins* bundle skills and MCP config.

**Subagents.** `multi_agent: { enabled, max_concurrent_subagents }` (default 6). They inherit
MCP servers, web search, and the environment's filesystem, but **not function tools**. Anything
a subagent needs from our side must be fetched into the workspace by the main agent first, or
reached over MCP.

**Control and delivery.** Steer a running turn by sending a message; cancel with an explicit
cancel event (closing a stream does not stop the turn, and it keeps billing). Webhooks
(`session.created`, `action_required`, `in_progress`, `idle`, `failed`) replace long-held
streams; `idle` is not success, check the turn's status. Structured final output via
`text.format` with a JSON schema.

**Limits worth knowing.** US-only data residency, no Zero Data Retention (a self-hosted
sandbox does not change this; the harness and session state stay at OpenAI). Request body
4 MiB; artifacts 200 MiB each, 500 MiB per session. Beta: fields change and some SDK types lag
the docs. Sessions, SDK sessions, Responses conversations, and sandboxes are separate resources
with separate cleanup.

**The reference app that matters to us** is the cookbook Slack bot: one session per thread
(key = workspace:channel:thread), four application-run tools scoped to the triggering channel,
optional MCP connections with credentials in a vault, streaming into one edited progress
message, "stop" cancels the active turn. Swap Slack for Discord and that is `/ask`.

## 3. The Decisions API in one page

`POST /v1/decisions` with `model: gpt-6-luna`, an `input` (string, or messages with text,
images, and `input_json`), and 1 to 400 `questions`. Three question types:

| Type | Returns | Use when |
|---|---|---|
| `predicate` | `probability` 0..1 | "Is this application complete?" |
| `choice` | `choice`, `probabilities`, `confidence` | Unordered categories: route a request, label a note, pick an agent's next step |
| `score` | `score` (probability-weighted level index), per-level `probabilities`, `confidence` | Ordered levels: urgency, fit, severity |

Input-only pricing ($0.10/M, $0.01/M cached, output free). Prompt caching is on by default
with the breakpoint after the shared input. US and EU residency, ZDR eligible. OpenAI claims
about 10x faster than Luna through the Responses API; Box reported about 5x faster routing at
equal accuracy. Independent latency numbers for the GA endpoint are not published yet; one
vendor measured plain Luna at about 1.5 s median before the endpoint opened, so the "150 ms"
slide figure is unverified.

OpenAI's own guidance on when **not** to use it matches our rules well: not for extraction or
generated text (use Structured Outputs), not for choosing tool arguments (use function
calling), not for questions that depend on each other (send separate requests). Thresholds
should be set from labeled examples from your own application.

## 4. What the GM asked for (brainstorm with Stridulent, 2026-10-26)

The notes sharpen the priorities more than the API research does:

- **Internal guild operations happen in Discord.** Nobody should have to check the website;
  the site is the "dig through it" surface and the officers' quarters. So the agent is a
  Discord officer tool first, and the first Decisions work should land in Discord flows.
- **An officer agent in Discord** that can "make simple changes directly or open an epic based
  on the request", for example updating recruitment needs, and "proactively assess and make
  recommendations". Bloodfen's framing: a GPT agent, Luna by default, specialists when a task
  needs a stronger model.
- **Guild applications** for raider and flex-raider only, submitted via Discord or the site,
  saved in the system, **categorized with the Decisions API and rough-rated for completeness
  by an LLM**, reviewed and replied to from the officers' quarters. On role elevation the bot
  DMs an onboarding note with the site link. Recruitment needs become the source of truth for
  the Discord embed and the site band.
- **Comparative log analysis**: not a Warcraft Logs replacement, an AI-backed investigation
  that finds narratives for improvement per raider, delivered as a Discord DM ("you're getting
  hit by this tank buster without a defensive up 73% of the time"). Helpful, not judgmental.
  Bloodfen has a start on this. Possibly a public product later.
- **Sub-roles** (recruitment officer, community) so not every officer sees everything.

The two things in that list the Agents API is genuinely built for are the log analysis (code,
files, parallel per-raider work, long turns) and the officer agent (durable sessions, function
tools over our commands). The applications pipeline is the Decisions API's natural first job.

## 5. Opinion: where each piece adds value

### 5.1 The Agents API is a better home for §3.10 than the SDK in Convex actions

The plan puts the agent loop inside a Convex Node action. That fit was always awkward: actions
have a wall-clock limit, there is no durable conversation unless we build it, and every tool
loop iteration lives in our process. The Agents API inverts that: OpenAI holds the loop and the
session; Convex only has to

1. create a session keyed to a Discord thread or DM (or a site chat), with `metadata`
   carrying `guildId` and `memberId`;
2. answer `action_required` webhooks by running the requested command through guild-kit **as
   that member** and posting the `tool_result`;
3. record each turn in the `AgentRun` ledger and enforce the spend caps and `agent-pause`.

That is a thin package, it maps onto Convex HTTP actions and scheduled functions cleanly, and it
keeps every invariant: commands remain the product (the agent's only tools are our commands),
the caller is the member (identity is resolved in step 2 and never handed to OpenAI), and
destructive commands still go through `dryRun` → confirm with a Discord button, not a
natural-language "yes". "Make simple changes directly" therefore means: the agent runs the
command with `dryRun`, posts the preview, and the officer presses confirm. One click, no epic.

For `/ask`, `environment: none` is right. Sandboxes, subagents, and computer use stay off until
a job needs code and files, which is exactly the log analysis.

Trade-offs to accept: conversation state lives at OpenAI (US only, no ZDR; guild data is low
sensitivity, but say so on the privacy page); the API is beta (pin the SDK, expect field
changes); and this deepens the OpenAI commitment the plan already made. One design question
stays open: the harness can call our future `/mcp` endpoint directly, which would let subagents
use commands too, but that needs a per-member credential in a vault per session. Function tools
answered by Convex avoid the credential problem, so start there and revisit MCP-direct when
`/mcp` exists (blocked on AFD 2.2 today).

### 5.2 The Decisions API is the quiet good fit

Vintage's rules forbid the AI from deciding anything consequential, and the coordinator is a
deterministic rule engine. The Decisions API is a *typed classifier with a probability*, priced
like a database lookup. That is exactly the shape that can live inside a deterministic rule
without changing who decides: the rule reads a label and a confidence, acts only above a
threshold we set from labeled examples, and otherwise falls back to today's behavior. Its
failure mode (a wrong label) is cheap to detect and harmless to fall back from.

Free text enters Vintage at: applications (planned), signup notes, `/ask` prompts, poll
questions, and later wishlist notes. Those are the candidates, in that order.

### 5.3 Log analysis is where the expensive features pay for themselves

A raid night's logs are large, per-raider analysis is embarrassingly parallel, and the output
is a set of files and messages. That is a hosted sandbox with Sol, `multi_agent` enabled, the
main agent pulling the report (via a function tool or an MCP server for the logs provider) into
the workspace, one subagent per role or raider writing its findings to its own output file, and
the main agent assembling per-raider DMs plus an officer summary. Compaction and artifacts
handle the length; webhooks handle the wait. Nothing else in Vintage needs this machinery, and
this job needs all of it.

Two rules to set before building: the tone is "here is one thing that would help", never a
ranking; and findings are claims about the log with the evidence attached (timestamps, counts),
so a raider can check them. Keep the module self-contained (its own tables, its own contract)
because it may become a product on its own.

### 5.4 What stays off the table

- **Loot awards.** Never a model decision (PLAN §1 P2, §5.3). A model may summarize inputs for
  the council; the award is a human command.
- **Comp selection.** `libs/comp-solver` is deterministic and explainable; keep it that way. A
  model may explain gaps or propose alt swaps as a dryRun preview; the pick order stays code.
- **Computer use, Dots, GPT-Live.** No Vintage surface needs a browser-driving agent; Discord
  voice is not reachable through GPT-Live; Dots is a ChatGPT product, not an API.
- **Contributor fleets on the Agents API.** Plausible for PLAN §7.4's `do-run-fleet` with a
  self-hosted sandbox, but that is repo tooling, not the guild product. Separate note if wanted.

## 6. Proposed first application set

Ordered so each one proves something the next one needs. All follow the ports-first rule:
modules depend on an `AgentPort` / `DecisionsPort` interface in `packages/`, `apps/api` adapts
them to OpenAI, tests use memory fakes, and every path has a deterministic fallback.

### A. Officer `/ask` in Discord (Agents API, `environment: none`)

- **Shape:** `/random ask <question>` in Discord (officers first, members once caps are
  proven) and later site chat. One session per thread or DM, model `gpt-6-luna` if accepted,
  else `gpt-6.1-terra`; tools are a small set of function tools over the registry
  (`afd-discover`, `afd-detail`, `afd-call`) answered by a Convex HTTP action on the
  `action_required` webhook, bound to the asking member.
- **First officer jobs:** "update recruitment needs: we're full on hunters, need a resto
  shaman" → `recruiting-set` preview + confirm; "who hasn't answered Thursday?" →
  non-responder list; "why did the bot ping Kol?" → `coordinator-log` answer.
- **Proactive recommendations** (the GM's ask): a weekly coordinator rule, deterministic
  trigger, that starts one agent turn with `comp-suggest` gaps, `recruiting-get`, and
  attendance, and posts a short "recruitment and roster assessment" to the ops channel with
  suggested `recruiting-set` changes as confirm buttons. Template fallback if the call fails.
- **Guardrails already planned:** per-member daily and global monthly caps from the
  `AgentRun` ledger, `agent-pause`, template fallback, previews for anything mutating.
- **Proves:** session-per-thread, the webhook tool bridge, identity binding, cost per question.

### B. Guild applications (new module; Decisions + a light agent pass)

- **Shape:** a `recruiting` or `applications` module owning `Application` records. Intake from
  a Discord modal (bot) and the site form, both calling `application-submit`. On submit, one
  Decisions request: `choice` role {raider, flex-raider, social}, `choice` class, `predicate`
  "complete enough to review", `score` fit to current open roles (the shared input is the
  application plus `recruiting-get`). Below-threshold labels show as "unsorted". Optionally one
  cheap agent turn drafts a two-line summary for the officer card.
- **Officer flow:** new applications post to a recruitment channel as an embed with labels and
  Accept / Ask more / Decline buttons; the officers' quarters lists and lets officers reply.
  Accept sets the Discord role; the existing role→rank sync promotes them; the bot DMs the
  onboarding note with the site link.
- **Sub-roles:** a `recruitment` tier or capability so a recruitment officer sees only this.
- **Proves:** Decisions inside a deterministic flow with thresholds from real applications;
  the first "same data in Discord and on the site" job the GM named.

### C. Decisions quick wins inside existing flows

- **Signup-note triage:** `choice` {late, tentative, absent-with-reason, swap-or-alt,
  question, other} and `predicate` "needs an officer". The digest groups notes by label and
  lifts "needs an officer" to the top; raw note shown as today below threshold. Cost well under
  $0.01 per thousand notes.
- **`/ask` intent router:** one `choice` on the prompt {read-only question, own-signup
  change, officer action, off-topic} before opening a session. Off-topic and officer actions
  from non-officers get a template reply and spend no session. Tier enforcement stays in
  guild-kit; this only saves tokens and labels each `AgentRun` for the cost report.

### D. Raid log insights (Agents API with a hosted sandbox and subagents)

- **Shape:** an officer command `insights-run <log-report>` starts a Sol session with
  `environment: openai_hosted`, `multi_agent` on, a function tool (or MCP server) that fetches
  the report into the workspace, and read-only tools over `raid-get` and `signup-list` for the
  roster. Subagents write per-raider findings to their own files; the main agent assembles DMs
  and an officer summary as artifacts. Convex stores the findings in the module's tables and
  the coordinator sends DMs under the same opt-out and rate limits as reminders.
- **Guardrails:** helpful-not-judgmental instructions with examples; every finding carries
  evidence; raiders opt in to DMs; officers see the summary before DMs go out the first few
  times; per-run cost cap and prompt deletion of sessions.
- **Build on** Bloodfen's existing analysis work; the harness replaces the orchestration, not
  the domain knowledge.
- **Proves:** whether the Agents API's sandbox, subagents, and artifacts earn their cost on a
  real job, and the shape of a possible standalone product.

### Later

- Loot council packet: an agent-drafted summary of a candidate's attendance, wishlist, and
  recent loot, shown as a dryRun preview to the officer running the award.
- Alt-swap suggestions as a dryRun on `comp-suggest`.
- Site chat using the same sessions.

## 7. Changes this implies

| Where | Change |
|---|---|
| PLAN §3.10 | Runtime becomes "Agents API sessions; Convex keeps the session map, the `AgentRun` ledger, and answers function tools over webhooks". `packages/agent` is a bridge, not a harness. |
| PLAN §3.2, model-routing | Model names to the GPT-6 line; add Decisions and the log-insights (Sol, subagents) rows. |
| PLAN §3.3, §8 | New module for applications (Phase 1.5, not "Later"); a new module for log insights; `agent-ask|pause|resume` stay. |
| `packages/` | `agent` (session map, webhook handler, tool bridge, spend ledger) and `decisions` (port + memory fake in `testing`). Modules never import OpenAI (layer rule). |
| coordinator | A weekly `assessment` rule and a `noteTriage` step in `render.ts`, both behind ports with the current output as fallback. |
| Tiers | A recruitment sub-role or capability. |
| Open question Q10 | Spend becomes concrete: Luna or Terra for answers, Luna for decisions, Sol for insights runs, caps per member, per run, and per month, `agent-pause` for officers. |
| Privacy copy | State that `/ask`, applications, and log insights are processed by OpenAI in the US. |

## 8. Open questions to settle by trying

1. Does the Agents API accept `gpt-6-luna` and `gpt-6.1-terra`? Docs only show Astra and Sol.
2. Webhook round-trip latency per function call from a Convex HTTP action, and whether
   Discord's 3-second acknowledgement plus a follow-up message is comfortable for one-call
   answers.
3. Measured Decisions latency and accuracy on our own notes and applications versus plain Luna
   with a strict enum (the fallback if the endpoint disappoints).
4. Log access: which logs provider, API terms for pulling a guild's reports, and whether the
   main agent fetches once or an MCP server serves subagents.
5. Cost of one insights run for a 25-person raid night on Sol with subagents (budget guess: low
   single-digit dollars; measure before promising DMs every week).
6. Whether a saved agent (by id) or an inline agent per session is easier to version alongside
   `commands.manifest.json`.
