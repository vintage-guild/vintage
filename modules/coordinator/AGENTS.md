# coordinator module

The autonomous raid coordinator (PLAN §6, #16): on a 5-minute Convex cron it creates upcoming
raids, posts signup messages, reminds non-responders, sends the officer digest, locks signups,
and posts the final roster and addon import string. Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `CoordinatorConfig`, `CoordinatorAction`, command names |
| `src/domain/plan.ts` | Pure: `planTick(state, now)` → the actions due now, per raid and rule |
| `src/domain/render.ts` | Pure: Discord messages (signup post, reminder, DM, digest, final roster, import string, failure) |
| `src/tick.ts` | `runTick(ports)`: materialize → load → plan → claim → send → record |
| `src/store.ts` | `CoordinatorStore` (config + action log), `TickSource`, `TickPorts`, `CoordinatorDeps` |
| `src/commands/` | `coordinator-status|pause|resume|run|config-set|log` |
| `src/testing.ts` | Memory store, fake Discord, fake raids, state source |
| `convex/` | The `coordinator` component: `config` and `actions` tables |

## Rules

| Rule | When | Where |
|---|---|---|
| `post` | as soon as the raid exists | signup channel, with answer buttons |
| refresh | whenever the post's content changed (not logged) | edits the post |
| `remind-<h>h` | each reminder offset, before lock; only the latest due one is sent | signup channel, pings non-responders only |
| `dm-<h>h` | the last reminder offset, if `dmReminders`; skips members who opted out | DM |
| `digest` | the last reminder offset | ops channel |
| `lock` | `lockHours` before start | runs `roster-lock` |
| `final-roster`, `import-string` | after lock | signup channel, ops channel |

- **Claim before send.** Every action is claimed in the component (one transaction) before it
  touches Discord, keyed by (guild, raid, rule, target). Re-running a tick, or two ticks at once,
  never sends anything twice. Keep new rules on this path.
- **Deterministic triggers; AI only for wording** (PLAN §6.2). Timings come from the raids
  schedule (`leadDays`, `reminderHours`, `lockHours`); channels, expected ranks, and DMs from
  `coordinator-config-set`.
- **Non-responders** are members whose rank is in `expectedRanks` and who have no signup.
- **Failures** are logged as `failed`, reported to the ops channel once, and retried next tick.
  A member who doesn't accept DMs (Discord 50007) is logged as skipped.
- Raids work goes through raids **commands** with the system caller (`schedule-materialize`,
  `roster-lock`), never raids tables.
- Button clicks (`signup:<eventId>:<status>`) are handled by the gateway once it calls Convex (#10).
