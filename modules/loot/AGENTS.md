# loot module

The loot host (PLAN §5): drops recorded from a raid's addon export (#29), plus pluggable loot
methods, candidate ranking, awards, and history (#26). Pure method logic lives in
`libs/loot-core`, starting with Mainspec over Offspec (`msos`). Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types (`LootDrop`, `LootAward`, `LootMethodConfigRecord`, re-exported `libs/loot-core` contract types), command names, events. The only import other modules may use |
| `src/store.ts` | `LootStore` and `LootRaidReader` ports, `LootDeps`, and `command = commandsFor<LootDeps>()` |
| `src/commands/` | `loot-list` (member), `loot-methods-list` (member), `loot-method-configure` (officer), `loot-candidates` (leader), `loot-award` (officer, `destructive: true`), `loot-history` (member), exported as `lootCommands` |
| `src/testing.ts` | Memory store and raid reader with the same behavior contract as the component |
| `convex/` | The `loot` Convex component: `drops`, `methodConfigs`, and `awards` tables |

## Rules

- **Methods are pure and live in `libs/loot-core`.** The host (`modules/loot`) loads raid context,
  config, and state, invokes the selected `LootMethod`, and persists awards and updated state.
  Never branch on a specific method id in the host.
- **Method selection per raid:** `loot-candidates` and `loot-award` resolve
  `input.methodId ?? raid.lootMethodId ?? 'msos'`.
- **Every award stamps its method and versions:** `methodId`, `methodVersion`, and `configVersion`
  (PLAN §5.3). `loot-method-configure` validates against `method.configSchema` and bumps
  `configVersion`.
- **`loot-award` is officer-only and `destructive: true`:** honors `ctx.dryRun` preview →
  confirm-token flow. Invalid awards per `method.validateAward` are refused unless `override: true`
  with a non-empty `note`.
- **Drops are written by `raid-export-record`** (raids), through raids' `RaidsLoot` port, which
  `apps/api` adapts to this module's store. Raids never reads these tables, and loot never depends
  on raids (`apps/api` adapts raids + identity to `LootRaidReader`).
- **`replaceDrops` replaces a raid's drops in one transaction**, so a re-recorded export never
  doubles them. Drops are listed oldest first (`at`, then insertion order).
- **Times are UTC epoch ms**. Nullable fields use `null`, not `undefined`.
