---
name: vintage-discord
description: Work on anything Discord in Vintage — libs/discord-kit (signature verification, responses, embeds, components, timestamps, REST client), the apps/gateway interactions endpoint, slash-command registration, the Vintage bot's settings and permissions, and role sync. Load before touching Discord code or the bot.
---

# Discord in Vintage

Discord is identity (ranks come from roles) and a surface (signups, reminders, `/vintage`
commands). Everything runs serverless: no always-on gateway process.

## Where things are

| Piece | Path | Notes |
|---|---|---|
| Toolkit | `libs/discord-kit` | Pure lib: no `node:` imports, Web APIs only. Read its `src/index.ts` exports |
| Interactions endpoint | `apps/gateway/src/interactions.ts`, `api/discord/interactions.ts` | Web-standard `Request → Response`, deployed as a Vercel function |
| Slash commands | `apps/gateway/src/commands.ts`, `scripts/register-commands.ts` | `pnpm --filter @vintage/gateway register-commands` |
| Role sync | `modules/identity/src/domain/role-sync.ts` (planner), `apps/api/src/discord-directory.ts`, `apps/api/convex/roleSync.ts`, `crons.ts` | Every 15 minutes; no-op until the bot is configured |
| Role → rank map | identity `roleRanks` table; commands `guild-roles-get` (leader) / `guild-roles-set` (officer, destructive) | Keyed by Discord role **id**, never name |

## Rules

- **Verify before parsing.** The endpoint checks `X-Signature-Ed25519` over timestamp + raw body
  first and answers 401 on failure. Discord probes with bad signatures and removes the URL if it
  ever accepts one. Never parse or route an unverified body.
- **Answer within 3 seconds.** Anything slower returns a deferred response (type 5, or 6 for
  component updates) and finishes through the interaction token (valid 15 minutes).
- **Commands, not logic, in the endpoint.** Interactions translate to guild-kit commands through
  the registry; the endpoint never holds business rules. (`/vintage ping` is the one local
  exception until the gateway calls Convex — see `TODO(#10)`.)
- **Least privilege for the bot.** It was invited with View Channels only. Add a permission only
  when a feature needs it, and say which in the PR. Never request Administrator.
- **Rate limits.** Use the discord-kit REST client (or the same pattern): honor `retry_after` on
  429, bounded retries, and never log the token.
- **Guards against self-harm.** Role sync refuses an empty member list when members are known
  (otherwise everyone would be marked departed); `guild-roles-set` refuses a map with no officer
  role (otherwise officers lock themselves out). Keep guards like these when changing either.

## Secrets and settings

- Env names: `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY` (not secret), `DISCORD_BOT_TOKEN` (secret),
  `DISCORD_GUILD_ID` (the Vintage server), `DISCORD_DEV_GUILD_ID` (the bot test server). Locally in `apps/api/.env.local` (gitignored); deployed in Convex and Vercel
  environment variables. Never commit values or echo the token in output.
- Portal settings (Public Bot, intents, install link) change who can install the bot: a human
  officer changes them, not an agent. The bot needs the **Server Members** intent for role sync.
- Read-only checks are fine: `GET /users/@me` (token valid), `GET /applications/@me`
  (`bot_public`, `verify_key`, intent flags), `GET /users/@me/guilds` (servers joined).

## Two servers

The bot lives in the **Vintage** server (View Channels only; role sync reads roles and members)
and a **test server** (broader permissions; register commands there with `DISCORD_DEV_GUILD_ID`
for instant updates). Try new commands, buttons, and embeds in the test server first. Never
point role sync at the test server: its roles don't match the guild's.

## Testing

Generate an Ed25519 keypair in the test with WebCrypto and sign real request bodies; use an
injected `fetch` for REST (429 and 5xx paths). Never call the real Discord API from tests.
