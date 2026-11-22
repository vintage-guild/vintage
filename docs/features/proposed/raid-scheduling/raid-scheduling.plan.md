# Raid scheduling: edit a raid's comp and size, schedules from Discord, a short site link

**Status:** proposed (2026-11-22). Nothing built. **Owner modules:** raids (commands), apps/api
(Discord), web (quarters, short links), coordinator (signup post, leads feed).

Three asks from TJ (guild master) on 2026-11-22:

1. Officers can change a raid's time and notes after it exists, but not its comp targets or
   size. A raid made for 3 healers stays at 3 even when the night needs 4.
2. Recurring raids on more than one night (raid 1 on Mondays, raid 2 on Wednesdays, the same
   raiders) can only be set up on the site.
3. Every Discord signup post should carry a short link to that raid's signup on the website.

## Today

| Piece | Where | State |
|---|---|---|
| Edit a raid after it exists | raids `raid-reschedule` (leader), the quarters' raid form | ✅ time and notes only |
| Comp targets and size | `raid-create`, `schedule-create`, `schedule-update` | ✅ at creation, and on schedules |
| A schedule's targets reaching its raids | `schedule-materialize` | ✅ copied when each raid is made; raids already made keep theirs |
| Several schedules at once | `schedule-create`, `schedule-list`, `schedule-materialize` (every active schedule), the quarters' Calendar tab (**New schedule**, an Edit per schedule) | ✅ |
| Schedules from Discord | `/vintage event` has `create`, `pick-night`, `check-export` | ❌ none |
| Split targets and roster approval | comp-solver `roleTargetsSchema` (melee and ranged, or the older single DPS), raids `rosterApprovedAt` | ✅ from the signup improvements work |
| A link from the signup post to the site | coordinator `card.ts`: a **Raid page** link button to `<site>/raids/<id>`, where the raid's signup card is | 🚧 only when `VINTAGE_SITE_URL` is set in Convex; the link is long (a 32-character id) and only a button |

Parallel raids for the same raiders already work: each night is its own schedule. What's
missing is setting them up from Discord.

## Design

### 1. Change a raid's comp and size after it exists

Decided: officers can change a raid's comp targets (tanks, healers, melee, ranged) and its size
after it's made, on the site only (TJ, 2026-11-22). The kind (raid, dungeon, battleground,
other) stays as created.

- **The command:** `raid-reschedule` (leader) takes two more optional inputs, `size` and
  `roleTargets`, alongside `startsAt` and `notes`; at least one of the four is required. New
  optional inputs don't break the command contract. Whether to rename it `raid-update` is
  Bloodfen's call (row 4); a rename is a breaking change.
- **Checks:** the same as `raid-create`: the size must fit the kind (`SIZE_NOT_ALLOWED`) and the
  targets must fit the size (`ROLE_TARGETS_TOO_BIG`). Allowed until the raid starts, locked or
  not, as leaders can change locked raids today. A started, completed or cancelled raid refuses.
- **This raid only.** The raid's schedule doesn't change; editing the schedule still changes
  only the raids it makes later, as today.
