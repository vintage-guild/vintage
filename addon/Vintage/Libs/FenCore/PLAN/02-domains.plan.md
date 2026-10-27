# Phase 2: Logic Domains

Create all pure logic domain modules. Each domain is self-contained, tested, and self-registering.

## Domain Inventory

| Domain | Source | Functions |
|--------|--------|-----------|
| Math | Flightsim/Core/Utils/math.lua | Clamp, Lerp, SmoothDelta, ToPercentage, ToFraction |
| Secrets | Flightsim/Bridge/Secrets.lua | IsSecret, SafeCompare, SafeToString, SafeArithmetic |
| Progress | Generalized from speed.lua | CalculateFill, Normalize, CalculateBarFill |
| Charges | Flightsim/Core/Logic/charges.lua | CalculateChargeFill, CalculateAllCharges, AdvanceAnimation |
| Cooldowns | Flightsim/Core/Logic/cooldowns.lua | CalculateProgress, Calculate, HandleSecretFallback |
| Color | Flightsim/Core/Utils/color.lua | Lerp, Gradient, ForHealth, ForProgress |
| Time | New | FormatDuration, FormatCooldown, ParseDuration |
| Text | New | Truncate, Pluralize, FormatNumber |

## File: `Domains/Math.lua`

```lua
-- Math.lua
-- Pure math utilities - no WoW dependencies

local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Catalog = FenCore.Catalog

local Math = {}

--- Clamp a number between min and max.
---@param n number Value to clamp
---@param minV number Minimum value
---@param maxV number Maximum value
---@return number Clamped value
function Math.Clamp(n, minV, maxV)
    if n < minV then return minV end
    if n > maxV then return maxV end
    return n
end

--- Linear interpolation between two values.
---@param a number Start value
---@param b number End value
---@param t number Interpolation factor (0-1)
---@return number Interpolated value
function Math.Lerp(a, b, t)
    t = Math.Clamp(t, 0, 1)
    return a + (b - a) * t
end

--- Smooth a delta value using exponential moving average.
---@param oldSmooth number Previous smoothed value
---@param newDelta number New raw delta
---@param oldWeight? number Weight for old value (default 0.7)
---@return number Smoothed delta
function Math.SmoothDelta(oldSmooth, newDelta, oldWeight)
    oldWeight = oldWeight or 0.7
    local newWeight = 1 - oldWeight
    return oldSmooth * oldWeight + newDelta * newWeight
end

--- Calculate percentage from current/max values.
---@param current number Current value
---@param max number Maximum value
---@return number Percentage (0-100)
function Math.ToPercentage(current, max)
    if max <= 0 then return 0 end
    return (current / max) * 100
end

--- Calculate fill fraction from current/max values.
---@param current number Current value
---@param max number Maximum value
---@return number Fraction (0-1)
function Math.ToFraction(current, max)
    if max <= 0 then return 0 end
    return Math.Clamp(current / max, 0, 1)
end

--- Normalize a value to a -1 to 1 range.
---@param value number Raw value
---@param maxValue number Maximum expected value
---@return number Normalized value (-1 to 1)
function Math.NormalizeDelta(value, maxValue)
    if maxValue <= 0 then return 0 end
    return Math.Clamp(value / maxValue, -1, 1)
end

--- Round a number to N decimal places.
---@param n number Value to round
---@param decimals? number Decimal places (default 0)
---@return number Rounded value
function Math.Round(n, decimals)
    decimals = decimals or 0
    local mult = 10 ^ decimals
    return math.floor(n * mult + 0.5) / mult
end

--- Map a value from one range to another.
---@param value number Input value
---@param inMin number Input range minimum
---@param inMax number Input range maximum
---@param outMin number Output range minimum
---@param outMax number Output range maximum
---@return number Mapped value
function Math.MapRange(value, inMin, inMax, outMin, outMax)
    if inMax == inMin then return outMin end
    local normalized = (value - inMin) / (inMax - inMin)
    return outMin + normalized * (outMax - outMin)
end

-- Register with catalog
Catalog:RegisterDomain("Math", {
    Clamp = {
        handler = Math.Clamp,
        description = "Clamp a number between min and max",
        params = {
            { name = "n", type = "number", required = true },
            { name = "minV", type = "number", required = true },
            { name = "maxV", type = "number", required = true },
        },
        returns = { type = "number" },
        example = "Math.Clamp(150, 0, 100) → 100",
    },
    Lerp = {
        handler = Math.Lerp,
        description = "Linear interpolation between two values",
        params = {
            { name = "a", type = "number", required = true },
            { name = "b", type = "number", required = true },
            { name = "t", type = "number", required = true, description = "0-1" },
        },
        returns = { type = "number" },
        example = "Math.Lerp(0, 100, 0.5) → 50",
    },
    ToFraction = {
        handler = Math.ToFraction,
        description = "Calculate fill fraction from current/max",
        params = {
            { name = "current", type = "number", required = true },
            { name = "max", type = "number", required = true },
        },
        returns = { type = "number", description = "0-1" },
        example = "Math.ToFraction(75, 100) → 0.75",
    },
    ToPercentage = {
        handler = Math.ToPercentage,
        description = "Calculate percentage from current/max",
        params = {
            { name = "current", type = "number", required = true },
            { name = "max", type = "number", required = true },
        },
        returns = { type = "number", description = "0-100" },
        example = "Math.ToPercentage(75, 100) → 75",
    },
    Round = {
        handler = Math.Round,
        description = "Round to N decimal places",
        params = {
            { name = "n", type = "number", required = true },
            { name = "decimals", type = "number", required = false, default = 0 },
        },
        returns = { type = "number" },
        example = "Math.Round(3.14159, 2) → 3.14",
    },
    MapRange = {
        handler = Math.MapRange,
        description = "Map value from one range to another",
        params = {
            { name = "value", type = "number", required = true },
            { name = "inMin", type = "number", required = true },
            { name = "inMax", type = "number", required = true },
            { name = "outMin", type = "number", required = true },
            { name = "outMax", type = "number", required = true },
        },
        returns = { type = "number" },
        example = "Math.MapRange(50, 0, 100, 0, 1) → 0.5",
    },
})

FenCore.Math = Math
return Math
```

