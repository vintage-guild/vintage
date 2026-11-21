# identity module

Members, characters, and Discord roles → guild rank → permission tier (PLAN §3.4). Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types, command names, events. The only import other modules may use |
| `src/domain/rank.ts` | Pure: Discord roles → guild rank → tier |
| `src/domain/role-sync.ts` | Pure: `planRoleSync(directory, known)` → `member-sync` inputs |
| `src/directory.ts` | `GuildDirectory` port (pages of Discord members) and `readDirectory` |
| `src/store.ts` | `IdentityStore` port (incl. the role → rank map), `IdentityDeps`, `command` |
| `src/commands/` | `member-*`, `character-*`, and `guild-roles-*` commands |
| `src/testing.ts` | Memory store with the same behavior contract as the component |
| `convex/` | The `identity` Convex component: `members`, `characters`, `roleRanks` tables |

## Rules

- `member-sync` is the only writer of `rank` and `tier`. Hosts call it at sign-in and from the role-sync
  cron through `commands:syncMember(s)` (system caller). Never set them anywhere else.
  It is `systemOnly`: its role ids are trusted, so no surface but the system caller may run it,
  not even an officer (who could otherwise promote any Discord id).
- `member-sync` also writes `rankSince`: the sync time when the rank changes or the member is
  first seen, otherwise the stored value. Rows from before 2026-10-27 have none and read as null
  ("before tracking began") until their rank changes; never backfill it with a guessed date. A
  recruit's trial runs from it; how long a trial lasts is still open (vintage-guild/vintage#30).
- The Discord role id → rank map lives in `roleRanks`, read with `guild-roles-get` (leader) and
  replaced with `guild-roles-set` (officer, destructive). The map must keep an officer role, so
  officers can't lock themselves out. Tiers follow at the next sync, not at save time. The first
  map is saved through `commands:runAsSystem` (system caller, deployment access only), since no
  one is an officer yet.
- `member-sync` also writes `inServer` (#145): whether the account was in the Discord server
  at the sync. Rows from before it read as in when they have a rank, out otherwise, until the
  next sync writes it. Applications read it to ask website applicants to join first.
- `member-refresh` (public, your own account) re-reads your Discord membership now instead of
  at the next sync: apps/api schedules `auth:syncSignIn`, the sign-in sync. A member synced in
  the last 30 seconds gets the stored answer (`current`) without asking Discord; otherwise it
  answers `checking`, and the caller reads again a few seconds later. Each call by a
  non-member schedules one Discord read; the 30-second floor only covers known members.
- Role sync (`apps/api/convex/roleSync.ts`, every 15 min) reads the whole `GuildDirectory` before
  planning. Never plan from a partial or empty directory: missing members are synced as gone.
- Rank decides tier (`RANK_TIER` in the contract). Discord-only Friends get the `friend` tier (can
  add characters and sign up for open raids); anyone without a rank role is `public` (being in the
  Discord server alone grants nothing). Exception: `member-sync`
  accepts a trusted `adminAccess` flag (from Convex's `VINTAGE_ADMIN_DISCORD_IDS` env var) that
  grants `officer` tier while keeping the member's real guild `rank`, so developers can use
  `/officers` without displaying as an Officer on the site.
- Rank and tier are separate on purpose: Raider and Flex Raider share the `raider` tier, but the
  coordinator gives Raiders priority.
- A member's first character becomes their main; setting a new main clears the old one. The main
  is the default character everywhere (signup guesses, Discord); there's no separate default
  pref (`prefs.defaultCharacterId` was removed in #149). The schema still allows it on stored
  prefs so old rows validate; the members mapper strips it and the next prefs write drops it.
- A character's `role` is guessed from its spec unless the member picked one (`role` on
  `character-add`/`character-update`, stored with `rolePicked`; a Fury warrior who tanks). A
  guessed role follows a spec change, a picked one stays, `role: null` goes back to guessing,
  and a class change starts over. Rows from before #149 have no `rolePicked` and read as false.
  `alsoRoles` lists the other roles a character can play (`[]` when none): only roles its class
  can play (`classRoles` in `@vintage/wow-data`; anything else is `INVALID_ROLE`), never its
  main role, each once, in `ROLES` order. A class change clears it unless a new list comes with
  it; a new main role leaves it. Rows written before it carry the single legacy `secondaryRole`
  from #301, read as `alsoRoles` until the row's list is next written; drop that field once no
  row has it.
- `character-update` edits name (unique, normalized), class (with a spec of that class), spec,
  role, alsoRoles (a full replacement), and main. Discord's `/random character`, the site's Characters page, and
  the Roster page's inline role editor all use it.
- Members edit only their own characters; officers can edit anyone's.
- Character names are unique per guild, stored capitalized.
- When you change a component function, keep `src/testing.ts` behaving the same way, and run
  `pnpm --filter @vintage/api dev:local` so `convex/_generated` is regenerated and committed.
