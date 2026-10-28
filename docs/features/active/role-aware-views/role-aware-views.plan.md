# Role-aware views and the officers' quarters

> Status: active · Created 2026-10-26 · Owner: Bloodfen · Depends on sign-in (#7)
> Related: [home page](../../completed/home-page/home-page.plan.md), [PLAN.md §3.4](../../../../PLAN.md)
> (tiers), [docs/jtbd](../../../jtbd/README.md)

**The ask.** "Add a bit of sight variance depending on if you're signed in or not and the role
you are. Officers and admins should have some kind of backstage officers' quarters."

**Done when:** a visitor, a signed-in raider, and an officer each open `/` and see the same
sections composed for them (storefront, raid-day board, officer glance); `/officers` exists for
leader tier and up with its Tonight tab working end to end through existing commands; every
action is an `@command`; the three new JTBD jobs below pass in both layers; and the page still
passes both themes and phone width.

## Why

The home page is a storefront, which is right for a recruit and wrong for everyone else. A
raider on raid day wants one answer on the first screen: am I in, when, and what do I bring. An
officer wants to know who hasn't answered and whether the comp works, then do something about
it. Today both scroll past the pitch to find the raid card, and the officer's work still happens
in Discord or on the CLI.

The permission model already exists. Tiers run `public < member < recruit < raider < leader <
officer`, derived from Discord roles by `member-sync`, and the registry answers
`COMMAND_NOT_FOUND` for anything above the caller's tier. So the site never needs a permission
model of its own. It needs to decide what to put first for whom, and to give officers a room
where their commands are buttons.

## Principles

- **Three compositions of one page, not three pages.** Same sections, same components. What
  changes with the session is which section is at the top, the figures, and how much the
  recruiting band takes.
- **The tier decides, never the page.** A surface shows or hides by the session's tier, but the
  command's own tier is the wall. Hiding a button is courtesy; the registry is the gate.
- **Every officer action is an `@command`.** The quarters renders commands that already pass
  tests. An officer doing it from the site, from Discord, or through an agent runs the same
  command with the same tier.
- **The phone on raid day is the test** for the member view: the first screen answers "am I in
  and what do I bring" without scrolling.

## The three views

### Visitor (`public`)

What the home page is now: the recruiting hero with Apply and Discord, then raids, progress,
recruiting, roster, news. Also what a `friend`-ranked Discord member sees, since friends are
`public` tier.

### Member and raider (`member`, `recruit`, `raider`)

- **Top: the next raid**, not the pitch. The signup card as it exists (own answer through
  `signup-set`, character, counts), plus what the card doesn't say yet: whether they are queued
  and how many are ahead (`Signup.queued` and the `signup-list` order), the lock time in the
  member's zone (`startsAt` less the schedule's `lockHours`), and the raid's notes ("bring fire
  resistance"; **new**, a `notes` field on `RaidEvent` set by `raid-create` and
  `raid-reschedule`, since raids carry none today and only signups have a `note`).
  `member` tier can't answer (that is `recruit`), so for them the card reads as the calendar with
  a line saying what unlocks when they are promoted.
- **The hero shrinks to a band.** Logo context, the identity pills, and the figures, now the
  member's: days to their next raid, their answer, bosses down, names on the rolls. The
  headline and standfirst go; the visitor already read them.
- **Recruiting collapses** to one line at the bottom: "We need two healers for the twenties.
  Know anyone?" with the Discord link. The needs table stays reachable on `/about`.
- **Progress, roster, news** stay as they are. On the roster wall the member's own row is already
  marked.

### Officer and raid leader (`leader`, `officer`)

The member view plus an **officer strip** directly under the header: non-responders for the next
raid (count and the first few names), comp gaps from `comp-suggest`, coordinator status (running,
paused, last tick), and a link into the quarters. A glance, not a dashboard; the work happens in
the quarters. `leader` sees the strip; `officer` sees it plus the config items in the quarters.

## The officers' quarters

A route of its own, `/officers`, in `apps/web`, for `leader` tier and up. Signed out, or under
tier, the route shows a sign-in card or a plain "officers only" note; the commands would refuse
anyway. It stays in `apps/web` rather than a second app: it shares the shell, the tokens, the
command client, and the tier check is the only wall it needs.

