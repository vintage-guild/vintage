# Guild roster: a public roster page fed by the Forever armory

**Status:** active (built 2026-11-19; hardened 2026-11-20). **Owner module:** armory (extended, not a new module — it
already owns the Blizzard client wiring and the Convex component this needs).

## Why

The guild tracks its raider and member roster in a Google Sheet today, filled in and kept
current by hand. WoW: Forever's armory already has every character's class, spec, and
professions; Vintage can read it once and show it to everyone instead of asking officers to
copy it into a spreadsheet.

## Job

A member or officer opens `/roster` on the website and sees every character currently in the
guild in-game (not just the ones someone has registered and linked), each with a portrait, a
link to its public armory page, its class and active spec, and its professions with their
levels. The list stays current on its own.

## Today

| Piece | Where | State |
|---|---|---|
| Per-character armory link (opt-in, one member's own characters) | `modules/armory` | ✅ built: `armory-link/get/list`, the hourly sweep, the `/characters` page's Armory section |
| `guildRoster(slug)` — the Forever guild roster endpoint | `libs/forever-api` | ✅ implemented, tested, confirmed live (2026-11-07); **unused** — [armory.plan.md](../../active/armory/armory.plan.md) flags it only as a future reconciliation check |
| Talent spec, portrait | `modules/armory/src/domain/fetch.ts` | ✅ solved problems (`toActiveSpec`, `toAvatar`) — reused here |
| Professions | — | ❌ not implemented anywhere; `/professions` returns 200 live ([forever-api README](../../../../libs/forever-api/README.md)) but has no schema or client method yet |
| Public armory page link | — | ❌ not implemented. Confirmed format: `https://worldofwarcraft.blizzard.com/en-us/forever/{region}/armory/character/{slug}` (`{slug}` = `characterSlug(name, surname)`, same lowercasing as the API) |
| A guild-wide roster page | — | ❌ doesn't exist. `/characters` is self-service and member-scoped only |

## How it works

### 1. `libs/forever-api` additions

- `characterProfessionsSchema` + `characterProfessions(name, surname)`, hitting
  `/profile/wow/character/{slug}/professions`. Shape follows the Retail API's documented
  `primaries`/`secondaries` (profession name, `skill_points`, `max_skill_points`); every field
  optional, same defensive pattern as the rest of this client, since Forever's shape is
  unconfirmed. **Needs a live check** with `armory-probe.ts` once deployed, same as
  `/specializations` got on 2026-11-07.
- `armoryProfileUrl(region, name, surname)`: pure string builder, no network call, next to
  `characterSlug`. Locale is fixed to `en-us` (Blizzard's armory UI takes a locale segment;
  Vintage has no other-locale members today).

### 2. A new Convex table in armory's component: `rosterEntries`

One row per character currently in the Forever guild roster, independent of identity links or
member opt-in — this is Blizzard's own guild membership, not a claim. Fields: `blizzardId`,
`name`, `surname`, `slug`, `level`, `className`, `raceName`, `guildRank` (Blizzard's numeric
in-game rank, 0 = GM — undocumented, no name), `activeSpec`, `professions`
(`{ name, level, maxLevel }[]`), `avatarUrl`, `profileUrl`, `error`, `checkedAt`. Indexed
`by_guild_slug`, like `links`.

### 3. Commands (in `modules/armory`, new `src/commands/roster.ts`)

- **`armory-guild-roster`** (read, tier `recruit`, matching `armory-list allGuild`): the cached
  table, sorted by `guildRank` then name.
- **`armory-guild-roster-sync`** (`systemOnly`, `mutation`, run by a new cron): never calls
  Blizzard directly (commands never do). It asks a new `ArmoryEffects.syncRoster(guildId)` to
  run the actual sync as a scheduled action, the same split `armory-sweep` uses for
  `armoryEffects.fetch`.
- **`armory-guild-roster-record`** (`systemOnly`, `mutation`): takes the action's results —
  Blizzard's current member list plus whichever members' details were just re-fetched — and
  upserts/removes rows in one pass, same shape as `armory-record`.

### 4. The sync action (`apps/api/convex/armory.ts`, new `syncRoster`)

1. Call `guildRoster(BLIZZARD_GUILD_SLUG)` (new env var, default `vintage`) — one request,
   gives the authoritative current member list and each one's native rank.
2. Diff against the stored table: brand-new slugs are inserted as `pending`; slugs no longer in
   the response are dropped.
3. Enrich a batch of the stalest rows (never-checked first, same ordering as `armory-sweep`;
   batch size `ROSTER_SYNC_BATCH`, larger than armory's 25 since this has no cooldown to race
   against) with `characterProfile` + `characterSpecializations` + `characterMedia` +
   `characterProfessions` — no `characterEquipment`: the roster doesn't show gear.
4. Hand the whole thing to `armory-guild-roster-record`.

Cron: every 30 minutes (`apps/api/convex/crons.ts`), so a guild of a couple hundred characters
cycles through full enrichment within a few hours without bursting Blizzard's rate limit.

### 5. Website: `/roster`

A new page (`apps/web/src/pages/roster.ts`; the table lives in the page, there is no ui-kit
element): name (linking to `profileUrl`), portrait, class, active spec, professions
with levels, sorted by guild rank. Public read (recruit tier already allows anyone signed in at
recruit+; the page itself can be public like the home page's recruiting band, since this is
exactly what the Google Sheet already shows anyone in Discord).

## Open questions

1. **"All raider and member ranks"** (the request) vs. Blizzard's native numeric guild rank:
   Blizzard's API gives a rank *index*, not a label, and nothing yet maps that index to
   "Raider" or "Member." **v1 shows the whole in-game roster** (which for this guild is already
   just raiders, members, and recruits — nobody else is in the in-game guild) sorted by rank
   index. **Resolved:** the website names the indices (`RANK_NAMES` in
   `apps/web/src/pages/roster.ts`, checked against the live roster); a
   `roster-rank-names-set`-style config is a follow-up once officers want to edit them.
2. ~~Professions shape is unverified.~~ Confirmed live 2026-11-19 (points and recipes in
   `tiers[]`; see the forever-api README).
3. **Guild slug**: `vintage` synced live 2026-11-19 (113 characters, per
   [recipe-search](../recipe-search/recipe-search.plan.md)); `BLIZZARD_GUILD_SLUG` overrides it.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-19 | Extend `modules/armory`, not a new module | It already owns the Blizzard client, the Convex component, and the `armory` commitlint/ownership scope; a guild-wide roster is a natural second table in the same component, not a separate concern |
| 2026-11-19 | Roster entries are independent of identity links | Blizzard's guild roster already includes everyone in-game; requiring every raider to register and link first would make the page less complete than the Google Sheet it replaces |
| 2026-11-19 | No gear/item level on this page | Not asked for; keeps the sync to 4 endpoints per character instead of 5 |
| 2026-11-20 | A failed sub-request keeps the stored fields | A 429 on `/professions` blanked a character's professions and recipes for a day (the next pass is 24 h out) |
| 2026-11-20 | An empty Blizzard roster is refused | `members` defaults to `[]`; one bad answer would have deleted every row and its enrichment |
| 2026-11-20 | Results are checked one by one | One answer past a bound refused the whole batch, membership included, and the same stalest rows were retried first forever |
| 2026-11-20 | Recipes in their own table, keyed by entry id | They're most of each row's bytes; the public roster read, the sync, and the staleness query all loaded them to throw them away |
| 2026-11-20 | Match roster rows by `blizzardId` only | A rename deleted and re-inserted the row, losing its enrichment; a slug fallback would hand a renamed character's row to whoever takes the freed name |
| 2026-11-20 | Split the record call by serialized size | 60 characters with hundreds of recipes each can outgrow one Convex argument; every chunk carries the full member list, so splitting never drops a member |

## Tasks

- [x] **`libs/forever-api`**: `characterProfessionsSchema`, `characterProfessions`,
  `armoryProfileUrl`, tests, README update (#287)
- [x] **`modules/armory`**: `rosterEntries` table, `RosterStore`/`RosterEffects` ports,
  `armory-guild-roster` (with the claiming member's id), `armory-guild-roster-sync`,
  `armory-guild-roster-record`, memory store, tests (#288)
- [x] **`apps/api`**: `rosterSync` action, `stores.ts` wiring, `BLIZZARD_GUILD_SLUG` env, cron
  (#288)
- [x] **`apps/web`**: `/roster` page, sections by the guild's rank names, Discord column, dev
  fixtures, privacy note. The table lives in the page for now; move it to ui-kit when a second
  page needs it
- [x] **Docs**: this plan, `modules/armory/AGENTS.md`, `apps/web/README.md`,
  `commands.manifest.json`
- [ ] **Next:** a character page (`/roster/<slug>`) linking out to the Armory and Warcraft Logs;
  Battle.net sign-in for verified ownership and alts (spike first: does `/profile/user/wow`
  answer for Forever?)

The guild's in-game ranks by Blizzard's index, which counts from 0 (the game's rank numbers
minus one; checked against the live roster 2026-11-19): 0 Guild Master, 1 Officer, 2 Officer Alt,
3 Raider, 4 Flex Raider, 5 Members & Alts, 6 Recruit. Guild slug `vintage` (confirmed). The live
roster had 113 characters: 1 / 3 / 4 / 29 / 2 / 33 / 41 by rank. Forever's professions keep
their skill points per tier, and characters below about level 10 404 until they level.
