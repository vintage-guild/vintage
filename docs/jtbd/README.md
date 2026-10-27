# Jobs to be done

The long-standing end-to-end checks for Vintage. Each **job** is something a guild member needs
to get done, written as "When …, I want …, so I can …". Jobs are checked two ways:

| Layer | What runs | Where | When |
|---|---|---|---|
| **Automated** | The job as a scenario test: real command registry, real tiers from Discord roles, real coordinator tick, memory stores, fake Discord | `apps/api/tests/jtbd/*.jtbd.test.ts` | Every PR (`pnpm test:run`, CI) |
| **Live** | The job's checklist against the local Convex backend and the Discord test server, driven through AFD commands and computer use | The suite docs below, run by an agent with the `vintage-jtbd` skill | Before a release, after a big change, or on request; results go in `runs/` |

Job ids (`J01`…) are shared: the doc, the test name, and the live run all use the same id.

## Suites

| Suite | Jobs | Automated | Live |
|---|---|---|---|
| [Raid night](raid-night.md) | J01–J15, J24, J28, J31, J32 | ✅ `raid-night.jtbd.test.ts` | ✅ checklist |
| [Progression](progression.md) | J16 | ✅ `progression.jtbd.test.ts` | ✅ checklist |
| [Polls](polls.md) | J17, J18, J22 | ✅ `polls.jtbd.test.ts` | ✅ checklist (J17 partly run live on 2026-10-26) |
| [Recruiting and the public site](recruiting.md) | J21, J23, J28, J29 | ✅ `recruiting.jtbd.test.ts` | ✅ checklist |
| [Guild agent](agent.md) | J25–J27, J30, J31, J33 | ✅ `agent.jtbd.test.ts` (the OpenAI turn stood in for) | ✅ J25, J26, J30 run 2026-10-26; J33 run 2026-10-27 |

## Rules

- **A feature isn't done until its job is here.** New behavior a member relies on gets a job
  (or extends one) in the same PR, in both layers.
- **Drive jobs only through commands** (and coordinator ticks), the way people and agents will.
  No reaching into stores to set things up, except what Discord itself would do (role changes).
- **Assert what the member sees:** the Discord message, the command result. Not internals.
- **A failing job blocks the merge.** Fix the code, or change the job with a reason in the PR.
- Live runs record date, commit, environment, and pass/fail per job in `runs/YYYY-MM-DD.md`.
  Never paste tokens or private data into a run log.
