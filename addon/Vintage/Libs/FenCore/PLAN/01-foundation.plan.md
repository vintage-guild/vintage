# Phase 1: Foundation

Create the core infrastructure for FenCore.

## Files to Create

### 1. `FenCore.toc`

```toc
## Interface: 120001
## Title: FenCore
## Notes: Foundation library for WoW addon development
## Author: Falkicon
## Version: 1.0.0
## IconTexture: Interface\Icons\INV_Gizmo_GoblinBoomBox_01
## X-Category: Development Tools
## X-License: GPL-3.0

# Core
Core\FenCore.xml
```

### 2. `FenCore.xml`

Load order for Core files:

```xml
<Ui xmlns="http://www.blizzard.com/wow/ui/">
    <!-- Core (load first) -->
    <Script file="Core\FenCore.lua"/>
    <Script file="Core\ActionResult.lua"/>
    <Script file="Core\Catalog.lua"/>
    
    <!-- Domains (depend on Core) -->
    <Script file="Domains\Math.lua"/>
    <Script file="Domains\Secrets.lua"/>
    <Script file="Domains\Progress.lua"/>
    <Script file="Domains\Charges.lua"/>
    <Script file="Domains\Cooldowns.lua"/>
    <Script file="Domains\Color.lua"/>
    <Script file="Domains\Time.lua"/>
    <Script file="Domains\Text.lua"/>
</Ui>
```

### 3. `Core/FenCore.lua`

Main namespace and initialization:

```lua
-- FenCore.lua
-- Foundation library for WoW addon development
-- https://github.com/Falkicon/FenCore

---@class FenCore
local MAJOR, MINOR = "FenCore", 1
local FenCore = {}

-- Version info
FenCore.version = "1.0.0"
FenCore.major = MAJOR
FenCore.minor = MINOR

-- Debug mode (set via /fencore debug)
FenCore.debugMode = false

-- Namespace containers (populated by modules)
FenCore.ActionResult = nil  -- Set by ActionResult.lua
FenCore.Catalog = nil       -- Set by Catalog.lua

-- Domain namespaces (populated by domain modules)
FenCore.Math = nil
FenCore.Secrets = nil
FenCore.Progress = nil
FenCore.Charges = nil
FenCore.Cooldowns = nil
FenCore.Color = nil
FenCore.Time = nil
FenCore.Text = nil

-- Debug logging (to Mechanic console if available)
function FenCore:Log(message, category)
    if not self.debugMode then return end
    
    local MechanicLib = LibStub and LibStub("MechanicLib-1.0", true)
    if MechanicLib then
        MechanicLib:Log("FenCore", message, category or "[Core]")
    else
        print("|cFF88CCFF[FenCore]|r " .. message)
    end
end

-- Slash command
SLASH_FENCORE1 = "/fencore"
SlashCmdList["FENCORE"] = function(msg)
    local cmd = msg:lower():trim()
    
    if cmd == "debug" then
        FenCore.debugMode = not FenCore.debugMode
        print("|cFF88CCFF[FenCore]|r Debug mode: " .. (FenCore.debugMode and "ON" or "OFF"))
    elseif cmd == "catalog" then
        if FenCore.Catalog then
            local catalog = FenCore:Catalog()
            print("|cFF88CCFF[FenCore]|r Catalog: " .. #catalog.domains .. " domains")
            for name, domain in pairs(catalog.domains) do
                local count = 0
                for _ in pairs(domain.functions) do count = count + 1 end
                print("  - " .. name .. ": " .. count .. " functions")
            end
        end
    else
        print("|cFF88CCFF[FenCore]|r v" .. FenCore.version)
        print("  /fencore debug - Toggle debug mode")
        print("  /fencore catalog - Show domain catalog")
    end
end

-- Register with MechanicLib if available
local function RegisterWithMechanic()
    local MechanicLib = LibStub and LibStub("MechanicLib-1.0", true)
    if MechanicLib and FenCore.Catalog then
        MechanicLib:Register("FenCore", {
            version = FenCore.version,
            catalog = function() return FenCore:Catalog() end,
        })
    end
end

-- Deferred registration (after all modules load)
C_Timer.After(0, RegisterWithMechanic)

-- Export global
_G.FenCore = FenCore
return FenCore
```

### 4. `Core/ActionResult.lua`

The AFD result pattern:

