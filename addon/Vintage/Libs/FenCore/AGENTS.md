# FenCore - Agent Documentation

Technical reference for AI agents working with FenCore.

## Quick Reference

| Task | API |
|------|-----|
| Create success result | `FenCore.ActionResult.success(data, reasoning)` |
| Create error result | `FenCore.ActionResult.error(code, msg, suggestion)` |
| Check result | `FenCore.ActionResult.isSuccess(result)` |
| Get data | `FenCore.ActionResult.unwrap(result)` |
| Transform result | `FenCore.ActionResult.map(result, fn)` |
| Clamp value | `FenCore.Math.Clamp(n, minValue, maxValue)` |
| Linear interpolation | `FenCore.Math.Lerp(a, b, t)` |
| Check secret | `FenCore.Secrets.IsSecret(val)` |
| Safe arithmetic | `FenCore.Secrets.SafeArithmetic(val, fn, fallback)` |
| Format duration | `FenCore.Time.FormatDuration(seconds)` |
| Format cooldown | `FenCore.Time.FormatCooldown(seconds)` |
| Truncate text | `FenCore.Text.Truncate(str, maxLen)` |
| Format number | `FenCore.Text.FormatNumber(n, decimals)` |
| Deep copy table | `FenCore.Tables.DeepCopy(tbl)` |
| Merge tables | `FenCore.Tables.DeepMerge(target, source)` |
| Check Midnight | `FenCore.Environment.IsMidnight()` |
| Get client type | `FenCore.Environment.GetClientType()` |

## Discovery

### Via MCP (Automatic Benefit)

When your addons use FenCore, agents automatically gain catalog discovery via Mechanic's MCP server after `/reload`:

| Command | Description |
|---------|-------------|
| `fencore-catalog` | Get full domain/function catalog |
| `fencore-search` | Search functions by name or description |
| `fencore-info` | Get detailed function info |

FenCore registers its catalog with MechanicLib, which syncs to SavedVariables. The desktop MCP server reads this data to expose the commands above.

### Via CLI

```bash
# Get full catalog
mech call fencore-catalog

# Search functions
mech call fencore-search -i '{"query": "clamp"}'

# Get function details
mech call fencore-info -i '{"domain": "Math", "function": "Clamp"}'
```

## Domain Overview

### ActionResult
The core pattern for all FenCore operations. Every domain function returns an ActionResult.

```lua
local Result = FenCore.ActionResult

-- Create results
local ok = Result.success({ value = 42 }, "calculated value")
local err = Result.error("INVALID_INPUT", "x must be positive")

-- Check and unwrap
if Result.isSuccess(ok) then
    local data = Result.unwrap(ok)
end
```

### Math
Pure mathematical utilities.

```lua
local Math = FenCore.Math

Math.Clamp(150, 0, 100)           -- 100
Math.Lerp(0, 100, 0.5)            -- 50
Math.Round(3.14159, 2)            -- 3.14
Math.ToFraction(75, 100)          -- 0.75
Math.MapRange(50, {inMin=0, inMax=100, outMin=0, outMax=1})  -- 0.5
Math.ApplyCurve(0.25)             -- 0.5 (sqrt curve)
```

### Secrets
Handle WoW 12.0+ secret values that crash on arithmetic/comparison.

```lua
local Secrets = FenCore.Secrets

Secrets.IsSecret(someValue)       -- true/false
Secrets.SafeToString(val)         -- "value" or "???"
Secrets.SafeCompare(a, b, ">")    -- true/false/nil
Secrets.CleanNumber(val)          -- number, isSecret
```

### Progress
Bar/fill calculations with session max support.

```lua
local Progress = FenCore.Progress

-- Basic fill calculation
Progress.CalculateFill(75, 100)   -- {fillPct: 0.75, ...}

-- With session max tracking
Progress.CalculateFillWithSessionMax(75, 100, 80)
```

