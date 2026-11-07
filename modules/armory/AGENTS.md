# armory module

Registered characters linked to their WoW: Forever armory entries: what Blizzard's profile API
says about each (level, class, guild, item level, gear, portrait), refreshed in the background
([feature doc](../../docs/features/active/armory/armory.plan.md)). Maturity: **labs**:
Blizzard hasn't documented the Forever API, so its shapes may change under us.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `ArmoryLink`, `ArmoryEntry` (a link with its owner now), `ArmoryProfile`, `ArmoryItem`, `ArmoryFetchResult`, the timing constants. The only import other modules may use |
| `src/domain/fetch.ts` | `fetchArmory`: one character's profile, equipment, and media through `@vintage/forever-api`, mapped to a result; never throws |
| `src/store.ts` | `ArmoryStore` port, `ArmoryCharacters` (identity's characters, adapted by apps/api), `ArmoryEffects` (the fetch, scheduled by apps/api), `command` |
| `src/commands/` | `armory-link`, `armory-unlink` (destructive), `armory-refresh`, `armory-get`, `armory-list`; system only: `armory-sweep`, `armory-record` |
| `src/testing.ts` | Memory store and deps; deps record the fetches asked for |
| `convex/` | The `armory` Convex component: the `links` table |

## Rules

- **A character is `{first}-{surname}`.** Forever has no realms; Blizzard finds a character by
  its slug, lowercased (`characterSlug` in forever-api). Identity's names are "First" or
  "First Last" (`armoryName`): a registered last name is the surname, otherwise the member gives
  one. One slug links to at most one registered character per guild.
- **A link is a claim, not proof.** Anyone can link any armory character whose name matches a
  character they registered. Never use a link for permissions or ownership decisions; Battle.net
  sign-in (`/profile/user/wow`) is how ownership gets verified, later.
- **Commands never call Blizzard.** They save the link and ask `ArmoryEffects.fetch`; apps/api's
  `armory:refresh` action fetches and records each result through `armory-record` (system only).
  A result for a slug the link no longer has is dropped, so a surname change mid-fetch is safe.
- **Found replaces, everything else keeps.** `found` overwrites profile, gear, and portrait;
  `not-found` and `error` only set the status and `checkedAt`, keeping the last good data
  (Blizzard 404s new characters until level 10 and a logout, and EU 404s were seen at launch).
- **The sweep paces Blizzard.** Hourly, up to `ARMORY_SWEEP_BATCH` (25) links whose last check is
  older than `ARMORY_STALE_MS` (12 h), never-checked first. A link asked for in the last
  `ARMORY_REFRESH_COOLDOWN_MS` (10 min) is in flight and skipped; members get the same cooldown
  on `armory-refresh`. The sweep also deletes links whose character was removed.
- **The slug is fixed at link time.** Renaming the registered character (`character-update`)
  keeps the old `name` and slug here; link again to follow the rename.
- **Owners come from identity at read time** (`ArmoryEntry.memberId`), so a character moved to
  another member by roster reconciliation follows without a write here.
- **Only `https:` portraits** are stored; the record command refuses anything else.
- **`guildId` on every link**, queried through the guild-scoped indexes.

## Command behavior

- `armory-link` answers the link (pending). The same surname again changes nothing; a new one
  resets the link and fetches again, unless the link was asked for within the refresh cooldown:
  then it saves the surname and leaves the fetch to the sweep, so switching surnames can't get
  around the cooldown. Unlinking and linking again still fetches at once; the confirm step is
  what slows that down. The cooldown is per character, so a member's budget grows with their
  characters. Errors: `CHARACTER_NOT_FOUND` (not yours, or no such id),
  `ARMORY_ALREADY_LINKED` (another character has that slug), `ARMORY_SURNAME_NEEDED` (no
  registered last name and none given), `ARMORY_SURNAME_MISMATCH` (one given that differs from
  the registered last name), `VALIDATION_ERROR` (a surname that isn't 1–12 letters).
- `armory-get` answers `{ link }`, null when unlinked; another member's character needs recruit
  and is otherwise answered `CHARACTER_NOT_FOUND`. `armory-list` is yours by default; another
  member's or `allGuild` needs recruit (as `character-list`).
- `armory-refresh` errors `ARMORY_REFRESH_TOO_SOON` (retryable, with the wait) and
  `ARMORY_NOT_LINKED`.
- `classMismatch` is true when the armory's class differs from the registered one: usually the
  wrong surname.
