# Vintage

The in-game addon for the **Vintage** guild on WoW: Forever. Together with
[vintageguild.gg](https://vintageguild.gg) and the guild's Discord bot, it will:

- form the raid from the import string the coordinator posts: invite everyone and arrange the
  groups,
- take attendance and record loot during the raid,
- show who the guild's loot method says should get an item when it drops,
- give you one export string for the website after the raid.

**Status:** an early build, not yet released or checked in the game. It has the raid window,
settings, and minimap button; importing, invites, attendance, loot, and export arrive in the
next versions.

## Commands

| Command | Does |
|---|---|
| `/vintage` or `/vin` | Opens or closes the raid window |
| `/vintage status` | Shows the current raid session |
| `/vintage clear` | Starts an empty raid session (asks you to confirm) |
| `/vintage settings` | Opens the settings |
| `/vintage debug` | Turns debug logging on or off |
| `/vintage help` | Lists the commands |

Left-click the minimap button for the raid window and right-click it for the settings.

## For developers

The addon lives in the [Vintage monorepo](https://github.com/vintage-guild/vintage) under
`addon/Vintage`. Start with [AGENTS.md](AGENTS.md).

## License

Copyright (c) 2026 Jason Falk and Vintage Guild contributors.

The Vintage addon (everything under `addon/Vintage`) is licensed under the
[GNU General Public License, version 3](LICENSE) (GPL-3.0). It ships FenUI and FenCore, which
are GPL-3.0, alongside Ace3, LibStub, LibDataBroker, LibDBIcon, LibDeflate, and LibSerialize
under their own licenses (see each folder in `Libs/`). The rest of the monorepo is under the
PolyForm Noncommercial License 1.0.0.
