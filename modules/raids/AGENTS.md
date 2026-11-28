# raids module

Recurring raid schedules, the raid events they create, signups, and rosters (PLAN §3.3,
§3.11). The coordinator (#16) drives these commands on a timer; people and agents call them
directly. Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`Schedule`, `RaidEvent`, `Signup`), command names, events. The only import other modules may use |
| `src/domain/recurrence.ts` | Pure: a weekly recurrence in an IANA zone → start times (DST-safe) |
| `src/domain/clock.ts` | Pure: `resolveGuildClock` (first active schedule's zone and start time, else first schedule's, else Chicago / 20:00) |
| `src/domain/comp.ts` | Pure: `RANK_PRIORITY`, `solveEventComp` (shared by `comp-suggest`, `roster-approve`, coordinator cards/lock, and Discord signup replies), and `hasRosterDecision` (true once a leader/officer decision applies, so capacity alone never sits anyone before that) |
| `src/domain/absence.ts` | Pure: `absenceCovers`, `resolveAbsenceCoverage` (`away` beats `late`), `excusedAtLock`, calendar date validation |
| `src/domain/export-check.ts` | Pure: an addon export (`@vintage/bridge-format` `raid-export`) matched to a raid's signups by name, with or without the realm |
| `src/domain/export-record.ts` | Pure: the attendance, drops, kills (matched to progress bosses), and boss tally `raid-export-record` stores from a checked export |
| `src/store.ts` | `RaidsStore` port, `RaidsMembers` (what raids reads from identity), `RaidsEventSink`, `RaidsLoot` (where recorded drops go: the loot module), `RaidsProgress` (where kills go: progress's `kill-record`), `RaidsDeps`, `command` |
| `src/commands/` | `schedule-*`, `raid-*`, `signup-*`, `roster-*`, `comp-suggest`, `raid-export-check` (read-only: an addon export matched to its raid), `raid-export-record`, `attendance-list` (#29), and `absence-*` |
| `src/testing.ts` | Memory store, members, and a recording event sink, same behavior as the component |
| `convex/` | The `raids` Convex component: `schedules`, `raidEvents`, `signups`, `raidRecords`, `attendance`, `absences` tables |

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
  optional. No size (`null`) means open: no cap, so `comp-suggest` and `solveEventComp` play
  everyone going (`compSize`). No instance is stored as `''`. Zod is the
  source of truth on create (`kindRules` in `commands/shared.ts`: every other kind needs both);
  `schedule-update` checks the merged schedule (`SIZE_NOT_ALLOWED`, `INSTANCE_REQUIRED`).
- **Times are UTC epoch ms**, computed from the schedule's local time and zone. Never store
  local times on events; Discord and the website render them per viewer.
- **Materializing is idempotent.** `schedule-materialize` skips any occurrence that already has
  an event, including a cancelled one, so cancelling a night sticks. Keep it that way: the
  coordinator runs it on a cron.
- **One signup per member per raid.** Changing your character, or switching between accepted
  and late, keeps `signedUpAt` as a tie-breaker record. Stepping down to tentative, bench, or
  declined resets it to now. Swapping characters or declining drops the roster spot.
- **Comp-based seating and Standby** (`domain/comp.ts`): first-come auto-queuing is retired
  (`queued` stays `false`, `promotedAt` stays `null`, and `signup-list`'s legacy `queuePosition`
  is always `null`). Before approval, `solveEventComp` drafts the ideal comp from going signups
  by comp requirements, role targets, and rank priority (`RANK_PRIORITY`: raiders/leaders/officers
  > recruits > flex raiders > members > friends), and the draft's overflow is what leaders review
  (the T-24h party draft, digest recommended sits) — it never sits a member on Standby by itself.
  `hasRosterDecision` is false until a leader or officer actually decides (rosters, approves, or
  the raid locks with no approval step to wait for); until then, a sign-up has no cap, so the
  signup card and private reply show everyone going as going, and Standby is only self-selected
  (`status: 'bench'`) or an explicit leader bench (2026-11-27, row 48). A signup's own answer is
  never overridden to Standby either way: Flex Raiders answer and compete for seats like anyone
  else, and the comp's rank priority (not a forced status) is what tends to leave them short of a
  seat (2026-11-27, reversing signup-improvements rows 12/20/35). `roster-approve` refuses
  overcommitted rosters (`ROSTER_OVERCOMMITTED` when explicitly seated players exceed
  `event.size`, #345) and otherwise materializes the drafted comp and `groupDraft` party groups
  onto `signups` (`roster: 'rostered'` + `group` for seated players, `roster: 'benched'` +
  `group: null` for Standby/overflow); after approval, a new signup stays `roster: 'pending'`
  until a leader explicitly seats or benches it — standby is never assigned automatically, only
  self-selected (`status: 'bench'`) or an officer's call. `roster-move` blocks seating a new
  player past `event.size` (`ROSTER_FULL`) while still letting leaders move already-seated
  players into valid groups.
- **When signups lock** (`domain/timings.ts`): `locksAt` = start minus the schedule's
  `lockHours`, or `DEFAULT_TIMINGS` for a one-off, the same rule the coordinator's tick source
  uses. `raid-list` rows and `raid-get` carry it.
- **Short site links** (`domain/short-code.ts`): every new raid gets a 6-character lowercase
  `shortCode` from the unambiguous alphabet `23456789abcdefghjkmnpqrstuvwxyz` (no `0/o/1/l/i`),
  unique per guild with collision retry on insert (`by_guild_short_code` index; optional in Convex
  until backfilled via `coordinator:backfillRaidShortCodes`). `raid-get` accepts `eventId` or
  case-insensitive `shortCode` and enforces the same `access` / `friend`-tier visibility check.
- **Raid notes and post-creation edits** ("what to bring", J19, J78, J72): `notes` on events and
  schedules, at most `RAID_NOTES_MAX` (500) characters, trimmed, blank or null for none
  (`notesSchema`). Set by `raid-create`, changed by `raid-update` (`startsAt`, `notes`, `size`,
  `roleTargets`; at least one; allowed open or locked, including after start; only completed or
  cancelled raids refuse; records `updatedAt`/`updatedBy`), and a schedule's `notes` are the
  default `schedule-materialize` copies to each new raid. Editing a raid's size or comp leaves
  its schedule untouched; before approval, shrinking clears manual `group > Math.ceil(size / 5)`
  to `null`; after approval, shrinking never unseats anyone. Editing a schedule leaves raids
  already created alone. Rows from before notes read as null (the field is optional in the
  schema; the mappers fill it). Surfaces split paragraphs on blank lines.
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
- **`signup-suggest`** (friend, read-only) guesses the character in `domain/guess.ts`: this
  raid's signup, then the main, then (only with no main) the one brought most in the member's
  last `SERIES_WINDOW` (5) raids for the same schedule (one-offs: the same instance; recorded
  attendance from `listAttendanceByMember` overrides and ranks above signed-up-only nights, #185;
  declines without attendance don't count; a tie goes to the most recent raid), then the only
  character; else null. The main beats history because members set it on purpose (Bloodfen,
  2026-10-27, #149), and history isn't read when there's a main. `reason` is shown to members,
  so keep it short and plain. It reads `listSignupsByMember` and `listAttendanceByMember` (both
  using `by_guild_member` indexes, newest first). `rolesNeeded` (contract) is what the surfaces'
  "needed" hints use.
- **`raid-export-check`** (leader, read-only, #29) matches an addon export to a raid: the
  caller's `eventId`, else the export's own when it's this guild's. Who was expected is
  `expectedSignups`: the roster once anyone is rostered (as `raid-complete` counts), else
  everyone going who isn't queued or benched. A declined signup who was seen is
  `declinedButSeen`, not unknown. A `Name-Realm` falls back to a signup for `Name` only when the
  export has no plain `Name` and no second realm's, and is flagged `matchedWithoutRealm`.
  `warnings` (OTHER_GUILD, OTHER_RAID, TIMES_APART: no snapshot from 2 hours before the start to
  10 after) are plain sentences every surface shows as they are. `standby` lists the export's
  bench people who stood by (#222).
  `bosses` groups the export's boss attempts by boss (#221): attempts, kills, wipes, seconds, and
  the first kill.
- **`raid-export-record`** (officer, destructive, #29) stores what `raid-export-check` matched:
  everyone in any snapshot attended, and so did everyone the leader confirmed stood by (full
  credit, decided 2026-10-30): a `stoodBy` row with 0 snapshots, matched to their signup by
  character, unless a snapshot has them already (`attendance`, with snapshot count, labels, first and last
  seen), the record (`raidRecords`, one per raid, `exportKey` = exporter@exportedAt), and the
  drops through `RaidsLoot` to the loot module, under the raid's `lootMethodId`. The same export
  again changes nothing; a different one replaces the record, its attendance and drops. It
  completes a live raid. Refuses no raid (`RAID_NOT_MATCHED`), cancelled, not started, and an
  export with no snapshots (`EXPORT_EMPTY`). Standby counts as attended once the export carries
  it (#222). `attendance-list` (recruit) reads it back. Decisions:
  [post-raid-record](../../docs/features/active/post-raid-record/post-raid-record.plan.md).
- **Boss kills from the export** (#221): for a `raid` (not a dungeon or other kind), each boss
  killed is matched to a launch boss with progress's `findBoss` (by name until the encounter
  ids are filled in after the Forever spike) and sent through `RaidsProgress.recordKill`, which
  apps/api runs as `kill-record` for the officer recording, at the night's first kill time.
  The preview lists `kills` (`bossId: null` for no match); the result's `ledger` says what
  happened to each: `first`, `again`, `duplicate` (kill-record already had that boss at that
  time, so a later export of the night adds nothing), `unmatched`, or `refused` (e.g. before
  the raids open). The reasoning names unmatched and refused kills. A refused kill never fails the
  record. The record keeps `bosses` (`RecordBosses`: bosses killed out of the matched raid's
  total, wipes, first pull and last attempt end) for the coordinator's summary; null without
  attempts, and for rows from before #221 (optional in the schema, the mapper fills it).
- **Leaders override** (tier `leader`): signing up anyone's character, changing locked raids,
  and every `roster-*` command. `raid-cancel` and `roster-remove` are destructive (confirm flow).
- **Events:** `signup-changed` on every real change (not on a no-op re-answer) and on removal
  (`to: null`); `roster-approved` when a leader approves the party roster; `raid-completed` with
  attendance from `raid-complete`, or from `raid-export-record` when it completes the raid;
  `raid-recorded` on every record (`replaced` when it replaced one); `absence-changed` on
  advance absence or weekly rule changes.
- **Comp priority comes from guild rank** (`RANK_PRIORITY` in `domain/comp.ts`): raiders and
  above, then recruits, then flex raiders, then members, then friends. Gate on tier; rank only
  orders.
- Nullable fields use `null`, not `undefined`, so Convex patches can clear them.
