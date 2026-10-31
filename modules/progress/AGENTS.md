# progress module

Raid progression: the launch raids and their bosses as data, the guild's kills as records, and
the first-kill ledger the website's home page shows
([home page plan](../../docs/features/completed/home-page/home-page.plan.md), section 4).
Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `LAUNCH_RAIDS` (Barrow Deeps 10/8, Hyjal Summit 20/13, Onyxia's Lair 40/1), `findBoss`, `RAIDS_OPEN_AT`, `Kill`, `KillRecorded`, the `Progress` view, item qualities. The only import other modules may use |
| `src/domain/ledger.ts` | Pure: kills → first kill per boss → `Progress` (per-raid rows, next target, totals, latest first kill) |
| `src/store.ts` | `ProgressStore` port (`listKills`, `insertKill`), `ProgressDeps`, `command` |
| `src/commands/` | `kill-record` (leader) and `progress-get` (member) |
| `src/testing.ts` | Memory store, same behavior as the component |
| `convex/` | The `progress` Convex component: the `kills` table |

## Rules

- **Raids and bosses are data, not rows.** They live in `contract.ts` and change by PR. Boss
  ids are stable kebab-case slugs; kills reference them, so never rename an id once a kill
  could exist (rename the display name instead).
- **Datamined names are flagged.** Barrow Deeps and Hyjal Summit bosses come from beta-client
  datamining (wowforeverbuilds.com, build 1.60.1.70532) and carry `datamined: true`. Every
  surface that shows such a name says so. When Blizzard publishes the real list, update the
  names, keep the ids where the boss is the same, and clear the flag.
- **The ledger shows first kills; the store keeps every kill.** `progress-get` derives the first
  kill per boss as the earliest `killedAt`, so recording a kill with an earlier time than the
  one on record moves the ledger entry. Later kills stay in the log for attendance and loot
  history later.
- **Game encounters match bosses through `findBoss`** (raids uses it for an addon export's kills,
  #221). Each boss has an `encounterId`, null for every boss until the Forever spike (Nov 4–6)
  reads them; then fill them in here. When both sides have an id the id decides; otherwise the
  name does, ignoring case and punctuation, so keep boss names unique across the launch raids
  (a test checks).
- **Times are UTC epoch ms.** `kill-record` refuses a time in the future or before
  `RAIDS_OPEN_AT` (`INVALID_TIME`); the website renders per viewer.
- **`guildId` on every kill**, queried through the guild-scoped indexes.
- No events yet. A `boss-killed` event for the coordinator to post in Discord is the obvious
  next step; add it to the contract and a `progressEvents` sink here, not in the coordinator.

## Command behavior

- `kill-record` answers `{ kill, first, duplicate }`: `first` is true when this kill is now the
  ledger entry. The same raid, boss, and time again changes nothing and answers the kill on
  record with `duplicate: true`, so a re-recorded export never doubles the log. Error codes: `BOSS_NOT_FOUND` (ids from `progress-get`), `INVALID_TIME`.
- `progress-get` is member tier: the public home page falls back to the empty ledger from
  `LAUNCH_RAIDS` until sign-in or a public read exists.
