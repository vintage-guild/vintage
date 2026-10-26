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
| `DISCORD_BOT_TOKEN` | Bot → Token | `scripts/register-commands.ts`, `scripts/set-bot-profile.ts` |
| `DISCORD_GUILD_ID` | Optional: a guild id | Register commands to one guild (instant) instead of globally |
| `VINTAGE_CONVEX_SITE_URL` | The Convex deployment's HTTP actions URL (`https://<name>.convex.site`) | Forwarding signup buttons and modals |
| `VINTAGE_GATEWAY_SECRET` | Any long random string; the same value in the Convex env | Authenticates the forward to Convex |

## Signup buttons

Clicks on the coordinator's signup posts (`signup:…`), the character picker (`signup-pick:…`) and
the reason form (`signup-note:…`) are verified here, then forwarded to Convex at
`POST /gateway/interaction` with `Authorization: Bearer $VINTAGE_GATEWAY_SECRET`. Convex runs the
flow (`apps/api/src/discord-signups.ts`) and returns the response this endpoint sends back to
Discord. Without the two variables, members get a private "not set up yet" reply.

## Build and deploy

Vercel builds each TypeScript function file on its own, which can't resolve our workspace packages
at runtime. So the project builds itself with the [Build Output API](https://vercel.com/docs/build-output-api):
`pnpm run build:vercel` (`scripts/build-vercel.mjs`) bundles `src/vercel.ts` with esbuild into one
module under `.vercel/output`, routing `/discord/interactions` to it. `vercel.json` sets that as the
build command; the Vercel project's root directory is `apps/gateway`.

Deployed as Vercel project `vintage-gateway` (team "Jason Falk's projects"):
`https://vintage-gateway.vercel.app/discord/interactions`. Deploy from the repo root (linked with
`vercel link --project vintage-gateway`):

```bash
npx vercel deploy --prod
```

## Register slash commands

```bash
pnpm --filter @vintage/gateway register-commands
```

## Bot name and avatar

The bot is **Random**, the raven the site calls Random Raven in its News section. Its avatar is the
animated head crop in `assets/brand/random-avatar.gif`. The application in the Developer Portal is
named Random too, with the raven as its icon (set by hand in General Information). The names are
display only: commands stay `/vintage`, and the app id, token, and OAuth client are unchanged. To
change the bot's name or avatar:

```bash
node --env-file=../api/.env.local --import tsx scripts/set-bot-profile.ts --username Random --avatar ../../assets/brand/random-avatar.gif
```

Run it from `apps/gateway`. Discord takes PNG, JPEG, or GIF, not WebP, so export other art to one
of those first (an image editor, a browser canvas, or Windows' imaging codecs). Discord allows about two username
changes an hour, and `--username ""` leaves the name alone. With `DISCORD_GUILD_ID` set, the script
also reports the bot's nickname in that server, because a nickname overrides the username there.
