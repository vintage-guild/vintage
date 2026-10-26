# Polls

Asking the guild a question in Discord and getting an answer everyone can see
([polls plan](../features/active/polls/polls.plan.md)). Automated in
`apps/api/tests/jtbd/polls.jtbd.test.ts`.

**Cast** (the same as the raid night): Rook (Raid Leader), Aeryn and Bram (Raiders), Pip (Member).

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`) with
   `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `VINTAGE_GATEWAY_SECRET` set, and the gateway points
   at it (`VINTAGE_CONVEX_SITE_URL`).
2. `/vintage poll` is registered in the test server
   (`pnpm --filter @vintage/gateway register-commands` with `DISCORD_DEV_GUILD_ID`).
3. Use the test server's channels; never the Vintage server.

## Jobs

### J17 · Ask the raid a question and see the answer on the post
**When** the raid has to decide something, **I (raider) want** to post a poll and have people
answer with one click, **so I can** see the answer without counting replies.
- [ ] `/vintage poll create` as a raider answers privately, and the poll goes up in the same
  channel with one button per option (a menu past five, or for pick-any).
- [ ] A raider's click answers privately ("You voted for …") and the post's counts move within
  seconds. Clicking another option changes the vote; nobody has two.
- [ ] A Member (below Raider) gets a private "no such poll" and the counts don't move.
- [ ] With results "when it closes", the post shows the options and how many voted, but no counts.
  An anonymous poll never names a voter anywhere.
- [ ] Close poll shows the creator a private preview of the result and a Close it button; confirming
  marks the winner on the post and removes the buttons. A late click is refused.
- [ ] Someone who didn't create the poll and doesn't lead raids can't close it.
