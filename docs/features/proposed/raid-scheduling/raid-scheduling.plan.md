# Raid scheduling: edit a raid's comp and size, schedules from Discord, a short site link

**Status:** proposed (2026-11-22). Nothing built. TJ's product calls and most of Bloodfen's
technical calls are settled (2026-11-22); the rest are under Open questions. **Owner modules:** raids
(commands), apps/api (Discord), web (quarters, short links), coordinator (signup post, leads
feed).

Three asks from TJ (guild master) on 2026-11-22:

1. Officers can change a raid's time and notes after it exists, but not its comp targets or
   size. A raid made for 3 healers stays at 3 even when the night needs 4.
2. Recurring raids on more than one night (raid 1 on Mondays, raid 2 on Wednesdays, the same
   raiders) can only be set up on the site.
3. Every Discord signup post should carry a short link to that raid's signup on the website.

## Today

| Piece | Where | State |
|---|---|---|
| Edit a raid after it exists | raids `raid-reschedule` (leader), the quarters' raid form | ✅ time and notes only; `TICK_TRIGGERS` in `apps/api/convex/commands.ts` has `'raid-update'` instead of `'raid-reschedule'` (#320) |
| Comp targets and size | `raid-create`, `schedule-create`, `schedule-update` | ✅ at creation and on schedules in commands; quarters form (`calendar-forms.ts`) and Discord event form still expose single `dps` only and no `access` toggle (#323) |
| A schedule's targets reaching its raids | `schedule-materialize` | ✅ copied when each raid is made; raids already made keep theirs |
| Several schedules at once | `schedule-create`, `schedule-list`, `schedule-materialize` (every active schedule), the quarters' Calendar tab (**New schedule**, an Edit per schedule) | ✅ |
| Schedules from Discord | `/vintage event` has `create`, `pick-night`, `check-export` | ❌ none |
| Split targets and roster approval | comp-solver `roleTargetsSchema` (melee and ranged, or the older single DPS), raids `rosterApprovedAt` | 🚧 schema and commands ready; lock open-seat suggestions, pre-approval comp Standby, and persisting approved seats are tracked in #324 |
| A link from the signup post to the site | coordinator `card.ts`: a **Raid page** link button to `<site>/raids/<id>`, where the raid's signup card is | 🚧 **bug (#320):** `coordinator/src/tick.ts` never passes `ports.links?.siteUrl` to `renderSignupPost` or `renderPartyDraft`, so the button never renders today; also `/raids/<id>` currently locks out signed-in Friends and blocks Members/Friends from answering open raids (#322) |

Parallel raids for the same raiders already work: each night is its own schedule. What's
missing is setting them up from Discord.

## Design

### 1. Change a raid's comp and size after it exists

Decided: officers can change a raid's comp targets (tanks, healers, melee, ranged) and its size
after it's made, on the site only (TJ, 2026-11-22). The kind (raid, dungeon, battleground,
other) stays as created.

