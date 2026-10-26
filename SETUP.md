# Setup

First-time setup for contributors. Agents entering an already set-up checkout should read
[INIT.md](INIT.md) instead.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (see `.nvmrc`) | `nvm use` / `fnm use` picks it up |
| pnpm | 10 (see `packageManager` in `package.json`) | `corepack enable` installs the right version |
| uv | 0.10+ | Only for the botcore repo tooling in `tooling/botcore` |
| Git | any recent | Your commit email must be a verified email on your GitHub account |

## Clone and install

```bash
git clone https://github.com/vintage-guild/vintage.git
cd vintage
pnpm install          # also installs the lefthook git hooks
pnpm validate:final   # lint, boundaries, docs, manifest, types, tests
```

## Git identity and sign-off

Every commit must be signed off; that's how you accept the
[contributor agreement](CONTRIBUTOR_AGREEMENT.md).

```bash
git config user.email you@example.com   # a verified email on your GitHub account
git commit -s -m "feat(identity): add character-update"
```

Use an email that's verified on your GitHub account, or your commits won't link to your
profile. If an AI agent helped, add an `Assisted-by: <model>` trailer, never `Co-authored-by`.

Forgot to sign off? `git rebase --signoff origin/main`, then `git push --force-with-lease` on
your branch.

## Hooks

lefthook runs automatically:

- **pre-commit:** Biome on staged files (auto-fix), boundary check when packages change
- **commit-msg:** commitlint (Conventional Commits, allowed scopes, sign-off)
- **pre-push:** `pnpm validate:final`

## Claude Code cloud sessions

To run agents on claude.ai/code instead of your machine, set up a cloud environment once with
[docs/operations/cloud-sessions.md](docs/operations/cloud-sessions.md). The repo's SessionStart
hook does the rest in each session.

## Convex locally (no account needed)

```bash
pnpm --filter @vintage/api dev:local
cd apps/api
npx convex env set VINTAGE_CONFIRM_SECRET local-dev-secret
npx convex run commands:read '{"name":"member-list","input":{}}'
```

`dev:local` starts an anonymous local Convex backend, pushes functions, and regenerates
`convex/_generated` (commit those changes). Use `dev:local:watch` to keep it running.

## Discord (only if you work on the bot)

The bot's settings live in the Discord Developer Portal under the **Random** application (renamed
from Vintage on 2026-10-26; the bot is Random the raven, and commands stay `/vintage`). To run
Discord code locally, put these in `apps/api/.env.local` (gitignored; never commit them):

```
DISCORD_APP_ID=        # General Information → Application ID (not secret)
DISCORD_PUBLIC_KEY=    # General Information → Public Key (not secret)
DISCORD_BOT_TOKEN=     # Bot → Reset Token (secret; ask an officer, never share in chat)
DISCORD_GUILD_ID=      # the Vintage server id (real roles and members; role sync)
DISCORD_DEV_GUILD_ID=  # the bot test server (register commands instantly, experiment safely)
```

