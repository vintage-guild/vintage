# OXM.GG: what to take from it

[OXM.GG](https://oxm.gg/) is a free guild manager for WoW Forever and TBC Classic, built by the
raiding guild Progress and used by 3,500+ guilds by its own count. TJ asked for a look at it
next to Vintage's Discord bot and raid signups on 2026-11-20. Researched from oxm.gg's home page
and its full public FAQ. The officer manual (`/manual`) needs a guild sign-in, so it wasn't
read. Compare [raid-helper.md](raid-helper.md): Raid-Helper is a signup bot, while OXM is a whole
guild manager with a bot attached.

**Up front:** our signup post already shows class icons (#79–81) and the ideas adopted from
Raid-Helper, so OXM's signup post isn't ahead of ours. OXM is ahead on what surrounds the
signup: absence planning, boss assignments, loot and BIS tooling, and gear sync.

**Adopted (2026-11-20):** idea 2 as the [absences plan](../features/proposed/absences/absences.plan.md),
and OXM's everyone-visible layout and party view as part of the
[signup improvements plan](../features/proposed/signup-improvements/signup-improvements.plan.md).

## How its bot and signup work

- Officers post a signup embed per raid. Members press **Sign Up**, **Bench**, **Tentative** or
  **Absence**. One eligible character signs up at once; several open a picker. With no character,
  **New character** creates one inline.
- A player can set several default specs on a character, and each becomes its own signup entry
  for every raid. In-game talents don't change.
- Rosters and invites post separately. Players **Confirm** or **Decline** a seat, and people
  added late get a DM.
- Commands: `/register` and `/absence` for members; `/create-event`, `/delete-event`, `/announce`,
  `/invite` and `/share-pug` for officers. Every bot reply is private.
- The name shown in each kind of post (character, OXM name, Discord name, server nickname or
  mention) is a guild setting.
- It never creates Discord scheduled events. It posts messages and threads only.

## Features at a glance

| Area | OXM |
|---|---|
| Signups | Buttons on an embed, several default specs per character, PUG signups cross-posted to other servers |
| Rosters | Drag-and-drop groups, lockout tracking per instance and week, copy last week's roster, CSV and MRT export |
| Auto-Split | A weighted solver (class balance, role coverage, loot spread, gear priority) across several raids at once |
| Boss assignments | Per-boss maps with markers dragged onto arena art, raid duties (interrupts, cooldowns, trash tanks) with priority rules, WeakAura-compatible groups, one Discord thread per raid with an image per boss |
| Soft reserves | A live picker tied to BIS lists, contested picks shown at once, Gargul export |
| Loot council | Reads guild BIS lists, ranks rostered characters per item, off-spec toggle, Gargul export |
| BIS and gear planning | Curated BIS lists per phase, a "needing" count per character, personal EP-weight planning |
| Absences | Calendar drag-select, weekly rules ("never Tuesdays"), late and early times, read by Auto-Split and an officer timeline |
| Armory sync | Gear, gems, enchants and talents from Blizzard's armory about every 12 hours; marks BIS items acquired |
| Recruiting | A public apply page, a kanban board, a pre-launch "Interest" headcount, a PUG raid board |
| Guild bank and finance | A request queue (loans, refunds, items) and a hand-kept gold ledger; nothing read from the game |
| Other | A task board with people as columns, EPGP sync through an addon key, install as a phone app |

## Ideas to adopt

| # | Idea | Why | Where it lands |
|---|---|---|---|
| 1 | **Fill in class and spec from the armory** when someone adds a character | `armory` already fetches class, level and gear by name (`modules/armory/src/domain/fetch.ts`); the add-character flows don't use it. Removes a step and a source of typos from J40 | armory, identity's add flow |
| 2 | **Absences ahead of time, with weekly rules**, read by reminders and visible to officers | Members could only answer posted raids, so the bot kept pinging people it already knew were out | Adopted: [absences plan](../features/proposed/absences/absences.plan.md) |
| 3 | **Soft reserves as a live panel tied to BIS**, with contested picks shown at once | `loot` records drops only so far (#26 is next). OXM's panel is a good picture of done: picks per character, contested items, lock before the raid, export | loot (soft-reserve method) |
| 4 | **Guild BIS lists per phase with a "needing" count** per character | Feeds loot council and seat choices; without it, "who needs this" is a guess | a new `bis` module, read by loot and comp-solver |
| 5 | **Boss assignments and raid duties**, posted as one Discord thread per raid | We have nothing here, and it's a main reason guilds keep a spreadsheet next to a bot. Start with raid duties (interrupts, cooldowns, trash tanks); the map editor can wait | a new module, posted through the coordinator |
| 6 | **Which name a post shows** (character, nickname, mention) as a setting | Small; keep character names as the default | coordinator render and config |
| 7 | **A "my lockouts" board** on the site: your characters against this week's raids | Useful once there's more than one raid a week; the data already exists | apps/web, read-only from raids |

Lower priority, noted so nobody builds them by accident: the Auto-Split solver across parallel
raids (Vintage runs one team), EPGP and DKP sync (already a later loot method; OXM's addon key
is a good reference), and a public guild-finder and PUG board (recruiting already has
`applications`, and open raids are planned in the signup improvements plan).

## Where Vintage is already ahead

- **Discord scheduled events.** OXM never uses Discord's Events list. Ours does
  (`serverEvents`), so a raid shows in Discord's own calendar.
- **Signups are characters,** with AI labels on notes and a one-step addon import string at
  lock, as noted against Raid-Helper.
- **Loot capture doesn't need a third-party addon.** Our addon's export carries attendance and
  drops together (`raid-export-record`). OXM imports loot from RCLootCouncil, Gargul or Nota.
- **Recruiting reads applications for fit** with AI labels (`applications`). OXM's board has no
  triage help.

## Things to avoid

- **Settings for everything.** OXM has a setting for display names per post, delete timers and
  mentions per step. Raid-Helper taught the same lesson: ship good defaults and add a setting
  only when an officer asks.
- **Loot tools that don't share data.** OXM's BIS lists, gear planner and loot council each keep
  their own picture. Guild BIS, loot council and comp-solver should read one source.
- **Accounts with no merge path.** OXM ties one account to one Discord login and can't merge
  two, which its FAQ spends several answers on. Don't add a second sign-in method without a way
  to merge accounts.
