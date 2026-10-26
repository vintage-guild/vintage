# Polls — guild polls, votes, and surveys

> Status: active · Owner: Bloodfen · Requested by the GM (2026-10-25) · Epic vintage-guild/vintage#56
> Related: [PLAN.md §3.3](../../../../PLAN.md) (command surface), §4.2 (module anatomy), §6 (coordinator)

**The ask.** "Will it have different modules per set of functionality? I may add some
polling/voting features to it."

**Short answer.** Yes. Each feature area is a module with its own commands and data
(`identity`, `raids` today; `coordinator`, `loot` next). Polls would be `modules/polls`. Because
every module's capabilities are commands behind one registry, a poll created from Discord is the
same poll on the website, over MCP, and to the hosted agent: one ballot per member no matter
where they voted.

## Why a module, and why not Discord's built-in polls

Discord has had native polls since 2024, and **anyone can post one from the message box without
a bot**. So the bot should not just re-create that. Where a Vintage poll adds something:

| Need | Native Discord poll | Vintage poll |
|---|---|---|
| Vote from the website too | No. Apps cannot vote on a poll on a user's behalf | Yes: same `vote-cast` command from a Discord button or a web component |
| Who may vote | Anyone who can see the channel | Permission tier (`raider+`, `officer`), from Discord roles via identity |
| Anonymous ballot | No (Discord FAQ: no anonymous voting; voters are listed) | Yes, per poll |
| Results hidden until close | No | Yes, per poll |
| Ranked choice, quorum, weighted | No | Tally methods are pure code in the module |
| Edit after posting | No (poll is not editable; delete the message) | Options locked once votes exist; copy and close time editable |
| Feeds other features | No | Events: a "pick the raid night" poll can create a raid; officer votes can gate loot or promotions |
| Multi-question surveys | No | Survey = ordered questions, best answered on the website; Discord posts the invite |
| Agent access | No | `poll-results` over MCP: "what did we decide about Thursday?" |
| Live votes to the bot | **Gateway only** (`MESSAGE_POLL_VOTE_ADD`, intent `GUILD_MESSAGE_POLLS`). Vintage's bot is HTTP-interactions only (PLAN §6.2), so it would only see results by polling REST | Every vote is an interaction the bot already receives |

Native polls stay useful for casual questions, and the module can **mirror** one later (see
"Native mirror" below). Build the Vintage poll first; it's the only shape that works end to end
with the serverless bot and the website.

