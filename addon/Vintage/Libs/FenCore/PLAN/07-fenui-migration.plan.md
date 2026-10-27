# Phase 7: FenUI Migration

Migrate FenUI to depend on FenCore, consolidating duplicate utilities and adding new domains discovered from FenUI's Utils/.

## New Domains from FenUI

### `Domains/Tables.lua`

Extract from: `FenUI/Utils/Tables.lua`

```lua
-- Tables.lua
-- Pure table utilities - no WoW dependencies

local FenCore = _G.FenCore
local Catalog = FenCore.Catalog

local Tables = {}

--- Performs a deep copy of a table.
---@param orig table The table to copy
---@return table copy
function Tables.DeepCopy(orig)
    local orig_type = type(orig)
    local copy
    if orig_type == "table" then
        copy = {}
        for orig_key, orig_value in next, orig, nil do
            copy[Tables.DeepCopy(orig_key)] = Tables.DeepCopy(orig_value)
        end
        setmetatable(copy, Tables.DeepCopy(getmetatable(orig)))
    else
        copy = orig
    end
    return copy
end

--- Shallow merge of source into target.
---@param target table Target table (modified in place)
---@param source table Source table
---@return table target
function Tables.Merge(target, source)
    if type(source) ~= "table" then return target end
    for k, v in pairs(source) do
        target[k] = v
    end
    return target
end

--- Deep merge of source into target.
---@param target table Target table (modified in place)
---@param source table Source table
---@return table target
function Tables.DeepMerge(target, source)
    if type(source) ~= "table" then return target end
    for k, v in pairs(source) do
        if type(v) == "table" and type(target[k]) == "table" then
            Tables.DeepMerge(target[k], v)
        else
            target[k] = Tables.DeepCopy(v)
        end
    end
    return target
end

--- Get all keys from a table.
---@param tbl table
---@return table keys
function Tables.Keys(tbl)
    local keys = {}
    if type(tbl) == "table" then
        for k in pairs(tbl) do
            table.insert(keys, k)
        end
    end
    return keys
end

--- Get all values from a table.
---@param tbl table
---@return table values
function Tables.Values(tbl)
    local values = {}
    if type(tbl) == "table" then
        for _, v in pairs(tbl) do
            table.insert(values, v)
        end
    end
    return values
end

--- Count entries in a table.
---@param tbl table
---@return number count
function Tables.Count(tbl)
    local count = 0
    if type(tbl) == "table" then
        for _ in pairs(tbl) do
            count = count + 1
        end
    end
    return count
end

--- Check if a table is empty.
---@param tbl table
---@return boolean isEmpty
function Tables.IsEmpty(tbl)
    if type(tbl) ~= "table" then return true end
    return next(tbl) == nil
end

--- Check if a table contains a value.
---@param tbl table
---@param value any
---@return boolean contains
function Tables.Contains(tbl, value)
    if type(tbl) ~= "table" then return false end
    for _, v in pairs(tbl) do
        if v == value then return true end
    end
    return false
end

-- Register with catalog
Catalog:RegisterDomain("Tables", {
    DeepCopy = {
        handler = Tables.DeepCopy,
        description = "Create a deep copy of a table",
        params = {
            { name = "orig", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "local copy = Tables.DeepCopy(original)",
    },
    Merge = {
        handler = Tables.Merge,
        description = "Shallow merge source into target",
        params = {
            { name = "target", type = "table", required = true },
            { name = "source", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "Tables.Merge(defaults, userSettings)",
    },
    DeepMerge = {
        handler = Tables.DeepMerge,
        description = "Deep merge source into target (recursive)",
        params = {
            { name = "target", type = "table", required = true },
            { name = "source", type = "table", required = true },
        },
        returns = { type = "table" },
    },
    Keys = {
        handler = Tables.Keys,
        description = "Get all keys from a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "table" },
        example = 'Tables.Keys({a=1, b=2}) → {"a", "b"}',
    },
    Values = {
        handler = Tables.Values,
        description = "Get all values from a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "table" },
        example = "Tables.Values({a=1, b=2}) → {1, 2}",
    },
    Count = {
        handler = Tables.Count,
        description = "Count entries in a table",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "number" },
        example = "Tables.Count({a=1, b=2}) → 2",
    },
    IsEmpty = {
        handler = Tables.IsEmpty,
        description = "Check if a table is empty",
        params = {
            { name = "tbl", type = "table", required = true },
        },
        returns = { type = "boolean" },
    },
    Contains = {
        handler = Tables.Contains,
        description = "Check if table contains a value",
        params = {
            { name = "tbl", type = "table", required = true },
            { name = "value", type = "any", required = true },
        },
        returns = { type = "boolean" },
    },
})

FenCore.Tables = Tables
return Tables
```