## File: `Domains/Secrets.lua`

```lua
-- Secrets.lua
-- Midnight (12.0+) secret value handling

local FenCore = _G.FenCore
local Catalog = FenCore.Catalog

local Secrets = {}

--- Check if a value is a WoW secret value.
---@param val any Value to check
---@return boolean isSecret
function Secrets.IsSecret(val)
    if val == nil then return false end
    
    -- Use WoW's built-in check if available (Midnight+)
    if issecretvalue then
        return issecretvalue(val) == true
    end
    
    -- Fallback: secret values crash on comparison
    local ok = pcall(function()
        local _ = (val > -1e12)
    end)
    return not ok
end

--- Safely convert a value to string.
---@param val any Value to convert
---@return string
function Secrets.SafeToString(val)
    if val == nil then return "nil" end
    if Secrets.IsSecret(val) then return "???" end
    return tostring(val)
end

--- Safely compare two values.
---@param a any First value
---@param b any Second value
---@param op string Operator: ">", "<", ">=", "<=", "==", "~="
---@return boolean|nil Result or nil if comparison not possible
function Secrets.SafeCompare(a, b, op)
    if a == nil or b == nil then return nil end
    if Secrets.IsSecret(a) or Secrets.IsSecret(b) then return nil end
    
    if op == ">" then return a > b
    elseif op == "<" then return a < b
    elseif op == ">=" then return a >= b
    elseif op == "<=" then return a <= b
    elseif op == "==" then return a == b
    elseif op == "~=" then return a ~= b
    end
    return nil
end

--- Safely perform arithmetic on a value.
---@param val number|secret Value to use
---@param operation function Operation to perform
---@param fallback any Fallback value if secret
---@return any Result or fallback
function Secrets.SafeArithmetic(val, operation, fallback)
    if val == nil or Secrets.IsSecret(val) then
        return fallback
    end
    
    local ok, result = pcall(operation, val)
    if not ok then return fallback end
    return result
end

--- Extract a clean number from a potentially secret value.
---@param val any Raw value
---@return number|nil value, boolean isSecret
function Secrets.CleanNumber(val)
    if val == nil then return nil, false end
    if Secrets.IsSecret(val) then return nil, true end
    if type(val) == "number" then return val, false end
    return nil, false
end

-- Register with catalog
Catalog:RegisterDomain("Secrets", {
    IsSecret = {
        handler = Secrets.IsSecret,
        description = "Check if a value is a WoW secret value (Midnight+)",
        params = {
            { name = "val", type = "any", required = true },
        },
        returns = { type = "boolean" },
        example = "Secrets.IsSecret(someValue) → true/false",
    },
    SafeToString = {
        handler = Secrets.SafeToString,
        description = "Safely convert value to string (returns '???' for secrets)",
        params = {
            { name = "val", type = "any", required = true },
        },
        returns = { type = "string" },
        example = 'Secrets.SafeToString(secretVal) → "???"',
    },
    SafeCompare = {
        handler = Secrets.SafeCompare,
        description = "Safely compare two values (returns nil if either is secret)",
        params = {
            { name = "a", type = "any", required = true },
            { name = "b", type = "any", required = true },
            { name = "op", type = "string", required = true, description = '">", "<", ">=", "<=", "==", "~="' },
        },
        returns = { type = "boolean|nil" },
        example = 'Secrets.SafeCompare(a, b, ">") → true/false/nil',
    },
    CleanNumber = {
        handler = Secrets.CleanNumber,
        description = "Extract clean number from potentially secret value",
        params = {
            { name = "val", type = "any", required = true },
        },
        returns = { type = "number|nil, boolean" },
        example = "local num, isSecret = Secrets.CleanNumber(val)",
    },
})

FenCore.Secrets = Secrets
return Secrets
```