```lua
-- ActionResult.lua
-- AFD-style structured results for all FenCore operations

local FenCore = _G.FenCore

---@class ActionError
---@field code string Machine-readable error code
---@field message string Human-readable message
---@field suggestion? string What to do about it

---@class ActionResult<T>
---@field success boolean Whether the action succeeded
---@field data? T The result data (if success)
---@field error? ActionError Error details (if failure)
---@field reasoning? string Why this result

local ActionResult = {}

--- Create a successful ActionResult.
---@generic T
---@param data T The result data
---@param reasoning? string Optional explanation
---@return ActionResult<T>
function ActionResult.success(data, reasoning)
    return {
        success = true,
        data = data,
        reasoning = reasoning,
    }
end

--- Create a failed ActionResult.
---@param code string Error code (e.g., "INVALID_INPUT")
---@param message string Human-readable message
---@param suggestion? string What to do about it
---@return ActionResult
function ActionResult.error(code, message, suggestion)
    return {
        success = false,
        error = {
            code = code,
            message = message,
            suggestion = suggestion,
        },
    }
end

--- Check if a result is successful.
---@param result ActionResult
---@return boolean
function ActionResult.isSuccess(result)
    return result and result.success == true
end

--- Check if a result is an error.
---@param result ActionResult
---@return boolean
function ActionResult.isError(result)
    return result and result.success == false
end

--- Unwrap a result, returning data or nil.
---@generic T
---@param result ActionResult<T>
---@return T|nil
function ActionResult.unwrap(result)
    if result and result.success then
        return result.data
    end
    return nil
end

--- Unwrap a result, throwing error if failed.
---@generic T
---@param result ActionResult<T>
---@return T
function ActionResult.unwrapOrThrow(result)
    if result and result.success then
        return result.data
    end
    local errMsg = result and result.error and result.error.message or "Unknown error"
    error(errMsg, 2)
end

--- Get error code from a failed result.
---@param result ActionResult
---@return string|nil
function ActionResult.getErrorCode(result)
    if result and result.error then
        return result.error.code
    end
    return nil
end

--- Map a successful result to a new value.
---@generic T, U
---@param result ActionResult<T>
---@param fn fun(data: T): U Mapping function
---@return ActionResult<U>
function ActionResult.map(result, fn)
    if result and result.success then
        return ActionResult.success(fn(result.data), result.reasoning)
    end
    return result
end

FenCore.ActionResult = ActionResult
return ActionResult
```

### 5. `Core/Catalog.lua`

Registry and discovery system:

```lua
-- Catalog.lua
-- Self-describing registry for MCP/agent discovery

local FenCore = _G.FenCore

---@class CatalogEntry
---@field handler function The actual function
---@field description string What this function does
---@field params table[] Parameter definitions
---@field returns table Return type definition
---@field example? string Example usage

local Catalog = {
    _registry = {},  -- { domainName = { funcName = CatalogEntry } }
}

--- Register a domain with its functions.
---@param domainName string Name of the domain (e.g., "Math")
---@param functions table Map of funcName -> CatalogEntry
function Catalog:RegisterDomain(domainName, functions)
    self._registry[domainName] = functions
    
    -- Also wire up FenCore.DomainName.FuncName shortcuts
    if not FenCore[domainName] then
        FenCore[domainName] = {}
    end
    
    for funcName, entry in pairs(functions) do
        if entry.handler then
            FenCore[domainName][funcName] = entry.handler
        end
    end
    
    FenCore:Log("Registered domain: " .. domainName, "[Catalog]")
end

--- Get full catalog of all registered functions.
--- Used by MCP for agent discovery.
---@return table Structured catalog
function Catalog:GetCatalog()
    local catalog = {
        version = FenCore.version,
        domains = {},
    }
    
    for domainName, functions in pairs(self._registry) do
        catalog.domains[domainName] = {
            functions = {}
        }
        
        for funcName, entry in pairs(functions) do
            catalog.domains[domainName].functions[funcName] = {
                description = entry.description,
                params = entry.params,
                returns = entry.returns,
                example = entry.example,
            }
        end
    end
    
    return catalog
end

--- Search functions by name or description.
---@param query string Search query (partial match)
---@return table[] Matching functions
function Catalog:Search(query)
    local results = {}
    local queryLower = query:lower()
    
    for domainName, functions in pairs(self._registry) do
        for funcName, entry in pairs(functions) do
            local fullName = domainName .. "." .. funcName
            local matchName = fullName:lower():find(queryLower, 1, true)
            local matchDesc = entry.description and entry.description:lower():find(queryLower, 1, true)
            
            if matchName or matchDesc then
                table.insert(results, {
                    domain = domainName,
                    name = funcName,
                    fullName = fullName,
                    description = entry.description,
                    params = entry.params,
                    returns = entry.returns,
                })
            end
        end
    end
    
    return results
end

--- Get info about a specific function.
---@param domainName string Domain name
---@param funcName string Function name
---@return CatalogEntry|nil
function Catalog:GetInfo(domainName, funcName)
    local domain = self._registry[domainName]
    if domain then
        return domain[funcName]
    end
    return nil
end

--- Get list of all domain names.
---@return string[]
function Catalog:GetDomains()
    local domains = {}
    for name in pairs(self._registry) do
        table.insert(domains, name)
    end
    table.sort(domains)
    return domains
end

-- Convenience wrapper for FenCore:Catalog()
function FenCore:Catalog()
    return Catalog:GetCatalog()
end

function FenCore:SearchCatalog(query)
    return Catalog:Search(query)
end

FenCore.Catalog = Catalog
return Catalog
```

## Verification

After creating these files:

1. Load WoW with only FenCore enabled
2. Type `/fencore` - should show version
3. Type `/fencore catalog` - should show "0 domains" (until Phase 2)
4. No Lua errors in !Mechanic error log

## Next Phase

Proceed to [02-domains.plan.md](02-domains.plan.md) to add logic domains.
