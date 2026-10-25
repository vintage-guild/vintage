# identity module

Members, characters, and Discord roles → guild rank → permission tier (PLAN §3.4). Maturity: **core**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types, command names, events. The only import other modules may use |
| `src/domain/rank.ts` | Pure: Discord roles → guild rank → tier |
| `src/store.ts` | `IdentityStore` port, `IdentityDeps`, and `command = commandsFor<IdentityDeps>()` |
| `src/commands/` | `member-*` and `character-*` commands |
| `src/testing.ts` | Memory store with the same behavior contract as the component |
| `convex/` | The `identity` Convex component: `members` and `characters` tables |

## Rules

- `member-sync` is the only writer of `rank` and `tier`. Hosts call it at sign-in and from the role-sync
  cron through `commands:syncMember` (system caller). Never set them anywhere else.
- Rank decides tier (`RANK_TIER` in the contract). Discord-only Friends and anyone without a
  rank role are `public`; being in the Discord server alone grants nothing.
- Rank and tier are separate on purpose: Raider and Flex Raider share the `raider` tier, but the
  coordinator gives Raiders priority.
- A member's first character becomes their main; setting a new main clears the old one.
- Members edit only their own characters; officers can edit anyone's.
- Character names are unique per guild, stored capitalized.
- When you change a component function, keep `src/testing.ts` behaving the same way, and run
  `pnpm --filter @vintage/api dev:local` so `convex/_generated` is regenerated and committed.
