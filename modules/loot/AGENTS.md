# loot module

The loot host (PLAN §5.1): for now, the drops recorded from a raid's addon export (#29). Loot
methods, awards, and history come with #26. Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`LootDrop`, `LootDropInput`), command names, events. The only import other modules may use |
| `src/store.ts` | `LootStore` port, `LootDeps`, and `command = commandsFor<LootDeps>()` |
| `src/commands/` | `loot-list` (member: a raid's drops), exported as `lootCommands` |
| `src/testing.ts` | Memory store with the same behavior contract as the component |
| `convex/` | The `loot` Convex component: the `drops` table |

## Rules

- **Drops are written by `raid-export-record`** (raids), through raids' `RaidsLoot` port, which
  `apps/api` adapts to this module's store. Raids never reads these tables, and loot doesn't
  depend on raids.
- **`replaceDrops` replaces a raid's drops in one transaction**, so a re-recorded export never
  doubles them. Drops are listed oldest first (`at`, then insertion order).
- **Times are UTC epoch ms** (the export's unix seconds × 1000).
- **Every drop records the raid's `lootMethodId`** at the time it was recorded (PLAN §5.3);
  awards under a method (#26) will add `methodVersion` and `configVersion`.
- Nullable fields use `null`, not `undefined`.
