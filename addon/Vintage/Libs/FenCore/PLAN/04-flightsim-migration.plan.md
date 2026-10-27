# Phase 4: Flightsim Migration

Migrate Flightsim to use FenCore, removing its Core/ directory entirely.

## Current Flightsim Structure

```
Flightsim/
├── Core/
│   ├── Actions/
│   │   └── init.lua          → FenCore.ActionResult
│   ├── Logic/
│   │   ├── acceleration.lua  → Keep (Flightsim-specific)
│   │   ├── charges.lua       → FenCore.Charges
│   │   ├── cooldowns.lua     → FenCore.Cooldowns
│   │   ├── speed.lua         → FenCore.Progress (partial)
│   │   └── visibility.lua    → Keep (Flightsim-specific)
│   ├── Utils/
│   │   ├── color.lua         → FenCore.Color
│   │   └── math.lua          → FenCore.Math
│   ├── init.lua
│   ├── Utils.lua
│   └── utils_spec.lua
├── Bridge/
│   ├── Context.lua
│   ├── Events.lua
│   ├── Executor.lua
│   ├── init.lua
│   └── Secrets.lua           → FenCore.Secrets
├── Libs/
│   └── MechanicLib/
├── UI.lua
├── Config.lua
└── SettingsUI.lua
```

## Target Structure

```
Flightsim/
├── Libs/
│   ├── FenCore/              # NEW: Embedded FenCore
│   └── MechanicLib/
├── Bridge/
│   ├── Context.lua           # Updated to use FenCore
│   ├── Events.lua
│   ├── Executor.lua          # Updated to use FenCore
│   └── init.lua
├── Logic/                    # NEW: Flightsim-specific only
│   ├── acceleration.lua
│   ├── visibility.lua
│   └── speed.lua             # Thin wrapper or Flightsim-specific parts
├── UI.lua
├── Config.lua
└── SettingsUI.lua
```

## Migration Steps

### Step 1: Add FenCore Dependency

Update `flightsim.toc`:

```toc
## Interface: 120001
## Title: Flightsim
## Notes: Skyriding HUD
## Author: Falkicon
## Version: 1.3.0
## SavedVariables: FlightsimDB

# Libraries
Libs\FenCore\FenCore.xml
Libs\MechanicLib\MechanicLib.lua

# Bridge (uses FenCore)
Bridge\init.lua
Bridge\Secrets.lua
Bridge\Context.lua
Bridge\Events.lua
Bridge\Executor.lua

# Flightsim-specific logic
Logic\acceleration.lua
Logic\visibility.lua
Logic\speed.lua

# UI
UI.lua
Config.lua
SettingsUI.lua
```

### Step 2: Update Bridge/init.lua

```lua
-- Bridge/init.lua
-- Now delegates to FenCore

---@class FlightsimBridge
FlightsimBridge = FlightsimBridge or {}

-- Use FenCore for common utilities
local FenCore = _G.FenCore
if not FenCore then
    error("Flightsim requires FenCore library")
end

-- Alias for convenience
FlightsimBridge.Result = FenCore.ActionResult
FlightsimBridge.Math = FenCore.Math

-- Debug logging (unchanged)
function FlightsimBridge:Log(msg, category)
    if not Flightsim or not Flightsim.debugMode then return end
    
    local MechanicLib = LibStub and LibStub("MechanicLib-1.0", true)
    if MechanicLib then
        MechanicLib:Log("Flightsim", msg, category or "[Bridge]")
    end
end

return FlightsimBridge
```

### Step 3: Update Bridge/Secrets.lua

Replace with thin delegation:

```lua
-- Bridge/Secrets.lua
-- Delegates to FenCore.Secrets

local Bridge = FlightsimBridge
local FenCore = _G.FenCore

-- Direct delegation to FenCore
Bridge.Secrets = FenCore.Secrets

return Bridge.Secrets
```

### Step 4: Update Bridge/Context.lua

Replace imports:

```lua
-- Before
local Secrets = Bridge.Secrets
local SpeedLogic = FlightsimCore.Logic.Speed

-- After
local Secrets = FenCore.Secrets
local Progress = FenCore.Progress
local Math = FenCore.Math
```

Update function calls:

```lua
-- Before
if not Secrets.IsSecret(max) and max > 0 then

-- After (unchanged - same API)
if not Secrets.IsSecret(max) and max > 0 then
```

### Step 5: Update Bridge/Executor.lua

Replace Core references:

```lua
-- Before
local Core = FlightsimCore
local Actions = Core.Actions
local Math = Core.Utils.Math

-- After
local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math
local Charges = FenCore.Charges
local Cooldowns = FenCore.Cooldowns
local Progress = FenCore.Progress
local Color = FenCore.Color
```

Update action calls:

```lua
-- Before
return Actions.success({ ... })

-- After
return Result.success({ ... })
```

Update logic calls:

```lua
-- Before
local chargeResult = Core.Logic.Charges.CalculateAllCharges({...})

-- After
local chargeResult = Charges.CalculateAllCharges({...})
```

### Step 6: Create Logic/ Directory

Move Flightsim-specific logic:

```lua
-- Logic/acceleration.lua
-- Flightsim-specific acceleration bar logic

local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math

local Acceleration = {}

-- ... existing acceleration logic (unchanged) ...

return Acceleration
```

```lua
-- Logic/visibility.lua
-- Flightsim-specific visibility rules

local FenCore = _G.FenCore
local Result = FenCore.ActionResult

local Visibility = {}

-- ... existing visibility logic (unchanged) ...

return Visibility
```

```lua
-- Logic/speed.lua
-- Flightsim-specific speed calculations
-- (Zone adjustments, base speed constants)

local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Progress = FenCore.Progress
local Math = FenCore.Math

local Speed = {}

-- Flightsim-specific constants
Speed.BASE_SPEED_FOR_PCT = 8.24
Speed.SLOW_SKYRIDING_RATIO = 705 / 830
Speed.FAST_FLYING_ZONES = {
    [2444] = true, -- Dragon Isles
    [2454] = true, -- Zaralek Cavern
    -- etc.
}

-- Delegates to FenCore for generic progress
function Speed.Calculate(context)
    -- Use FenCore.Progress for fill calculation
    local fillResult = Progress.CalculateFillWithSessionMax(
        context.speedPct,
        context.configuredMax,
        context.sessionMax
    )
    
    -- Add Flightsim-specific fields
    local data = Result.unwrap(fillResult)
    data.isSlowZone = context.isSlowZone
    -- ... etc
    
    return Result.success(data)
end

return Speed
```

### Step 7: Remove Core/ Directory

After migration verified:

```bash
# Delete Core/ directory
rm -rf Flightsim/Core/
```

### Step 8: Update Tests

Move tests to use FenCore, delete duplicates:

```lua
-- Tests/helpers_spec.lua (if kept)
describe("Flightsim", function()
    -- Only test Flightsim-specific logic
    -- FenCore domains are tested in FenCore/Tests/
end)
```

## Verification Checklist

- [ ] Flightsim loads without Lua errors
- [ ] `/fs` command works
- [ ] Speed bar displays correctly
- [ ] Ability bars (Surge Forward, Second Wind, Whirling Surge) work
- [ ] Secret value handling works in combat
- [ ] Sandbox tests pass: `mech call sandbox.test -i '{"addon": "Flightsim"}'`
- [ ] No references to FlightsimCore remain

## Rollback Plan

If migration fails:
1. Core/ directory is still in git history
2. Revert TOC file changes
3. Restore FlightsimCore references

## Next Phase

Proceed to [05-mcp-integration.plan.md](05-mcp-integration.plan.md).
