---
name: vintage-discord
description: Work on anything Discord in Vintage — libs/discord-kit (signature verification, responses, embeds, components, timestamps, REST client), the apps/gateway interactions endpoint, slash-command registration, the bot's settings and permissions (the app and bot are named Random), and role sync. Load before touching Discord code or the bot.
---

# Discord in Vintage

Discord is identity (ranks come from roles) and a surface (signups, reminders, `/random`
commands). Everything runs serverless: no always-on gateway process.

## Where things are

| Piece | Path | Notes |
|---|---|---|
| Toolkit | `libs/discord-kit` | Pure lib: no `node:` imports, Web APIs only. Read its `src/index.ts` exports |
| Interactions endpoint | `apps/gateway/src/interactions.ts`, `api/discord/interactions.ts` | Web-standard `Request → Response`, deployed as a Vercel function |
| Slash commands | `apps/gateway/src/commands.ts`, `scripts/register-commands.ts` | `pnpm --filter @vintage/gateway register-commands` |
| Bot name and avatar | `apps/gateway/scripts/set-bot-profile.ts`, `assets/brand/random-avatar.gif` | The app and bot are **Random** (animated raven avatar; app icon set in the Portal); the slash command is `/random` (it was `/vintage` until 2026-10-26). PNG/JPEG/GIF only, about 2 renames an hour. See the gateway README |
| Role sync | `modules/identity/src/domain/role-sync.ts` (planner), `apps/api/src/discord-directory.ts`, `apps/api/convex/roleSync.ts`, `crons.ts` | Every 15 minutes; no-op until the bot is configured |
| Role → rank map | identity `roleRanks` table; commands `guild-roles-get` (leader) / `guild-roles-set` (officer, destructive) | Keyed by Discord role **id**, never name |

## Rules

- **Verify before parsing.** The endpoint checks `X-Signature-Ed25519` over timestamp + raw body
  first and answers 401 on failure. Discord probes with bad signatures and removes the URL if it
  ever accepts one. Never parse or route an unverified body.
- **Answer within 3 seconds.** Anything slower returns a deferred response (type 5, or 6 for
  component updates) and finishes through the interaction token (valid 15 minutes).
- **Commands, not logic, in the endpoint.** Interactions translate to guild-kit commands through
  the registry; the endpoint never holds business rules. `/random ping` answers locally; buttons,
  modals, and the subcommand groups in `FORWARDED_GROUPS` (`/random poll`, `/random raid`, `/random ask`) go to
  Convex, where `src/discord-signups.ts`, `discord-polls.ts`, `discord-raids.ts`, and
  `discord-agent.ts` run them (shared helpers in `discord-common.ts`). Re-register after changing commands.
  A `/random` subcommand or click that the gateway or Convex doesn't know yet (registered before
  both deploys landed) gets a private "can't do that yet", never a timeout.
- **Least privilege for the bot.** It's invited with View Channels, Send Messages, Embed Links,
  Read Message History, Add Reactions, and Mention Everyone (permissions integer `216128`). Add a
  permission only when a feature needs it, and say which in the PR. Never request Administrator
  or Manage Roles.
- **Bootstrap the role map as the system caller.** The first `guild-roles-set` runs through
  `commands:runAsSystem` (internal; needs deployment access), preview then confirm. SETUP.md
  "First role map" has the steps.
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
- **Signup buttons:** the gateway verifies, then forwards components and modals to Convex
  (`convex/http.ts` → `convex/discord.ts` → `src/discord-signups.ts`) with `VINTAGE_GATEWAY_SECRET`.
  Custom ids: `signup:<event>:<status>`, `signup-pick:<event>:<status>`,
  `signup-note:<event>:<status>:<character>`. Replies are ephemeral; never edit the public post
  from an interaction (the coordinator tick does that).
- **App emoji:** class, spec, and role icons are the app's own emoji (work in any server,
  no slots). `scripts/discord-emojis.json` lists them (WoW icon names, or `file:` for our own art);
  `node --env-file=apps/api/.env.local scripts/discord-emojis.mjs` uploads missing ones and
  regenerates `modules/coordinator/src/domain/emoji-ids.ts`. Blizzard's icons are never committed.
- **Raid cards are embeds** (three role columns; Components V2 has no columns). V2 builders exist
  in discord-kit (`layout.ts`) for messages that don't need columns.
- **Embed text quirks:** custom emoji render in field names (the column headers' role icons);
  `-# ` subtext works in descriptions; repeated spaces collapse, so space inline items with an em
  space (U+2003); a zero-width space (U+200B) makes an empty line or an empty field name. Biome
  rewrites `' '` escapes into invisible literals, so build them with `String.fromCharCode`.
- **Preview a layout before shipping it:** post a throwaway embed to the ops channel with the bot
  token (`node --env-file=apps/api/.env.local`), screenshot it, then delete it.
- **Our own emoji art:** `scripts/build-emoji-art.mjs` renders Tabler outline icons (MIT) and class
  squares into `assets/emoji/`; list new ones in `scripts/discord-emojis.json` as `file:` entries.
- **The app is public** (decided 2026-10-25, so the GM can add it). Anyone can add it to their
  own server, so the bot must only act for the configured guild: role sync reads
  `DISCORD_GUILD_ID`, the coordinator posts only to configured channels, and the gateway must
  ignore interactions from any other guild (#10).
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