Tabs by job, not by module, because an officer thinks "tonight" and "recruits", not
"coordinator" and "identity". Every command named below exists in the manifest today unless
marked **new**.

| Tab | What it shows | Actions (`@command`) | Commands |
|---|---|---|---|
| **Tonight** | The digest in web form for the next raid: signups by role, comp gaps with reasons, non-responders by name, the queue, late and tentative with notes | Lock and unlock the roster; bench, move, remove; copy the addon import string | `raid-get`, `signup-list`, `comp-suggest`, `roster-lock`, `roster-unlock`, `roster-bench`, `roster-move`, `roster-remove` |
| **Calendar** | Schedules and one-off raids: an agenda by day (or a month table), the last month folded under Earlier | Add a one-off, move, cancel (preview, then confirm), mark done; add or edit a schedule, pause or resume it, create raids now | `raid-list`, `raid-create`, `raid-reschedule`, `raid-cancel`, `raid-complete`, `schedule-list`, `schedule-create`, `schedule-update`, `schedule-materialize` |
| **Random** (the coordinator) | Running, paused, or not set up; per upcoming raid what it did, what is due, and who it is still chasing; Random's log for the upcoming raids and the last week's with the "why" per entry; the channels, expected ranks, and DM reminders | Pause, resume, run a check, replace a signup post; edit the settings (`officer`) | `coordinator-status`, `coordinator-log`, `coordinator-pause`, `coordinator-resume`, `coordinator-run`, `coordinator-repost`, `coordinator-config-set` |
| **Roster** | Members by rank with the date they got it, the last sync (flagged when the 15-minute sync has stopped), who has no character yet, recruits on trial with their start date | Edit the role-to-rank map (`officer`; preview, then confirm). "Sync now" waits: a full sync calls Discord, which a command can't | `member-list`, `guild-roles-get`, `guild-roles-set`; the trial start is `rankSince` on each member (2026-10-27) |
| **Recruiting** | The open roles and the pitch the public band shows | Edit them | `site` module: `recruiting-get` (public) and `recruiting-set` (`officer`); leaders see the tab read-only |
| **Polls** | Open and closed polls with results | Open, close, cancel, sweep | `poll-list`, `poll-results`, `poll-open`, `poll-close`, `poll-cancel`, `poll-sweep` |
| **Progress** | The ledger with a form beside it, closed until the raids unlock | Record a kill with its loot | `progress-get`, `kill-record` |
| **Loot** | Council decisions, soft reserves, award history | As the loot module defines them | Phase 2 (#26, #27); the tab appears when the module lands |

Destructive commands (`roster-remove`, `raid-cancel`, `poll-cancel`, `guild-roles-set`) go
through guild-kit's preview and confirm-token flow; the quarters renders the preview and the
confirm button, never a one-click delete.

## What changes in the code

- **A `view` chosen once in the shell** from `currentSession()`: `visitor`, `member`, or
  `officer`, exported from `src/session.ts` next to the session. The home page reads it to order
  and show sections. Components keep reading commands; only the composition moves.
- **A compact hero.** `vintage-hero` gets a `compact` boolean: no headline or standfirst slots
  rendered, the art as a short band behind the pills and figures. The figures are bound to the
  member's data (`member-me`, `raid-list`, the member's `signup-list` row, `progress-get`).
- **The signup card learns the rest of the answer:** queued and how many ahead, lock time, raid
  notes. The first two come from `signup-list` and `raid-get` as they are; the notes need the
  new field on `RaidEvent`.
