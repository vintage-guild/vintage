# FenCore Integration Guide

How to integrate FenCore into your WoW addon.

---

## Quick Start

### 1. Embed FenCore

Copy FenCore into your addon's `Libs/` folder:

```
YourAddon/
├── YourAddon.toc
├── Libs/
│   └── FenCore/
│       ├── FenCore.toc
│       ├── Core/
│       └── Domains/
└── ...
```

### 2. Add to TOC

Add FenCore to your TOC file before your addon files:

```toc
## Interface: 120001
## Title: YourAddon

# Libraries
Libs\FenCore\Core\FenCore.xml

# Your addon
Core.lua
UI.lua
```

### 3. Access FenCore

```lua
local FenCore = _G.FenCore
local Result = FenCore.ActionResult
local Math = FenCore.Math

-- Now use any domain
local clamped = Math.Clamp(150, 0, 100)
```

---

## Common Integration Patterns

### Progress Bars

Use `Progress` for bar fill calculations:

```lua
local function UpdateHealthBar(healthBar, current, max)
    local result = FenCore.Progress.CalculateFill(current, max)

    if FenCore.ActionResult.isSuccess(result) then
        local data = FenCore.ActionResult.unwrap(result)
        healthBar:SetWidth(healthBar.maxWidth * data.fillPct)

        -- Color based on health
        local color = FenCore.Color.ForHealth(data.fillPct)
        healthBar:SetColorTexture(color.r, color.g, color.b)
    end
end
```

### Cooldown Displays

Use `Cooldowns` for cooldown progress:

```lua
local function UpdateCooldownDisplay(frame, startTime, duration)
    local now = GetTime()
    local result = FenCore.Cooldowns.CalculateProgress(startTime, duration, now)

    if FenCore.ActionResult.isSuccess(result) then
        local data = FenCore.ActionResult.unwrap(result)

        if data.isOnCooldown then
            frame.cooldownText:SetText(FenCore.Time.FormatCooldownShort(data.remaining))
            frame.cooldownOverlay:Show()
        else
            frame.cooldownText:SetText("")
            frame.cooldownOverlay:Hide()
        end
    end
end
```

### Multi-Charge Abilities

Use `Charges` for charge-based abilities:

```lua
local function UpdateCharges(chargeDisplay, abilityInfo)
    local result = FenCore.Charges.CalculateAll({
        currentCharges = abilityInfo.currentCharges,
        maxCharges = abilityInfo.maxCharges,
        chargeStart = abilityInfo.chargeStart,
        chargeDuration = abilityInfo.chargeDuration,
        now = GetTime(),
    })

    if FenCore.ActionResult.isSuccess(result) then
        local data = FenCore.ActionResult.unwrap(result)

        for i, charge in ipairs(data.charges) do
            local pip = chargeDisplay.pips[i]
            pip.fill:SetWidth(pip.maxWidth * charge.fill)

            if charge.isRecharging then
                pip.glow:Show()
            else
                pip.glow:Hide()
            end
        end
    end
end
```

### Secret Value Handling (12.0+)

Use `Secrets` to safely handle secret values:

```lua
local function DisplaySpellCost(spellCost)
    if FenCore.Secrets.IsSecret(spellCost) then
        costText:SetText("???")
        return
    end

    costText:SetText(FenCore.Text.FormatNumber(spellCost))
end

-- Safe arithmetic
local function CalculateDamageMultiplier(baseDamage)
    return FenCore.Secrets.SafeArithmetic(baseDamage, function(v)
        return v * 1.5
    end, 0)
end
```

---

## Bridge Layer Pattern

For complex addons, create a Bridge layer that translates between WoW APIs and FenCore logic:

```
YourAddon/
├── Bridge/
│   ├── SpellBridge.lua      -- WoW spell APIs → FenCore
│   ├── UnitBridge.lua       -- WoW unit APIs → FenCore
│   └── SettingsBridge.lua   -- SavedVariables → FenCore
├── Core/
│   └── Logic.lua            -- Pure logic using FenCore
└── UI/
    └── Display.lua          -- UI using Core logic
```

**Example SpellBridge:**

```lua
local SpellBridge = {}

--- Get cooldown data in FenCore-compatible format.
function SpellBridge:GetCooldownContext(spellID)
    local info = C_Spell.GetSpellCooldown(spellID)
    if not info then return nil end

    return {
        startTime = info.startTime,
        duration = info.duration,
        now = GetTime(),
        enabled = info.isEnabled,
    }
end

--- Calculate cooldown using FenCore.
function SpellBridge:CalculateCooldown(spellID)
    local context = self:GetCooldownContext(spellID)
    if not context then
        return FenCore.ActionResult.error("NOT_FOUND", "Spell not found")
    end

    return FenCore.Cooldowns.Calculate(context)
end
```

**Benefits:**

1. **Testable** - Mock the Bridge for unit tests
2. **Isolated** - WoW API changes only affect Bridge
3. **Clean** - Core logic stays WoW-free

---

## Testing Integration

### Sandbox Testing

Test your FenCore integration without WoW:

```bash
mech call sandbox.test -i '{"addon": "YourAddon"}'
```

**Test File Structure:**