- **The command:** rename `raid-reschedule` to `raid-update` (`breaking-contract` label; Bloodfen,
  2026-11-22) to match `schedule-update` / `character-update` and keep AFD command discovery clear
  before `/mcp` ships. Takes optional `startsAt`, `notes`, `size` (nullable for `kind: 'other'`),
  and `roleTargets` (nullable to reset back to the kind's default); at least one of the four is
  required. `TICK_TRIGGERS` in `apps/api/convex/commands.ts` triggers a coalesced immediate tick
  on `raid-update` (#320).
- **Checks:** the same as `raid-create`: the size must fit the kind (`SIZE_NOT_ALLOWED`) and the
  targets must fit the size (`ROLE_TARGETS_TOO_BIG`). Allowed locked or not, as leaders can
  change locked raids today, and after the raid starts too: time, notes, size and comp can all
  still change (TJ, 2026-11-22). Only a completed or cancelled raid refuses.
- **This raid only.** The raid's schedule doesn't change; editing the schedule still changes
  only the raids it makes later, as today.
- **Before leaders approve the roster** (signup improvements §1a): the bot's draft re-seats
  with the new size and targets (depends on #324 for pre-approval comp Standby). A bigger raid
  seats more of the raiders and recruits who answered; a smaller one moves overflow people to
  Standby with their private reason ("raid full (20/20)"), and clears any manual `group` above
  the new `groupCount(event)` (`Math.ceil(size / 5)`) back to `null` (Bloodfen, 2026-11-22).
- **After approval, seats are the leaders'.** A bigger raid opens seats and the leads channel
  gets the open-seat suggestions with Seat buttons (uses the shared rule from #324). A smaller
  raid is allowed even with more people seated than it now holds (TJ, 2026-11-22). Leaders pick
  who stays in the group and who moves to Standby, the same as any raid with more signups than
  seats. The bot never unseats anyone. The leads channel gets one line, "Molten Core is now 20
  people with 24 seated. Move 4 to Standby.", and the leads draft and quarters roster desk show
  the overflow and anyone in a party group past the new group count (Group 6 after 40 → 20) for
  leaders to move. How `groupDraft`, `roster-move` and `finalRoster()` carry an over-full or
  out-of-range roster until then is Bloodfen's call (row 11).
- **What updates:** the signup post (headers like "Healers 3/4", Missing, the size line) and the
  party post refresh on the next tick, and so does the Discord server event's description when
  server events are on.
- **Leads feed tracking (Bloodfen, 2026-11-22):** `RaidEvent` records `updatedAt` and `updatedBy`
  (optional in Convex for older rows), and `coordinator`'s `announcedState` stores the raid's
  last-announced `size` and `roleTargets` at T-24h digest so subsequent ticks can diff and post:
  "**Rook** set Molten Core to 25 people, Healers 6."
- **On the site:** the quarters' raid Edit form (`vintage-raid-form` / `KindedForm`, building on
  #323) shows Size and the four target counts, filled in with the raid's own, next to the time
  and notes it has today. Raids with only a DPS target show their melee and ranged split as blank
  until set, as signup improvements §1b describes.
- **Discord:** no raid edit command for now (TJ, 2026-11-22).

### 2. Recurring raids from Discord

Decided: recurring raids can be set up from Discord as well as the site (TJ, 2026-11-22).

A new `/vintage schedule` group for raid leaders, forwarded to Convex like `event` (wired in
`FORWARDED_GROUPS`, `AUTOCOMPLETED_GROUPS`, `GROUP_HELP`, and `apps/api/src/help-topics.ts`).
Every reply is private.

| Subcommand | Runs | Notes |
|---|---|---|
| `schedule create` | `schedule-create` | Opens a **New schedule** form reusing `discord-event-form.ts` pieces: Stage 1 (5/5 modal fields) has Name, Kind, Where, Nights (weekday `stringSelect`, `max_values: 7`) and Time (half hours in the guild clock). Preview adds an **Open to pugs** toggle button, **Set up schedule** (Stage 2 modal), and **Create schedule**. Stage 2 keeps melee and ranged apart, as the site does (TJ, 2026-11-22): Size, Tanks, Healers, Melee, Ranged is 5/5, so Length needs another home, such as a select on the preview next to Open to pugs (row 15) |
| `schedule list` | `schedule-list` | Every schedule, paused ones marked, with its nights, time and next raid. `schedule-list` (or a raids contract helper) provides `nextStartsAt` so Discord stays thin |
| `schedule edit [schedule]` | `schedule-update` | Autocomplete from the guild's schedules; opens the same forms filled in. Sends only changed fields so unshown schedule settings (`timeZone`, `access`, `timings`, `notes`, `lootMethodId`) are preserved (Bloodfen, 2026-11-22). Changes reach raids made from now on; raids already made keep theirs |
| `schedule pause [schedule]` and `schedule resume [schedule]` | `schedule-update` with `active` | Paused schedules make no new raids; resumed ones trigger `afterChange()` so upcoming raids materialize and post shortly |

- **A raid per night:** a schedule can hold several weekdays, and a guild can run several
  schedules. Raid 1 on Mondays and raid 2 on Wednesdays can be two schedules (different names,
  instances or comps) or one schedule on both nights (the same raid twice a week).
- **After Create schedule**, the bot runs `schedule-materialize` (scoped to `{ scheduleId }`)
  and `afterChange()` straight away, so the week's signup posts go up within seconds, as
  `/vintage event create` does for one raid. Adding `'schedule-materialize'` to `TICK_TRIGGERS`
  keeps site and MCP callers consistent too.
- **Tiers:** create, edit, pause and resume need raid leader, as their commands do; list is open
  to members. Anyone below gets "needs the Raid Leader rank".

Copy (UI copy mode):

- Created: "Made **Raid night** (Molten Core, 40-person raid) on Mondays and Wednesdays at 8:00
  PM. This week's raids are posting now."
- Edited: "Saved **Raid night**. Raids already posted keep their old details; change those one
  at a time on the site."
- Paused: "Paused **Raid night**. No new raids until you resume it."
- Resumed: "Resumed **Raid night**. Its next raids post shortly."
- No schedules: "No schedules yet. Use `/vintage schedule create` to add one."

### 3. A short link to the site on every signup post

Decided: each Discord signup post carries a short link to that raid's signup on the website
(TJ, 2026-11-22).

- **The link and data model (Bloodfen, 2026-11-22):** `vintageguild.gg/r/<code>`, where `shortCode`
  is a six-character lowercase code using an unambiguous alphabet (`23456789abcdefghjkmnpqrstuvwxyz`,
  excluding `0`, `o`, `1`, `l`, `i`), unique per guild, generated on insert with collision retry
  (optional in Convex schema until a one-time backfill populates older raids). Indexed via
  `by_guild_short_code` on `raidEvents` (`['guildId', 'shortCode']`).
- **Command contract (AFD):** `raid-get` accepts `{ eventId?: string, shortCode?: string }`
  (requiring at least one, case-insensitive on `shortCode`) so the site's `/r/<code>` route
  resolves through the command registry and automatically enforces `access` / `friend`-tier
  visibility (`RAID_NOT_FOUND` for Friends probing a guild raid's code).
- **Web landing experience:** `/r/<code>` opens the raid page (and requires #322 so signed-in
  Friends and Members can actually view/answer open raids, plus preserving the return path if a
  signed-out member clicks the link and signs in with Discord).
- **On the post:** at the end of the subtext line, rendered as a masked markdown link so Discord
  embeds reliably make it clickable:
  `-# Signups open · lock 2h before · 40-person raid · [vintageguild.gg/r/k3m9qz](https://vintageguild.gg/r/k3m9qz)`.
  The **Raid page** button on the second row stays and uses the same short link.
- **Elsewhere:** the party post (`renderPartyPost`), the final roster (`renderFinalRoster`), and
  the Discord server event's description (`renderServerEvent`) use the same short link, so every
  place a raid shows has one way to the site. (`tick.ts` passes `{ siteUrl: ports.links?.siteUrl }`
  to all card/party/roster renderers — fixed in #320.)
- **Reminder DMs keep the Discord link** (TJ, 2026-11-22): they jump to the signup post, where
  the answer buttons are. The server event moves off `signupLink()` to the short link.
- **Setup:** links need `VINTAGE_SITE_URL` in the Convex environment. Without it, the post shows
  no link and no button. Note: the reason signup posts had no Raid page button before #320 was
  `tick.ts` omitting `siteUrl`, not necessarily a missing env var (still verify `VINTAGE_SITE_URL`
  is set in production Convex).

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands.

- **J71 · Add a healer to a raid that's already up.** Wednesday's Molten Core was made for 10
  healers. Rook opens it in the quarters, sets Healers to 11, and saves. The signup post reads
  "Healers 9/11" within a tick; the schedule's next raid still asks for 10. A raider calling
  `raid-update` with `roleTargets` gets `COMMAND_NOT_FOUND`.
- **J72 · Grow a raid from 20 to 40.** Before the roster is approved, Rook changes Zul'Gurub's
  size to 40: raiders the draft had on Standby for size are seated, and the post shows the new
  counts. After approval, Rook shrinks it back to 20 with 24 seated: the change saves, nobody
  is unseated, and the leads channel says to move 4 to Standby.
- **J73 · Two raid nights from Discord.** Rook runs `/vintage schedule create` for Monday's
  Molten Core and again for Wednesday's Blackwing Lair. Both weeks' signup posts go up within
  seconds. `/vintage schedule list` shows both; pausing Wednesday's stops new Wednesday raids
  and leaves Monday's running.
- **J74 · Sign up on the site from the Discord post.** Wednesday's signup post ends its subtext
  line with `vintageguild.gg/r/k3m9qz`. Aeryn clicks it, lands on the raid's page and answers
  on the signup card; the Discord post shows her answer within a tick. The Raid page button and
  the Discord server event use the same link.

## Decisions

TJ decides how it behaves; Bloodfen makes the technical calls. Dated rows are decided;
"(proposed)" rows wait on their owner.

| # | Decision | Why | Owner |
|---|---|---|---|
| 1 | Officers can change a raid's comp targets and size after it exists; the kind stays | Nights change after a raid is posted | TJ, 2026-11-22 |
| 2 | That edit is on the site only for now | The quarters already edit raids | TJ, 2026-11-22 |
| 3 | Recurring raids can be set up from Discord too: create, list, edit, pause, resume | Leaders work from Discord | TJ, 2026-11-22 |
| 4 | Rename `raid-reschedule` to `raid-update` (`breaking-contract`), with optional `size` (nullable for `other`) and `roleTargets` (nullable to reset defaults) | Matches `schedule-update` / `character-update` and keeps AFD discovery clear before `/mcp` ships | Bloodfen, 2026-11-22 |
| 5 | After roster approval, a smaller size is allowed with more people seated than it holds; leaders pick who moves to Standby, as with any raid that has more signups than seats; the bot never unseats | Seats are the leaders' call (signup improvements §3) | TJ, 2026-11-22 |
| 6 | The New schedule form reuses `discord-event-form.ts` pieces within Discord's 5-field modal limit (weekday multi-select in stage 1; `Open to pugs` toggle on preview; `schedule edit` preserves unshown fields) | One way to make events and schedules without hitting Discord's 5-component modal ceiling | Bloodfen, 2026-11-22 |
| 7 | Every signup post carries a short link to the raid's signup on the site | Members who'd rather answer on the site get there in one click | TJ, 2026-11-22 |
| 8 | The link is visible text at the end of the subtext line, and the party post, final roster and server event use it too | A button can't be copied or shared; one link everywhere | TJ, 2026-11-22 |
| 9 | A six-character `shortCode` (excluding `0/o/1/l/i`) on raids with `by_guild_short_code` index, `raid-get` accepting `shortCode`, `/r/<code>` route, masked markdown link in Discord embeds, and a backfill | Short to read and type, indexed, and keeps access checks inside the AFD command | Bloodfen, 2026-11-22 |
| 10 | Track `updatedAt` / `updatedBy` on `RaidEvent` and raid-level metadata in `announcedState` for `#leads` edit lines | `announcedState` currently only diffs member signups/absences | Bloodfen, 2026-11-22 |
| 11 | Shrinking a raid checks party group bounds (`group > Math.ceil(size / 5)`): clear out-of-range groups before approval. After approval nothing is refused (row 5): how `groupDraft`, `roster-move` and `finalRoster()` carry an over-full or out-of-range roster until leaders move people | Prevents orphaned groups 5–8 breaking `roster-move` and `groupDraft` when shrinking 40 → 20 | Bloodfen (before approval, 2026-11-22; after approval proposed) |
| 12 | Reminder DMs keep linking to the Discord signup post; the server event uses the short link | The DM's job is getting an answer, and the buttons are on the post | TJ, 2026-11-22 |
| 13 | `raid-update` allows every edit after the raid starts (time, notes, size, comp); only completed and cancelled raids refuse | Nights change mid-raid too | TJ, 2026-11-22 |
| 14 | Discord forms keep melee and ranged apart, for schedules and for `/vintage event create` (#323) | Same targets as the site | TJ, 2026-11-22 |
| 15 | Where Length goes once Stage 2 holds Size, Tanks, Healers, Melee and Ranged (a select on the preview, or a third stage) | Discord modals hold 5 fields | Bloodfen (proposed) |
| 16 | `/vintage schedule create` is form-only, like the event form, with no inline slash options | One way in, and the form checks every field | TJ (proposed) |

## Open questions

For TJ: row 16.

For Bloodfen: row 11 (after approval) and row 15. Prerequisites are tracked in #320, #322, #323
and #324.

## Tasks

- [ ] **Prerequisites** (#320, #322, #323, #324): `tick.ts` passing `siteUrl`, `TICK_TRIGGERS`
  fix, `/raids/<id>` open-raid access for Friends & Members, split melee/ranged targets in
  `calendar-forms.ts`, lock/open-seat suggestions & pre-approval comp Standby.
- [ ] **Edit comp and size** (raids, coordinator, web): rename `raid-reschedule` → `raid-update`
  (`breaking-contract`) with `size` and `roleTargets`, `updatedAt`/`updatedBy` on `RaidEvent`,
  create checks + completed/cancelled refusal, draft re-seating & out-of-range group handling
  before approval, the over-full line in the leads channel and overflow shown for leaders after
  approval, raid-level `announcedState` diff
  for the leads feed line, quarters raid Edit form fields, manifest. Jobs J71 and J72.
- [ ] **Schedules from Discord** (gateway, apps/api, raids): `/vintage schedule` group (`create`,
  `list`, `edit`, `pause`, `resume`, `help`), `FORWARDED_GROUPS` / `AUTOCOMPLETED_GROUPS` /
  `help-topics.ts`, New schedule form (weekday multi-select, `Open to pugs` toggle on preview,
  preserving unshown fields on edit), schedule autocomplete, `nextStartsAt` on `schedule-list`,
  immediate `schedule-materialize` + `afterChange()` on create/resume. Job J73.
- [ ] **Short site links** (raids, web, coordinator): `shortCode` on raids with
  `by_guild_short_code` index, collision retry, and backfill; `raid-get` accepting `shortCode`;
  `/r/<code>` route with post-sign-in return; masked link on the signup post's subtext line, Raid
  page button, party post, final roster, and server event. Human step: verify `VINTAGE_SITE_URL`
  is set in production Convex. Job J74.
