# raids module

Recurring raid schedules, the raid events they create, signups, and rosters (PLAN §3.3,
§3.11). The coordinator (#16) drives these commands on a timer; people and agents call them
directly. Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`Schedule`, `RaidEvent`, `Signup`), command names, events. The only import other modules may use |
| `src/domain/recurrence.ts` | Pure: a weekly recurrence in an IANA zone → start times (DST-safe) |
| `src/store.ts` | `RaidsStore` port, `RaidsMembers` (what raids reads from identity), `RaidsEventSink`, `RaidsDeps`, `command` |
| `src/commands/` | `schedule-*`, `raid-*`, `signup-*`, `roster-*`, `comp-suggest` |
| `src/testing.ts` | Memory store, members, and a recording event sink, same behavior as the component |
| `convex/` | The `raids` Convex component: `schedules`, `raidEvents`, `signups` tables |

## Rules

- **Event kinds** (#151): every schedule and event has a `kind`: `raid` (10/20/40), `dungeon`
  (5), `battleground` (10/15/40), or `other` (1–40). Rows from before kinds read as `raid` (the
  component's mapper fills it; the field is optional in the schema). `raid-create`,
  `schedule-create`/`-update` check the size per kind (`SIZE_NOT_ALLOWED`) and that roleTargets
  fit (`ROLE_TARGETS_TOO_BIG`). `roleTargets: null` means the kind's default: comp-solver's by
  size for raids, 1/1/3 for dungeons, healers and dps (no tank) for battlegrounds, none for
  `other`. Raid buffs count as gaps only for raids (`eventTemplate`). The rules live in
  `@vintage/comp-solver` (`kinds.ts`) so the card and the site share them; the contract
  re-exports them.
- **Times are UTC epoch ms**, computed from the schedule's local time and zone. Never store
  local times on events; Discord and the website render them per viewer.
- **Materializing is idempotent.** `schedule-materialize` skips any occurrence that already has
  an event, including a cancelled one, so cancelling a night sticks. Keep it that way: the
  coordinator runs it on a cron.
- **One signup per member per raid.** Changing your character, or switching between accepted
  and late, keeps `signedUpAt` (your place in line). Stepping down to tentative, bench, or
  declined resets it to now, so you go to the back. Swapping characters or declining drops the
  roster spot.
- **The queue** (`domain/queue.ts`): when more people are going (accepted or late) than the raid
  holds, the earliest are in and the rest are `queued`. Every signup change and removal re-runs
  `syncQueue`; a queued person whose turn comes gets `promotedAt` and a `signup-promoted` event.
  Queued people count as bench in `comp-suggest`.
- **Identity is read through `RaidsMembers`**, never its tables. Signups snapshot the
  character's name, class, spec, and role at signup time.
- **Leaders override** (tier `leader`): signing up anyone's character, changing locked raids,
  and every `roster-*` command. `raid-cancel` and `roster-remove` are destructive (confirm flow).
- **Events:** `signup-changed` on every real change (not on a no-op re-answer) and on removal
  (`to: null`), then `signup-promoted` for anyone it moved up; `raid-completed` with attendance
  from `raid-complete`.
- **Comp priority comes from guild rank** (`RANK_PRIORITY` in `comp.ts`): raiders and above,
  then flex raiders, then recruits. Gate on tier, rank only orders.
- Nullable fields use `null`, not `undefined`, so Convex patches can clear them.