- **An officer strip** element, `vintage-officer-strip`: non-responders, comp gaps, coordinator
  status, a link. Reads `coordinator-status` (which reports each raid's non-responders, by the
  coordinator's own rule) and `comp-suggest`.
- **The `/officers` route** with the tier guard in `apps/web`, and officer composites in ui-kit:
  a digest table, a non-responder list, a roster-control card, a coordinator-status card, a
  calendar list with its actions, a kill form. Every action a `@command` with `canExecute`
  bound to the session's tier, so an agent sees the same buttons the officer does.
- **Three small contract changes**, each in its own PR with its manifest change: the `site`
  module's recruiting pair, the trial start date on identity, and `notes` on raids. Nothing
  else needs a new command or field.
- **Sign-in (#7) is the prerequisite.** Until it lands, the dev fixtures sign in a raider; a
  fixture switch (`?as=officer`, dev only) lets the three views be built and checked before
  Discord sign-in is real.

## Jobs to be done

New jobs for [docs/jtbd](../../../jtbd/README.md), each as a scenario test and a live checklist:

- **J19** When it is raid day, I want the first screen of the site to say whether I'm in, when
  we pull, and what to bring, so I can get ready without hunting.
- **J20** When tonight's roster is set, I want to lock it from the site and copy the addon import
  string, so I can form the raid in game without opening Discord or the CLI.
- **J21** When our needs change, I want to edit the open roles on the site, so the public
  recruiting band and the hero's figures change without a deploy.

## Order

1. The role-aware composition and the member view of the top, because it reshapes what every
   signed-in person sees and it needs sign-in soon anyway. The fixture switch makes it visible
   before sign-in lands.
2. The quarters' Tonight tab, since that is the officer's raid-night job and every command for
   it exists.
3. Recruiting as editable content (the `site` module), which also fixes the dead "How we raid"
   link on the band.
4. The remaining tabs as their modules mature; Loot when Phase 2 lands.

## Decisions

| Date | Decision |
|---|---|
| 2026-10-26 | The quarters lives in `apps/web` under `/officers`, not a separate app. Shared shell, tokens, and command client; the tier check is the only wall. |
| 2026-10-26 | Three compositions of one home page, not three pages or a separate member portal. |
| 2026-10-26 | No site-side permission model. The session's tier chooses the composition; each command's own tier remains the gate. |
| 2026-10-26 | Every value on the public pages is real data or officer-set: the hero's facts and intro, the About page, the Discord invite, and the legal contact are the site module's guild profile (Guild tab); the calendar's raid nights and signup timings come from `schedule-list`. Launch and unlock dates and boss names stay as game facts. |
| 2026-10-26 | Leaders and officers get "Preview as" on the live site (`src/preview.ts`): the page composes for a lower tier, reads above it answer `COMMAND_NOT_FOUND` from the manifest's tiers, and every action answers `PREVIEW_ONLY`. Reads within the tier still return the officer's own data (their characters and answers). The dev-only fixture switch stays for building without sign-in. |
| 2026-10-26 | The Calendar tab leads with an agenda by day, with a month view as a plain `<table>` beside it (not an ARIA grid: at two or three raids a week the raids are ordinary buttons and empty days aren't tab stops). Times are in the viewer's zone with the guild's clock alongside; the week the US and Europe change clocks on different dates gets a note. Edits are scoped the way the commands are: a raid on its own (`raid-reschedule`, `raid-cancel`), or the schedule, which changes raids not yet created; no "this and following". Storybook was tried for building it and dropped: the `/ui` gallery and happy-dom tests cover the states without 70-odd new packages. |
| 2026-10-27 | The Coordinator tab is **Random**, the bot's name in Discord and on the home page ("From Random Raven"), and its log is "Random's log"; the code keeps `coordinator`. The log asks `coordinator-log` once per raid (the upcoming ones and the last week's, since a raid leaves `coordinator-status` when it starts), so no all-raids command was needed. Channels are typed as ids: nothing lists the server's channels yet. |
| 2026-10-27 | The trial start date is a general `rankSince` on members, written by `member-sync` when the rank changes (or the member is first seen), not a recruit-only field: it also dates promotions. Members whose rank last changed before it existed read null and show as "before tracking began" rather than a guessed date. The Roster tab shows days on trial with no "due for review" flag until the trial length is settled (open question 3). |
| 2026-10-27 | The raids module says when signups lock (`locksAt` on `raid-list` and `raid-get`) and where a queued signup is in line (`queuePosition` on `signup-list`); the site shows both and never recomputes them. Signed out, the home page gets an **About** section from the guild profile (the about lead and sections officers edit in the Guild tab), between the hero and recruiting: members already know us, so it's the storefront's only (`VISITOR_SECTIONS` in `src/view.ts`). |
| 2026-10-27 | Raid notes are edited through `raid-reschedule` (its `startsAt` became optional, `notes` added; one of them required), not a new `raid-update`: the Calendar tab's one raid form saves time and notes in one call, and a second command doing half of the same edit would split the contract. Schedules carry default notes that each new raid copies (raid nights repeat the same "flasks, on at 7:45"); editing a schedule's notes leaves raids already created alone, as with its time. |
| 2026-10-26 | The Progress tab records kills only; there is no way to correct or remove one yet. The form says what it will record, and whether it becomes the ledger entry, before it is sent. A `kill-remove` command (officer, destructive, with the confirm step) is the follow-up if a wrong kill gets recorded. Repeat kills are kept but not listed: `progress-get` answers first kills only. |
| 2026-10-26 | The site module's commands are `recruiting-get` / `recruiting-set`, not `site-recruiting-*`: names say the noun, as `progress-get` and `kill-record` do, not the module. Until an officer saves, `recruiting-get` answers the copy the site shipped with. |

## Open questions

1. Should `member` tier (not yet a recruit) see the raid-day top at all, or the visitor view
   with a "you're in, ask an officer about raiding" line? Proposed: the raid-day top, read-only,
   since it shows what joining gets them.
2. Does the officer strip belong on every page or only the home page? Proposed: home page only;
   the quarters has the full picture.
3. Trial length for recruits (the roster tab's clock). The band says "about two weeks"; the GM
   should confirm (vintage-guild/vintage#30).
4. ~~Whether `raid-leader` rank should see the Coordinator tab's config items.~~ Settled
   2026-10-27: leaders see Random's settings read-only and run everything else; saving is
   `officer` tier.

## Build log

**Pass 1 (2026-10-26): the three compositions and the dev switch.**

- `src/view.ts`: `viewFor(session)` maps tiers to `visitor` (signed out, `public`), `member`
  (member, recruit, raider), `officer` (leader, officer); an unknown tier gets the storefront.
  `canSignUp` mirrors `signup-set`'s recruit tier. A signed-in Discord user who isn't in the
  server is `public`, so they get the storefront too.
- Dev switch: `?as=visitor|member|recruit|raider|leader|officer`, remembered for the tab, plus a
  floating "View as" control (dev builds only). Personas are fixture members, one per tier
  (Gwendolyn, Wendeline, Bloodfen, Garrick, Aeryn); visitor signs in nobody and runs commands
  as a public caller, so every refusal on the page is the registry's real answer.
- `vintage-hero` `compact`: heading kept (the page's h1, now "Welcome back, Bloodfen."), the
  standfirst and actions hidden, a shorter band. Member figures: days to their next raid, going
  count with their own answer ("you're going", "you haven't answered" in accent, or "recruits
  and up sign up"), bosses down, names on the rolls. Pills become their rank and main character.
- Composition: members get "Your next raid" at the top, the signup card read-only with a note
  for `member` tier, and recruiting as one line at the foot ("Know a Warrior, Priest, or
  Shaman…"). The full band stays the visitor's. Officers get the member composition for now;
  the officer strip is the next task.
- Refused reads now say why instead of looking empty: the calendar, roster, coordinator log, and
  poll tell visitors they are for members, and the roster tells `member` tier it opens at
  recruit. When the roster is refused the count figure becomes "3 roles we need most".
- Fixed in passing: `vintage-member-menu` ignored `hidden` (its `:host` display won), so a
  signed-out page showed a "?" avatar. That would have shipped to production.
- Phone check (375 px, raider): the "10 days to Launch night" and "you're going" figures end at
  430 px, inside the first screen. Changing the answer still needs a scroll to the card; the
  queued count, lock time, and raid notes are the next card task.

**Pass 2 (2026-10-26): the officer strip.**

- `coordinator-status` now reports `waiting` per upcoming raid: the expected ranks with no
  signup, from the coordinator's `nonResponders`, the same rule its reminders and officer digest
  use. Additive output only; inputs and tier are unchanged, so the manifest changed only its
  description.
- `vintage-officer-strip` (ui-kit): "Waiting on n" with the first four names, "Comp: n gaps"
  with `comp-suggest`'s reasons, and the coordinator's state (running, paused, not set up) with
  what is due now or what it did last. It sits above the hero for leaders and officers and
  refreshes after they answer. The quarters link is hidden until `/officers` exists.
- The page doesn't decide who is a non-responder or what a gap is; both come from commands, so
  Discord, the site, and an agent agree.

**Pass 3 (2026-10-26): `/officers` and the Tonight tab.**

- `/officers` in `apps/web`: leaders and officers get the room; signed-out visitors get a
  sign-in card and lower tiers a plain note. The header gains an "Officers" link for them, and
  the strip on the home page now links here. The tabs are listed by job; only Tonight is built,
  the rest are disabled with what they will hold.
- `vintage-tonight` (ui-kit): the picked raid (the next one by default, a picker when there are
  several), counts, comp gaps, who hasn't answered, signups by role with answer, place (group,
  benched, queued, unplaced), and note, and declines in one line. Every action is an
  `@command`: lock and unlock (`roster-lock` / `roster-unlock`), place in a group
  (`roster-move`, five to a group), bench (`roster-bench`), remove (`roster-remove`), and copy
  the addon import. Removal shows the server's preview and runs only with its confirm token;
  the confirm line is built from the preview's signup, not the registry's agent-facing hint.
- New command `addon-import-get` (coordinator, leader, read): the addon import string for an
  upcoming raid. It shares `buildImportString` with the officer-channel post, so the site and
  Discord hand out the same string.
- The dev fixtures' page client no longer auto-confirms destructive commands, so the preview and
  confirm step shows in dev exactly as it will against Convex. Seeding still auto-confirms.
- Phone: the room fits at 375 px without sideways scroll, but each signup row stacks to about
  140 px, so a forty-player list is long. A compact row is worth doing once officers use it.

**Pass 4 (2026-10-26): real sessions.** Discord sign-in is wired (`apps/web/src/connect.ts` over
`@vintage/web-session`), so the views now follow the signed-in member, not just the dev switch.
The page reloads when who is signed in or their tier changes, which keeps the compose-once
design. Someone signed in with Discord who isn't in the server is `public` and gets the
storefront. The dev switch gained `live` for the real server.

**Pass 5 (2026-10-27): no placeholders, honest loading.** Bloodfen: sections a group can't see
should not show. `HOME_SECTIONS` in `src/view.ts` gives each home section the tier its reads
need; the page renders only those, and the header drops links to the rest. Visitors see the hero
and recruiting; `member` tier sees all but the roster. Pending reads now show a loading state
(home calendar, Coming up, the news log, the officer strip, Tonight) distinct from empty and
from refused. Open: `progress-get` is `member` tier, so the ledger is hidden from visitors; making
it public would let recruits see the scoreboard (a command change).

## Tasks

- [x] `view` from the session; home page composes by view; dev fixture switch
- [x] `vintage-hero` compact mode and member-bound figures
- [x] Signup card: place in line (`signup-list` `queuePosition`) and lock time (`raid-list` `locksAt`)
- [x] Raid notes: `notes` on `RaidEvent` and schedules (raids contract, manifest), set from the Calendar tab, on the home card and the Discord post ("what to bring", J19)
- [x] `vintage-officer-strip`
- [x] `/officers` route, tier guard, Tonight tab (digest, non-responders, roster controls, import string)
- [x] Polls tab: open and closed polls with results, open, close and cancel with confirm, the sweep (#63)
- [x] Calendar tab (`vintage-calendar-desk`, `vintage-raid-month`, the schedule and raid forms); J24
- [x] Random tab, the coordinator (`vintage-coordinator-desk`)
- [x] Progress tab (`vintage-progress-desk`)
- [x] `site` module: `recruiting-get` / `recruiting-set`, Recruiting tab (`vintage-recruiting-desk`), band reads it
- [x] Trial start date on identity (`rankSince`, set by `member-sync`)
- [x] Roster tab (`vintage-roster-desk`)
- [x] J19 in `docs/jtbd/raid-night.md` and `raid-night.jtbd.test.ts`, with "what to bring" (raid notes)
- [ ] J20 in `docs/jtbd` and `apps/api/tests/jtbd` (J21 done: `docs/jtbd/recruiting.md`)
- [x] About for visitors on the home page, from the guild profile
- [ ] Docs: `apps/web/README.md` routes table, `packages/ui-kit/README.md`, architecture status
