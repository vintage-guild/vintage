---
name: vintage-jtbd
description: Run or extend Vintage's jobs-to-be-done suite, the long-standing end-to-end checks in docs/jtbd. Covers adding a job (doc + automated scenario test in apps/api/tests/jtbd), the in-memory JTBD host, and a live run against the local backend and the Discord test server with AFD commands and computer use. Load when a feature changes what a member can do, before a release, or when asked to validate end to end.
---

# Jobs to be done

The suite lives in [docs/jtbd](../../../docs/jtbd/README.md). Read its rules first.

## Add or change a job

1. Write the job in the suite doc (`docs/jtbd/<suite>.md`): an id (`J12`), "When … I want … so
   I can …", and a live checklist a person could follow.
2. Add the scenario to `apps/api/tests/jtbd/<suite>.jtbd.test.ts` with the same id in the test
   name. Use `createHost()` from `tests/jtbd/host.ts`:
   - `discordMember(id, name, [roleIds])` joins a member through `member-sync` (tiers come from
     `ROLES`); `as(discordId)` resolves their caller like the website will.
   - `run` / `ok` call commands (destructive ones preview, then confirm); `tick()` runs the real
     coordinator tick; `clock.advance()` moves time.
   - `sentTo(channel)`, `editsTo(channel)`, and `discord.sent` are what the bot posted.
3. Drive only through commands and ticks; assert what a member would see.
4. Make the test fail once on purpose (break the behavior) before trusting it.
5. Update the suite table in `docs/jtbd/README.md`.

## Live run

1. Follow the suite doc's **Live setup**: the local backend running and pointed at the Discord
   test server. Never the real guild server without an officer's OK.
2. For each job, run the commands (`npx convex run commands:runAsSystem …` in `apps/api` until
   sign-in exists) and check Discord with computer use, with a screenshot per check.
3. Record `docs/jtbd/runs/YYYY-MM-DD.md`: commit, environment, and per job ✅/❌ with a one-line
   note. File an issue for each ❌.
4. Clean up afterwards (`raid-cancel` test raids) so the test server's channels stay readable.

Never paste tokens, real members' DMs, or other private data into a run log.
