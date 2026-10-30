# Vintage addon — agent context

The in-game half of Vintage, for **WoW: Forever only** (client 1.60.1, interface `16001`, the
Mainline API family). It forms the raid from the coordinator's import string, records attendance
and loot, shows loot candidates, and exports a string for the website. The plan, decisions, and
PR breakdown: [vintage-addon.plan.md](../../docs/features/active/vintage-addon/vintage-addon.plan.md).
Load the `vintage-addon` skill before changing anything here.

## Layers (Weekly layout)

| Folder | Holds | Rule |
|---|---|---|
| `Core/` | Session reducer, migrations, actions returning ActionResult; `BridgeFormat/`: the `!VIN:1!` codec and payload schemas, the Lua twin of `libs/bridge-format` | Pure Lua 5.1. No WoW API, no `LibStub`; runs in busted and Mechanic's sandbox |
| `Bridge/` | `Secrets`, `BridgeStrings` (`ns.BridgeCodec` over the embedded LibSerialize and LibDeflate), `Context` (every game read), `Events`, `Executor` (the action registry), `Game` (every call that changes the group or the loot), `Forming` (the invite and arrange queue), `Recorder` (events into actions), `Items` (item data), `LootWindow` (whether a loot window is open) | The only layer that calls WoW APIs. Every returned field passes `Secrets.Public` |
| `View/` | FenUI raid window, loot popup, theme registration, minimap button | Calls `ns.Executor:Execute(name, params)`; never Core or WoW game state directly |
| `Theme/VintageTokens.lua` | FenUI theme generated from `libs/design-tokens` | Never edit; `pnpm tokens:build` writes it |
| `Vintage.lua`, `Config.lua`, `Settings.lua` | AceAddon lifecycle and slash commands, AceDB (`VintageDB`), AceConfig | Slash commands are Executor actions plus a printed result |
| `Mechanic.lua` | Optional MechanicLib registration: in-game tests, tools, debug log | A no-op without `!Mechanic` |
| `Libs/` | Synced libraries, committed, shipped as is | Never edit; see "Libraries" |

Actions are kebab-case and mirror the service commands they pair with (`session-get`,
`raid-import`, `loot-give`). Destructive ones take `confirm = true` and refuse without it.

## Saved data

`VintageDB` through AceDB: `profile` (settings), `char.session` (the raid night; survives
`/reload`), `global.items` (item data the client revealed). Each scope has its own
`schemaVersion`, migrated by `Core/Migrations.lua`. Never put `schemaVersion` in the AceDB
defaults, and add a step instead of changing an old one.

## Checks