The bot is invited with `bot` + `applications.commands` and only these permissions: View Channels,
Send Messages, Embed Links, Read Message History, Add Reactions, and Mention Everyone (so the
coordinator can ping a rank role that isn't mentionable). It needs the **Server Members** intent
(Bot page in the portal) to list members for role sync. It belongs in two servers: the **Vintage**
server, and a **test server** for trying commands, buttons, and embeds without the guild seeing
half-built messages. Until the Vintage server is ready, the test server stands in for both.

The role-sync cron does nothing until `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` are set in the
Convex environment (`npx convex env set …` in `apps/api`). See the `vintage-discord` skill for
how the pieces fit.

### Deployments

| What | Where | Deploy |
|---|---|---|
| Convex production | project `jason-falk/vintage`, deployment `dusty-sardine-902` (`https://dusty-sardine-902.convex.cloud`, HTTP routes on `.convex.site`) | `npx convex deploy` in `apps/api` |
| Convex dev | `cautious-ant-152` (what `npx convex dev` in `apps/api` pushes to) | `npx convex dev` |
| Gateway | Vercel project `vintage-gateway` (root directory `apps/gateway`), `https://vintage-gateway.vercel.app` | Automatic: production on every push to `main`, a preview per PR. By hand: `npx vercel deploy --prod` from the repo root |
| Website | Vercel project `vintage-web` (root directory `apps/web`, Node 24, `apps/web/vercel.json`), `https://vintageguild.gg` (also `https://vintage-web-pi.vercel.app`) | Automatic: production on every push to `main`, a preview per PR. By hand, from the repo root: `VERCEL_ORG_ID=team_XXxAohn4xk9zQOEGH6WsJUSs VERCEL_PROJECT_ID=prj_OTILApEA5n4u7RnslTNgppvt26Zp npx vercel deploy --prod` (the ids pick the website project; without them the root's link deploys the gateway) |

Both Vercel projects are connected to `vintage-guild/vintage` through Vercel's GitHub app
(installed on the org, `vintage` only). Each builds only when a push changes its root directory
or a workspace package it depends on ("affected projects" is on), so a website change doesn't
redeploy the gateway. The website talks to Convex production and signs in through it, so its
origin must be production's `SITE_URL` or in `VINTAGE_TRUSTED_ORIGINS` (see Website sign-in).
PR previews get their own `*.vercel.app` addresses, which aren't trusted, so sign-in works only
on https://vintageguild.gg, https://vintage-web-pi.vercel.app, and http://localhost:5173.

The domain `vintageguild.gg` is registered at Porkbun (Bloodfen's account). Its DNS is two A records on the
bare domain (`216.150.1.1`, `216.150.16.1`) and a `www` CNAME to
`384cab4ceb2a9d79.vercel-dns-016.com`, the values Vercel gave for the `vintage-web` project; `www`
redirects to the bare domain (308) in Vercel. It is production's `SITE_URL`, and the `vercel.app`
address is in `VINTAGE_TRUSTED_ORIGINS`, so sign-in works on both; `www` never serves the app,
so it isn't trusted.

Production runs the role-sync and coordinator crons; dev has no Discord env, so its crons do
nothing. Run `npx convex env list --prod` (in `apps/api`) to see which variables production has.
The local anonymous backend (`dev:local`) is still there for offline work.

### Signup buttons (gateway → Convex)

The buttons on signup posts need the gateway deployed (Vercel) and pointed at Convex:

1. Pick a long random secret. Set `VINTAGE_GATEWAY_SECRET` to it in the Convex env
   (`npx convex env set …` in `apps/api`) and in Vercel.
2. In Vercel also set `VINTAGE_CONVEX_SITE_URL` (the deployment's `https://<name>.convex.site`)
   and `DISCORD_PUBLIC_KEY`.
3. In the Developer Portal → General Information, set **Interactions Endpoint URL** to
   `https://<gateway>/discord/interactions` and save. Discord checks it with a signed PING.

Clicks from any server other than `DISCORD_GUILD_ID` get a private refusal.

### Polls in Discord

`/vintage poll create` uses the same gateway → Convex path, and the bot posts and edits poll
messages with `DISCORD_BOT_TOKEN` (no new permissions). After changing `apps/gateway/src/commands.ts`,
register the commands again (`pnpm --filter @vintage/gateway register-commands`). Optional:
set `VINTAGE_SITE_URL` in the Convex env so ranked polls link to the website (once #63 adds the page).

### Website sign-in (Discord)

Members sign in to the website with Discord only (#7). Better Auth runs inside Convex
(`apps/api/convex/auth.ts`); the website uses `@vintage/web-session`. To turn it on:

1. Developer Portal → OAuth2 → **Redirects**: add
   `https://<deployment>.convex.site/api/auth/callback/discord` (production is
   `https://dusty-sardine-902.convex.site/api/auth/callback/discord`).
2. In the Convex env (`npx convex env set … --prod` in `apps/api`), set `DISCORD_CLIENT_ID` and
   `DISCORD_CLIENT_SECRET` (OAuth2 page), `BETTER_AUTH_SECRET` (a long random string), and
   `SITE_URL` (the website origin; `http://localhost:5173` for local work). More origins, like
   preview deploys, go in `VINTAGE_TRUSTED_ORIGINS`, comma-separated. Production has
   `SITE_URL=https://vintageguild.gg` (Better Auth's primary site and default return target) and
   `VINTAGE_TRUSTED_ORIGINS=https://vintage-web-pi.vercel.app,http://localhost:5173`, so local sign-in
   works against production too.
3. Deploy (`npx convex deploy`).

Sign-in asks Discord only for `identify`; rank and tier come from the bot's view of the server,
synced the moment someone signs in (and every 15 minutes after). Someone not in the server can
sign in but stays public. The variables, all in the Convex env and never in the repo:

| Variable | What |
|---|---|
| `BETTER_AUTH_SECRET` | Signs sessions; rotating it signs everyone out |
| `DISCORD_CLIENT_ID` | OAuth2 → Client ID (not secret) |
| `DISCORD_CLIENT_SECRET` | OAuth2 → Client Secret |
| `SITE_URL` | The website origin sign-in returns to |
| `VINTAGE_TRUSTED_ORIGINS` | Optional: more website origins, comma-separated |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | Already set for role sync; sign-in reads the member with them |

### Coordinator (raid posts and reminders)

The coordinator cron (every 5 minutes) does nothing until it knows where to post. Point it at
the channels once, as an officer or the system caller:

```bash
npx convex run commands:runAsSystem '{"name":"coordinator-config-set","input":{"signupChannelId":"<#raid-signups id>","opsChannelId":"<#vintage-ops id>"}}'
npx convex run coordinator:tick   # run one tick now instead of waiting
```

`coordinator-pause` / `coordinator-resume` stop and restart it; `coordinator-status` shows what
it did and what is due. DMs to non-responders are on by default (`dmReminders`).

### First role map (bootstrap)

`guild-roles-set` needs an officer, and nobody is an officer until the map exists. Someone with
deployment access runs it once as the system caller, preview first, then with the returned token:

```bash
cd apps/api
npx convex run commands:runAsSystem '{"name":"guild-roles-set","input":{"roles":{"<officer role id>":"officer","<raider role id>":"raider"}}}'
npx convex run commands:runAsSystem '{"name":"guild-roles-set","input":{"roles":{…same…}},"confirmToken":"<token>"}'
npx convex run roleSync:syncAllMembers
```

Role ids come from `GET /guilds/{id}/roles` with the bot token. After this, officers manage the
map with `guild-roles-set` like any other command.

## Design tokens

Token sources live in `libs/design-tokens/nodes/`. After changing one, run `pnpm tokens:build` and
commit the regenerated `generated/` files with it; a test fails if they're stale.

## Repo tooling (botcore)

```bash
uv run --directory tooling/botcore vintagebot module-new raids --maturity core
uv run --directory tooling/botcore vintagebot repo-check
```

## WoW addon (Phase 1+)

The addon lives in `addon/Vintage` and follows the Weekly addon layout. To develop against the
game, link it into your client's AddOns folder, for example on Windows:

```powershell
New-Item -ItemType Junction -Path "C:\Program Files (x86)\World of Warcraft\_forever_\Interface\AddOns\Vintage" -Target "<repo>\addon\Vintage"
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR_PNPM_OUTDATED_LOCKFILE` in CI | Run `pnpm install` and commit `pnpm-lock.yaml` |
| commitlint: `signed-off-by` | Commit with `-s` |
| Convex warns about different filesystems (Windows) | Use `pnpm --filter @vintage/api dev:local`, which sets `CONVEX_TMPDIR` for you |
| `uv` fails downloading from PyPI (TLS handshake errors) | A network or proxy issue; retry, try `UV_NATIVE_TLS=1`, or rely on the `botcore` CI lane |
| `commands.manifest.json is stale` | `pnpm manifest:write` and commit it |
