# Progression

The guild's first kills, from a raid leader recording them to the ledger every member sees on
the home page (`docs/features/completed/home-page`, section 4). Automated in
`apps/api/tests/jtbd/progression.jtbd.test.ts`.

**Cast** (the same as the raid night): Ana (Officer), Rook (Raid Leader), Aeryn (Raider),
Pip (Member).

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`).
2. Run commands as the system caller (`npx convex run commands:runAsSystem '{…}'` in `apps/api`)
   until Discord sign-in (#7) lets real members run them. The website's dev fixtures
   (`pnpm --filter @vintage/web dev`) show the same ledger over the in-memory guild.
3. Kill times must be after the raids unlock (2026-12-09); before that, check the pre-launch state.

## Jobs

### J16 · Record a first kill and see the ledger fill
**When** we kill a boss for the first time, **I (raid leader) want** to record it with what
dropped, **so I can** have the guild's progression on the site without a screenshot.
- [ ] Before any kill, `progress-get` as a member shows the three raids with every slot empty,
  `open` true after Dec 9 (false before, when the home page says "unlocks Dec 9"), and no latest kill.
- [ ] `kill-record` (Barrow Deeps, Chillhowl, two drops) as the raid leader answers `first: true`.
  `progress-get` as a member now shows Chillhowl's first-kill time and loot, Elder Tangleclaw as
  the next target, 1 of 22 down, and Chillhowl as the latest kill. The home page's ledger shows a
  gold slot with the date and the "first kill" card with the loot in quality colors.
- [ ] A raider's `kill-record` is refused (`COMMAND_NOT_FOUND`); a member below recruit can still
  read `progress-get`; the public can't.
- [ ] Recording the same boss a week later answers `first: false` and leaves the ledger date alone.
- [ ] On the site, `/officers?tab=progress` as the raid leader: before Dec 9 the form is closed
  and says when kills can be recorded; after, recording Chillhowl with two drops answers "First
  kill of Chillhowl in Barrow Deeps. It's on the ledger." and the ledger beside the form fills.
  A raider doesn't get the quarters at all.
