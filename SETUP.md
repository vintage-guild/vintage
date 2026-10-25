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

The bot's settings live in the Discord Developer Portal under the **Vintage** application. To run
Discord code locally, put these in `apps/api/.env.local` (gitignored; never commit them):

```
DISCORD_APP_ID=        # General Information → Application ID (not secret)
DISCORD_PUBLIC_KEY=    # General Information → Public Key (not secret)
DISCORD_BOT_TOKEN=     # Bot → Reset Token (secret; ask an officer, never share in chat)
DISCORD_GUILD_ID=      # the Vintage server id (real roles and members; role sync)
DISCORD_DEV_GUILD_ID=  # the bot test server (register commands instantly, experiment safely)
```

The bot is in two servers: the **Vintage** server with minimal permissions (View Channels) for
role sync, and a **test server** for trying commands, buttons, and embeds without the guild seeing
half-built messages.

The role-sync cron does nothing until `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` are set in the
Convex environment. See the `vintage-discord` skill for how the pieces fit.

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
