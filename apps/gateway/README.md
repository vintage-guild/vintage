# @vintage/gateway

Vercel functions for the public HTTP surfaces in front of Convex (PLAN §3.1). Today:
`POST /api/discord/interactions` (also reachable as `/discord/interactions`).

## Environment

Set these in Vercel (and in `.env.local` for local runs). Never commit real values. All come from
the Discord Developer Portal → your application.

| Variable | Where | Used by |
|---|---|---|
| `DISCORD_PUBLIC_KEY` | General Information → Public Key (hex) | Interactions endpoint (signature check) |
| `DISCORD_APP_ID` | General Information → Application ID | `scripts/register-commands.ts` |
| `DISCORD_BOT_TOKEN` | Bot → Token | `scripts/register-commands.ts` only |
| `DISCORD_GUILD_ID` | Optional: a guild id | Register commands to one guild (instant) instead of globally |

## Register slash commands

```bash
pnpm --filter @vintage/gateway register-commands
```
