# Role-aware views and the officers' quarters

> Status: proposed · Created 2026-10-26 · Owner: Bloodfen · Depends on sign-in (#7)
> Related: [home page](../../active/home-page/home-page.plan.md), [PLAN.md §3.4](../../../../PLAN.md)
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
| **Calendar** | Schedules and one-off raids, upcoming and past | Create, reschedule, cancel, complete a raid; create, update, materialize a schedule | `raid-list`, `raid-create`, `raid-reschedule`, `raid-cancel`, `raid-complete`, `schedule-list`, `schedule-create`, `schedule-update`, `schedule-materialize` |
| **Coordinator** | Status, the channels and expected ranks, DM reminders on or off, and the action log across all raids with the "why" per entry | Pause, resume, run a tick, repost; edit the config (`officer`) | `coordinator-status`, `coordinator-log`, `coordinator-pause`, `coordinator-resume`, `coordinator-run`, `coordinator-repost`, `coordinator-config-set` |
| **Roster** | Members with rank and tier, last sync, who has no character yet, recruits on trial with their start date | Sync from Discord; edit the role-to-rank map (`officer`) | `member-list`, `member-sync`, `guild-roles-get`, `guild-roles-set`; trial start date **new** (identity records when a member became `recruit`) |
| **Recruiting** | The open roles and the pitch the public band shows | Edit them | **new** `site` module: `site-recruiting-get` (public) and `site-recruiting-set` (`officer`); replaces `apps/web/src/content/recruiting.ts` |
| **Polls** | Open and closed polls with results | Open, close, cancel, sweep | `poll-list`, `poll-results`, `poll-open`, `poll-close`, `poll-cancel`, `poll-sweep` |
| **Progress** | The ledger with a form beside it | Record a kill with its loot | `progress-get`, `kill-record` |
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
  status, a link. Reads `signup-list`, `comp-suggest`, `coordinator-status`.
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

- **J17** When it is raid day, I want the first screen of the site to say whether I'm in, when
  we pull, and what to bring, so I can get ready without hunting.
- **J18** When tonight's roster is set, I want to lock it from the site and copy the addon import
  string, so I can form the raid in game without opening Discord or the CLI.
- **J19** When our needs change, I want to edit the open roles on the site, so the public
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

## Open questions

1. Should `member` tier (not yet a recruit) see the raid-day top at all, or the visitor view
   with a "you're in, ask an officer about raiding" line? Proposed: the raid-day top, read-only,
   since it shows what joining gets them.
2. Does the officer strip belong on every page or only the home page? Proposed: home page only;
   the quarters has the full picture.
3. Trial length for recruits (the roster tab's clock). The band says "about two weeks"; the GM
   should confirm (vintage-guild/vintage#30).
4. Whether `raid-leader` rank should see the Coordinator tab's config items. Proposed: no; config
   is `officer` tier in the manifest already, and the tab hides what the tier can't run.

## Tasks

- [ ] `view` from the session; home page composes by view; dev fixture switch
- [ ] `vintage-hero` compact mode and member-bound figures
- [ ] Signup card: queued and how many ahead, lock time; `notes` on `RaidEvent` (raids contract, manifest)
- [ ] `vintage-officer-strip`
- [ ] `/officers` route, tier guard, Tonight tab (digest, non-responders, roster controls, import string)
- [ ] Calendar, Coordinator, Polls, Progress tabs
- [ ] `site` module: `site-recruiting-get` / `site-recruiting-set`, Recruiting tab, band reads it
- [ ] Trial start date on identity; Roster tab
- [ ] J17, J18, J19 in `docs/jtbd` and `apps/api/tests/jtbd`
- [ ] Docs: `apps/web/README.md` routes table, `packages/ui-kit/README.md`, architecture status