### Charges
Ability charge calculations for multi-charge abilities.

```lua
local Charges = FenCore.Charges

-- Calculate single charge fill
Charges.CalculateChargeFill(30, 60)  -- 0.5 (halfway recharged)

-- Calculate all charges
Charges.CalculateAllCharges({
    currentCharges = 2,
    maxCharges = 3,
    chargeStart = GetTime() - 30,
    chargeDuration = 60,
    now = GetTime()
})
```

### Cooldowns
Cooldown progress calculations.

```lua
local Cooldowns = FenCore.Cooldowns

Cooldowns.CalculateProgress(GetTime() - 5, 10, GetTime())  -- 0.5
Cooldowns.IsReady(startTime, duration, GetTime())
Cooldowns.GetRemaining(startTime, duration, GetTime())
```

### Color
Color utilities for UI.

```lua
local Color = FenCore.Color

Color.Create(1, 0, 0)             -- {r=1, g=0, b=0}
Color.Lerp(red, green, 0.5)       -- yellow-ish
Color.ForHealth(0.5)              -- yellow
Color.ForProgress(0.75)           -- green-ish
Color.Gradient(0.5, {red, yellow, green})
```

### Time
Time formatting utilities.

```lua
local Time = FenCore.Time

Time.FormatDuration(3661)         -- "1 hour 1 min 1 sec"
Time.FormatCooldown(90)           -- "1:30"
Time.FormatCooldownShort(90)      -- "2m"
Time.ParseDuration("1h30m")       -- 5400
Time.FormatRelative(3600)         -- "1 hour ago"
```

### Text
Text formatting utilities.

```lua
local Text = FenCore.Text

Text.Truncate("Hello World", 8)   -- "Hello..."
Text.Pluralize(5, "item")         -- "5 items"
Text.FormatNumber(1234567)        -- "1,234,567"
Text.FormatCompact(1500000)       -- "1.5M"
Text.Capitalize("hello")          -- "Hello"
Text.StripColors("|cFFFF0000Red|r") -- "Red"
```

### Tables
Pure table utilities - no WoW dependencies.

```lua
local Tables = FenCore.Tables

-- Deep copy (preserves metatables)
local copy = Tables.DeepCopy(original)

-- Shallow merge (overwrites target keys)
Tables.Merge(target, source)

-- Deep merge (recursive, preserves nested tables)
Tables.DeepMerge(target, source)

-- Table inspection
local keys = Tables.Keys(tbl)       -- {"key1", "key2", ...}
local vals = Tables.Values(tbl)     -- {val1, val2, ...}
local count = Tables.Count(tbl)     -- number of entries
local has = Tables.Contains(tbl, "key")  -- true/false
```

### Environment
WoW client detection and version utilities.

```lua
local Env = FenCore.Environment

-- Version detection
Env.GetInterfaceVersion()    -- e.g., 120001
Env.GetVersion()             -- e.g., "12.0.5"
Env.GetBuild()               -- e.g., "58238"

-- Client type detection
Env.GetClientType()          -- "Retail", "PTR", or "Beta"
Env.IsMidnight()             -- true if 12.0+ (Midnight expansion)

-- Convenience checks
Env.IsRetail()               -- true if live retail
Env.IsPTR()                  -- true if PTR
Env.IsBeta()                 -- true if beta
```

## Testing

Run sandbox tests:
```bash
mech call sandbox.test '{"addon": "FenCore"}'
```

## Adding New Domains

1. Create `Domains/NewDomain.lua`
2. Implement functions following ActionResult patterns
3. Register with Catalog:
```lua
Catalog:RegisterDomain("NewDomain", {
    FunctionName = {
        handler = NewDomain.FunctionName,
        description = "What it does",
        params = {...},
        returns = {...},
        example = "..."
    }
})
```
4. Add tests in `Tests/NewDomain_spec.lua`
5. Update `Core/FenCore.xml` load order