## File: `Domains/Progress.lua`

Generalized progress/fill bar calculations (extracted from Flightsim speed.lua):

```lua
-- Progress.lua
-- Progress bar and fill calculations

local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math
local Catalog = FenCore.Catalog

local Progress = {}

--- Calculate bar fill percentage.
---@param current number Current value
---@param max number Maximum value
---@return ActionResult<{fillPct: number, isAtMax: boolean}>
function Progress.CalculateFill(current, max)
    if current == nil then
        return Result.error("INVALID_INPUT", "current is required")
    end
    if max == nil or max <= 0 then
        max = 100
    end
    
    local fillPct = Math.Clamp(current / max, 0, 1)
    local isAtMax = fillPct >= 0.99
    
    return Result.success({
        fillPct = fillPct,
        isAtMax = isAtMax,
    })
end

--- Calculate fill with effective max (session max override).
---@param current number Current value
---@param configuredMax number User-configured maximum
---@param sessionMax? number Session observed maximum
---@return ActionResult<{fillPct: number, effectiveMax: number, usedSession: boolean}>
function Progress.CalculateFillWithSessionMax(current, configuredMax, sessionMax)
    if current == nil then
        return Result.error("INVALID_INPUT", "current is required")
    end
    
    configuredMax = configuredMax or 100
    local effectiveMax = configuredMax
    local usedSession = false
    
    if sessionMax and sessionMax > configuredMax then
        effectiveMax = sessionMax
        usedSession = true
    end
    
    if effectiveMax <= 0 then
        effectiveMax = 1
    end
    
    local fillPct = Math.Clamp(current / effectiveMax, 0, 1)
    
    return Result.success({
        fillPct = fillPct,
        effectiveMax = effectiveMax,
        usedSession = usedSession,
    })
end

--- Calculate marker position on a progress bar.
---@param markerValue number Value for the marker
---@param max number Maximum value
---@return ActionResult<{markerPct: number, shouldShow: boolean}>
function Progress.CalculateMarker(markerValue, max)
    if markerValue == nil or markerValue <= 0 then
        return Result.success({
            markerPct = 0,
            shouldShow = false,
        })
    end
    
    if max == nil or max <= 0 then
        max = 100
    end
    
    local markerPct = Math.Clamp(markerValue / max, 0, 1)
    
    return Result.success({
        markerPct = markerPct,
        shouldShow = true,
    })
end

--- Normalize a raw value to percentage.
---@param rawValue number Raw value
---@param baseValue number Value that equals 100%
---@return ActionResult<{percentage: number}>
function Progress.ToPercentage(rawValue, baseValue)
    if rawValue == nil then
        return Result.error("INVALID_INPUT", "rawValue is required")
    end
    
    baseValue = baseValue or 1
    if baseValue <= 0 then
        baseValue = 1
    end
    
    local pct = (rawValue / baseValue) * 100
    
    return Result.success({
        percentage = pct,
    })
end

-- Register with catalog
Catalog:RegisterDomain("Progress", {
    CalculateFill = {
        handler = Progress.CalculateFill,
        description = "Calculate bar fill percentage from current/max",
        params = {
            { name = "current", type = "number", required = true },
            { name = "max", type = "number", required = true },
        },
        returns = { type = "ActionResult<{fillPct, isAtMax}>" },
        example = "Progress.CalculateFill(75, 100) → {fillPct: 0.75, isAtMax: false}",
    },
    CalculateFillWithSessionMax = {
        handler = Progress.CalculateFillWithSessionMax,
        description = "Calculate fill with session max override",
        params = {
            { name = "current", type = "number", required = true },
            { name = "configuredMax", type = "number", required = true },
            { name = "sessionMax", type = "number", required = false },
        },
        returns = { type = "ActionResult<{fillPct, effectiveMax, usedSession}>" },
    },
    CalculateMarker = {
        handler = Progress.CalculateMarker,
        description = "Calculate marker position on progress bar",
        params = {
            { name = "markerValue", type = "number", required = true },
            { name = "max", type = "number", required = true },
        },
        returns = { type = "ActionResult<{markerPct, shouldShow}>" },
    },
    ToPercentage = {
        handler = Progress.ToPercentage,
        description = "Convert raw value to percentage",
        params = {
            { name = "rawValue", type = "number", required = true },
            { name = "baseValue", type = "number", required = true, description = "Value that equals 100%" },
        },
        returns = { type = "ActionResult<{percentage}>" },
    },
})

FenCore.Progress = Progress
return Progress
```

