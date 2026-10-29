# Production

How Vintage ships, how to undo a bad ship, and what to do when something breaks. Where each piece
lives (deployment names, Vercel projects, the domain) is in [SETUP.md → Deployments](../../SETUP.md#deployments).

## What runs where

| Piece | Runs on | Ships |
|---|---|---|
| `apps/api` (commands, components, crons, sign-in) | Convex `dusty-sardine-902` | `deploy-convex` CI job on push to `main`, after `ci-ok` |
| `apps/gateway` (Discord interactions) | Vercel `vintage-gateway` | Vercel, on push to `main` when its paths change |
| `apps/web` (website) | Vercel `vintage-web`, https://vintageguild.gg | Vercel, on push to `main` when its paths change |
| Slash commands | Discord | By hand: `scripts/register-commands.ts` (gateway README) |

## Deploys

Every merge to `main` ships. Vercel builds the website and gateway as soon as the push lands;
CI validates the commit with every lane, then `deploy-convex` pushes `apps/api` to production.
A running push to `main` is never cancelled; when several merges land quickly, the newest pending
run replaces older pending ones, and its deploy carries all of them.

**Set up once (maintainer), in this order:**

1. In GitHub → Settings → Environments, create `production`. Under Deployment branches and tags,
   choose **Selected branches and tags** and allow only `main`. Do this before adding the secret:
   the branch rule is what stops a workflow edited on another branch from reading it.
2. In the Convex dashboard, create a production deploy key for `dusty-sardine-902`.
3. Add it to the `production` environment as the secret `CONVEX_DEPLOY_KEY`. Make it an
   environment secret, never a repository secret: a repository secret reaches any branch's
   workflow. Required reviewers on the environment are optional extra protection.
4. Optional but recommended: in each Vercel project, turn on Deployment Checks and require
   `deploy-convex`, so the website and gateway are promoted only after Convex is deployed.

Until the secret exists, `deploy-convex` warns and skips; deploy by hand with
`npx convex deploy` in `apps/api` (agent sessions ask before running it).

**Keep every merge safe to ship in any order.** Vercel and Convex deploy separately, so for a few
minutes the website can be newer than the backend or the other way around:

- Add a Convex function before the website or gateway calls it, or make the caller tolerate its
  absence. Remove a function only after nothing calls it.
- New table fields start `v.optional(...)`. Make one required only after a migration backfills
  every existing row; Convex refuses a deploy whose schema existing rows don't match.
- A command change follows the manifest rules in AGENTS.md (`breaking-contract` label).
- After a slash command definition changes, register the commands again: test server first,
  then the Vintage server.

## Rollback

| Piece | How |
|---|---|
| Website or gateway | Vercel → the project → Deployments → an earlier production deployment → **Instant Rollback**. Takes effect in seconds; the next push to `main` replaces it. |
| Convex | Revert the PR (`git revert`, merged like any PR); CI deploys the reverted code. In a hurry: check out the last good commit and run `npx convex deploy` in `apps/api` by hand. A schema rollback works only if the data written since still matches the older schema. |
| Env change | `npx convex env set <NAME> <old value> --prod` (or Vercel → Settings → Environment Variables, then redeploy). Convex reads env at runtime: no deploy needed. |

## Backups

Convex keeps the data; Vintage keeps no copy of its own yet, and the Convex plan (which decides
scheduled backups) is still open (PLAN.md §8, Phase 0).

- **Before a risky deploy** (a migration, a component change, a schema tightening), export:
  `npx convex export --prod --path backups/<date>.zip` in `apps/api`. Keep the file off the repo
  (it holds member data) and somewhere only officers can read.
- **Restore** a table or the whole deployment from an export with `npx convex import --prod`
  (see `npx convex import --help`; `--replace` overwrites). Restoring is a maintainer decision.

## Watching it

- **Convex:** dashboard → Logs for function errors, Schedules for cron runs. Cron failures
  (coordinator tick, poll sweep, role sync) only throw into these logs today; nobody is notified.
  Routing them to the ops channel is still to do (PLAN.md Phase 1, coordinator).
- **Vercel:** each project's Logs for the gateway's interaction errors and 401s.
- **Discord:** Random answers in the test server. A slash command that times out usually means
  the gateway can't reach Convex: check `VINTAGE_CONVEX_SITE_URL` and `VINTAGE_GATEWAY_SECRET`.
- **Sign-in:** a hosted deployment missing `BETTER_AUTH_SECRET`, `SITE_URL`, `DISCORD_CLIENT_ID`,
  or `DISCORD_CLIENT_SECRET` refuses sign-in with an error naming them (`apps/api/src/auth-env.ts`)
  instead of falling back to defaults.

## Addon releases

A tag `addon-vX.Y.Z` runs `.github/workflows/release-addon.yml`, which packages `addon/Vintage`
and uploads it to CurseForge; running the workflow by hand from `main` is a dry run that keeps the
zip as a run artifact ([plan](../features/active/vintage-addon/vintage-addon.plan.md#release-25),
`addon/Vintage/AGENTS.md` "Releasing"). Not yet run.

**Set up once (maintainer), in this order (#25):**

1. Create the CurseForge project **Vintage** from the author account, for WoW: Forever.
2. Add its project id as `## X-Curse-Project-ID: <id>` in `addon/Vintage/Vintage.toc` (a PR).
   A tag release fails without it, since the packager would otherwise skip the upload and pass.
3. In GitHub → Settings → Environments, create `curseforge` (or open it, if a run already made
   it: GitHub creates a missing environment with no rules) and set Deployment branches and tags
   to only the branch `main` and tags matching `addon-v*`. Confirm the rule shows just those two.
4. In GitHub → Settings → Rules, add a tag ruleset for `addon-v*` that restricts creating,
   updating, and deleting those tags to the maintainer, with no bypass list. Required: a tag run
   uses the workflow file at the tagged commit, so anyone who could push an `addon-v*` tag on an
   edited workflow could read the token. Optional extra: a required reviewer on `curseforge`,
   which also stops an agent session that holds the maintainer's own credentials.
5. Create a CurseForge API token (author account → API tokens) and add it to the `curseforge`
   environment as the secret `CF_API_TOKEN`, never as a repository secret.
6. Run **Release addon** by hand on `main` and check the zip in the run's artifacts.
7. Date the version's `CHANGELOG.md` entry, merge, then tag `main`: `git tag addon-v0.1.0` and
   push the tag.

The workflow pins `BigWigsMods/packager` to a commit SHA, unlike `ci.yml`'s major tags, because
it receives the publish token; keep third-party actions that get a secret on SHA pins.

## Secrets

Names and what each does are in SETUP.md and the gateway README; values live only in the Convex
and Vercel env (and `.env.local` for local runs). In agent sessions, `.claude/settings.json` denies
the Read tool on `.env` files (except `.env.example`) under the session's folder and on
`~/.convex/`, and asks before any Convex CLI deploy, env, run, import, or export. That is a guard
rail, not a wall: a shell command or a file outside the session's folder can still reach them, so
keep the production bot token off machines that run agents where you can.

| Rotate | Effect | Where |
|---|---|---|
| `BETTER_AUTH_SECRET` | Signs everyone out | Convex |
| `VINTAGE_GATEWAY_SECRET` | Must change in both places at once; Discord buttons fail between the two edits | Convex and the gateway's Vercel env (Production only) |
| `DISCORD_BOT_TOKEN` | Reset in the Developer Portal, then update everywhere it's set | Convex, `apps/api/.env.local` |
| `VINTAGE_CONFIRM_SECRET` | Pending confirm tokens stop working (they expire in 5 minutes anyway) | Convex |
| `CONVEX_DEPLOY_KEY` | Create a new key, update the GitHub environment secret, revoke the old one | Convex dashboard, GitHub |
| `CF_API_TOKEN` | Create a new token, update the `curseforge` environment secret, revoke the old one | CurseForge, GitHub |

Rotate a secret as soon as it may have leaked: pasted into a chat or an issue, printed in a log,
or read by an agent session.
