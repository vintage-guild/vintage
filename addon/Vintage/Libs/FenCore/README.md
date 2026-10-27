# FenCore

Foundation library for WoW addon development.

## Features

- **ActionResult** - AFD-style structured results for all operations
- **Logic Domains** - Pure, testable functions with no WoW dependencies
- **Catalog System** - Self-describing API for MCP/agent discovery

## Installation

Embed FenCore in your addon:

```
YourAddon/
└── Libs/
    └── FenCore/
```

Add to your TOC:
```toc
Libs\FenCore\FenCore.xml
```

## Usage

```lua
local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math

-- Use ActionResult for operations
local result = FenCore.Progress.CalculateFill(75, 100)
if Result.isSuccess(result) then
    local data = Result.unwrap(result)
    print("Fill:", data.fillPct)
end

-- Direct utility access
local clamped = Math.Clamp(150, 0, 100)  -- 100
```

## Domains

| Domain | Description | Key Functions |
|--------|-------------|---------------|
| Math | Pure math utilities | Clamp, Lerp, Round, MapRange, ToFraction |
| Secrets | WoW 12.0+ secret value handling | IsSecret, SafeCompare, SafeToString |
| Progress | Bar/fill calculations | CalculateFill, CalculateMarker |
| Charges | Ability charge logic | CalculateChargeFill, CalculateAllCharges |
| Cooldowns | Cooldown progress | CalculateProgress, Calculate, IsReady |
| Color | Color utilities | Lerp, Gradient, ForHealth, ForProgress |
| Time | Time formatting | FormatDuration, FormatCooldown, ParseDuration |
| Text | Text formatting | Truncate, Pluralize, FormatNumber, FormatCompact |

## ActionResult Pattern

All domain functions return structured results:

```lua
-- Success result
{
    success = true,
    data = { ... },
    reasoning = "optional explanation"
}

-- Error result
{
    success = false,
    error = {
        code = "ERROR_CODE",
        message = "Human-readable message",
        suggestion = "What to do about it"
    }
}
```

## MCP Discovery

Use Mechanic CLI to discover FenCore's API:

```bash
# Get full catalog
mech call fencore-catalog

# Search for functions
mech call fencore-search -i '{"query": "format"}'

# Get specific function info
mech call fencore-info -i '{"domain": "Math", "function": "Clamp"}'
```

## Testing

Run sandbox tests:
```bash
mech call sandbox.test -i '{"addon": "FenCore"}'
```

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

## License

GPL-3.0
