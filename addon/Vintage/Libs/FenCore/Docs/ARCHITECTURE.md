# FenCore Architecture

Technical deep-dive into FenCore's layered architecture and design decisions.

---

## Overview

FenCore is a foundation library for WoW addon development, providing pure logic domains that are testable without the WoW client. It sits at the bottom of the addon stack, beneath both UI libraries and application code.

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Addon (thin shell)                 │
│              Bridge/ (WoW ↔ Logic) + UI + features          │
├─────────────────────────────────────────────────────────────┤
│                          FenUI                              │
│              Widgets, Tokens, Theme, Animation              │
├─────────────────────────────────────────────────────────────┤
│                         FenCore                             │
│          ActionResult, Logic Domains, Catalog               │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. ActionResult

The foundational pattern for all structured operations. ActionResult provides a consistent way to handle success and failure across the library.

```
ActionResult<T>
├── success: boolean
├── data?: T              (if success)
├── error?: ActionError   (if failure)
│   ├── code: string
│   ├── message: string
│   └── suggestion?: string
└── reasoning?: string
```

**Why ActionResult?**

1. **Explicit failure handling** - No surprise exceptions
2. **Agent-friendly** - Structured data for AI consumption
3. **Self-documenting** - Reasoning field explains decisions
4. **Chainable** - `map()` for transformations

**When to use:**

| Scenario | Use ActionResult? |
|----------|-------------------|
| Can fail (validation, parsing) | Yes |
| Multiple return fields | Yes |
| Pure math that never fails | No - return value directly |
| Boolean check | No - return boolean directly |

### 2. Catalog

Self-describing registry for MCP/agent discovery. Every domain function is registered with metadata enabling programmatic discovery.

```lua
Catalog:RegisterDomain("Math", {
    Clamp = {
        handler = Math.Clamp,
        description = "Clamp a number between min and max",
        params = {
            { name = "n", type = "number", required = true },
            { name = "minValue", type = "number", required = true },
            { name = "maxValue", type = "number", required = true },
        },
        returns = { type = "number" },
        example = "Math.Clamp(150, 0, 100) → 100",
    },
})
```

**Discovery Methods:**

| Method | Description |
|--------|-------------|
| `Catalog:GetCatalog()` | Full catalog export |
| `Catalog:Search(query)` | Search by name/description |
| `Catalog:GetInfo(domain, func)` | Specific function details |
| `Catalog:GetDomains()` | List all domain names |

### 3. Domains

Logic modules organized by concept, not implementation. Each domain:

- Is a single Lua file in `Domains/`
- Contains pure functions with no WoW dependencies (except Environment)
- Registers all functions with the Catalog
- Is testable in the sandbox

**Current Domains:**

| Domain | Purpose | WoW-Free? |
|--------|---------|-----------|
| Math | Pure math utilities | Yes |
| Tables | Table manipulation | Yes |
| Secrets | Secret value handling | Yes |
| Environment | Client detection | No* |
| Progress | Bar/fill calculations | Yes |
| Charges | Ability charge logic | Yes |
| Cooldowns | Cooldown progress | Yes |
| Color | Color utilities | Yes |
| Time | Time formatting | Yes |
| Text | Text formatting | Yes |

*Environment uses `GetBuildInfo()` but gracefully degrades in sandbox.

---

## Load Order

The XML loader ensures correct initialization:

```xml
<!-- Core (load first) -->
<Script file="FenCore.lua"/>      <!-- Creates _G.FenCore -->
<Script file="ActionResult.lua"/> <!-- Sets FenCore.ActionResult -->
<Script file="Catalog.lua"/>      <!-- Sets FenCore.Catalog -->

<!-- Domains (depend on Core) -->
<Script file="..\Domains\Math.lua"/>
<Script file="..\Domains\Tables.lua"/>
<Script file="..\Domains\Secrets.lua"/>
<!-- ... more domains ... -->
```

**Initialization Flow:**

1. `FenCore.lua` creates the global namespace
2. `ActionResult.lua` attaches the Result pattern
3. `Catalog.lua` attaches the registry
4. Each domain:
   - Accesses `FenCore` and `Catalog`
   - Implements functions
   - Calls `Catalog:RegisterDomain()`
   - Attaches to `FenCore.DomainName`

---

## Integration Points

### MechanicLib Registration

FenCore optionally integrates with Mechanic's MCP server:

```lua
local function RegisterWithMechanic()
    local MechanicLib = LibStub and LibStub("MechanicLib-1.0", true)
    if MechanicLib and FenCore.Catalog then
        MechanicLib:Register("FenCore", {
            version = FenCore.version,
            catalog = function() return FenCore:GetCatalog() end,
        })
    end
end

C_Timer.After(0, RegisterWithMechanic)  -- Deferred
```

This enables the `fencore-catalog`, `fencore-search`, and `fencore-info` MCP commands.

### Slash Commands

Built-in slash commands for debugging:

```
/fencore          - Show version
/fencore debug    - Toggle debug mode
/fencore catalog  - Show domain summary
```

### Debug Logging

When debug mode is enabled, FenCore logs to MechanicLib (if available) or print:

