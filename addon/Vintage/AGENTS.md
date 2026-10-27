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
| `Bridge/` | `Secrets`, `BridgeStrings` (`ns.BridgeCodec` over the embedded LibSerialize and LibDeflate), `Context` (every game read), `Events`, `Executor` (the action registry) | The only layer that calls WoW APIs. Every returned field passes `Secrets.Public` |
| `View/` | FenUI raid window, theme registration, minimap button | Calls `ns.Executor:Execute(name, params)`; never Core or WoW game state directly |
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

## Local development

`_dev_/Vintage` is a junction to an `addon/Vintage` checkout so Mechanic finds it like the
sibling addons; `addon.sync` (dry run first) links it into `_forever_/Interface/AddOns`. An edit
in a worktree reaches the game only if the junction points at that worktree.

## Don'ts

- No game API calls outside `Bridge/`; no WoW globals in `Core/`.
- No `FenUI:SetGlobalTheme` (it restyles every FenUI addon); see `View/Theme.lua`.
- No loot hand-out without a confirm click; no addon messages (trial accounts can't send them).
- No arithmetic, comparison, or formatting on a value that may be secret.