| Where | Command |
|---|---|
| Full gate (CI `addon` lane) | `python Tools/validate.py --lua lua5.1` from this folder: tool versions, validator tests, locale keys, TOC/XML manifest, `.pkgmeta`, library pins, theme freshness, CHANGELOG version, luacheck, busted. Its diff-whitespace stage checks uncommitted edits, so it only catches anything locally |
| No Lua on the machine | `python Tools/validate.py --static` runs only the Python stages and says so |
| Bridge fixtures | `pnpm fixtures:bridge`, then `python Tools/validate.py --write-fixtures`, then `VINTAGE_WRITE_FIXTURES=1 busted Tests/core/bridge_codec_spec.lua` (rewrites `lua-made.json` under Lua 5.1), then `--write-fixtures` again ([order](../../libs/bridge-format/README.md#fixtures)) |
| Mechanic (MCP) | `addon.lint`, `addon.test`, `sandbox.test` for `Core/`, `addon.validate` with `addon="Vintage"` |
| In game | Mechanic's protocol: `diagnostic.targets`, ask for `/reload`, wait for confirmation, then `addon.output` with the same target. Never straight after an edit |

Specs are `Tests/**/_spec.lua` (busted). `Tests/support/wow.lua` is a fake Forever client
(frames, events, timers, slash commands, secret values); `Tests/support/load.lua` loads Core,
Bridge, or the whole TOC with its real libraries. Every UI string is a literal `L["..."]` key
defined in `Locales/enUS.lua`; Core's ActionResult messages stay English.

## Libraries

`Libs/libs.json` lists what Mechanic's `libs.sync` copies from `_dev_/Libs`; the copies are
committed and `.pkgmeta` has no externals, so CI and the release run the same code.
`validate.py` pins each library's version line. Ace3 must come from upstream: the shared
`_dev_/Libs/Ace3` working copy has had a local AceEvent fork (MINOR 9), and an embedded fork
would override every other addon's AceEvent through LibStub. After a sync, check the pins.

## Releasing

The version is `## Version` in `Vintage.toc`, with a matching `CHANGELOG.md` entry (the release
notes, through `.pkgmeta`'s `manual-changelog`). Pushing a tag `addon-vX.Y.Z` runs
`.github/workflows/release-addon.yml`: `Tools/release.py check-tag` (the tag matches the
version, the TOC has `X-Curse-Project-ID`), the static checks, `release.py stage` (the tracked
files as a one-commit repository, since the packager needs a `.git` folder at its `-t`), then
`BigWigsMods/packager@v2`, which uploads with the `curseforge` environment's `CF_API_TOKEN`. A
manual run of the workflow packages without uploading and keeps the zip. `python
Tools/release.py files` lists what ships. **Human steps** (#25, not done yet): the CurseForge
project, its id in the TOC, the environment and secret, and one manual run before the first tag
([production.md](../../docs/operations/production.md#addon-releases)).

## Local development

`_dev_/Vintage` is a junction to an `addon/Vintage` checkout so Mechanic finds it like the
sibling addons; `addon.sync` (dry run first) links it into `_forever_/Interface/AddOns`. An edit
in a worktree reaches the game only if the junction points at that worktree.

**Trying it on retail** (before Forever's servers open, or for anything that isn't Forever's
game data): `python Tools/retail_toc.py` writes `Vintage_Mainline.toc`, a gitignored copy of the
TOC with retail's interface numbers, which retail loads instead of `Vintage.toc`. Link the
checkout into `_retail_/Interface/AddOns/Vintage` (`mklink /J`). Re-run the script after the TOC
changes (a stale copy leaves new files unloaded; `validate.py` fails while it differs), then
restart the client, since a `/reload` may not see new files. Retail proves loading, the window, saved data, and bridge strings (Roster → Import,
Export → Take a snapshot, Make export string); raid, loot, and class data differ from Forever,
and the addon says it isn't on Forever at login.

## The window

Everything a raid leader does is a button in the raid window, never only a slash command.
Under the tabs, a header every tab shares holds the raid's name, a line about it (or the last
button's result, in red on an error), and **Import**, which opens a paste area over any tab.
Before a raid the header is empty, since each tab's empty state says what to do. FenUI's panel
subtitle overlaps the tab bar, so the window leaves it empty. Roster lists people by role and
Groups by the import's planned group, in columns (class icon, name in class color, class,
group or role, and a check for who is in your group), then the import's bench under Standby
(the Export tab ticks each as having stood by, a click unticks, `standby-set`; the export's
`standby` carries the ticked ones who never came in)
(why each is on it; the roles the raid is short of first, and "Short 1 healer" in the header
once the raid's start time has passed, less any bench person of that role who came in); Loot shows the import's loot plan and
the drops recorded so far. Each button calls one Executor action. Rows show Invite and Whisper on
hover. Invites and group moves run as a queue (`Bridge/Forming.lua`): one game call, then wait
(0.3 s between invites; a move waits for `GROUP_ROSTER_UPDATE` or 2 s; a full party waits up to
10 s or until an invite answer), read the group again, and ask `Core.Forming` for the next step.
A generation counter cancels a run on stop or a new import, and a move the game ignores (same
step, unchanged group) ends the run with `NO_PROGRESS`. Invite answers come from
`CHAT_MSG_SYSTEM`; an unanswered invite counts as not sent after 90 s. Every call that changes
the group goes through `Bridge/Game.lua`, which checks the API, leadership, and combat.

The night records itself (`Bridge/Recorder.lua` turns events into actions): `CHAT_MSG_LOOT`
becomes `loot-capture` (in a raid group, at or above the import's loot threshold, else the game's;
the last kill within 5 minutes is the drop's `source`), `ENCOUNTER_END` becomes
`encounter-record` (every attempt goes in the export's `encounters`, from the pull
`encounter-start` remembered to its end; a kill takes a snapshot labelled with the boss), and the first pull
(`ENCOUNTER_START`) or a finished Arrange takes the one "start" snapshot. `raid-export` in a
raid records "end" first. Nothing is recorded automatically outside a raid group, so a party
the next day can't land in the imported raid's export.
Item data goes to `VintageDB.global.items` through `Bridge/Items.lua`, which asks the client
to load an unknown item once per session and records it on `ITEM_DATA_LOAD_RESULT`.

The loot popup (`View/LootPopup.lua`) opens beside the game's loot window for the master
looter: each item with an import priority list (or at the threshold) and its ranked
candidates, matched to the game's master-loot candidates for that slot by full name (a name
without a realm is the player's realm; never a namesake from another realm). Give never hands out
on one press (plan D6): the first press runs `loot-give` without `confirm`, which checks the
slot still holds the item and the candidate index still means that person, and the row turns
into Confirm; only Confirm on the same row sends `confirm = true`. **Set loot method** on the
Loot tab sets the import's method and threshold the same way (`loot-mode-set`, leader only).
Without a master-loot corpse (retail has master loot turned off), Mechanic's **Preview loot
popup** tool shows it with `loot-preview`'s sample rows: the import's items with everyone on
its roster as candidates (your group first), so Give shows even alone. Give and Confirm behave
as usual, but a preview never calls `loot-give`, and a real loot window ends the preview. The
popup can be dragged; it opens where it was left (Settings → Reset loot popup position).
FenUI's list sizes rows from its own width, which is 0 while hidden: fill a list after its
frame shows.

Layout rules (`View/RaidWindow.lua` constants): 16px margins and one left edge for tabs,
header, and content; 8px between related things, 12px between bands; section captions in
upper case with a hairline; gold (`variant = "primary"`) only for the next step, and the
forward action last in a row. Check a layout change in the game, not only in specs.
Group reads
(`Context:BuildGroupSnapshot`) go through `Secrets.Public`; a member the game hides is counted,
not exported. The window's methods (`SubmitImport`, `TakeSnapshot`, `MakeExport`) are what the
specs drive, since the fake client can't click.

## Don'ts

- No game API calls outside `Bridge/`; no WoW globals in `Core/`.
- No `FenUI:SetGlobalTheme` (it restyles every FenUI addon); see `View/Theme.lua`.
- No loot hand-out without a confirm click; no addon messages (trial accounts can't send them).
- No arithmetic, comparison, or formatting on a value that may be secret.
