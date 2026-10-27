---
name: vintage-addon
description: Work on the Vintage WoW addon (addon/Vintage, Lua 5.1, WoW Forever only) — the Core/Bridge/View layers, kebab-case Executor actions, saved-data migrations, FenUI windows and the design-token theme, the fake client and busted specs, Tools/validate.py, embedded libraries and Mechanic. Load before touching addon/ or the Lua side of libs/bridge-format.
---

# The Vintage addon

Start with `addon/Vintage/AGENTS.md` (layers, saved data, checks) and the plan,
`docs/features/active/vintage-addon/vintage-addon.plan.md` (decisions D1–D10, the PR breakdown,
the Forever API table for the spike).

## Adding an action

1. **Core:** a pure function in `Core/Actions/<family>.lua` taking a context table and returning
   `Core.Result.success(data, reasoning)` or `Core.Result.error(CODE, message, suggestion)`.
   Destructive actions refuse without `context.confirm`. No WoW globals.
2. **Bridge:** a `Context:Build…Context(params)` for any game or saved state it needs (every
   game field through `Secrets.Public`), and a registry entry in `Bridge/Executor.lua` named
   `<noun>-<verb>` that builds the context, runs the action, and saves what it returns. Set
   `changes = true` on an action that changes saved state: listeners (the open window) hear
   only about those, so reads never trigger a refresh.
3. **Surfaces:** the View and slash commands call `ns.Executor:Execute(name, params)` and render
   or print the result. User-facing strings are `L["..."]` keys in `Locales/enUS.lua`.
4. **Tests:** a Core spec in `Tests/core/`, a Bridge spec on `Tests/support/wow.lua`, and a
   lifecycle case when a slash command or window changes. Extend the fake client rather than
   stubbing Vintage's own code.

## Saved data

Add a migration step to `Core/Migrations.lua` for any new or reshaped saved field; never edit an
old step, and never put `schemaVersion` in AceDB defaults.

## Forever rules

- Mainline API family: namespaced APIs (`C_Item.GetItemInfo`, `C_PartyInfo.InviteUnit`,
  `C_AddOns.*`). Guard every API that the spike hasn't confirmed (plan's API table).
- Secret values during encounters: never compare, format, or count a value from the game
  before `Secrets.Public`.
- Game mutations (invites, subgroups, loot method, master loot) get a guarded Bridge file and
  a confirm step for anything the player can't undo.

## Gates

- `python Tools/validate.py --lua lua5.1` is the CI `addon` lane; `--static` on a machine
  without Lua. Watch any new check fail once.
- Bridge format changes bump `v` on both sides (`schemas.ts` and `Core/BridgeFormat/schema.lua`)
  and regenerate the fixtures in the order in `libs/bridge-format/README.md` (Fixtures):
  `pnpm fixtures:bridge`, `--write-fixtures`, the busted run with `VINTAGE_WRITE_FIXTURES=1`
  under Lua 5.1, `--write-fixtures` again. Pasted strings are untrusted: keep the TS limits and
  error codes, and bound work before reading a value (see `Core/BridgeFormat/schema.lua`).
- Libraries: change them only through `libs.sync`, then update `PINNED_LIBRARIES` in
  `Tools/validate.py`. The theme copy: `pnpm tokens:build`, never by hand.
- Review lane: `vintage-addon-reviewer`.
