# Post-raid: record the addon's export

Issue #29, Phase 2 under #5. **Depends on:** the addon's `raid-export` string (`libs/bridge-format`,
schema v1) and `raid-export-check` (J44), which reads and matches it without saving anything.

## Goal

After a raid, an officer pastes the addon's export string and Vintage keeps who attended and what
dropped, completes the raid, and (next) posts a summary in Discord. This closes the Phase 2 loop
(PLAN §8): coordinator → roster → addon forms the raid → attendance and loot recorded → summary.

## Slice 1 (this PR): the command

| Command | Module | Tier | What |
|---|---|---|---|
| `raid-export-record` | raids | officer, destructive | Decodes and matches the export exactly as `raid-export-check` does, then stores attendance (raids) and drops (loot), completes the raid if it's still open or locked, and emits `raid-completed` (only then) and `raid-recorded` |
| `attendance-list` | raids | recruit | A raid's recorded attendance and the record it came from |
| `loot-list` | loot | member | A raid's recorded drops, in the order they were looted |

The preview is the check: it carries the full `ExportCheck` (warnings, not signed up, signed up but
not seen), what will be stored, whether it completes the raid, and the record it replaces.

### Where the data lives

- **Attendance → `raids`** (`attendance`, `raidRecords` tables). Raids owns events and signups, and
  `raid-completed` already carries attendance.
- **Drops → a new `loot` module** (`drops` table), as PLAN §5.1 gives drops to the loot host. This
  PR scaffolds the module with only drops and `loot-list`; #26 adds methods, awards and history to
  it. Raids writes drops through a `RaidsLoot` port that `apps/api` adapts to the loot component,
  so raids never touches loot's tables (invariant 3). Raids imports only `@vintage/loot/contract`.
- Every row carries `guildId` and is read through a `by_guild_event` index (invariant 7).

### Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Being in any snapshot counts as attending.** Each person's snapshot count, the labels of the snapshots they were in, and first and last seen are stored too | Officer call, 2026-10-29. Keeps the rule simple while a loot method can still weigh a partial night |
| D2 | **Standby counts as full attendance** | Officer call, 2026-10-29, for #222. The export has no standby list yet; when #222 adds one, its people are recorded as attended |
| D3 | **A second, different export replaces the first**, after the preview and confirm. The same export again (same exporter and `exportedAt`) changes nothing and says so | Officer call, 2026-10-29. An officer who exports again later in the night should be able to fix the record; a double paste must not double anything |
| D4 | **Officers only.** Raid leaders keep `raid-export-check` | The record feeds loot standings, which officers own (PLAN §5.3) |
| D5 | Drops record the raid's `lootMethodId` at the time of recording | "Recorded under the event's loot method" (#29); method and config versions come with #26 |
| D6 | Refused: no raid matched (`RAID_NOT_MATCHED`, pass `eventId`), a cancelled raid (`RAID_CANCELLED`), one that hasn't started (`RAID_NOT_STARTED`), an export with no snapshots (`EXPORT_EMPTY`) | A pick-up raid has nothing to record against; an empty export would wipe a record |
| D7 | `raid-completed` goes out only when the record completes the raid; `raid-recorded` goes out on every record, with `replaced` | `raid-complete` may have completed the raid already, and subscribers shouldn't see it twice |

## Left for later slices

- [ ] **Raid summary post:** the bot posts who came and what dropped in Discord, from
  `raid-recorded` (or straight after `raid-export-record` in the Convex mutation). Needs a channel
  choice (the signup channel's thread, or the ops channel) and the wording.
- [ ] **Website UI:** a **Record** button next to **Check an export** in the officers' quarters
  (Tonight tab), showing the preview and confirming; attendance and loot on the raid page.
- [ ] **Discord:** `/random event record-export` for officers, mirroring `check-export`.
- [ ] **Standby credit** once #222 adds `standby` to the export (D2).
- [ ] **Loot methods** (#26): awards with `methodId`, `methodVersion`, `configVersion` built on the
  recorded drops; `onRaidCompleted` from the recorded attendance.
- [ ] A live JTBD run of J46 on the local backend.