Discord API facts this design relies on (checked 2026-10-25,
[poll resource](https://docs.discord.com/developers/resources/poll),
[components](https://docs.discord.com/developers/components/reference),
[gateway events](https://docs.discord.com/developers/events/gateway-events)):

- Native poll: question ≤300 chars, ≤10 answers of ≤55 chars, duration 1h–32 days (client UI
  offers up to 1 week), optional multiselect. Created by `POST /channels/{id}/messages` with
  `poll`, or as an interaction response. Not editable; `POST …/polls/{message}/expire` ends it.
- Native results: `GET /channels/{id}/messages/{message}` returns `poll.results`
  (`answer_counts`, `is_finalized`); `GET …/polls/{message}/answers/{answer}` lists voters
  (paginated, 100 per page). REST only; no gateway needed.
- Components (legacy messages): 5 action rows; 5 buttons per row; a string select takes its own
  row, ≤25 options, `min_values`/`max_values` 0–25; `custom_id` ≤100 chars. Modals offer radio
  groups (2–10) and checkbox groups (1–10).

## Vocabulary

| Term | Meaning |
|---|---|
| **Poll** | One question, a fixed list of options, a voting method, a close time, and rules (who may vote, anonymity, when results show). Covers casual polls and formal votes alike |
| **Vote** | One member's ballot on one poll: the option ids they chose (ordered for ranked polls). One per member per poll; changing it replaces it |
| **Method** | How ballots become a result: `single` (one choice), `multi` (approval, up to N), `ranked` (instant-runoff) |
| **Survey** | An ordered list of questions answered together, with one response per member. Deferred to v2 (below) |

Formal officer votes are not a separate entity: a poll with `eligibleTier: 'officer'`,
`anonymous: true`, `resultsVisible: 'after-close'`, and a quorum.

## Module anatomy

```
modules/polls/
├─ module.json          name polls · maturity official · dependsOn [identity]
├─ src/contract.ts      Poll, PollOption, Vote, PollResults, POLLS_COMMANDS, PollsEvents
├─ src/domain/tally.ts  pure: (poll, votes) → PollResults for single / multi / ranked
├─ src/render/discord.ts pure: (poll, results, viewer?) → embed + action rows (discord-kit builders)
├─ src/commands/        poll-*, vote-*
├─ src/store.ts         PollsStore port, PollsMembers (reads identity), PollsEventSink, PollsDeps
├─ src/testing.ts       memory store + recording sink
├─ convex/              component: polls, votes, pollPosts tables
├─ tests/
└─ AGENTS.md
```

Same shape as `raids`: commands depend on the store port, never on Convex; identity is read
through `PollsMembers` (tier and rank for eligibility, display names for public results); the
Discord renderer is pure TypeScript on `libs/discord-kit` so it's snapshot-tested without a bot.

### Entities

The sketch below is the original design. `modules/polls/src/contract.ts` is the source of truth; it adds `PollOption.value` (opaque data for the feature that made the poll), `createdAt`, `closedAt`, and the frozen `results` on `Poll`, and names the post field `renderedKey`.

```ts
interface Poll {
  id: string; guildId: string;
  question: string;                       // ≤300
  description: string | null;
  options: PollOption[];                  // 2–25, { id, label ≤80, emoji? }
  method: 'single' | 'multi' | 'ranked';
  maxChoices: number | null;              // multi only
  eligibleTier: Tier;                     // who may vote; never below 'member'
  anonymous: boolean;                     // results never name voters, on any surface
  resultsVisible: 'live' | 'after-close' | 'officers';
  quorum: number | null;                  // minimum ballots for a valid result
  status: 'draft' | 'open' | 'closed' | 'cancelled';
  opensAt: number | null; closesAt: number | null;   // epoch ms
  createdBy: string;                      // memberId
  closedBy: string | null;                // memberId, or null when the sweep closed it
  tags: string[];                         // 'raid-night', 'loot-council', 'promotion', … for other modules
  configVersion: number;
}

interface Vote {
  id: string; guildId: string; pollId: string;
  memberId: string;                       // one vote per member per poll (index by_guild_poll_member)
  choices: string[];                      // option ids; ordered for ranked
  castAt: number; updatedAt: number;
  weight: number;                         // 1 today; room for rank weighting later
}

interface PollPost {                      // where the poll is shown on Discord, for edits
  id: string; guildId: string; pollId: string;
  channelId: string; messageId: string;
  renderedVersion: number;                // last (configVersion, vote count) rendered; skip no-op edits
}
```

Anonymity: `Vote` still carries `memberId` so each member votes once and can change their
mind, but no command, render, or event exposes voter identity for an anonymous poll, including to
officers. That's "anonymous through every surface", not "anonymous in the database". If the GM
wants a true secret ballot for officer votes, `memberId` becomes `voterKey = hmac(pollSalt,
memberId)` for that poll; the lookup "did I vote / change my vote" still works, and nothing can
map a key back without the member calling the command. Decide per poll with a `secretBallot`
flag; default off.

### Commands

| Command | Tier | Notes |
|---|---|---|
| `poll-create` | `raider` | Draft or open immediately. Validates options (2–25, unique), `closesAt` in the future, `eligibleTier ≥ member`. A creator cannot set `eligibleTier` above their own tier |
| `poll-update` | `raider` (own) / `leader` | Question, description, close time, visibility; options only while there are no votes |
| `poll-open` | `raider` (own) / `leader` | Draft → open; emits `poll-opened` |
| `poll-close` | `raider` (own) / `leader` | Open → closed, tallies, emits `poll-closed`. **Destructive** (irreversible): dryRun previews the result that would be recorded |
| `poll-cancel` | `leader` | Open or draft → cancelled, no result. **Destructive** |
| `poll-get` | `member` | Poll plus the caller's own vote; results included according to `resultsVisible` and the caller's tier |
| `poll-list` | `member` | Filters: status, tag, open-at time; sorted by close time |
| `poll-results` | `member` | Tally; voter names only when the poll is not anonymous. Officers always see the tally |
| `poll-sweep` | `system` (cron) | Opens due drafts, closes due polls; idempotent like `schedule-materialize` |
| `vote-cast` | `member` | Checks `tierAllows(caller.tier, poll.eligibleTier)`, status open, choices valid for the method; insert or replace; emits `vote-cast` only on a real change |
| `vote-retract` | `member` | Removes the caller's vote while the poll is open |

Names follow `<noun>-<verb>` (AGENTS.md invariant 5). Tiers: `member` is the floor so friends
and unranked accounts (`public`) never vote; a poll's `eligibleTier` narrows from there. Guild
rank stays out of permission, as in raids (gate on tier; rank may later weight or order).

### Events (contract)

| Event | Payload | Who listens |
|---|---|---|
| `poll-opened` | `pollId, question, closesAt, eligibleTier, tags` | Discord poster: post the message and record `PollPost` |
| `vote-cast` | `pollId, memberId?` (omitted when anonymous), `from, to` | Discord poster: refresh the post (debounced) |
| `poll-closed` | `pollId, tags, results, quorumMet` | Discord poster: final render. Coordinator: a `raid-night` poll creates the raid. Loot/promotion flows later |

### Store port

`PollsStore` mirrors `RaidsStore`: `listPolls(guildId, filter)`, `getPoll`, `insertPoll`,
`updatePoll`; `listVotes(guildId, pollId)`, `getVoteByMember(guildId, pollId, memberId)`,
`insertVote`, `updateVote`, `deleteVote`; `listPosts(guildId, pollId)`, `insertPost`,
`updatePost`. Every query is guild-scoped (invariant 7).

## Surfaces

### Discord

Posting and refreshing follow the coordinator's rules (PLAN §6.2): deterministic, serverless,
idempotent, logged.

1. **Create.** `/vintage poll create` opens a modal (question, options one per line, close time,
   method). The gateway turns the submit into `poll-create` + `poll-open`. Officers can also create
   from the website or from Claude over MCP.
2. **Post.** `poll-opened` → a Convex action renders the embed and posts it to the channel the
   command was run in (or a configured `#polls`), then records `PollPost`.
3. **Vote.** Up to 5 options and `single`: one button per option, `custom_id = poll:v:<pollId>:<optionId>`
   (well under 100 chars). 6–25 options, or `multi`: a string select with `max_values = maxChoices`.
   `ranked`: a link button to the website (ordering 25 options in Discord is a bad experience; a
   modal radio group only ranks one). The interaction hits `/discord/interactions`, which answers
   type 6 (deferred update) within 3 s, resolves the caller from the Discord user id, runs
   `vote-cast`, and follows up with an ephemeral "You voted for *Thursday*" (that is fine even
   for anonymous polls: it's only shown to the voter).
4. **Refresh.** `vote-cast` → the poster schedules one message edit a few seconds out if none is
   pending for that post (debounce), re-renders from `poll-results`, and skips the edit when
   `renderedVersion` is unchanged. Counts render as a text bar per option and a footer with
   votes cast, eligible count, and `<t:…:R>` for the close time. `after-close` and `officers`
   visibility hide the bars until close.
5. **Close.** `poll-sweep` on a cron (every 5 minutes, same pattern as materialize) closes due
   polls; `poll-closed` does the final render, disables the components, and marks the winner.
   Officers can `/vintage poll close` early.

The bot needs no new permissions for this (Send Messages, Embed Links, Read Message History are
already in the invite). It would need **Send Polls** only for the native mirror below.

### Website

- `<vintage-poll-card>` in `packages/ui-kit`: question, options, the member's current vote,
  results per visibility; `@command` → `vote-cast` (same command as the Discord button).
- `/polls` lists open and recent polls (`poll-list` as a live `commands.read` query, so bars
  move as Discord votes land), `/polls/:id` is the card plus voter list when public.
- Create and manage pages for leaders. Ranked polls vote here (drag to order).
- Sign-in is Discord OAuth (#7), so the web voter's `memberId` is the same member who presses the
  button in Discord: one ballot, two doors.

### MCP and the agent

`poll-list`, `poll-get`, `poll-results`, `vote-cast` are ordinary commands, so they appear through
`afd-discover` / `afd-call` at the caller's tier with no extra work. `/ask what did we decide
about Thursday?` is `poll-list` + `poll-results`. An officer can create a poll from Claude; a
member's agent can only vote as that member.

## Integrations

| Flow | How it uses polls |
|---|---|
| **Pick a raid night** ✅ (#64) | `raid-night-poll` (coordinator) creates a `raid-night` poll of start times; each option's `value` is the instant, so nothing parses labels. The coordinator tick reads closed ones (the event bus has no subscribers yet) and runs `raid-create` with the winner; a tie, a missed quorum, or no votes goes to the ops channel |
| **Officer votes** | `eligibleTier: 'officer'`, anonymous, `after-close`, quorum; posted to the officer channel. Promotions (recruit → raider) and policy changes |
| **Loot council** | `loot` asks `polls` (via contract) for a poll over the candidate characters for a drop, tagged `loot-council`; the award command reads the result. Keeps voting logic out of `loot` |
| **Post-raid feedback** | On `raid-completed`, open a short survey (v2) and summarize it in the officer digest |
| **Recurring polls** | "Which nights work next week?" every Sunday: a `PollTemplate` plus a materialize step, exactly like `Schedule` → `RaidEvent`. Add when there's a real recurring question |

## Surveys (v2)

A **Survey** is `{ title, questions: PollLike[], closesAt, eligibleTier, anonymous }` with one
`SurveyResponse` per member holding an answer per question (choices or free text ≤500 chars).
Discord is a poor place to answer five questions, so Discord's job is the invite (embed, link
button, "12/30 raiders responded" that refreshes) and reminders to non-responders through the
coordinator's existing nudge rules. Answering happens on the website. A single-question survey is
just a poll, so keep polls as the primitive and let surveys compose them rather than inventing a
second voting path. Free-text answers and CSV export (`survey-export`) are the only new pieces.

## Native mirror (later, if wanted)

If the GM prefers Discord's own poll UI for casual questions, add `render: 'native'` to
`poll-create`: the poster sends a native poll (question ≤300, ≤10 options of ≤55 chars, duration
≤32 days, no custom close time), stores the message id, and `poll-sweep` imports results via REST
(`poll.results` for counts; the voters endpoint to attach `memberId`s for non-anonymous reads).
Trade-offs to state up front: website is read-only for native polls, no tier gating, no
anonymity, no edits, counts lag by the sweep interval, and the bot needs **Send Polls**. This is
a rendering strategy on the same `Poll`, so nothing above changes.

## Decisions

Adopted 2026-10-25: Bloodfen took the defaults so work can start. The GM can revisit any of
them; only #2 is costly to change once votes exist.

| # | Question | Decision |
|---|---|---|
| 1 | Who may create polls: raiders, or leaders only? | `raider` creates for `raider+` audiences; `leader` to target `member`/`recruit` or officer-only |
| 2 | Is "anonymous through every surface" enough, or do officer votes need a secret ballot (`voterKey`)? | Surface-level anonymity; `secretBallot` flag held in reserve |
| 3 | Dedicated `#polls` channel, or post where the command runs? | Where the command runs; officer polls in the officer channel |
| 4 | Is a plain components poll acceptable, or does the GM want Discord's native look for casual polls? | Components first; native mirror if asked |
| 5 | Which integration first: raid-night picker, officer votes, or feedback survey? | Raid-night picker (uses the coordinator the GM already asked for) |

## Tasks

- [x] `vintagebot module-new polls`; contract, store port, memory store (#59)
- [x] `domain/tally.ts` with tests for single, multi, ranked (including ties and quorum) (#59)
- [x] Commands with the destructive confirm flow for `poll-close` / `poll-cancel` (#60)
- [x] Convex component (`polls`, `votes`, `pollPosts`), adapters in `apps/api`, register the commands and write the manifest, `poll-sweep` cron (#61)
- [x] `render/discord.ts` with tests; `/vintage poll create` (slash options, no modal), vote buttons, select, close with confirm (#62)
- [x] Poster in `apps/api/convex/pollPosts.ts`: post, debounced refresh, final render; the sweep also refreshes open posts (#62)
- [x] `ui-kit` poll card (pick one, pick any, ranked, hidden results) + `/polls` and `/polls/<id>`, home card by role view, officers' Polls tab (#63)
- [x] Raid-night picker in the coordinator: `raid-night-poll`, settled by the tick (#64)
- [x] Docs: module `AGENTS.md`, architecture table row, this plan → `active/` (#59)