```lua
FenCore:Log("Registered domain: Math", "[Catalog]")
```

---

## Domain Architecture Pattern

Each domain follows a consistent pattern:

```lua
-- 1. Get dependencies
local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math  -- If needed
local Catalog = FenCore.Catalog

-- 2. Create local module
local MyDomain = {}

-- 3. Implement functions
function MyDomain.SomeFunction(param1, param2)
    -- Validate
    if param1 == nil then
        return Result.error("INVALID_INPUT", "param1 is required")
    end

    -- Calculate
    local result = doSomething(param1, param2)

    -- Return structured result
    return Result.success({
        value = result,
        wasProcessed = true,
    })
end

-- 4. Register with Catalog
Catalog:RegisterDomain("MyDomain", {
    SomeFunction = {
        handler = MyDomain.SomeFunction,
        description = "Does something useful",
        params = { ... },
        returns = { ... },
        example = "...",
    },
})

-- 5. Attach to FenCore and export
FenCore.MyDomain = MyDomain
return MyDomain
```

---

## Testing Architecture

FenCore is designed for sandbox testing without WoW:

```bash
mech call sandbox.test -i '{"addon": "FenCore"}'
```

**Test Structure:**

```
FenCore/
└── Tests/
    ├── ActionResult_spec.lua
    ├── Math_spec.lua
    ├── Progress_spec.lua
    └── ... (one per domain)
```

**Test Pattern:**

```lua
-- Tests/Math_spec.lua
describe("Math.Clamp", function()
    it("returns value when within range", function()
        assert.equals(50, FenCore.Math.Clamp(50, 0, 100))
    end)

    it("clamps to min when below", function()
        assert.equals(0, FenCore.Math.Clamp(-10, 0, 100))
    end)

    it("clamps to max when above", function()
        assert.equals(100, FenCore.Math.Clamp(150, 0, 100))
    end)
end)
```

---

## Dependency Graph

```
FenCore.lua
    │
    ├── ActionResult.lua
    │       (no deps)
    │
    └── Catalog.lua
            (no deps)
            │
            ├── Math.lua
            │   (uses Catalog)
            │
            ├── Tables.lua
            │   (uses Catalog)
            │
            ├── Secrets.lua
            │   (uses Catalog)
            │
            ├── Environment.lua
            │   (uses Catalog, WoW APIs)
            │
            ├── Progress.lua
            │   (uses Catalog, Result, Math)
            │
            ├── Charges.lua
            │   (uses Catalog, Result, Math, Secrets)
            │
            ├── Cooldowns.lua
            │   (uses Catalog, Result, Math, Secrets)
            │
            ├── Color.lua
            │   (uses Catalog, Math)
            │
            ├── Time.lua
            │   (uses Catalog, Math)
            │
            └── Text.lua
                (uses Catalog, Math)
```

---

## Design Decisions

### Why Global Namespace?

FenCore uses `_G.FenCore` as a global for simplicity:

1. **Single entry point** - All domains accessible from one object
2. **No LibStub dependency** - Standalone library
3. **Consistent access** - Same pattern everywhere

### Why Domains, Not Classes?

Domains are **concept-based**, not object-based:

- `FenCore.Math` - mathematical operations
- `FenCore.Color` - color operations
- `FenCore.Time` - time operations

This matches how developers think about problems, not implementation.

### Why Pure Functions?

All domain functions are pure (except Environment):

1. **Testable** - No WoW client needed
2. **Predictable** - Same input = same output
3. **Composable** - Easy to chain operations
4. **Debuggable** - No hidden state

### Why ActionResult for Some, Direct Return for Others?

Cost-benefit analysis:

| Pattern | When |
|---------|------|
| ActionResult | Can fail, multiple fields, needs error context |
| Direct return | Pure math, simple transforms, boolean checks |

`Math.Clamp()` returns a number directly - it cannot fail.
`Progress.CalculateFill()` returns ActionResult - it validates input.

---

## Extension Points

### Adding a New Domain

1. Create `Domains/NewDomain.lua`
2. Implement functions following the pattern
3. Register with `Catalog:RegisterDomain()`
4. Add to `Core/FenCore.xml` load order
5. Create `Tests/NewDomain_spec.lua`

### Adding Functions to Existing Domains

1. Implement in the domain file
2. Add to the Catalog registration
3. Add tests

### Adding MCP Commands

If registered with MechanicLib, the Catalog automatically exposes discovery commands. No additional work needed.

---

## Performance Considerations

### Function Call Overhead

Direct function calls have minimal overhead:

```lua
-- Fast - direct call
local clamped = FenCore.Math.Clamp(150, 0, 100)

-- Also fast - stored reference
local Clamp = FenCore.Math.Clamp
for i = 1, 1000 do
    local x = Clamp(i, 0, 100)
end
```

### ActionResult Allocation

ActionResult creates new tables. For hot paths, consider:

```lua
-- Hot path - use direct functions
local fill = FenCore.Math.ToFraction(current, max)

-- Cold path - use ActionResult for validation
local result = FenCore.Progress.CalculateFill(current, max)
```

### Catalog Overhead

Catalog registration happens once at load time. Runtime queries are table lookups - fast and suitable for MCP use.