## Remaining Domains

The following domains follow the same pattern. See the source files for implementation details:

### `Domains/Charges.lua`
Extract from: `Flightsim/Core/Logic/charges.lua`

Key functions:
- `CalculateChargeFill(chargeIndex, currentCharges, chargeStart, chargeDuration, now)`
- `CalculateAllCharges(context)`
- `AdvanceAnimation(currentValue, deltaTime, animSpeed)`
- `HandleSecretFallback(isUsable, maxCharges)`

### `Domains/Cooldowns.lua`
Extract from: `Flightsim/Core/Logic/cooldowns.lua`

Key functions:
- `CalculateProgress(startTime, duration, now)`
- `Calculate(context)`
- `AdvanceAnimation(currentValue, deltaTime, animSpeed)`
- `HandleSecretFallback(isUsable)`

### `Domains/Color.lua`
Extract from: `Flightsim/Core/Utils/color.lua`

Key functions:
- `Lerp(c1, c2, t)` - Interpolate between two colors
- `Gradient(pct, stops)` - Get color from gradient stops
- `ForHealth(pct)` - Red → Yellow → Green
- `ForProgress(pct)` - Same as ForHealth
- `HexToRGB(hex)` - Convert hex string to RGB

### `Domains/Time.lua`
New utility domain:

Key functions:
- `FormatDuration(seconds, opts)` - "1h 30m 15s"
- `FormatCooldown(seconds)` - "1:30" or "30s"
- `ParseDuration(str)` - Parse "1h 30m" to seconds

### `Domains/Text.lua`
New utility domain:

Key functions:
- `Truncate(str, maxLen, suffix)` - Truncate with "..."
- `Pluralize(count, singular, plural)` - "1 item" vs "2 items"
- `FormatNumber(n, decimals)` - "1,234.56"
- `FormatCompact(n)` - "1.2K", "3.4M"

## Verification

After creating all domains:

1. `/fencore catalog` should show all 8 domains
2. `mech call sandbox.test -i '{"addon": "FenCore"}'` passes
3. Each domain can be used independently

## Next Phase

Proceed to [03-testing.plan.md](03-testing.plan.md) for sandbox test setup.
