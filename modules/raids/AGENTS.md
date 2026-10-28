# raids module

Recurring raid schedules, the raid events they create, signups, and rosters (PLAN §3.3,
§3.11). The coordinator (#16) drives these commands on a timer; people and agents call them
directly. Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`Schedule`, `RaidEvent`, `Signup`), command names, events. The only import other modules may use |
| `src/domain/recurrence.ts` | Pure: a weekly recurrence in an IANA zone → start times (DST-safe) |
| `src/domain/export-check.ts` | Pure: an addon export (`@vintage/bridge-format` `raid-export`) matched to a raid's signups by name, with or without the realm |
| `src/store.ts` | `RaidsStore` port, `RaidsMembers` (what raids reads from identity), `RaidsEventSink`, `RaidsDeps`, `command` |
| `src/commands/` | `schedule-*`, `raid-*`, `signup-*`, `roster-*`, `comp-suggest`, `raid-export-check` (read-only: an addon export matched to its raid, #29) |
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
- **`other` is the catch-all** (a levelling group anyone can join): `size` and `instance` are
  optional. No size (`null`) means open: no cap, so `queuePositions` queues nobody, and
  `comp-suggest` plays everyone going (`compSize`). No instance is stored as `''`. Zod is the
  source of truth on create (`kindRules` in `commands/shared.ts`: every other kind needs both);
  `schedule-update` checks the merged schedule (`SIZE_NOT_ALLOWED`, `INSTANCE_REQUIRED`).
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
  `signup-list` gives each queued row its `queuePosition` (1 is next), counted over every
  signup so a status filter never renumbers the line; surfaces show it, never recompute it.
- **When signups lock** (`domain/timings.ts`): `locksAt` = start minus the schedule's
  `lockHours`, or `DEFAULT_TIMINGS` for a one-off, the same rule the coordinator's tick source
  uses. `raid-list` rows and `raid-get` carry it.
  Queued people count as bench in `comp-suggest`.
- **Raid notes** ("what to bring", J19): `notes` on events and schedules, at most
  `RAID_NOTES_MAX` (500) characters, trimmed, blank or null for none (`notesSchema`). Set by
  `raid-create`, changed by `raid-reschedule` (`startsAt`, `notes`, or both; at least one), and a
  schedule's `notes` are the default `schedule-materialize` copies to each new raid. Editing a
  schedule's notes leaves raids already created alone. Rows from before notes read as null (the
  field is optional in the schema; the mappers fill it). Surfaces split paragraphs on blank lines.
- **Identity is read through `RaidsMembers`** (`getCharacter`, `listCharacters`, `getMember`),
  never its tables. Signups snapshot the character's name, class, spec, and role at signup time.
- **A spec for one raid** (#148): `signup-set`'s optional `spec` must be one of the character's
  class's specs (`INVALID_SPEC`); the role follows it. It changes the signup's copy only, never
  the saved character. Without `spec`, the same character keeps the signup's spec and role
  (changing status keeps a chosen spec); a different character starts from its saved spec
  (switching clears it). A spec change alone is a change: `signup-changed` goes out.
- **A role for one raid** (#149): `signup-set`'s optional `role` plays the signup as tank,
  healer, melee or ranged (stored with `rolePicked`); `null` follows the spec again. A spec
  change re-guesses the role unless one was picked for the signup; switching character clears
  both. The guessed role for a character's saved spec is its saved role (which may be picked).
  Comp, the card, the queue and the "needed" hints all read the signup's `role`.
- **`signup-suggest`** (recruit, read-only) guesses the character in `domain/guess.ts`: this
  raid's signup, then the main, then (only with no main) the one brought most in the member's
  last `SERIES_WINDOW` (5) signups for the same schedule (one-offs: the same instance; declines
  don't count; a tie goes to the most recent raid), then the only character; else null. The main
  beats history because members set it on purpose (Bloodfen, 2026-10-27, #149), and the history
  isn't read when there's a main. `reason` is shown to members,
  so keep it short and plain. It reads `listSignupsByMember` (the component's `by_guild_member`
  index, latest `signedUpAt` first). `rolesNeeded` (contract) is what the surfaces' "needed"
  hints use.
- **`raid-export-check`** (leader, read-only, #29) matches an addon export to a raid: the
  caller's `eventId`, else the export's own when it's this guild's. Who was expected is
  `expectedSignups`: the roster once anyone is rostered (as `raid-complete` counts), else
  everyone going who isn't queued or benched. A declined signup who was seen is
  `declinedButSeen`, not unknown. A `Name-Realm` falls back to a signup for `Name` only when the
  export has no plain `Name` and no second realm's, and is flagged `matchedWithoutRealm`.
  `warnings` (OTHER_GUILD, OTHER_RAID, TIMES_APART: no snapshot from 2 hours before the start to
  10 after) are plain sentences every surface shows as they are.
- **Leaders override** (tier `leader`): signing up anyone's character, changing locked raids,
  and every `roster-*` command. `raid-cancel` and `roster-remove` are destructive (confirm flow).
- **Events:** `signup-changed` on every real change (not on a no-op re-answer) and on removal
  (`to: null`), then `signup-promoted` for anyone it moved up; `raid-completed` with attendance
  from `raid-complete`.
- **Comp priority comes from guild rank** (`RANK_PRIORITY` in `comp.ts`): raiders and above,
  then flex raiders, then recruits. Gate on tier, rank only orders.
- Nullable fields use `null`, not `undefined`, so Convex patches can clear them.
