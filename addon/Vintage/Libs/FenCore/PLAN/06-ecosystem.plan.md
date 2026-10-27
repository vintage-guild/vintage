# Phase 6: Ecosystem Integration

Integrate FenCore with FenUI, lib_sync, and prepare for other addon migrations.

## FenUI Integration

### Update FenUI Dependency

`FenUI/FenUI.toc`:

```toc
## Interface: 120001
## Title: FenUI
## Notes: UI widget library for WoW addons
## Author: Falkicon
## Version: 2.9.0
## Dependencies: FenCore

# FenCore must load first (handled by Dependencies)

# FenUI Core
Core\FenUI.xml
```

### Refactor FenUI Utils

FenUI has its own `Utils/` folder. Some utilities can delegate to FenCore:

```lua
-- FenUI/Utils/Colors.lua
-- Delegate to FenCore where appropriate

local FenCore = _G.FenCore
local FenUI = _G.FenUI

-- Use FenCore for color lerping
FenUI.Utils.LerpColor = function(c1, c2, t)
    return FenCore.Color.Lerp(c1, c2, t)
end

-- Keep FenUI-specific color utilities (token-based)
FenUI.Utils.GetTokenColor = function(token)
    -- FenUI-specific token resolution
end
```

### What Stays in FenUI Utils

| FenUI Util | Keep/Delegate | Reason |
|------------|---------------|--------|
| `Colors.lua` | Partial delegate | Token resolution stays, lerping delegates |
| `Tables.lua` | Keep | Table utilities are generic |
| `Formatting.lua` | Delegate | Use FenCore.Text |
| `SafeAPI.lua` | Keep | WoW API wrappers (Bridge-level) |
| `SecretValues.lua` | Delete | Use FenCore.Secrets |
| `UI.lua` | Keep | Frame utilities (UI-specific) |

## Library Sync Update

### Update `lib_sync.ps1`

Add FenCore to the sync targets:

```powershell
# lib_sync.ps1 - Library distribution script

$SOURCE_ROOT = "C:\Program Files (x86)\World of Warcraft\_dev_"

# Libraries to sync
$LIBRARIES = @(
    @{ Name = "FenCore"; Path = "$SOURCE_ROOT\FenCore" },
    @{ Name = "FenUI"; Path = "$SOURCE_ROOT\MechanicLocal\Libs\FenUI" },
    @{ Name = "MechanicLib"; Path = "$SOURCE_ROOT\Mechanic\!Mechanic\Libs\MechanicLib" }
)

# Target addons
$ADDONS = @(
    "Flightsim",
    "Weekly",
    "ActionHud",
    "Strategy",
    "ClassyMap"
)

foreach ($addon in $ADDONS) {
    $addonPath = "$SOURCE_ROOT\$addon"
    if (Test-Path $addonPath) {
        foreach ($lib in $LIBRARIES) {
            $targetPath = "$addonPath\Libs\$($lib.Name)"
            
            # Remove existing
            if (Test-Path $targetPath) {
                Remove-Item -Recurse -Force $targetPath
            }
            
            # Copy fresh
            Copy-Item -Recurse $lib.Path $targetPath
            Write-Host "Synced $($lib.Name) to $addon"
        }
    }
}
```

## Other Addon Migrations

### Weekly Migration

Weekly already uses FenUI. Add FenCore:

1. Update TOC to depend on FenCore
2. Replace any duplicate math/text utilities with FenCore
3. Use FenCore.ActionResult for data operations

### ActionHud Migration

Similar to Flightsim:
1. Add FenCore dependency
2. Extract common logic to FenCore if reusable
3. Keep ActionHud-specific Bridge/UI

### Strategy Migration

Strategy is least developed - can be built FenCore-first from the start.

## Documentation

### FenCore README.md

```markdown
# FenCore

Foundation library for WoW addon development.

## Features

- **ActionResult** - AFD-style structured results
- **Logic Domains** - Pure, testable functions
- **Catalog System** - Self-describing API for discovery

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

| Domain | Functions |
|--------|-----------|
| Math | Clamp, Lerp, Round, MapRange, ToFraction |
| Secrets | IsSecret, SafeCompare, SafeToString |
| Progress | CalculateFill, CalculateMarker |
| Charges | CalculateChargeFill, CalculateAllCharges |
| Cooldowns | CalculateProgress, Calculate |
| Color | Lerp, Gradient, ForHealth |
| Time | FormatDuration, FormatCooldown |
| Text | Truncate, Pluralize, FormatNumber |

## MCP Discovery

```bash
mech call fencore.catalog
mech call fencore.search -i '{"query": "format"}'
```

## License

GPL-3.0
```

### FenCore AGENTS.md

```markdown
# FenCore - Agent Documentation

Technical reference for AI agents working with FenCore.

## Quick Reference

| Task | API |
|------|-----|
| Create success result | `FenCore.ActionResult.success(data, reasoning)` |
| Create error result | `FenCore.ActionResult.error(code, msg, suggestion)` |
| Check result | `FenCore.ActionResult.isSuccess(result)` |
| Get data | `FenCore.ActionResult.unwrap(result)` |
| Clamp value | `FenCore.Math.Clamp(n, min, max)` |
| Check secret | `FenCore.Secrets.IsSecret(val)` |
| Format duration | `FenCore.Time.FormatDuration(seconds)` |

## Discovery

Get catalog via MCP:
```
mech call fencore.catalog
```

Search functions:
```
mech call fencore.search -i '{"query": "clamp"}'
```

## Testing

Run sandbox tests:
```
mech call sandbox.test -i '{"addon": "FenCore"}'
```

## Adding New Domains

1. Create `Domains/NewDomain.lua`
2. Implement functions following patterns
3. Register with Catalog
4. Add tests in `Tests/NewDomain_spec.lua`
5. Update FenCore.xml load order
```

## Final Verification

- [ ] FenCore loads standalone
- [ ] FenUI loads with FenCore dependency
- [ ] Flightsim works with embedded FenCore (no FenUI)
- [ ] Weekly works with embedded FenCore + FenUI
- [ ] `lib_sync.ps1` distributes both libraries
- [ ] `mech call fencore.catalog` works
- [ ] All sandbox tests pass
- [ ] Documentation complete

## Future Considerations

### New Domains to Add

As more addons migrate, consider adding:
- `Animation` - Easing functions, timing
- `Currency` - Gold formatting, parsing
- `Unit` - Unit frame utilities
- `Inventory` - Bag/slot calculations

### Versioning Strategy

- Semantic versioning (1.0.0)
- Breaking changes = major bump
- New domains = minor bump
- Bug fixes = patch bump

### Backwards Compatibility

When updating FenCore:
- Don't remove functions (deprecate instead)
- Don't change function signatures
- Add new optional parameters at end
- Document migration path for breaking changes