```lua
-- Tests/Logic_spec.lua
describe("YourAddon Logic", function()
    it("calculates progress correctly", function()
        local result = YourAddon.Logic.CalculateProgress(75, 100)
        assert.is_true(FenCore.ActionResult.isSuccess(result))

        local data = FenCore.ActionResult.unwrap(result)
        assert.equals(0.75, data.fillPct)
    end)
end)
```

### Mocking WoW APIs

For Bridge testing, mock WoW APIs:

```lua
-- tests/mocks/wow_api.lua
_G.GetTime = function() return 12345.678 end
_G.C_Spell = {
    GetSpellCooldown = function(spellID)
        return {
            startTime = 12340,
            duration = 10,
            isEnabled = true,
        }
    end,
}
```

---

## Error Handling Patterns

### Graceful Degradation

```lua
local function GetProgressData(current, max)
    local result = FenCore.Progress.CalculateFill(current, max)

    if FenCore.ActionResult.isSuccess(result) then
        return FenCore.ActionResult.unwrap(result)
    end

    -- Fallback for errors
    return { fillPct = 0, isAtMax = false }
end
```

### Error Logging

```lua
local function SafeCalculate(fn, ...)
    local result = fn(...)

    if FenCore.ActionResult.isError(result) then
        local code = FenCore.ActionResult.getErrorCode(result)
        print(string.format("[YourAddon] Error %s: %s",
            code, result.error.message))

        if result.error.suggestion then
            print("  Suggestion:", result.error.suggestion)
        end

        return nil
    end

    return FenCore.ActionResult.unwrap(result)
end
```

### Validation at Boundaries

Validate data at system boundaries, trust FenCore internally:

```lua
-- At API boundary - validate
function YourAddon:SetProgress(current, max)
    if type(current) ~= "number" then
        print("SetProgress: current must be a number")
        return
    end

    -- Internal call - FenCore handles edge cases
    local result = FenCore.Progress.CalculateFill(current, max)
    -- ...
end
```

---

## Performance Tips

### Cache Domain References

For hot paths, cache domain references:

```lua
-- At file scope
local Math = FenCore.Math
local Clamp = Math.Clamp
local Lerp = Math.Lerp

-- In hot path
local function OnUpdate(elapsed)
    -- Fast - using cached references
    local t = Clamp(self.animTime / self.animDuration, 0, 1)
    local pos = Lerp(self.startPos, self.endPos, t)
end
```

### Avoid ActionResult in Hot Paths

For per-frame calculations, use direct utility functions:

```lua
-- Hot path - use Math directly
local function OnUpdate(elapsed)
    local fill = FenCore.Math.ToFraction(current, max)
    self.bar:SetWidth(self.maxWidth * fill)
end

-- Cold path (user action) - use ActionResult
local function OnSettingsChanged(newMax)
    local result = FenCore.Progress.CalculateFill(current, newMax)
    if FenCore.ActionResult.isError(result) then
        ShowError(result.error.message)
        return
    end
    -- ...
end
```

### Batch Calculations

For multiple related calculations, compute once:

```lua
-- Instead of multiple Progress calls
local fillResult = FenCore.Progress.CalculateFill(current, max)
local data = FenCore.ActionResult.unwrap(fillResult)

-- Use the data multiple times
self.bar:SetWidth(self.maxWidth * data.fillPct)
self.text:SetText(string.format("%.0f%%", data.fillPct * 100))
self.glow:SetShown(data.isAtMax)
```

---

## Compatibility

### WoW Version Detection

```lua
if FenCore.Environment.IsMidnight() then
    -- Use 12.0+ features
    -- Handle secrets with FenCore.Secrets
else
    -- Pre-12.0 code path
end
```

### Checking FenCore Availability

```lua
local function SafeInit()
    if not _G.FenCore then
        print("YourAddon requires FenCore")
        return false
    end

    if not FenCore.version then
        print("YourAddon requires FenCore 1.0.0+")
        return false
    end

    return true
end
```

---

## Debugging

### Enable Debug Mode

```
/fencore debug
```

This enables FenCore's internal logging.

### Check Catalog

```
/fencore catalog
```

Shows all registered domains and function counts.

### MCP Discovery

```bash
# List all available functions
mech call fencore-catalog

# Search for specific functionality
mech call fencore-search -i '{"query": "cooldown"}'

# Get detailed function info
mech call fencore-info -i '{"domain": "Cooldowns", "function": "CalculateProgress"}'
```

---

## Migration from Custom Logic

### Before (custom implementation)

```lua
local function CalculateFill(current, max)
    if max <= 0 then return 0 end
    local pct = current / max
    if pct < 0 then pct = 0 end
    if pct > 1 then pct = 1 end
    return pct
end
```

### After (using FenCore)

```lua
local function CalculateFill(current, max)
    local result = FenCore.Progress.CalculateFill(current, max)
    return FenCore.ActionResult.unwrap(result).fillPct
end

-- Or even simpler for just the fill:
local fill = FenCore.Math.ToFraction(current, max)
```

### Benefits of Migration

1. **Tested** - FenCore functions have unit tests
2. **Documented** - Full API reference
3. **Consistent** - Same patterns across your codebase
4. **Agent-aware** - MCP discovery for AI assistance
