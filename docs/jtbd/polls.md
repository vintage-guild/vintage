# Polls

Asking the guild a question in Discord and getting an answer everyone can see
([polls plan](../features/active/polls/polls.plan.md)). Automated in
`apps/api/tests/jtbd/polls.jtbd.test.ts`.

**Cast** (the same as the raid night): Rook (Raid Leader), Aeryn and Bram (Raiders), Pip (Member).

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`) with
   `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `VINTAGE_GATEWAY_SECRET` set, and the gateway points
   at it (`VINTAGE_CONVEX_SITE_URL`).
2. `/random poll` is registered in the test server
   (`pnpm --filter @vintage/gateway register-commands` with `DISCORD_DEV_GUILD_ID`).
3. Use the test server's channels; never the Vintage server.

## Jobs

### J17 · Ask the raid a question and see the answer on the post
**When** the raid has to decide something, **I (raider) want** to post a poll and have people
answer with one click, **so I can** see the answer without counting replies.
- [ ] `/random poll create` as a raider answers privately, and the poll goes up in the same
  channel with one button per option (a menu past five, or for pick-any).
- [ ] A raider's click answers privately ("You voted for …") and the post's counts move within
  seconds. Clicking another option changes the vote; nobody has two.
- [ ] A Member (below Raider) gets a private "no such poll" and the counts don't move.
- [ ] With results "when it closes", the post shows the options and how many voted, but no counts.
  An anonymous poll never names a voter anywhere.
- [ ] Close poll shows the creator a private preview of the result and a Close it button; confirming
  marks the winner on the post and removes the buttons. A late click is refused.
- [ ] Someone who didn't create the poll and doesn't lead raids can't close it.

### J18 · Pick the raid night by vote
**When** a one-off raid could go on a few nights, **I (raid leader) want** the raid to vote and
the winner to become the raid, **so I can** skip counting replies and copying dates.
- [ ] `raid-night-poll` (raid leader) posts a poll of the start times in the signup channel, each
  labelled in New York time, with every reader's local time in the description. A raider can't
  start one.
- [ ] Raiders vote from the post. Once the poll closes, the next tick creates the raid at the
  winning time and posts its signup message; another tick never makes a second raid.
- [ ] A tie, a missed quorum, or no votes creates nothing and tells the ops channel why, with
  what to do next.

### J22 · See the guild's polls and their results on the site
**When** I'm signed in, **I (raider) want** to vote and see results on the website too, **so I
can** answer from wherever I am, and **I (officer) want** every closed result in one place.
- [ ] As a raider, `/polls` lists the open polls I may vote on and recently closed ones. Voting
  there is the same ballot as in Discord. Ranked polls are voted here.
- [ ] A poll with results "when it closes" shows no counts until it closes; an officers-only
  result never shows to a raider, and an officers-only poll doesn't appear for a raid leader.
- [ ] As an officer, the quarters' Polls tab shows open polls with the live tally and every
  closed poll with its result, and closes or cancels only after a preview and a confirm.
- [ ] A visitor gets the sign-in card, and the home page says polls are for members.

### J43 · Vote from the website
**When** I'm on the site anyway, **I (raider) want** to answer the open poll from the home page,
and rank a ranked poll on its own page, **so I can** vote without opening Discord and know it
counts the same.
- [ ] Signed in as a raider, the home page's poll card shows the first open poll with its live
  tally. A click on an option votes (`vote-cast`): the card marks my choice and the counts move.
- [ ] It is the same ballot as Discord: a vote on the post's buttons shows as mine on the card,
  and the post's "voted" count includes my site vote once it refreshes.
- [ ] Clicking another option changes my vote; "Take back my vote" (`vote-retract`) removes it,
  and the card shows no choice.
- [ ] A ranked poll's post has a "Rank on the website" link to `/polls/<id>`. There I click
  options in order, see the order numbered, and vote; reloading shows my ranking in that order.
  While it's open the card shows first preferences.
- [ ] Once a ranked poll closes, `/polls/<id>` shows the winner after the runoff (a second choice
  can carry it) and takes no more votes.
- [ ] A Member (below the poll's audience) sees no poll card on the home page.
