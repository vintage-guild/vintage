# @vintage/loot-core

Pure, platform-free loot method contract and swappable raid loot methods (PLAN §5, #26).

## Design

- **Pure code only:** zero Convex, Discord, network, or clock I/O. Every method is deterministic and
  unit-testable with plain fixtures.
- **`LootMethod<Config, State>`:** stable `id`, `version`, Zod `configSchema`, `initialState`,
  `candidates(item, ctx)`, `validateAward(draft, ctx)`, `apply(award, ctx)`, and optional
  `standings` / `onRaidCompleted`.
- **First method:** `msos` (**Mainspec over Offspec**, settled in Q5 / #30), with optional
  per-raid mainspec cap (`maxMainspecPerRaid`) and MS+1 tiebreaking (`plusOne`).
