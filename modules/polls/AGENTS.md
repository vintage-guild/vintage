# polls module

Guild polls and their ballots, shared by every surface: a vote from a Discord button and a
vote from the website are the same `vote-cast` command on the same poll. Design:
[polls.plan.md](../../docs/features/active/polls/polls.plan.md). Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`Poll`, `Vote`, `PollResults`, `PollPost`), command names, events. The only import other modules may use |
| `src/domain/tally.ts` | Pure: poll + votes → `PollResults` for `single`, `multi`, and `ranked` (instant-runoff) |
| `src/store.ts` | `PollsStore` port, `PollsMembers` (what polls reads from identity), `PollsEventSink`, `PollsDeps`, `command` |
| `src/commands/` | `poll-*` and `vote-*` (#60); empty until then |
| `src/testing.ts` | Memory store, members, and a recording event sink, same behavior as the component |
| `convex/` | The `polls` Convex component (#61) |

## Rules

- **Polls knows no other feature.** It imports only identity's contract and guild-kit. A
  feature that wants a poll creates one, tags it (`raid-night`), and reacts to `poll-closed`
  for that tag. Never import raids, coordinator, or loot here; they depend on polls, not the
  other way round. `PollOption.value` carries the caller's own data (a start time) opaquely.
- **One ballot per member per poll.** Changing your vote replaces it; the store refuses a
  second insert.
- **Anonymous means every surface.** For an anonymous poll no command result, render, or event
  names a voter, officers included. `Vote.memberId` exists only to enforce one ballot and let
  members change theirs.
- **Options lock once votes exist.** Copy, close time, and visibility can still change.
- **Eligibility is tier, never rank.** `eligibleTier` is at least `member`; public callers
  never vote. A creator can't target a tier above their own.
- **Tally is pure and recomputed.** Results are derived from votes; the stored `results` is the
  frozen snapshot taken at close.
- **Times are UTC epoch ms.** Discord and the website render them per viewer.
- Nullable fields use `null`, not `undefined`, so Convex patches can clear them.
