# FenCore API Reference

Complete reference for all FenCore domains and functions.

---

## Table of Contents

- [ActionResult](#actionresult) - Structured result pattern
- [Math](#math) - Pure math utilities
- [Tables](#tables) - Table manipulation
- [Secrets](#secrets) - WoW 12.0+ secret value handling
- [Environment](#environment) - Client detection
- [Progress](#progress) - Bar/fill calculations
- [Charges](#charges) - Ability charge logic
- [Cooldowns](#cooldowns) - Cooldown progress
- [Color](#color) - Color utilities
- [Time](#time) - Time formatting
- [Text](#text) - Text formatting

---

## ActionResult

The core pattern for structured results. All complex domain functions return an ActionResult.

### Types

```lua
---@class ActionResult<T>
---@field success boolean Whether the action succeeded
---@field data? T The result data (if success)
---@field error? ActionError Error details (if failure)
---@field reasoning? string Why this result

---@class ActionError
---@field code string Machine-readable error code
---@field message string Human-readable message
---@field suggestion? string What to do about it
```

### Functions

#### `ActionResult.success(data, reasoning?)`

Create a successful result.

```lua
local result = FenCore.ActionResult.success(
    { fillPct = 0.75, isAtMax = false },
    "Calculated from current/max values"
)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `T` | Yes | The result data |
| `reasoning` | `string` | No | Optional explanation |

**Returns:** `ActionResult<T>`

---

#### `ActionResult.error(code, message, suggestion?)`

Create a failed result.

```lua
local result = FenCore.ActionResult.error(
    "INVALID_INPUT",
    "current value is required",
    "Pass a number for the current parameter"
)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | `string` | Yes | Error code (e.g., `"INVALID_INPUT"`) |
| `message` | `string` | Yes | Human-readable message |
| `suggestion` | `string` | No | What to do about it |

**Returns:** `ActionResult`

---

#### `ActionResult.isSuccess(result)`

Check if a result succeeded.

```lua
if FenCore.ActionResult.isSuccess(result) then
    -- Handle success
end
```

**Returns:** `boolean`

---

#### `ActionResult.isError(result)`

Check if a result failed.

```lua
if FenCore.ActionResult.isError(result) then
    print("Error:", result.error.message)
end
```

**Returns:** `boolean`

---

#### `ActionResult.unwrap(result)`

Extract data from a successful result, or return `nil`.

```lua
local data = FenCore.ActionResult.unwrap(result)
if data then
    print("Fill:", data.fillPct)
end
```

**Returns:** `T|nil`

---

#### `ActionResult.unwrapOrThrow(result)`

Extract data or throw an error if failed.

```lua
local data = FenCore.ActionResult.unwrapOrThrow(result)  -- Throws on failure
print("Fill:", data.fillPct)
```

**Returns:** `T` (throws on failure)

---

#### `ActionResult.getErrorCode(result)`

Get the error code from a failed result.

```lua
local code = FenCore.ActionResult.getErrorCode(result)
if code == "INVALID_INPUT" then
    -- Handle invalid input
end
```

**Returns:** `string|nil`

---

#### `ActionResult.map(result, fn)`

Transform a successful result's data.

```lua
local percentResult = FenCore.ActionResult.map(result, function(data)
    return data.fillPct * 100
end)
```

**Returns:** `ActionResult<U>`

---

## Math

Pure mathematical utilities with no WoW dependencies.

### `Math.Clamp(n, minValue, maxValue)`

Clamp a number between min and max bounds.

```lua
FenCore.Math.Clamp(150, 0, 100)  -- 100
FenCore.Math.Clamp(-10, 0, 100) -- 0
FenCore.Math.Clamp(50, 0, 100)  -- 50
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `n` | `number` | Yes | Value to clamp |
| `minValue` | `number` | Yes | Minimum bound |
| `maxValue` | `number` | Yes | Maximum bound |

**Returns:** `number`

---

### `Math.Lerp(a, b, t)`

Linear interpolation between two values.

```lua
FenCore.Math.Lerp(0, 100, 0.5)   -- 50
FenCore.Math.Lerp(0, 100, 0.25)  -- 25
FenCore.Math.Lerp(10, 20, 0.5)   -- 15
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `a` | `number` | Yes | Start value |
| `b` | `number` | Yes | End value |
| `t` | `number` | Yes | Interpolation factor (0-1) |

**Returns:** `number`

---

### `Math.SmoothDelta(oldSmooth, newDelta, oldWeight?)`

Smooth a delta value using exponential moving average.

```lua
local smoothed = FenCore.Math.SmoothDelta(5, 10, 0.7)  -- 6.5
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `oldSmooth` | `number` | Yes | - | Previous smoothed value |
| `newDelta` | `number` | Yes | - | New raw delta |
| `oldWeight` | `number` | No | `0.7` | Weight for old value |

**Returns:** `number`

---

### `Math.ToPercentage(current, max)`

Calculate percentage (0-100) from current/max values.

```lua
FenCore.Math.ToPercentage(75, 100)  -- 75
FenCore.Math.ToPercentage(50, 200)  -- 25
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current` | `number` | Yes | Current value |
| `max` | `number` | Yes | Maximum value |

**Returns:** `number` (0-100)

---

### `Math.ToFraction(current, max)`

Calculate fill fraction (0-1) from current/max values.

```lua
FenCore.Math.ToFraction(75, 100)  -- 0.75
FenCore.Math.ToFraction(50, 200)  -- 0.25
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current` | `number` | Yes | Current value |
| `max` | `number` | Yes | Maximum value |

**Returns:** `number` (0-1, clamped)

---

### `Math.NormalizeDelta(value, maxValue)`

Normalize a value to -1 to 1 range.

```lua
FenCore.Math.NormalizeDelta(5, 10)   -- 0.5
FenCore.Math.NormalizeDelta(-5, 10)  -- -0.5
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | `number` | Yes | Raw value |
| `maxValue` | `number` | Yes | Maximum expected value |

**Returns:** `number` (-1 to 1)

---

### `Math.Round(n, decimals?)`

Round a number to N decimal places.

```lua
FenCore.Math.Round(3.14159)     -- 3
FenCore.Math.Round(3.14159, 2)  -- 3.14
FenCore.Math.Round(3.14159, 4)  -- 3.1416
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `n` | `number` | Yes | - | Value to round |
| `decimals` | `number` | No | `0` | Decimal places |

**Returns:** `number`

---

### `Math.MapRange(value, options)`

Map a value from one range to another.

```lua
FenCore.Math.MapRange(50, { inMin = 0, inMax = 100, outMin = 0, outMax = 1 })  -- 0.5
FenCore.Math.MapRange(25, { inMin = 0, inMax = 100, outMin = 0, outMax = 255 })  -- 63.75
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | `number` | Yes | Input value |
| `options` | `table` | Yes | `{inMin, inMax, outMin, outMax}` |

**Returns:** `number`

---

### `Math.ApplyCurve(value)`

Apply square root curve for sensitivity ramping. More sensitive near zero, compressed at extremes.

```lua
FenCore.Math.ApplyCurve(0.25)   -- 0.5
FenCore.Math.ApplyCurve(0.04)   -- 0.2
FenCore.Math.ApplyCurve(-0.25)  -- -0.5
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | `number` | Yes | Normalized value (-1 to 1) |

**Returns:** `number` (-1 to 1)

---

## Tables

Pure table utilities with no WoW dependencies.

### `Tables.DeepCopy(original)`

Create a deep copy of a table, including nested tables and metatables.

```lua
local copy = FenCore.Tables.DeepCopy(original)
```

**Returns:** `table`

---

### `Tables.Merge(target, source)`

Shallow merge source into target (modifies target in place).

```lua
local settings = { volume = 50 }
FenCore.Tables.Merge(settings, { volume = 75, muted = false })
-- settings = { volume = 75, muted = false }
```

**Returns:** `table` (the modified target)

---

### `Tables.DeepMerge(target, source)`

Deep merge source into target, recursively merging nested tables.

```lua
local config = { ui = { scale = 1 } }
FenCore.Tables.DeepMerge(config, { ui = { opacity = 0.8 } })
-- config = { ui = { scale = 1, opacity = 0.8 } }
```

**Returns:** `table` (the modified target)

---

### `Tables.Keys(tbl)`

Get all keys from a table.

```lua
FenCore.Tables.Keys({ a = 1, b = 2 })  -- { "a", "b" }
```

**Returns:** `table` (array of keys)

---

### `Tables.Values(tbl)`

Get all values from a table.

```lua
FenCore.Tables.Values({ a = 1, b = 2 })  -- { 1, 2 }
```

**Returns:** `table` (array of values)

---

### `Tables.Count(tbl)`

Count entries in a table (works with non-array tables).

```lua
FenCore.Tables.Count({ a = 1, b = 2, c = 3 })  -- 3
```

**Returns:** `number`

---

### `Tables.IsEmpty(tbl)`

Check if a table is empty.

```lua
FenCore.Tables.IsEmpty({})        -- true
FenCore.Tables.IsEmpty({ a = 1 }) -- false
```

**Returns:** `boolean`

---

### `Tables.Contains(tbl, value)`

Check if a table contains a specific value.

```lua
FenCore.Tables.Contains({ 1, 2, 3 }, 2)  -- true
FenCore.Tables.Contains({ 1, 2, 3 }, 5)  -- false
```

**Returns:** `boolean`

---

### `Tables.KeyOf(tbl, value)`

Find the key for a given value.

```lua
FenCore.Tables.KeyOf({ a = 1, b = 2 }, 2)  -- "b"
```

**Returns:** `any|nil`

---

### `Tables.Filter(tbl, predicate)`

Filter table entries by a predicate function.

```lua
local evens = FenCore.Tables.Filter({ a = 1, b = 2, c = 3 }, function(v)
    return v % 2 == 0
end)
-- evens = { b = 2 }
```

**Returns:** `table`

---

### `Tables.Map(tbl, transform)`

Transform table values with a function.

```lua
local doubled = FenCore.Tables.Map({ a = 1, b = 2 }, function(v)
    return v * 2
end)
-- doubled = { a = 2, b = 4 }
```

**Returns:** `table`

---

## Secrets

Handle WoW 12.0+ (Midnight) secret values that crash on arithmetic/comparison operations.

### `Secrets.IsSecret(val)`

Check if a value is a WoW secret value.

```lua
if FenCore.Secrets.IsSecret(someValue) then
    -- Handle secret value
end
```

**Returns:** `boolean`

---

### `Secrets.SafeToString(val)`

Safely convert a value to string. Returns `"???"` for secrets.

```lua
FenCore.Secrets.SafeToString(42)         -- "42"
FenCore.Secrets.SafeToString(secretVal)  -- "???"
```

**Returns:** `string`

---

### `Secrets.SafeCompare(a, b, op)`

Safely compare two values. Returns `nil` if either is a secret.

```lua
FenCore.Secrets.SafeCompare(10, 5, ">")   -- true
FenCore.Secrets.SafeCompare(10, 5, "<")   -- false
FenCore.Secrets.SafeCompare(secret, 5, ">")  -- nil
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `a` | `any` | Yes | First value |
| `b` | `any` | Yes | Second value |
| `op` | `string` | Yes | Operator: `">"`, `"<"`, `">="`, `"<="`, `"=="`, `"~="` |

**Returns:** `boolean|nil`

---

### `Secrets.SafeArithmetic(val, operation, fallback)`

Safely perform arithmetic on a potentially secret value.

```lua
local doubled = FenCore.Secrets.SafeArithmetic(val, function(v)
    return v * 2
end, 0)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `val` | `any` | Yes | Value to use |
| `operation` | `function` | Yes | Operation to perform |
| `fallback` | `any` | Yes | Fallback if secret |

**Returns:** `any`

---

### `Secrets.CleanNumber(val)`

Extract a clean number from a potentially secret value.

```lua
local num, isSecret = FenCore.Secrets.CleanNumber(val)
if not isSecret and num then
    -- Safe to use num
end
```

**Returns:** `number|nil`, `boolean`

---

### `Secrets.CountSecrets(tbl, recursive?)`

Count secret values within a table.

```lua
local count = FenCore.Secrets.CountSecrets(data, true)
```

**Returns:** `number`

---

### `Secrets.HasSecrets(tbl, recursive?)`

Check if a table contains any secret values.

```lua
if FenCore.Secrets.HasSecrets(data) then
    -- Table contains secrets
end
```

**Returns:** `boolean`

---

## Environment

WoW client detection and version utilities.

> **Note:** This domain uses WoW APIs and requires the game client.

### `Environment.IsMidnight()`

Check if running Midnight (12.0+) client.

```lua
if FenCore.Environment.IsMidnight() then
    -- Use 12.0+ features
end
```

**Returns:** `boolean`

---

### `Environment.GetInterfaceVersion()`

Get the current interface version number.

```lua
FenCore.Environment.GetInterfaceVersion()  -- 120001
```

**Returns:** `number`

---

### `Environment.GetVersion()`

Get WoW version string.

```lua
FenCore.Environment.GetVersion()  -- "12.0.5"
```

**Returns:** `string`

---

### `Environment.GetBuild()`

Get WoW build number.

```lua
FenCore.Environment.GetBuild()  -- "58238"
```

**Returns:** `string`

---

### `Environment.GetClientType()`

Detect client type.

```lua
FenCore.Environment.GetClientType()  -- "Retail", "PTR", or "Beta"
```

**Returns:** `string`

---

### `Environment.GetVersionString()`

Get formatted version with build number.

```lua
FenCore.Environment.GetVersionString()  -- "12.0.5 (58238)"
```

**Returns:** `string`

---

### `Environment.GetInterfaceString()`

Get interface version with client type.

```lua
FenCore.Environment.GetInterfaceString()  -- "120001 (Retail)"
```

**Returns:** `string`

---

### `Environment.IsTestRealm()`

Check if running on PTR or Beta.

```lua
if FenCore.Environment.IsTestRealm() then
    print("Running on test realm")
end
```

**Returns:** `boolean`

---

## Progress

Bar/fill calculations for progress bars and similar UI elements.

### `Progress.CalculateFill(current, max)`

Calculate bar fill percentage.

```lua
local result = FenCore.Progress.CalculateFill(75, 100)
-- result.data = { fillPct = 0.75, isAtMax = false }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current` | `number` | Yes | Current value |
| `max` | `number` | Yes | Maximum value |

**Returns:** `ActionResult<{ fillPct: number, isAtMax: boolean }>`

---

### `Progress.CalculateFillWithSessionMax(current, configuredMax, sessionMax?)`

Calculate fill with session max override. Useful for dynamic maximums.

```lua
local result = FenCore.Progress.CalculateFillWithSessionMax(75, 100, 150)
-- result.data = { fillPct = 0.5, effectiveMax = 150, usedSession = true }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `current` | `number` | Yes | Current value |
| `configuredMax` | `number` | Yes | User-configured maximum |
| `sessionMax` | `number` | No | Session observed maximum |

**Returns:** `ActionResult<{ fillPct: number, effectiveMax: number, usedSession: boolean }>`

---

### `Progress.CalculateMarker(markerValue, max)`

Calculate marker position on a progress bar.

```lua
local result = FenCore.Progress.CalculateMarker(80, 100)
-- result.data = { markerPct = 0.8, shouldShow = true }
```

**Returns:** `ActionResult<{ markerPct: number, shouldShow: boolean }>`

---

### `Progress.ToPercentage(rawValue, baseValue)`

Convert raw value to percentage.

```lua
local result = FenCore.Progress.ToPercentage(1.5, 1.0)
-- result.data = { percentage = 150 }
```

**Returns:** `ActionResult<{ percentage: number }>`

---

## Charges

Ability charge calculations for multi-charge abilities.

### `Charges.CalculateChargeFill(chargeIndex, currentCharges, chargeStart, chargeDuration, now)`

Calculate fill for a single charge.

```lua
local result = FenCore.Charges.CalculateChargeFill(2, 1, 100, 30, 115)
-- result.data = { fill = 0.5, isRecharging = true }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chargeIndex` | `number` | Yes | Which charge (1-based) |
| `currentCharges` | `number` | Yes | Current charge count |
| `chargeStart` | `number` | Yes | When recharge started (GetTime) |
| `chargeDuration` | `number` | Yes | Recharge duration in seconds |
| `now` | `number` | Yes | Current time (GetTime) |

**Returns:** `ActionResult<{ fill: number, isRecharging: boolean }>`

---

### `Charges.CalculateAll(context)`

Calculate all charges for an ability.

```lua
local result = FenCore.Charges.CalculateAll({
    currentCharges = 1,
    maxCharges = 3,
    chargeStart = 100,
    chargeDuration = 30,
    now = 115
})
-- result.data = { charges = {...}, allFull = false, anyRecharging = true }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `context.currentCharges` | `number` | Current charge count |
| `context.maxCharges` | `number` | Maximum charges |
| `context.chargeStart` | `number` | When recharge started |
| `context.chargeDuration` | `number` | Recharge duration |
| `context.now` | `number` | Current time |

**Returns:** `ActionResult<{ charges: table[], allFull: boolean, anyRecharging: boolean }>`

---

### `Charges.AdvanceAnimation(currentValue, targetValue, deltaTime, animSpeed?)`

Advance animation value smoothly toward target.

```lua
local newValue = FenCore.Charges.AdvanceAnimation(0.5, 1.0, 0.016, 8)
```

**Returns:** `number`

---

### `Charges.HandleSecretFallback(isUsable, maxCharges)`

Handle secret value fallback for charges.

```lua
local result = FenCore.Charges.HandleSecretFallback(isUsable, 3)
-- result.data = { currentCharges = 3, isSecret = true }
```

**Returns:** `ActionResult<{ currentCharges: number, isSecret: boolean }>`

---

## Cooldowns

Cooldown progress calculations.

### `Cooldowns.CalculateProgress(startTime, duration, now)`

Calculate cooldown progress.

```lua
local result = FenCore.Cooldowns.CalculateProgress(100, 30, 115)
-- result.data = { progress = 0.5, remaining = 15, isOnCooldown = true }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startTime` | `number` | Yes | When cooldown started |
| `duration` | `number` | Yes | Cooldown duration |
| `now` | `number` | Yes | Current time |

**Returns:** `ActionResult<{ progress: number, remaining: number, isOnCooldown: boolean }>`

---

### `Cooldowns.Calculate(context)`

Calculate full cooldown state from context.

```lua
local result = FenCore.Cooldowns.Calculate({
    startTime = 100,
    duration = 30,
    now = 115,
    enabled = true
})
-- result.data = { progress = 0.5, remaining = 15, isOnCooldown = true, isEnabled = true }
```

**Returns:** `ActionResult<{ progress, remaining, isOnCooldown, isEnabled }>`

---

### `Cooldowns.AdvanceAnimation(currentValue, targetValue, deltaTime, animSpeed?)`

Advance animation value smoothly toward target.

```lua
local newValue = FenCore.Cooldowns.AdvanceAnimation(0.5, 1.0, 0.016)
```

**Returns:** `number`

---

### `Cooldowns.HandleSecretFallback(isUsable)`

Handle secret value fallback for usability.

```lua
local result = FenCore.Cooldowns.HandleSecretFallback(isUsable)
-- result.data = { usable = true, isSecret = true }
```

**Returns:** `ActionResult<{ usable: boolean, isSecret: boolean }>`

---

### `Cooldowns.IsReady(startTime, duration, now)`

Check if cooldown is ready (not on cooldown).

```lua
FenCore.Cooldowns.IsReady(100, 30, 130)  -- true
FenCore.Cooldowns.IsReady(100, 30, 115)  -- false
```

**Returns:** `boolean`

---

### `Cooldowns.GetRemaining(startTime, duration, now)`

Get time remaining on cooldown.

```lua
FenCore.Cooldowns.GetRemaining(100, 30, 115)  -- 15
FenCore.Cooldowns.GetRemaining(100, 30, 140)  -- 0
```

**Returns:** `number`

---

## Color

Color utilities and gradient calculations.

### `Color.Create(r, g, b, a?)`

Create a color table from RGB values.

```lua
FenCore.Color.Create(1, 0, 0)        -- { r = 1, g = 0, b = 0, a = 1 }
FenCore.Color.Create(1, 0, 0, 0.5)   -- { r = 1, g = 0, b = 0, a = 0.5 }
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `r` | `number` | Yes | - | Red (0-1) |
| `g` | `number` | Yes | - | Green (0-1) |
| `b` | `number` | Yes | - | Blue (0-1) |
| `a` | `number` | No | `1` | Alpha (0-1) |

**Returns:** `table`

---

### `Color.Lerp(c1, c2, t)`

Interpolate between two colors.

```lua
local red = { r = 1, g = 0, b = 0 }
local green = { r = 0, g = 1, b = 0 }
local yellow = FenCore.Color.Lerp(red, green, 0.5)
-- { r = 0.5, g = 0.5, b = 0 }
```

**Returns:** `table`

---

### `Color.Gradient(pct, stops)`

Get color from gradient stops.

```lua
local color = FenCore.Color.Gradient(0.5, {
    { pct = 0, color = { r = 1, g = 0, b = 0 } },
    { pct = 1, color = { r = 0, g = 1, b = 0 } },
})
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pct` | `number` | Yes | Position in gradient (0-1) |
| `stops` | `table[]` | Yes | Array of `{ pct, color }` |

**Returns:** `table`

---

### `Color.ForHealth(pct)`

Get health-based color (Red → Yellow → Green).

```lua
FenCore.Color.ForHealth(0)    -- Red
FenCore.Color.ForHealth(0.5)  -- Yellow
FenCore.Color.ForHealth(1)    -- Green
```

**Returns:** `table`

---

### `Color.ForProgress(pct)`

Get progress-based color (same gradient as health).

```lua
FenCore.Color.ForProgress(0.75)  -- Green-ish
```

**Returns:** `table`

---

### `Color.HexToRGB(hex)`

Convert hex string to RGB color.

```lua
FenCore.Color.HexToRGB("#FF0000")  -- { r = 1, g = 0, b = 0, a = 1 }
FenCore.Color.HexToRGB("00FF00")   -- { r = 0, g = 1, b = 0, a = 1 }
```

**Returns:** `table`

---

### `Color.RGBToHex(color, includeAlpha?)`

Convert RGB color to hex string.

```lua
FenCore.Color.RGBToHex({ r = 1, g = 0, b = 0 })        -- "FF0000"
FenCore.Color.RGBToHex({ r = 1, g = 0, b = 0 }, true)  -- "FF0000FF"
```

**Returns:** `string`

---

### `Color.Darken(color, factor)`

Darken a color by a factor.

```lua
FenCore.Color.Darken({ r = 1, g = 0.5, b = 0 }, 0.5)
-- { r = 0.5, g = 0.25, b = 0 }
```

**Returns:** `table`

---

### `Color.Lighten(color, factor)`

Lighten a color by a factor.

```lua
FenCore.Color.Lighten({ r = 0.5, g = 0, b = 0 }, 0.5)
-- { r = 0.75, g = 0.5, b = 0.5 }
```

**Returns:** `table`

---

## Time

Time formatting utilities.

### `Time.FormatDuration(seconds, opts?)`

Format duration to human-readable string.

```lua
FenCore.Time.FormatDuration(3661)                           -- "1 hour 1 min 1 sec"
FenCore.Time.FormatDuration(3661, { compact = true })       -- "1h 1m 1s"
FenCore.Time.FormatDuration(3600, { showSeconds = false })  -- "1 hour"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts.showSeconds` | `boolean` | Show seconds (default: `true`) |
| `opts.compact` | `boolean` | Use compact format (default: `false`) |

**Returns:** `string`

---

### `Time.FormatCooldown(seconds)`

Format seconds as cooldown display (MM:SS or just seconds).

```lua
FenCore.Time.FormatCooldown(45)    -- "45"
FenCore.Time.FormatCooldown(90)    -- "1:30"
FenCore.Time.FormatCooldown(3661)  -- "1:01:01"
```

**Returns:** `string`

---

### `Time.FormatCooldownShort(seconds, decimals?)`

Format seconds as short cooldown (1.5, 30, 2m, 1h).

```lua
FenCore.Time.FormatCooldownShort(5.5)   -- "5.5"
FenCore.Time.FormatCooldownShort(45)    -- "45"
FenCore.Time.FormatCooldownShort(90)    -- "2m"
FenCore.Time.FormatCooldownShort(3600)  -- "1h"
```

**Returns:** `string`

---

### `Time.ParseDuration(str)`

Parse duration string to seconds.

```lua
FenCore.Time.ParseDuration("1h 30m")  -- 5400
FenCore.Time.ParseDuration("90s")     -- 90
FenCore.Time.ParseDuration("2d")      -- 172800
```

**Returns:** `number|nil`, `string|nil` (error message)

---

### `Time.FormatRelative(seconds)`

Get relative time description.

```lua
FenCore.Time.FormatRelative(30)     -- "just now"
FenCore.Time.FormatRelative(3600)   -- "1 hour ago"
FenCore.Time.FormatRelative(-3600)  -- "1 hour from now"
```

**Returns:** `string`

---

## Text

Text formatting utilities.

### `Text.Truncate(str, maxLen, suffix?)`

Truncate string with suffix.

```lua
FenCore.Text.Truncate("Hello World", 8)       -- "Hello..."
FenCore.Text.Truncate("Hello World", 8, "…")  -- "Hello W…"
FenCore.Text.Truncate("Hi", 10)               -- "Hi"
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `str` | `string` | Yes | - | String to truncate |
| `maxLen` | `number` | Yes | - | Maximum length |
| `suffix` | `string` | No | `"..."` | Suffix to add |

**Returns:** `string`

---

### `Text.Pluralize(count, singular, plural?)`

Pluralize a word based on count.

```lua
FenCore.Text.Pluralize(1, "item")           -- "1 item"
FenCore.Text.Pluralize(5, "item")           -- "5 items"
FenCore.Text.Pluralize(2, "mouse", "mice")  -- "2 mice"
```

**Returns:** `string`

---

### `Text.FormatNumber(n, decimals?, sep?)`

Format number with thousands separators.

```lua
FenCore.Text.FormatNumber(1234567)        -- "1,234,567"
FenCore.Text.FormatNumber(1234.5678, 2)   -- "1,234.57"
FenCore.Text.FormatNumber(1234567, 0, " ") -- "1 234 567"
```

**Returns:** `string`

---

### `Text.FormatCompact(n, decimals?)`

Format number in compact form (1K, 1.2M, etc).

```lua
FenCore.Text.FormatCompact(1500)      -- "1.5K"
FenCore.Text.FormatCompact(1500000)   -- "1.5M"
FenCore.Text.FormatCompact(1500000000) -- "1.5B"
```

**Returns:** `string`

---

### `Text.Capitalize(str)`

Capitalize first letter of string.

```lua
FenCore.Text.Capitalize("hello")  -- "Hello"
FenCore.Text.Capitalize("HELLO")  -- "Hello"
```

**Returns:** `string`

---

### `Text.TitleCase(str)`

Capitalize first letter of each word.

```lua
FenCore.Text.TitleCase("hello world")  -- "Hello World"
```

**Returns:** `string`

---

### `Text.Pad(str, len, char?, right?)`

Pad string to length.

```lua
FenCore.Text.Pad("42", 5, "0")        -- "00042"
FenCore.Text.Pad("42", 5, "0", true)  -- "42000"
FenCore.Text.Pad("Hi", 10)            -- "        Hi"
```

**Returns:** `string`

---

### `Text.StripColors(str)`

Strip WoW color codes from string.

```lua
FenCore.Text.StripColors("|cFFFF0000Red|r Text")  -- "Red Text"
```

**Returns:** `string`

---

### `Text.FormatMemory(kilobytes)`

Format memory usage in KB or MB.

```lua
FenCore.Text.FormatMemory(512)   -- "512 KB"
FenCore.Text.FormatMemory(2048)  -- "2.0 MB"
```

**Returns:** `string`

---

### `Text.FormatBytes(bytes)`

Format bytes in human-readable form.

```lua
FenCore.Text.FormatBytes(1024)          -- "1.0 KB"
FenCore.Text.FormatBytes(1048576)       -- "1.0 MB"
FenCore.Text.FormatBytes(1073741824)    -- "1.0 GB"
```

**Returns:** `string`

---

## MCP Discovery

Use Mechanic's MCP server to discover FenCore's API programmatically:

```bash
# Get full catalog
mech call fencore-catalog

# Search functions
mech call fencore-search -i '{"query": "format"}'

# Get function details
mech call fencore-info -i '{"domain": "Math", "function": "Clamp"}'
```

---

## Error Codes

Standard error codes used across domains:

| Code | Usage |
|------|-------|
| `INVALID_INPUT` | Required parameter missing or wrong type |
| `OUT_OF_RANGE` | Value outside acceptable bounds |
| `NOT_FOUND` | Requested item doesn't exist |
| `INVALID_STATE` | Operation not valid in current state |
