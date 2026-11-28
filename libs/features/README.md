# @vintage/features

Feature flags for guild features the site and the bot can switch off without removing them.
Each flag is a constant in `src/index.ts`: change it and deploy.

| Flag | Covers | Now |
|---|---|---|
| `polls` | The site's `/polls` page, header link, home poll card, and the quarters' Polls tab; `/vintage poll` and `/vintage event pick-night` in Discord, and their vote buttons; the Polls help topic | Off (2026-11-27) |

The commands behind a flag stay registered, so agents and MCP clients still see them, and
stored data is kept. Turning a flag back on needs the slash commands registered again
(`pnpm --filter @vintage/gateway register-commands`), since Discord only shows what was registered.