### `Domains/Environment.lua`

Extract from: `FenUI/Utils/Environment.lua`

```lua
-- Environment.lua
-- WoW client detection and version utilities

local FenCore = _G.FenCore
local Catalog = FenCore.Catalog

local Environment = {}

-- Cache interface version at load time
local _, _, _, interfaceVersion = GetBuildInfo()
Environment._interfaceVersion = interfaceVersion or 0

--- Check if running Midnight (12.0+) client.
---@return boolean isMidnight
function Environment.IsMidnight()
    return Environment._interfaceVersion >= 120000
end

--- Get the current interface version number.
---@return number interfaceVersion
function Environment.GetInterfaceVersion()
    return Environment._interfaceVersion
end

--- Get WoW version string (e.g., "11.0.5").
---@return string version
function Environment.GetVersion()
    local version = GetBuildInfo()
    return version or "unknown"
end

--- Get WoW build number.
---@return string build
function Environment.GetBuild()
    local _, build = GetBuildInfo()
    return build or "unknown"
end

--- Detect the client type.
---@return string clientType "Retail", "PTR", or "Beta"
function Environment.GetClientType()
    -- Try native build type checks
    if _G.IsBetaBuild and _G.IsBetaBuild() then
        return "Beta"
    end
    if _G.IsTestBuild and _G.IsTestBuild() then
        return "PTR"
    end
    
    -- Fallback to portal CVar
    local project = GetCVar and GetCVar("portal") or ""
    if project:find("test") then
        return "PTR"
    elseif project:find("beta") then
        return "Beta"
    end
    
    return "Retail"
end

--- Get formatted version string: "11.0.5 (57212)"
---@return string formatted
function Environment.GetVersionString()
    local version, build = GetBuildInfo()
    return string.format("%s (%s)", version or "?", build or "?")
end

--- Get formatted interface string: "110005 (Retail)"
---@return string formatted
function Environment.GetInterfaceString()
    local client = Environment.GetClientType()
    return string.format("%d (%s)", Environment._interfaceVersion, client)
end

-- Register with catalog
Catalog:RegisterDomain("Environment", {
    IsMidnight = {
        handler = Environment.IsMidnight,
        description = "Check if running Midnight (12.0+) client",
        params = {},
        returns = { type = "boolean" },
        example = "Environment.IsMidnight() → true/false",
    },
    GetInterfaceVersion = {
        handler = Environment.GetInterfaceVersion,
        description = "Get current interface version number",
        params = {},
        returns = { type = "number" },
        example = "Environment.GetInterfaceVersion() → 120001",
    },
    GetVersion = {
        handler = Environment.GetVersion,
        description = "Get WoW version string",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetVersion() → "12.0.1"',
    },
    GetClientType = {
        handler = Environment.GetClientType,
        description = "Detect client type (Retail/PTR/Beta)",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetClientType() → "Retail"',
    },
    GetVersionString = {
        handler = Environment.GetVersionString,
        description = "Get formatted version with build number",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetVersionString() → "12.0.1 (58238)"',
    },
})

FenCore.Environment = Environment
return Environment
```

## Expanded Domains

### Update `Domains/Text.lua`

Add functions from `FenUI/Utils/Formatting.lua`:

```lua
-- Additional functions for Text.lua

--- Format memory usage in KB or MB.
---@param kb number Memory in KB
---@return string formatted
function Text.FormatMemory(kb)
    if kb >= 1024 then
        return string.format("%.1f MB", kb / 1024)
    else
        return string.format("%.0f KB", kb)
    end
end

--- Format a number with thousand separators.
---@param n number Number to format
---@param decimals? number Decimal places (default 0)
---@return string formatted
function Text.FormatNumber(n, decimals)
    decimals = decimals or 0
    local formatted = string.format("%." .. decimals .. "f", n)
    
    -- Add thousand separators
    local left, dec = formatted:match("^(-?%d+)(%.?%d*)$")
    left = left:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
    return left .. dec
end

--- Format a number compactly (1.2K, 3.4M, etc.).
---@param n number Number to format
---@return string formatted
function Text.FormatCompact(n)
    if n >= 1e9 then
        return string.format("%.1fB", n / 1e9)
    elseif n >= 1e6 then
        return string.format("%.1fM", n / 1e6)
    elseif n >= 1e3 then
        return string.format("%.1fK", n / 1e3)
    else
        return tostring(math.floor(n))
    end
end
```

### Update `Domains/Secrets.lua`

Add functions from `FenUI/Utils/SecretValues.lua`:

```lua
-- Additional functions for Secrets.lua

--- Count secret values within a table.
---@param tbl table Table to scan
---@param recursive? boolean Scan nested tables
---@return number count
function Secrets.CountSecrets(tbl, recursive)
    local count = 0
    if not tbl or type(tbl) ~= "table" then
        return 0
    end
    
    for _, v in pairs(tbl) do
        if Secrets.IsSecret(v) then
            count = count + 1
        elseif recursive and type(v) == "table" then
            count = count + Secrets.CountSecrets(v, true)
        end
    end
    return count
end
```

## FenUI Migration Steps

### Step 1: Add FenCore Dependency

Update `FenUI/FenUI.toc`:

```toc
## Interface: 120001
## Title: FenUI
## Notes: UI widget library for WoW addons
## Author: Falkicon
## Version: 2.9.0
## Dependencies: FenCore

# FenUI files load after FenCore
Core\FenUI.xml
```

### Step 2: Update FenUI.xml Load Order

```xml
<Ui xmlns="http://www.blizzard.com/wow/ui/">
    <!-- Note: FenCore loads first via dependency -->
    
    <!-- FenUI Core -->
    <Script file="Core\FenUI.lua"/>
    <Script file="Core\Tokens.lua"/>
    <Script file="Core\ThemeManager.lua"/>
    <Script file="Core\BlizzardBridge.lua"/>
    <Script file="Core\Fonts.lua"/>
    <Script file="Core\Animation.lua"/>
    
    <!-- Utils (delegates to FenCore where possible) -->
    <Script file="Utils\Utils.lua"/>
    <Script file="Utils\Tables.lua"/>
    <Script file="Utils\SecretValues.lua"/>
    <Script file="Utils\Environment.lua"/>
    <Script file="Utils\Colors.lua"/>
    <Script file="Utils\Formatting.lua"/>
    <Script file="Utils\SafeAPI.lua"/>
    <Script file="Utils\UI.lua"/>
    
    <!-- Widgets... -->
</Ui>
```

### Step 3: Refactor Utils to Delegate

#### `FenUI/Utils/SecretValues.lua` (after migration)

```lua
--------------------------------------------------------------------------------
-- FenUI.Utils.SecretValues
-- Delegates to FenCore.Secrets
--------------------------------------------------------------------------------

local Utils = FenUI.Utils
local FenCore = _G.FenCore

-- Delegate to FenCore
function Utils:IsValueSecret(value)
    return FenCore.Secrets.IsSecret(value)
end

function Utils:CountSecrets(tbl, recursive)
    return FenCore.Secrets.CountSecrets(tbl, recursive)
end

-- Legacy alias
Utils.IsSecret = function(self, val) return FenCore.Secrets.IsSecret(val) end
```

#### `FenUI/Utils/Tables.lua` (after migration)

```lua
--------------------------------------------------------------------------------
-- FenUI.Utils.Tables
-- Delegates to FenCore.Tables, keeps FenUI-specific additions
--------------------------------------------------------------------------------

local Utils = FenUI.Utils
local FenCore = _G.FenCore

-- Delegate to FenCore
function Utils:DeepCopy(orig)
    return FenCore.Tables.DeepCopy(orig)
end

-- SafeCompare uses FenCore.Secrets for secret detection
function Utils:SafeCompare(a, b, op)
    op = op or "=="
    
    -- Use FenCore for secret detection
    if FenCore.Secrets.IsSecret(a) or FenCore.Secrets.IsSecret(b) then
        if op == "==" then return rawequal(a, b) end
        if op == "~=" then return not rawequal(a, b) end
        return nil
    end
    
    return FenCore.Secrets.SafeCompare(a, b, op)
end

-- FenUI-specific: Wipe wrapper
function Utils:Wipe(t)
    if t and type(t) == "table" then
        wipe(t)
    end
end
```

#### `FenUI/Utils/Formatting.lua` (after migration)

```lua
--------------------------------------------------------------------------------
-- FenUI.Utils.Formatting
-- Delegates pure functions to FenCore, keeps UI-specific formatting
--------------------------------------------------------------------------------

local Utils = FenUI.Utils
local FenCore = _G.FenCore

-- Delegate to FenCore.Text
function Utils:FormatMemory(kb)
    return FenCore.Text.FormatMemory(kb)
end

function Utils:TruncateText(text, maxLength)
    return FenCore.Text.Truncate(text, maxLength)
end

-- Delegate to FenCore.Time
function Utils:FormatDuration(seconds, useRoyal)
    -- If useRoyal and WoW has SecondsFormatter, use that
    if useRoyal and self.Cap.HasSecondsFormatter then
        if not self.formatter then
            self.formatter = _G.CreateSecondsFormatter()
            if self.formatter then
                self.formatter:SetMinimumComponents(1)
            end
        end
        if self.formatter then
            return self.formatter:Format(seconds)
        end
    end
    
    -- Otherwise use FenCore
    return FenCore.Time.FormatDuration(seconds)
end

-- FenUI-specific: These stay in FenUI (UI formatting)
function Utils:SanitizeText(text, fallback)
    -- Blizzard SetText specific
    if text == true then return fallback or "" end
    if text == nil then return fallback or "" end
    if type(text) == "string" or type(text) == "number" then return text end
    return tostring(text)
end

function Utils:StripColors(text)
    -- WoW color code specific
    if type(text) ~= "string" then return text end
    return text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
end

function Utils:FormatValue(value, options)
    -- Complex UI formatting with colors - stays in FenUI
    -- ... existing implementation ...
end
```

