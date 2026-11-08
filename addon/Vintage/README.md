# Vintage

The in-game addon for the **Vintage** guild on WoW: Forever. Together with
[vintageguild.gg](https://vintageguild.gg) and the guild's Discord bot, it:

- forms the raid from the import string the coordinator posts: invites everyone and arranges
  the groups,
- takes attendance and records boss attempts and loot during the raid,
- shows the master looter who the guild's loot method says should get each item,
- gives you one export string for the website after the raid.

**Status:** a beta on CurseForge (install it from the CurseForge app with betas allowed for
Vintage). It has not yet been run in a raid on the Forever client, so
please report anything that goes wrong in the guild Discord. What each version adds is in
[CHANGELOG.md](CHANGELOG.md).

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
