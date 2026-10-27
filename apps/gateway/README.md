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
| `VINTAGE_CONVEX_SITE_URL` | The Convex deployment's HTTP actions URL (`https://<name>.convex.site`) | Forwarding signup buttons and modals; the issuer in /mcp's sign-in metadata (`<that origin>/api/auth`) |
| `VINTAGE_MCP_URL` | Optional: the /mcp URL, if not `https://vintage-gateway.vercel.app/mcp` | The protected-resource metadata and /mcp's 401 challenge |
| `VINTAGE_GATEWAY_SECRET` | Any long random string; the same value in the Convex env | Authenticates the forward to Convex |

## MCP sign-in metadata

`/.well-known/oauth-protected-resource` (and `/.well-known/oauth-protected-resource/mcp`) answers
RFC 9728 metadata that names /mcp as the resource and Better Auth on Convex as its authorization
server (`src/mcp-metadata.ts`). It needs no Discord settings. /mcp itself (AFD's stateless handler,
#9) will answer an unauthenticated request with `mcpChallenge()`, a 401 whose `WWW-Authenticate`
header points there, so MCP clients find the sign-in flow.

## Signup buttons

Clicks on the coordinator's signup posts (`signup:…`), the character picker (`signup-pick:…`), the
reason form (`signup-note:…`) and the reply's Switch character and Change spec menus
(`signup-char:…`, `signup-spec:…`) are verified here, then forwarded to Convex at
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
`https://vintage-gateway.vercel.app/discord/interactions`. Production deploys on every push to
`main`. To deploy by hand, run this from the repo root (linked with
`vercel link --project vintage-gateway`):

```bash
npx --yes vercel deploy --prod --archive=tgz
```

`--archive=tgz` uploads the source as one archive. Without it the CLI sends every file in the repo
root separately, and Vercel refuses more than 15,000: on 2026-10-26 the upload was 15,799 files.
`--yes` lets npx install the CLI without asking. Its "failed to fetch dist-tags from npm" warning is
the CLI's own update check hitting a blocked registry; it doesn't affect the deploy.

Deployment Protection (Vercel Authentication) covers preview deploys only. To check that the
production URL reaches our endpoint and not Vercel's login, send an unsigned request: the answer
should be `401` with `{"error":"invalid request signature"}`.

## Register slash commands

```bash
pnpm --filter @vintage/gateway register-commands
```

The script reads `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, and optionally `DISCORD_GUILD_ID` from the
environment. It upserts each command by name and leaves others alone. After renaming or removing a
command, add `--prune` to delete what the code no longer defines, in the same scope (the guild, or
global). From `apps/gateway`, with the token from `apps/api/.env.local`:

```bash
DISCORD_GUILD_ID=<server id> node --env-file=../api/.env.local --import tsx scripts/register-commands.ts --prune
```

### Help pages follow the definitions

`/random help` and each group's `help` subcommand are forwarded to Convex, which builds the page
from `RANDOM_COMMAND` (exported as `@vintage/gateway/commands`) and the examples in
`apps/api/src/help-topics.ts`. When you add or change a subcommand, add it to a topic there with an
example: `apps/api/tests/help.test.ts` fails until you do, and when an example no longer fits the
options. A new subcommand group also needs its own `help` subcommand (`GROUP_HELP`), and a new
topic needs a choice on `/random help`.

## Bot name and avatar

The bot is **Random**, the raven the site calls Random Raven in its News section. Its avatar is the
animated head crop in `assets/brand/random-avatar.gif`. The application in the Developer Portal is
named Random too, with the raven as its icon (set by hand in General Information), and the slash
command is `/random` (it was `/vintage` until 2026-10-26). The app id, token, and OAuth client are
unchanged. To change the bot's name or avatar:

```bash
node --env-file=../api/.env.local --import tsx scripts/set-bot-profile.ts --username Random --avatar ../../assets/brand/random-avatar.gif
```

Run it from `apps/gateway`. Discord takes PNG, JPEG, or GIF, not WebP, so export other art to one
of those first (an image editor, a browser canvas, or Windows' imaging codecs). Discord allows about two username
changes an hour, and `--username ""` leaves the name alone. With `DISCORD_GUILD_ID` set, the script
also reports the bot's nickname in that server, because a nickname overrides the username there.