#### `FenUI/Utils/Environment.lua` (after migration)

```lua
--------------------------------------------------------------------------------
-- FenUI.Utils.Environment
-- Delegates to FenCore.Environment, keeps UI-specific detection
--------------------------------------------------------------------------------

local Utils = FenUI.Utils
local FenCore = _G.FenCore

-- Delegate core detection to FenCore
Utils.IS_MIDNIGHT = FenCore.Environment.IsMidnight()

function Utils:GetClientType()
    return FenCore.Environment.GetClientType()
end

function Utils:GetVersionString()
    return FenCore.Environment.GetVersionString()
end

function Utils:GetInterfaceString()
    return FenCore.Environment.GetInterfaceString()
end

-- FenUI-specific: UI capability detection (stays in FenUI)
function Utils:GetTimerFont(size)
    -- Font mapping is UI-specific
    -- ... existing implementation ...
end

function Utils:DetectCapabilities()
    -- UI capability detection
    -- ... existing implementation ...
end
```

### Step 4: Update FenCore.xml

Add new domains:

```xml
<Ui xmlns="http://www.blizzard.com/wow/ui/">
    <!-- Core -->
    <Script file="Core\FenCore.lua"/>
    <Script file="Core\ActionResult.lua"/>
    <Script file="Core\Catalog.lua"/>
    
    <!-- Domains -->
    <Script file="Domains\Math.lua"/>
    <Script file="Domains\Secrets.lua"/>
    <Script file="Domains\Tables.lua"/>
    <Script file="Domains\Environment.lua"/>
    <Script file="Domains\Progress.lua"/>
    <Script file="Domains\Charges.lua"/>
    <Script file="Domains\Cooldowns.lua"/>
    <Script file="Domains\Color.lua"/>
    <Script file="Domains\Time.lua"/>
    <Script file="Domains\Text.lua"/>
</Ui>
```

## Updated Domain Count

| Domain | Source | Status |
|--------|--------|--------|
| Math | Flightsim | Original |
| Secrets | Flightsim + FenUI | Consolidated |
| Tables | FenUI | **NEW** |
| Environment | FenUI | **NEW** |
| Progress | Flightsim | Original |
| Charges | Flightsim | Original |
| Cooldowns | Flightsim | Original |
| Color | Flightsim | Original |
| Time | New + FenUI | Expanded |
| Text | New + FenUI | Expanded |

**Total: 10 domains**

## Verification Checklist

- [ ] FenCore loads with 10 domains
- [ ] `/fencore catalog` shows all domains
- [ ] FenUI loads with FenCore dependency
- [ ] All FenUI Utils delegate correctly to FenCore
- [ ] No duplicate code between FenCore and FenUI
- [ ] Existing FenUI consumers (Weekly, etc.) still work
- [ ] Sandbox tests pass for all domains

## Deprecation Notices

Add deprecation warnings to FenUI for functions that now live in FenCore:

```lua
-- In FenUI/Utils/Tables.lua
function Utils:DeepCopy(orig)
    -- Optional: Add deprecation warning in debug mode
    if FenUI.debugMode then
        print("|cFFFFAA00[FenUI]|r Utils:DeepCopy is deprecated, use FenCore.Tables.DeepCopy")
    end
    return FenCore.Tables.DeepCopy(orig)
end
```

## Future Cleanup

In a future version (FenUI 3.0), consider:

1. Removing delegating Utils files entirely
2. Documenting migration: "Use FenCore.X instead of FenUI.Utils:X"
3. Updating all consuming addons to use FenCore directly

## Timeline

This phase should be done **after** FenCore is stable and tested:

1. Phases 1-3: FenCore Foundation, Domains, Testing
2. Phase 4: Flightsim Migration (validates FenCore)
3. Phase 5: MCP Integration
4. Phase 6: Ecosystem (lib_sync)
5. **Phase 7: FenUI Migration** (this phase)

Estimated effort: **3-4 hours**