- **Before leaders approve the roster** (signup improvements §1a): the bot's draft re-seats
  with the new size and targets. A bigger raid seats more of the raiders and recruits who
  answered; a smaller one moves people to Standby, each with their private reason ("raid full
  (20/20)").
- **After approval, seats are the leaders'.** A bigger raid opens seats and the leads channel
  gets the usual open-seat suggestions with Seat buttons. A smaller raid can't drop below the
  people seated: "18 are seated. Move 2 to Standby first." The bot never unseats anyone.
- **What updates:** the signup post (headers like "Healers 3/4", Missing, the size line) and the
  party post refresh on the next tick, and so does the Discord server event's description when
  server events are on. After the T-24h digest the change goes to the leads feed: "**Rook** set
  Molten Core to 25 people, Healers 6."
- **On the site:** the quarters' raid Edit form shows Size and the four target counts, filled in
  with the raid's own, next to the time and notes it has today. Raids with only a DPS target
  show their melee and ranged split as blank until set, as signup improvements §1b describes.
- **Discord:** no raid edit command for now (TJ, 2026-11-22).

### 2. Recurring raids from Discord

Decided: recurring raids can be set up from Discord as well as the site (TJ, 2026-11-22).

A new `/vintage schedule` group for raid leaders, forwarded to Convex like `event`. Every reply
is private.

| Subcommand | Runs | Notes |
|---|---|---|
| `schedule create` | `schedule-create` | Opens a **New schedule** form like the New event form: Name, Kind, Where, Nights (a weekday select, several allowed) and Time (half hours in the guild clock). Then a preview with **Set up schedule** for size and comp (the same details form as events), and **Create schedule** |
| `schedule list` | `schedule-list` | Every schedule, paused ones marked, with its nights, time and next raid |
| `schedule edit [schedule]` | `schedule-update` | Autocomplete from the guild's schedules; opens the same forms filled in. Changes reach raids made from now on; raids already made keep theirs |
| `schedule pause [schedule]` and `schedule resume [schedule]` | `schedule-update` with `active` | Paused schedules make no new raids; resumed ones catch up on the next tick |

- **A raid per night:** a schedule can hold several weekdays, and a guild can run several
  schedules. Raid 1 on Mondays and raid 2 on Wednesdays can be two schedules (different names,
  instances or comps) or one schedule on both nights (the same raid twice a week).
- **After Create schedule**, the bot runs `schedule-materialize` for it straight away, so the
  week's signup posts go up within seconds, as `/vintage event create` does for one raid.
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

- **The link:** `vintageguild.gg/r/<code>`, where the code is six letters and digits stored on
  the raid (`shortCode`, unique per guild, made when the raid is created; older raids get one
  in a one-time backfill). The site's `/r/<code>` route opens the raid's page, `/raids/<id>`,
  which has the signup card. Leaving out look-alike characters (0, o, 1, l) keeps it easy to
  read aloud or type.
- **On the post:** at the end of the subtext line, "-# Signups open · lock 2h before · 40-person
  raid · vintageguild.gg/r/k3m9qz". Discord turns it into a link, and people can copy it to
  share. The **Raid page** button on the second row stays and uses the same short link.
- **Elsewhere:** the party post, the final roster and the Discord server event's description
  use the same short link, so every place a raid shows has one way to the site.
- **Setup:** links need `VINTAGE_SITE_URL` in the Convex environment, as the Raid page button
  does today. Without it, the post shows no link and no button. If signup posts show no Raid
  page button now, that setting is the first thing to check (a human step).

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands.

- **J71 · Add a healer to a raid that's already up.** Wednesday's Molten Core was made for 10
  healers. Rook opens it in the quarters, sets Healers to 11, and saves. The signup post reads
  "Healers 9/11" within a tick; the schedule's next raid still asks for 10. A raider calling
  `raid-reschedule` with `roleTargets` gets `COMMAND_NOT_FOUND`.
- **J72 · Grow a raid from 20 to 40.** Before the roster is approved, Rook changes Zul'Gurub's
  size to 40: raiders the draft had on Standby for size are seated, and the post shows the new
  counts. After approval, shrinking it below the people seated is refused with how many to
  move first.
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
| 4 | Extend `raid-reschedule` with optional `size` and `roleTargets` (non-breaking), or rename it `raid-update` (breaking) | It now edits more than the time | Bloodfen (proposed) |
| 5 | After roster approval, a smaller size can't drop below the people seated; the bot never unseats | Seats are the leaders' call (signup improvements §3) | TJ (proposed) |
| 6 | The New schedule form reuses the event form's pieces (date, time, details step) with a weekday select | One way to make events and schedules | Bloodfen (proposed) |
| 7 | Every signup post carries a short link to the raid's signup on the site | Members who'd rather answer on the site get there in one click | TJ, 2026-11-22 |
| 8 | The link is visible text at the end of the subtext line, and the party post, final roster and server event use it too | A button can't be copied or shared; one link everywhere | TJ (proposed) |
| 9 | A six-character `shortCode` on raids with a site route `/r/<code>`, backfilled for older raids | Short to read and type; the 32-character id isn't | Bloodfen (proposed) |

## Open questions

For TJ: row 8.

For Bloodfen: rows 4, 6 and 9.

## Tasks

- [ ] **Edit comp and size** (raids, coordinator, web): `size` and `roleTargets` on
  `raid-reschedule` (or `raid-update`, row 4) with the create checks and the started-raid
  refusal, the draft re-seating before approval and the seated-count check after, the leads
  feed line, the quarters' raid form fields, the manifest. Jobs J71 and J72.
- [ ] **Schedules from Discord** (gateway, apps/api): the `/vintage schedule` group, the New
  schedule form and details step, schedule autocomplete, materializing right after create, help
  pages from the slash definitions. Job J73.
- [ ] **Short site links** (raids, web, coordinator): `shortCode` on raids with the backfill, the
  `/r/<code>` route, the link on the signup post's subtext line, the Raid page button, the party
  post, the final roster and the server event. Human step: check `VINTAGE_SITE_URL` is set in
  production. Job J74.
