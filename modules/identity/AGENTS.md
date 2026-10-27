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
- Role sync (`apps/api/convex/roleSync.ts`, every 15 min) reads the whole `GuildDirectory` before
  planning. Never plan from a partial or empty directory: missing members are synced as gone.
- Rank decides tier (`RANK_TIER` in the contract). Discord-only Friends and anyone without a
  rank role are `public`; being in the Discord server alone grants nothing.
- Rank and tier are separate on purpose: Raider and Flex Raider share the `raider` tier, but the
  coordinator gives Raiders priority.
- A member's first character becomes their main; setting a new main clears the old one.
- Members edit only their own characters; officers can edit anyone's.
- Character names are unique per guild, stored capitalized.
- When you change a component function, keep `src/testing.ts` behaving the same way, and run
  `pnpm --filter @vintage/api dev:local` so `convex/_generated` is regenerated and committed.
