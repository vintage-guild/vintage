# FenCore Master Plan

## Vision

FenCore is a standalone foundation library for WoW addon development. It provides:

- **ActionResult pattern** - AFD-style structured results for all operations
- **Pure logic domains** - Testable functions with no WoW dependencies
- **Catalog system** - Self-describing API for agent/MCP discovery

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Addon (thin shell)                 │
│                   Bridge/ + UI + unique features            │
├─────────────────────────────────────────────────────────────┤
│                          FenUI                              │
│              Widgets, Tokens, Theme, Animation              │
├─────────────────────────────────────────────────────────────┤
│                         FenCore                             │
│          ActionResult, Logic Domains, Catalog               │
└─────────────────────────────────────────────────────────────┘
```

## Dependency Options

| Addon Type | FenCore | FenUI | Example |
|------------|---------|-------|---------|
| HUD/overlay | ✅ | ❌ | Flightsim (texture bars only) |
| Full UI app | ✅ | ✅ | Weekly (panels, tabs, grid) |
| Data-only | ✅ | ❌ | Background processors |

## Plan Phases

| Phase | File | Description |
|-------|------|-------------|
| 1 | [01-foundation.plan.md](01-foundation.plan.md) | Core files: FenCore.lua, ActionResult, Catalog |
| 2 | [02-domains.plan.md](02-domains.plan.md) | Logic domains: Math, Secrets, Progress, etc. (8 domains) |
| 3 | [03-testing.plan.md](03-testing.plan.md) | Sandbox testing setup |
| 4 | [04-flightsim-migration.plan.md](04-flightsim-migration.plan.md) | First addon migration |
| 5 | [05-mcp-integration.plan.md](05-mcp-integration.plan.md) | MCP commands for discovery |
| 6 | [06-ecosystem.plan.md](06-ecosystem.plan.md) | lib_sync, other addons |
| 7 | [07-fenui-migration.plan.md](07-fenui-migration.plan.md) | FenUI migration, new domains (Tables, Environment) |

## File Structure (Target)

```
FenCore/
├── FenCore.toc
├── FenCore.xml
├── AGENTS.md
├── README.md
├── CHANGELOG.md
│
├── Core/
│   ├── FenCore.lua           # Namespace, version, debug
│   ├── ActionResult.lua      # AFD result pattern
│   └── Catalog.lua           # Registry + discovery
│
├── Domains/                  # 10 domains total
│   ├── Math.lua              # Clamp, Lerp, Round, MapRange
│   ├── Secrets.lua           # IsSecret, SafeCompare, CountSecrets (Midnight)
│   ├── Tables.lua            # DeepCopy, Merge, Keys, Values (from FenUI)
│   ├── Environment.lua       # IsMidnight, GetClientType (from FenUI)
│   ├── Progress.lua          # CalculateFill, Normalize
│   ├── Charges.lua           # CalculateCharges, AdvanceAnimation
│   ├── Cooldowns.lua         # CalculateCooldown, IsReady
│   ├── Color.lua             # Gradient, Lerp, ForHealth
│   ├── Time.lua              # FormatDuration, FormatCooldown
│   └── Text.lua              # Truncate, Pluralize, FormatNumber, FormatMemory
│
├── Tests/
│   ├── ActionResult_spec.lua
│   ├── Math_spec.lua
│   └── ...
│
└── PLAN/
    └── *.plan.md
```

## Success Criteria

- [ ] FenCore loads standalone in WoW (no errors)
- [ ] `FenCore:Catalog()` returns valid schema (10 domains)
- [ ] All domains pass sandbox tests
- [ ] Flightsim works with FenCore (Core/ removed)
- [ ] `mech call fencore.catalog` works via MCP
- [ ] FenUI depends on FenCore (Utils/ delegates)
- [ ] No duplicate code between FenCore and FenUI
- [ ] lib_sync includes FenCore

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| 1. Foundation | 2-3 hours | None |
| 2. Domains (8 initial) | 3-4 hours | Foundation |
| 3. Testing | 1-2 hours | Domains |
| 4. Flightsim Migration | 2-3 hours | Testing |
| 5. MCP Integration | 1-2 hours | Migration |
| 6. Ecosystem | 2-3 hours | All above |
| 7. FenUI Migration | 3-4 hours | Ecosystem |

**Total**: ~15-21 hours of focused work
