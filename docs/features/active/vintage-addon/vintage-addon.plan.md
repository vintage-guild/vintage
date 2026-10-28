# The Vintage addon: form the raid, record the night, show loot priority

**Status:** active (2026-10-27): PR1, the scaffold, is built and tested on a fake client; not yet run in the game. **Area:** addon. **Issues:** #21 (spike), #23 (bridge Lua side),
#24 (raid builder, attendance, loot capture, export), #25 (CurseForge release), #28 (loot popup);
Phase 2 #5 under epic #2. **Depends on the web side:** #26 (loot module), #29 (post-raid paste).

The raid leader pastes one string from Discord into the game and the raid forms itself: everyone
on the roster is invited, groups match the plan, and the loot mode is set. Through the night the
addon keeps attendance, records every drop, and, when the master looter opens a corpse, shows who
the guild's loot method says should get each item. After the raid, one export string carries
attendance, loot, and the item data the client revealed back to the website.

This plan extends PLAN §3.5, §3.6 and §5 with what the reference addons in `_dev_` (Weekly,
ActionHud, ClassyMap, Flightsim, FenUX) have settled, what the Forever client at `_forever_`
shows, and what `libs/bridge-format` already fixed. Forever is the only target.

## Today

| Piece | Where | State |
|---|---|---|
| Bridge format, TS side: schemas, codec, errors, golden fixtures | `libs/bridge-format` (#49) | ✅ `raid-import` and `raid-export` v1; `fixtures/lua-made.json` written by the addon's busted suite (the strings were produced on the Lua 5.4 stand-in; CI's Lua 5.1 run checks they are what 5.1 encodes) |
| Import string from the coordinator | `modules/coordinator` `addon-import-get` and the officer-channel post after lock (J07) | ✅ roster and groups; `loot.mode` is `group` and `candidates` is empty until the loot module lands |
| Addon scaffold (PR1) | `addon/Vintage` | ✅ Core, Bridge, View, lifecycle, settings, minimap button, Mechanic tests; 57 busted specs and the validator. Specs and lint ran locally only on stand-ins (Lua 5.4 under wasmoon, a luaparse lint); CI's Lua 5.1 run is the first real one |
| Bridge format, Lua side (PR2) | `addon/Vintage/Core/BridgeFormat` | ✅ codec and schemas; 50 busted specs over the golden fixtures (both directions), the envelope limits, and every schema rule. Ran locally on the Lua 5.4 stand-in; CI's Lua 5.1 run is the check that `lua-made.json` is what 5.1 encodes |
| CI addon lane | `.github/workflows/ci.yml` `addon` job, selected on `addon/**`, `libs/bridge-format/**`, and `libs/design-tokens/generated/lua/**` | 🚧 wired: installs Lua 5.1, busted, and luacheck, then runs `Tools/validate.py` (no longer skips). First CI run pending |
| Release workflow | `release-addon.yml` | ❌ |
| FenUI theme from the design tokens | `libs/design-tokens/generated/lua/VintageTokens.lua` | ✅ generated; `pnpm tokens:build` also writes the addon's `Theme/VintageTokens.lua`, which registers both themes with FenUI at login (and again before a window opens, since every embedded FenUI copy resets its tables when it loads) |
| Addon reviewer agent | `.claude/agents/vintage-addon-reviewer.md` | ✅ checklist written for a Weekly-layout addon |
| Forever client | `C:\Program Files (x86)\World of Warcraft\_forever_` | ✅ installed, `Wow.exe` 1.60.1.70532, 50 addons; Forever addons (Attune, WTFix) declare `## Interface: 16001` |
| Blizzard UI source for Forever | `_dev_/wow-ui-source-live`, `_dev_/12.0.1.64889` | ⚠️ Retail (Mainline) sources only; the Forever export (`/console exportInterfaceFiles code`) waits for the client to log in (#21) |
| Reference addons | `_dev_/Weekly`, `ActionHud`, `ClassyMap`, `Flightsim`, `FenUX` | ✅ all run on Forever through junctions into `_forever_/Interface/AddOns` |
| Shared libraries | `_dev_/Libs`: Ace3, FenCore, FenUI (120001), LibDeflate 1.0.2, LibStub, MechanicLib, LibDBIcon, LibDataBroker, SharedMedia | ✅ LibSerialize: `_dev_/Libs/LibSerialize` is a clone of rossnichols/LibSerialize at v1.2.3 (MINOR 7), embedded since PR2. ⚠️ The Ace3 working copy carries an uncommitted AceEvent fork (MINOR 9); the addon embeds Ace3 from its git HEAD instead (MINOR 4) |
| Local Lua tooling on this machine | `mech`, `lua5.1`, `busted`, `luacheck`, `stylua` | ❌ none on PATH; Mechanic MCP not connected in this session; pypi blocked. Python works through the main checkout's botcore venv, so `validate.py --static` runs locally |

## Scope

**In (the Phase 2 done-when):**

1. Paste the import string; see the roster, the planned groups, and the loot settings.
2. Invite everyone on the roster, converting to a raid as soon as possible; show who is in, who
   declined, who is missing.
3. Arrange raid subgroups to match the plan, with swaps when a group is full.
4. Set the game's loot method and threshold from the import (master or group loot) when the
   player is the leader.
5. Attendance snapshots: on form, after each boss, on export, and on demand.
6. Record every drop (who, what, when, which boss) and every item the client reveals.
7. Loot popup for the master looter: for a dropped item in the import, the ranked candidates with
   their reasons; hand-out through `GiveMasterLoot` only after a confirm click.
8. One export string with attendance, loot, and items seen.
9. Ship on CurseForge; install and update through the CurseForge app.

**Out:** addon-to-addon messages (trial accounts can't send them, and nothing needs them), the
companion app (PLAN "Later"), any loot method logic in Lua (the website precomputes candidates;
PLAN §5.3), DKP or standings, automatic hand-outs, Retail support, translations beyond `enUS`
(the structure is there), boss strategy, and a raid-leader cooldown tracker.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Source of truth is `addon/Vintage` in the monorepo.** A junction `_dev_/Vintage` points at the main checkout's `addon/Vintage`, so Mechanic sees it like the sibling addons; `addon.sync` junctions `_forever_/Interface/AddOns/Vintage` to it | CI, the bridge fixtures, and the design tokens live here. The `_dev_` junction keeps the one-folder Mechanic workflow (`addon.lint`, `libs.sync`, `addon.sync`) the reference addons use. A worktree edit does not change the installed addon (Mechanic rule), so a session that needs live checks either works in the main checkout or re-points the junction and says so |
| D2 | **Forever only:** `## Interface: 16001`, no Retail line. Code gates on `WOW_PROJECT_ID == WOW_PROJECT_CAMELOT` only where Forever differs | The user's call. One client means one API surface to confirm in the spike. `## AllowLoadGameType` stays out until the spike shows which game-type token Forever accepts |
| D3 | **Libraries are committed** under `addon/Vintage/Libs`, synced from `_dev_/Libs` through Mechanic's `libs.json`; `.pkgmeta` has **no `externals`** | ActionHud's rule: CI, the test host, and the release package run the same library code. FenUI and FenCore have no CurseForge external anyway. A repo check pins what is embedded |
| D4 | **Action names are kebab-case** and mirror service commands: `raid-import`, `raid-invite`, `raid-arrange`, `attendance-snapshot`, `loot-capture`, `item-record`, `raid-export` | The 2026-10-25 decision (AGENTS.md); supersedes the dotted examples in PLAN §3.6 |
| D5 | **Four layers** (Weekly and Flightsim): `Core/` pure Lua returning FenCore `ActionResult`, `Bridge/` the only WoW API caller (`Context`, `Events`, `Executor`, `Secrets`), `View/` FenUI frames that only call the Executor, `Vintage.lua` the AceAddon lifecycle | Core runs in busted and Mechanic's sandbox without a client; Bridge is tested against a fake host; View is checked in game |
| D6 | **The addon never hands out loot on its own.** `GiveMasterLoot` runs only after a confirm click; under group loot the popup records and advises only | PLAN §5.3 "officers always decide"; one mis-click would be a guild incident |
| D7 | **Attendance is snapshotted outside encounters,** and any secret value from a game API is dropped, never compared or formatted | Midnight secret-value rules apply to Forever during boss encounters (ActionHud, Flightsim). Roster and loot APIs are expected public, but the Bridge treats every field through `Secrets` |
| D8 | **State lives in AceDB `VintageDB`:** `char.session` (the current raid, survives `/reload`), `global.items` (item data seen, across characters), `profile` (settings), each with its own `schemaVersion` and ordered migrations (Weekly's `ConfigMigrations` rule: never put `schemaVersion` in defaults) | A disconnect mid-raid must not lose the night. Forever has had SavedVariables loss (WTFix exists for it): the TOC declares `## X-WTFix-Managed: 1` like Weekly, and the export can always be rebuilt from the session |
| D9 | **The FenUI theme comes from the design tokens.** `pnpm tokens:build` also writes `addon/Vintage/Theme/VintageTokens.lua`; a check fails when it is stale. The addon registers `VintageDark` and `VintageParchment` through `FenUI:RegisterTheme`. **Q13, answered in PR1:** FenUI applies a theme's colors only through `SetGlobalTheme`, which restyles every FenUI addon and prints to chat, so Vintage registers its themes, names one on its panel (border pack only), and never switches the global theme. Vintage colors on Vintage windows alone need a per-frame token hook upstream in FenUI. Also found: FenUI is a plain global with no version guard, and each embedded copy resets `FenUI.Themes` and `FenUI.Tokens` when it loads, so Vintage registers at login and re-checks before building a window | One palette on the site, in Discord embeds, and in game (`vintage-design-tokens` skill) |
| D10 | **Roster names are matched the way the game shows them:** `Name` on the player's realm, `Name-Realm` otherwise, compared case-insensitively after `Ambiguate(name, "none")` | The import's `unitName` already follows this rule (bridge-format), and cross-realm raiders cost nothing extra to support |

## Architecture

### Layout

```
addon/Vintage/
├── Vintage.toc                 # Interface 16001; SavedVariables VintageDB; OptionalDeps !Mechanic, WTFix
├── embeds.xml                  # LibStub, CallbackHandler, Ace3, LibDeflate, LibSerialize, FenCore, FenUI, LibDBIcon
├── Libs/libs.json              # Mechanic manifest (include mode); Libs/ committed (D3)
├── Locales/enUS.lua            # AceLocale; every UI string is L["..."]
├── Core/                       # pure Lua: no WoW globals, sandbox-testable
│   ├── init.lua                # ns.Core, FenCoreCompat (ActionResult with fallback)
│   ├── Schemas/bridge.lua      # v1 import/export validators mirroring libs/bridge-format/src/schemas.ts
│   ├── Bridge/codec.lua        # !VIN:1! envelope: LibSerialize + LibDeflate, limits, error codes
│   ├── Roster.lua              # import roster ↔ game roster matching, invite queue, missing/extra
│   ├── Groups.lua              # subgroup move plan (moves and swaps) from current → planned
│   ├── Session.lua             # the raid session reducer: states, snapshots, loot, items
│   ├── Loot.lua                # loot message parsing (Weekly's ParseLootMessage pattern), candidate lookup
│   └── Actions/*.lua           # one file per action family (raid, attendance, loot, item, export)
├── Bridge/                     # WoW API adapter
│   ├── Secrets.lua             # FenCore.Secrets wrappers: Public(v), drop secret fields
│   ├── Context.lua             # builders: group roster, loot window, item info, encounter, player
│   ├── Events.lua              # event frame; GROUP_ROSTER_UPDATE, LOOT_OPENED/CLOSED, CHAT_MSG_LOOT, ENCOUNTER_*, …
│   ├── Game.lua                # the mutating calls, each behind a guard: invite, convert, subgroup, loot method, master loot
│   └── Executor.lua            # action registry: name → Context + Core action; pcall; ActionResult out
├── View/                       # FenUI only; talks to the Executor, never to Core or WoW APIs
│   ├── RaidWindow.lua          # Panel + TabGroup: Roster, Groups, Loot, Export
│   ├── ImportDialog.lua        # MultiLineEditBox paste → raid-import
│   ├── LootPopup.lua           # candidates for the open loot slot; Give after confirm
│   └── Minimap.lua             # LibDBIcon + AddonCompartment entry
├── Theme/VintageTokens.lua     # generated from libs/design-tokens (D9)
├── Config.lua                  # AceDB defaults, migrations (Core/Migrations.lua), profile callbacks
├── Settings.lua                # AceConfig panel + FenUI theme picker
├── Mechanic.lua                # MechanicLib registration: tests, perf blocks, tools panel, settings
├── Vintage.lua                 # AceAddon: OnInitialize/OnEnable/OnDisable, slash commands
├── Tests/                      # busted: Core specs, Bridge specs on a fake host, fixtures, jtbd scenarios
├── Tools/                      # validate.py, install_lua_tools.py, toolchain.json (from Weekly)
├── .luacheckrc  .pkgmeta  .stylua.toml  CHANGELOG.md  README.md  AGENTS.md
└── Dev/                        # dev-only (excluded from the package): fixture loader, fake-drop tool
```

Load order in the TOC follows Weekly: libraries, locale, Core, Bridge, the addon entry, Config,
Settings, View, Mechanic, then a `#@debug@` block for `Dev/`. Lua is 5.1: no `goto`, `bit32`,
or `//`.

### Actions

Every capability is a named action with a typed input, a Core function, and an `ActionResult`
(`success`, `data`, `error { code, message, suggestion, retryable }`, `reasoning`). The Executor
is the only way the View and the slash commands reach Core. Names mirror the service commands they
pair with on the web (D4).

| Action | Input | Core | Bridge context | Game calls | Triggered by |
|---|---|---|---|---|---|
| `raid-import` | `{ text }` | decode + validate → new session | none | none | Import dialog, `/vintage import` |
| `raid-status` | — | roster match, missing, extra, group diff | group roster | none | Raid window refresh, `GROUP_ROSTER_UPDATE` |
| `raid-invite` | `{ only? }` | invite queue in roster order (tanks and healers first) | group roster, `CanInvite` | `C_PartyInfo.InviteUnit`, `ConvertToRaid` once 2+ members | Invite all / Invite missing buttons |
| `raid-arrange` | — | move plan: moves into free slots, swaps when full, one op per roster update | group roster | `SetRaidSubgroup`, `SwapRaidSubgroup` | Arrange groups button |
| `loot-mode-set` | — | the mode and threshold from the import, or skip when `mode = group` and unchanged | loot method, leadership | `C_PartyInfo.SetLootMethod`, `SetLootThreshold` | After the raid forms, with a confirm |
| `attendance-snapshot` | `{ label? }` | members from the roster (name, class, group, online) | group roster, encounter state | none | Form, `ENCOUNTER_END`, export, `/vintage snapshot` |
| `loot-capture` | `{ message }` or `{ slots }` | parse `CHAT_MSG_LOOT` into `{ itemId, looter, count }`; attach the last encounter as `source` | last encounter, time | none | `CHAT_MSG_LOOT`, `LOOT_OPENED` |
| `loot-candidates` | `{ itemId }` | ranked candidates from the import, mapped to master-loot candidate indexes and online state | loot window, master-loot candidates | none | `LOOT_OPENED` while master looter |
| `loot-give` | `{ slot, candidateIndex, confirm }` | refuse without `confirm`; refuse when the slot's item changed | loot window | `GiveMasterLoot` | Loot popup Give → Confirm |
| `item-record` | `{ itemId }` | add or refresh `global.items[itemId]` | `C_Item.GetItemInfo`, async load | `C_Item.RequestLoadItemDataByID` | Every item link seen |
| `raid-export` | — | build the `raid-export` payload, validate, encode | player name, addon version, time | none | Export tab, `/vintage export` |
| `session-clear` | `{ confirm }` | drop the session | none | none | Clear button → confirm |

Destructive ones (`loot-give`, `session-clear`, `loot-mode-set`) take a `confirm` flag and the
View shows a confirm step first, the addon's version of guild-kit's preview → confirm flow.

### The raid session

`VintageDB.char.session` is a small state machine the Core reducer owns:

```
idle ──raid-import──▶ imported ──raid-invite──▶ forming ──(roster matches or leader says go)──▶ live ──raid-export──▶ exported
                                                                                              ▲          │
                                                                                              └── more ──┘   (export again any time)
```

```lua
session = {
  schemaVersion = 1,
  state = "live",
  import = <decoded raid-import payload>,       -- as pasted; never edited
  importedAt = 1793050000,
  byName = { ["Aeryn"] = "c_aeryn", ... },      -- unit name → characterId (D10)
  candidatesByItem = { [16800] = { ... } },     -- itemId → ranked list, built once at import
  attendance = { { at = ..., label = "start", members = { ... } }, ... },
  loot = { { itemId = 16800, looter = "Doran", at = ..., count = 1, source = "Onyxia" }, ... },
  itemsSeen = { [16800] = true, ... },          -- exported from global.items
  lastEncounter = { id = 1084, name = "Onyxia", endedAt = ... },
  lastExportAt = nil,
}
```

Import payloads are kept verbatim so a second export after a fix on the website side still carries
`guildId` and `eventId`. Without an import (a pick-up raid), the addon still records attendance,
loot, and items, and the export simply has no `eventId`.

### Bridge codec (the Lua side of #23)

The string is `!VIN:1!` + `EncodeForPrint(CompressDeflate(SerializeEx({ stable = true }, payload)))`.

| Step | Lua | Notes |
|---|---|---|
| Prefix | `text:match("^!VIN:(%d+)!")` | not `1` → `UNSUPPORTED_ENCODING`; absent → `NOT_A_BRIDGE_STRING` |
| Size | `#text > 1000000` → `TOO_LARGE` | same cap as `DEFAULT_DECODE_LIMITS.maxEncodedLength` |
| Print decoding | `LibDeflate:DecodeForPrint` | nil → `CORRUPT` |
| Inflate | `LibDeflate:DecompressDeflate` | nil → `CORRUPT`; `#out > 2 MiB` → `TOO_LARGE` (LibDeflate cannot stop mid-stream; the cap is checked after, which is acceptable for strings that come from the guild's own site) |
| Deserialize | `LibSerialize:Deserialize` | failure → `CORRUPT`; then a walk refuses cycles, depth > 32, and more than 200k values → `CORRUPT`, as the TS deserializer does |
| Schema | `Core/BridgeFormat/schema.lua` | `v > 1` → `UNSUPPORTED_VERSION`; unknown `kind` → `UNKNOWN_KIND`; the wrong kind for the call → `WRONG_KIND`; field problems → `INVALID_PAYLOAD` with `details.issues[] = { path, message }` |

The validator mirrors `schemas.ts` field for field, including the cross-reference rules (unique
ids, groups and candidates only name rostered characters, nobody in two groups, at most 5 per
group). Encoding uses `SerializeEx({ stable = true })` so the serialized bytes match the TS port;
compressed bytes differ, so tests compare decoded values. Changing a payload bumps `v` on both sides
and updates the fixtures (`pnpm fixtures:bridge` for TS; the busted suite regenerates
`lua-made.json` under Lua 5.1).

**Fixtures without a JSON parser:** `Tools/validate.py --write-fixtures` renders
`libs/bridge-format/fixtures/*.json` (and `lua-made.json`'s strings) as
`addon/Vintage/Tests/fixtures/bridge_fixtures.lua`, and its static check fails while that file is
stale, so one renderer owns it. The codec spec writes `lua-made.json` (`Tests/support/lua_made.lua`)
when `VINTAGE_WRITE_FIXTURES=1`, and otherwise fails while a committed string differs from what this
Lua encodes. Codec files live in `Core/BridgeFormat/` (not `Core/Bridge/`, to keep "Bridge" for
the game adapter); the codec takes LibSerialize and LibDeflate as arguments, so Core never calls
LibStub, and `Bridge/BridgeStrings.lua` hands it the embedded copies. `wow-data.json` carries
`libs/wow-data`'s class and role lists, and the Lua spec fails when the schema's copies drift.

**Parity with the TS side (PR2 review).** Same error codes for the same input (a huge `v` reads as a newer version on both sides), including invalid
UTF-8 anywhere, integers past 2^53, non-string/number keys, and a second serialized value; both sides
keep a leading byte order mark in a string (the TS decoder uses `ignoreBOM`); values
are counted the TS way (the smallest `maxNodes` that decodes each fixture matches on both sides).
Untrusted strings are bounded before they are read: a string longer than 3 × its limit in bytes is
refused without scanning, each distinct string is UTF-8-checked once, and the trim is linear and
also strips the no-break spaces and byte order marks JavaScript's `trim` does. Known differences,
all on crafted input only: LibDeflate inflates fully before the 2 MiB cap is checked; a sequence
written into LibSerialize's map part, or an array with a trailing nil, decodes in Lua but is
refused by the TS deserializer; other Unicode spaces that JavaScript trims are kept.

### Bridge layer rules (from ActionHud, Flightsim, FenUX)

- **Every game read goes through `Context`,** every mutation through `Game`, and each is guarded:
  the API exists (`type(C_PartyInfo.InviteUnit) == "function"`), the player may do it
  (`C_PartyInfo.CanInvite()`, `UnitIsGroupLeader`, `UnitIsGroupAssistant`), not in combat for
  roster changes (`InCombatLockdown()` and a deferral to `PLAYER_REGEN_ENABLED`), and returned
  fields pass `Secrets.Public` before Core sees them.
- **One roster operation per roster update.** `raid-arrange` and `raid-invite` run as queues:
  do one game call, wait for `GROUP_ROSTER_UPDATE` (with a 2 s timeout), rebuild the context,
  ask Core for the next op. No `OnUpdate` loops; `C_Timer.After` for the timeout only.
- **Generation counters** (ClassyMap, ActionHud): a queue started before a `/reload`, a session
  clear, or a new import is cancelled by bumping the generation; late callbacks check it.
- **Events are coalesced** into a next-frame refresh (`View:RequestRefresh(scope)` with scopes
  `roster`, `groups`, `loot`, `export`), the ClassyMap pattern, so ten roster updates in a row
  render once.
- **Loot window state is read when `LOOT_OPENED` fires** and dropped on `LOOT_CLOSED` or
  `LOOT_SLOT_CLEARED`; `loot-give` refuses when the slot's link no longer matches what the popup
  showed.
- **Item data is async:** `C_Item.GetItemInfo` can return nil for undiscovered items on Forever;
  `item-record` requests the load and retries through `Item:CreateFromItemID(id):ContinueOnItemLoad`,
  bounded to one retry per item per session.
- **Errors in callbacks** go to the error handler with the action name and a ten-second
  per-callback throttle (Flightsim), so one bad roster line never stops the queue silently.
- **Protected frames:** none. The addon creates no secure buttons and hooks no Blizzard frames; the
  loot popup is a plain FenUI panel anchored next to `LootFrame`, shown only out of combat
  lockdown (loot windows open after combat anyway).

### View (FenUI)

FenUI is embedded (`Libs/FenUI/FenUI.xml` in `embeds.xml`), so the widgets are always present; the
Weekly-style `if FenUI and FenUI.CreatePanel` guards stay for the cheap fallbacks only.

| Surface | FenUI | Content |
|---|---|---|
| Raid window (`/vintage`) | `CreatePanel` (title, movable, closable, `theme = "VintageDark"`), `CreateTabGroup` with badges, `CreateToolbar` footer | Tabs: **Roster** (`CreateGrid`, columns icon · name · class · role · group · status, `onRowBind` tints by `VintageTokens.wow.class`), **Groups** (eight `CreateSection`s with `CreateStatusRow`s; planned vs. actual; a Fix button per group), **Loot** (`CreateGrid` of drops this session with looter and source), **Export** (`CreateMultiLineEditBox` read-only, select-all on focus, "Copy with Ctrl+C" hint) |
| Import dialog | `CreateDialog` with `CreateMultiLineEditBox` and Import / Cancel `CreateButton`s | Validation errors shown inline with the error code's suggestion; a decoded summary ("Molten Core — week 1 · 25 characters · 4 groups · master loot, epic+") before the session replaces the current one |
| Loot popup | `CreatePanel` anchored to `LootFrame`, `CreateGrid` of candidates (rank · name · reason · online), Give `CreateButton` per row → confirm row | Shows for a slot whose item has candidates or whose quality ≥ the loot threshold; one popup per slot, stacked |
| Empty states | `CreateEmptyState` | "No import yet. Paste the string from #vintage-ops." |
| Minimap and compartment | LibDBIcon, `AddonCompartmentFrame:RegisterAddon` (Weekly) | Left click: window; right click: settings |
| Settings | AceConfig through `Settings.lua`, FenUI `ThemePicker` for Dark / Parchment | Popup on/off, auto-popup threshold, invite pacing, show declined, minimap icon, debug |
| Theme | `Theme/VintageTokens.lua` merged into `FenUI.Tokens.colors`, then `FenUI:RegisterTheme("VintageDark", VintageTokens.themes["vintage-dark"])` | Class, quality, role, and signup colors read from `VintageTokens.wow["vintage-dark"]` |

Rendering never computes; a tab asks the Executor for `raid-status` and binds rows. Grids reuse
rows (`onRowBind`), and the window sizes itself from content (Weekly's auto-size).

### Slash commands

`/vintage` and `/vin`: no argument toggles the window; `import`, `export`, `invite`, `arrange`,
`snapshot [label]`, `clear`, `settings`, `help`, `debug`. Every subcommand is an action call plus a
printed `ActionResult` message, so the slash surface and the window cannot drift.

## Forever: facts and the spike (#21)

Forever 1.60.1 (internal name Camelot) is the Mainline API family: Weekly, FenUI, FenCore, and
MechanicLib run on it unchanged through junctions from `_dev_`. What the addon needs, and how sure
we are:

| API or event | Used for | Evidence today | Spike check on the live client |
|---|---|---|---|
| `C_PartyInfo.InviteUnit(name)`, `CanInvite()`, `ConvertToRaid()`, `ConvertToParty()` | `raid-invite` | Documented in Retail 12.0.1 (`PartyInfoDocumentation.lua`); PLAN §3.6 | Invite by `Name` and `Name-Realm`; when `ConvertToRaid` needs the confirmation popup (`ConfirmConvertToRaid` exists) |
| `GetNumGroupMembers()`, `GetRaidRosterInfo(i)` → name, rank, subgroup, level, class, fileName, zone, online, isDead, role, isML | roster context, attendance | Globals used by BigWigs' Forever modules | Which fields are secret during an encounter, if any |
| `SetRaidSubgroup(index, group)`, `SwapRaidSubgroup(a, b)` | `raid-arrange` | Used by `Blizzard_RaidUI.lua` (Mainline) | Needs leader or assistant; refused in combat? One op per `GROUP_ROSTER_UPDATE`? |
| `C_PartyInfo.GetLootMethod()` → `Enum.LootMethod` (Masterlooter = 2, Group = 3), `C_PartyInfo.SetLootMethod`, `SetLootThreshold`, `GetLootThreshold` | `loot-mode-set` | Documented in 12.0.1; `IsLegacyLootModeEnabled` exists | That master loot is offered in Forever raids (`GetAvailableLootMethods`) |
| `LOOT_OPENED`, `LOOT_CLOSED`, `LOOT_SLOT_CLEARED`, `GetNumLootItems()`, `GetLootSlotInfo(slot)`, `GetLootSlotLink(slot)` | loot popup, item capture | Mainline `GroupLootFrame.lua` | Arguments on Forever; whether `LOOT_READY` also fires |
| `GetMasterLootCandidate(slot, i)` for `i = 1..MAX_RAID_MEMBERS`, `GiveMasterLoot(slot, i)` | candidates, hand-out | Mainline `GroupLootFrame.lua` (`MasterLooterFrame_UpdatePlayers`); PLAN §5 cites three Forever loot addons | The whole hand-out once, on a trash item, with a willing guildie (Q6) |
| `CHAT_MSG_LOOT` with the `LOOT_ITEM*` global patterns | who got what | Weekly's Journal parses it on Forever today | Patterns for other players' loot in a raid (`LOOT_ITEM`, `LOOT_ITEM_MULTIPLE`) |
| `ENCOUNTER_START` / `ENCOUNTER_END` (id, name, difficulty, size, success), `BOSS_KILL` | snapshot labels, loot `source` | Mainline events; BigWigs Forever modules use encounter ids | That Forever's launch raids fire them (Onyxia, Hyjal Summit, Barrow Deeps) |
| `ENCOUNTER_LOOT_RECEIVED` (encounterID, itemID, itemLink, quantity, itemName, fileName) | cross-check `source` | Documented in 12.0.1 `LootDocumentation.lua` | Whether it fires for other raiders' loot |
| `C_Item.GetItemInfo`, `C_Item.RequestLoadItemDataByID`, `Item:CreateFromItemID` | item capture | Weekly uses `C_Item` on Forever | How undiscovered items present (nil, or name only) |
| `C_AddOns.GetAddOnMetadata`, `Ambiguate`, `GetNormalizedRealmName`, `UnitIsGroupLeader`, `UnitIsGroupAssistant`, `IsMasterLooter` | names, guards | Mainline globals | Present |
| `WOW_PROJECT_ID == WOW_PROJECT_CAMELOT` (18) | client gate | PLAN §3.6; Weekly's `.luacheckrc` lists both `WOW_PROJECT_CAMELOT` and `WOW_PROJECT_FOREVER` | Which constant exists; the value; the `AllowLoadGameType` token |
| `issecretvalue`, `C_Secrets` | D7 | Midnight rules (ActionHud, `13-midnight-secret-values.doc.md`) | That roster and loot reads stay public between pulls |

**Spike procedure (Nov 4–6, needs a human at the client):**

1. Log in once, run `/console exportInterfaceFiles code`, copy `_forever_/BlizzardInterfaceCode`
   to `_dev_/forever-ui-source-1.60.1/` (outside the repo), note the path in `addon/Vintage/AGENTS.md`.
2. `diagnostic.targets` → pick the Forever character; `api.queue` the table above; user `/reload`s;
   read `addon.output` with that target (the `using-mechanic` protocol). Record each row's result
   in this doc's table.
3. In a 2-person party on a trash mob with master loot: run the loot flow end to end once.
4. Check Mechanic's sandbox stubs against the differences found; file gaps upstream
   (Falkicon/Mechanic), per PLAN §7.5.
5. Tick #21's criteria and PLAN §8's "Addon spike" box.

Until then every API call sits behind a guard and the busted host models the documented shapes;
the spike changes contexts, not Core.

## Tooling and workflow (Mechanic)

| Task | How |
|---|---|
| Library sync | `Libs/libs.json` (include mode): LibStub, CallbackHandler-1.0, AceAddon, AceConsole, AceDB, AceDBOptions, AceEvent, AceGUI, AceConfig, AceLocale, LibDataBroker-1.1, LibDBIcon-1.0, LibDeflate, **LibSerialize**, FenCore (`local`), FenUI; `libs.sync` with `dry_run` first |
| LibSerialize | Clone `rossnichols/LibSerialize` into `_dev_/Libs/LibSerialize` (own `.git`, like the other externals), MINOR ≥ 7 so stable serialization matches the TS port (`libs/bridge-format/README.md`) |
| Lint, format | `addon.lint` / `addon.format` (Luacheck 1.2.0, StyLua); `.luacheckrc` from Weekly minus its API list, plus the raid and loot globals |
| Offline tests | `sandbox.test` for `Core/` (restricted sandbox, no WoW globals); `addon.test` for the busted suite |
| Live | `diagnostic.targets` → `lua.queue` / `api.queue` → user confirms `/reload` → `addon.output` with `agent_mode=true` and the same target. Never straight after an edit |
| Client link | `addon.sync` (dry run, then real) junctions `_forever_/Interface/AddOns/Vintage` → `_dev_/Vintage` → `<main checkout>/addon/Vintage` (D1) |
| Release | `addon.validate`, then the tag workflow below; `release.all` is not used (the monorepo tags) |
| Debug output | `MechanicLib:Log("Vintage", msg, MechanicLib.Categories.EVENT)` through `ns.Debug`; never `print` |

`Mechanic.lua` registers with MechanicLib (optional, `LibStub("MechanicLib-1.0", true)`):
**tests** (codec round trip of an embedded fixture, roster match, group plan, loot parse, session
reducer), **performance** blocks (`rosterRefresh`, `lootCapture`, `codec`, `uiRefresh`), a
**tools panel** (Load sample import, Simulate drop of item 16800, Snapshot now, Dump session,
Toggle window), and **settings** (debug mode, popup on/off).

**Local gate on this machine:** no Lua 5.1, busted, luacheck, or `mech` is installed, and pypi is
blocked. Options, in order: `mech setup` from the Mechanic checkout's venv (checksum-verified
downloads, if the network allows), else a portable Lua 5.1 + LuaRocks on PATH. Until one works,
CI is the Lua gate and local checks are only what Node runs (fixture and token freshness): the
risk is a red `addon` lane on the first push, which doubles as the lane's watched failure.

## Testing

| Layer | Runner | What |
|---|---|---|
| Core | busted (`Tests/core/*_spec.lua`) and Mechanic `sandbox.test` | Codec: every fixture decodes to its payload or fails with its error; own encode → decode round-trips; limits. Schemas: each `schemas.ts` rule has a failing case. Roster: matching with realms, ordering, missing and extra. Groups: plan reaches the target with ≤ N ops, swaps when full, stable when already arranged. Session: every transition, snapshot dedupe, loot with and without a source, export payload validates against the export schema. Loot: `CHAT_MSG_LOOT` patterns for self, others, multiples |
| Bridge | busted on a fake host (`Tests/support/wow.lua`, modeled on ActionHud's host and ClassyMap's `wow_mock`: events, timers, frames, `InCombatLockdown`, a secret-value factory) | Invite queue converts to raid after the second member; arrange issues one op per roster update and times out cleanly; loot capture on `LOOT_OPENED` records items and asks for item data; attendance after `ENCOUNTER_END`; secret fields dropped; nothing mutates in combat |
| Lifecycle | busted, loading the real TOC order (ActionHud's `load_addon.lua`) with the embedded libraries | `OnInitialize` → `OnEnable` → `/reload` keeps the session; migrations run once; profile copy and reset |
| Fixtures | `Tests/fixtures/bridge_fixtures.lua` rendered by `validate.py --write-fixtures` from `libs/bridge-format/fixtures` | Freshness checked by `validate.py`; `lua-made.json` regenerated under Lua 5.1 and decoded by the TS tests (`pnpm exec vitest run libs/bridge-format`) |
| JTBD | `Tests/jtbd/*_spec.lua` (scenario specs on the fake host, one per job) and the web half in `apps/api/tests/jtbd/raid-night.jtbd.test.ts` | See the jobs below |
| Gate | `Tools/validate.py --lua lua5.1` (Weekly's, minus the season checks): toolchain versions, literal locale keys, TOC/XML references, `.pkgmeta` exclusions, Luacheck, busted, diff whitespace, fixture freshness, TOC version ↔ CHANGELOG | Run by CI's `addon` lane and listed in `docs/operations/local-validation.md` |
| In game | Mechanic tests tab and the spike table | Visuals, event timing, combat, the hand-out |

A gate is added only after it has been watched failing once (AGENTS.md).

## Release (#25)

- `Vintage.toc`: `## Version: 0.1.0`, `## X-Curse-Project-ID: <id>` once the project exists,
  `## IconTexture`, `## X-Website: https://vintageguild.gg`, `## X-License:` the repo's
  `PolyForm-Noncommercial-1.0.0` for now. **Open before the first release:** the package also
  ships GPL-3.0 FenUI and FenCore, so the license terms of the combined package need a decision.
- `.pkgmeta`: `package-as: Vintage`; `ignore:` Weekly's list (`.github`, `Tests`, `Tools`, `Dev`,
  `AGENTS.md`, `CONTRIBUTING.md`, lint and format configs) but not `CHANGELOG.md`, which
  `manual-changelog: CHANGELOG.md` turns into the release notes; no `externals` (D3).
- `.github/workflows/release-addon.yml`: on tag `addon-v*`, check the tag matches the TOC version,
  then `BigWigsMods/packager@v2` with `args: -t addon/Vintage` and `CF_API_TOKEN`; a dry run
  (`-d`) on `workflow_dispatch` so the first real tag is not the first run.
- CurseForge project **Vintage** (human: Falkicon's author account), game version Forever 1.60.1.
- `CHANGELOG.md` in the addon, Keep-a-Changelog style; `pnpm` never versions the addon.

## Work breakdown

Each PR keeps `ci-ok` green, updates this doc, and passes the `vintage-addon-reviewer` lane. PR1
and PR2 are fully offline and can start now; PR3–PR6 are built offline against the fake host and
verified live from Nov 4.

| PR | Issue | Delivers | Done when |
|---|---|---|---|
| **PR1 Scaffold** | #21 (scaffold part), #24 (skill) | `addon/Vintage` skeleton (TOC, embeds, Libs via `libs.sync`, Core/Bridge/View stubs, `Vintage.lua`, Config, Settings, Mechanic.lua, Locales), `Tools/validate.py` + toolchain, `.luacheckrc`, `.pkgmeta`, `Tests/support/wow.lua`, one lifecycle spec, `Theme/VintageTokens.lua` wired to `pnpm tokens:build` with a freshness check, `addon/Vintage/AGENTS.md`, the `vintage-addon` skill, the `_dev_/Vintage` junction, PLAN §3.6 and architecture.md rows updated, this doc moved to `active/` | `/vintage` opens an empty themed window on the Forever client (after Nov 4); CI `addon` lane runs validate.py and was watched failing once; `pnpm check:agent-docs` green. **Built 2026-10-27.** Differences from this row: `Bridge/Game.lua` waits for the first game mutation (PR4) and `Dev/` for the fixture loader (PR3); LibDeflate and LibSerialize arrive with the codec (PR2); no theme setting yet, since only the border would change (Q13). The window has not been opened in the game |
| **PR2 Bridge codec** | #23 | `Core/BridgeFormat/codec.lua` and `schema.lua`, `bridge_fixtures.lua` from `validate.py --write-fixtures`, busted spec over every fixture, `lua-made.json` checked against what Lua encodes, the vitest suite still decodes it | Both sides decode each other's fixtures; #23 closed; PLAN §8 Phase 2 first box ticked. **Built 2026-10-27**, plus LibSerialize v1.2.3 and LibDeflate embedded and an in-game Mechanic test that decodes a website-made string |
| **PR3 Session and import** | #24 | `Core/Session.lua`, `Core/Roster.lua`, `raid-import`, `raid-status`, Import dialog, Roster tab with match status, `session-clear` | Pasting the coordinator's string from `#vintage-ops` shows the roster with who is already in the group |
| **PR4 Invite and arrange** | #24 | `raid-invite` queue with `ConvertToRaid`, `raid-arrange` move plan with swaps, `loot-mode-set` with confirm, Groups tab | On the fake host: a 25-name import forms a raid in ≤ 26 roster updates and arranges into the planned groups; live: a 5-person test after Nov 4 |
| **PR5 Attendance, loot, items, export** | #24 | `attendance-snapshot` on form / `ENCOUNTER_END` / export / manual, `loot-capture`, `item-record`, `raid-export`, Loot and Export tabs | The export string decodes on the website side (`decodeRaidExport`) with the attendance, loot, and items the fake host produced; the J-job spec passes |
| **PR6 Loot popup** | #28 | `loot-candidates`, `loot-give` with confirm, `LootPopup.lua`, settings for threshold and auto-popup | A `LOOT_OPENED` with item 16800 on the fake host shows "1. Doran — Soft-reserved (1 of 2)"; Give asks to confirm and calls `GiveMasterLoot(slot, index)` once; live hand-out checked per the spike |
| **PR7 Release** | #25 | `release-addon.yml`, `X-Curse-Project-ID`, CHANGELOG, `addon-v0.1.0` | Installed from CurseForge on the Forever client (human) |
| **Spike** | #21 | The table above filled in, Blizzard source exported, Mechanic gaps filed | Nov 4–6, interleaved with PR3–PR6 |

Web-side work this plan needs but does not own: `candidates` and `loot.mode` in the import once
the loot module exists (#26), and `raid-export` intake (#29). The export schema is fixed at v1, so
the addon can ship before either.

## Jobs to be done

A new suite, `docs/jtbd/raid-addon.md`, with the automated layer split between the addon's busted
scenario specs (the in-game half) and `raid-night.jtbd.test.ts` (the web half). Job IDs are
assigned when each job lands, since other suites took J33–J43 in the meantime. The first one in
is **J44**, in the raid-night suite: the export check on the site, over MCP, and in Discord, using
a string the addon's codec wrote.

| Job | When … I want … so I can … | Addon checks |
|---|---|---|
| **Form the raid from the string** | the raid is locked, I (raid leader) want to paste one string and invite everyone, so I can form the raid in a minute | Decoded summary shown; invites in roster order; raid conversion; status per character; declined and offline shown |
| **Groups match the plan** | the raid is formed, I want the groups arranged, so I can skip dragging 25 people | Move plan reaches the import's groups; manual changes afterwards are respected (no fighting the leader) |
| **Attendance without a spreadsheet** | the night runs, I want attendance taken at start, per boss, and at the end, so I can stop asking "who was here for Onyxia?" | Snapshots labelled `start`, boss names, `end`; late joiners appear in later snapshots |
| **Loot priority at the corpse** | an item drops, I (master looter) want to see who the guild's method says gets it and why, so I can hand it out without alt-tabbing | Popup with ranked reasons; Give → Confirm → one `GiveMasterLoot`; group loot: record only |
| **Close the loop** | the raid is over, I want one string for the website, so I can record attendance and loot and let the bot post the summary | Export validates against `raidExportV1Schema`; pasting it on the site records attendance and loot (the web half: J44 checks it today, read-only; recording is #29) |

## Docs and repo updates that ride with PR1

Done in PR1, except the jtbd suite (it arrives with the first job, PR3) and the PLAN §8 spike box
(it needs the live client).

- `PLAN.md` §3.6: Forever-only TOC, kebab-case action names, committed libraries, the `_dev_`
  junction; §8 Phase 1 spike box when done; §9 Q13 answered.
- `AGENTS.md` Decisions: D2, D3, D4 (repo-wide).
- `docs/architecture.md`: the WoW addon row and the foundation-projects rows for Mechanic, FenUI,
  FenCore go from 📋 to 🚧.
- `docs/features/README.md` index (this doc), `docs/jtbd/README.md` (the new suite).
- `.github/area-ownership.json`: an `addon` area (`addon/`; `libs/bridge-format` stays in `libs`);
  CODEOWNERS updated to match; `commitlint` already has the `addon` scope.
- `.claude/skills/vintage-addon/SKILL.md`: layout, the action pattern, Forever rules, the Mechanic
  loop, validate.py, fixtures, when to bump `v`.
- `.claude/agents/vintage-addon-reviewer.md`: the validate.py path exists; add the kebab-case
  action rule and the "no game call outside `Bridge/`" check.
- `docs/operations/local-validation.md`: the addon gate and the local Lua tooling note.

## Proposed issue updates

To post on GitHub once this plan is accepted (comments, not edits, so the history stays):

- **#21:** add the API table's spike checks and the export path convention; note the scaffold part
  moves to PR1 and no longer waits for the client.
- **#23:** the Lua-side checklist from Falkicon's comment plus: fixtures come in as a generated
  `bridge_fixtures.lua` (no JSON rock), the validator mirrors `schemas.ts` including the
  cross-reference rules, and the error codes match `errors.ts`.
- **#24:** split into PR3 / PR4 / PR5 acceptance criteria; add the session state machine, the
  one-op-per-roster-update rule, name matching (D10), and the `vintage-addon` skill contents.
- **#25:** no `externals` (D3), the tag ↔ TOC version check, and a `workflow_dispatch` dry run.
- **#28:** the popup is master-looter only, Give needs a confirm, slot changes cancel, group loot
  records only; threshold and auto-popup settings.
- **#5 / PLAN §8:** link this doc; note the addon can ship before #26 and #29 because the export
  schema is fixed.

## Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| A1 | Does Forever accept an `## AllowLoadGameType` token, and which (`forever`, `camelot`)? | spike | nothing; `Interface: 16001` already gates |
| A2 | Are any `GetRaidRosterInfo` fields secret during an encounter? | spike | D7's snapshot timing is the fallback either way |
| A3 | Does `ConvertToRaid` on Forever need the confirmation popup, and does it work from a 2-person party? | spike | PR4 live check |
| A4 | Which Lua toolchain can be installed on this machine (`mech setup`, portable LuaRocks)? | Bloodfen | local gate only; CI unaffected |
| A5 | Should the export also go to the clipboard-friendly chat frame when the window is too small for 40 names of loot? (The 1M-char cap is far above a night's export.) | GM / raid leader | UX only |
| A6 | Threshold default: epic (4) like the fixture, or rare (3) for Onyxia nights? | officers (Q5) | PR6 default |

## Risks

| Risk | Mitigation |
|---|---|
| Forever differs from Mainline on a raid or loot API | Every call is guarded and documented in the table; the spike runs before PR4–PR6 go live; Core is untouched by API shape changes |
| No local Lua tooling | CI is the gate; Core specs also run in Mechanic's sandbox once `mech` works; the first red lane is the watched failure |
| SavedVariables loss on Forever | `X-WTFix-Managed`, a session that can rebuild the export, and snapshots written on every change |
| The loot module's candidates arrive late | The popup already shows quality-based drops without candidates; `candidates: []` is valid v1 |
| A mis-click gives loot to the wrong raider | Confirm step, slot-change cancellation, and the record in the Loot tab so the award can be fixed on the website |
| The addon grows past one package | PLAN §3.6 allows load-on-demand children later; the Core/Bridge split makes that a TOC change |
