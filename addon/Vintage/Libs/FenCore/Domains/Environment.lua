-- Environment.lua
-- WoW client detection and version utilities
-- Note: This domain uses WoW APIs and requires the game client

local FenCore = _G.FenCore
local Catalog = FenCore.Catalog

local Environment = {}

-- Lazy-loaded interface version (nil until first access)
Environment._interfaceVersion = nil

--- Get the current interface version number (lazy-loaded).
---@return number interfaceVersion e.g., 120001
function Environment.GetInterfaceVersion()
    if Environment._interfaceVersion == nil then
        if GetBuildInfo then
            local _, _, _, v = GetBuildInfo()
            Environment._interfaceVersion = v or 0
        else
            -- Sandbox fallback
            Environment._interfaceVersion = 0
        end
    end
    return Environment._interfaceVersion
end

--- Check if running Midnight (12.0+) client.
---@return boolean isMidnight
function Environment.IsMidnight()
    return Environment.GetInterfaceVersion() >= 120000
end

--- Get WoW version string (e.g., "12.0.5").
---@return string version
function Environment.GetVersion()
    local version = GetBuildInfo()
    return version or "unknown"
end

--- Get WoW build number.
---@return string buildNumber e.g., "58238"
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

--- Get formatted version string: "12.0.5 (58238)"
---@return string formatted
function Environment.GetVersionString()
    local version, build = GetBuildInfo()
    return string.format("%s (%s)", version or "?", build or "?")
end

--- Get formatted interface string: "120001 (Retail)"
---@return string formatted
function Environment.GetInterfaceString()
    local clientType = Environment.GetClientType()
    return string.format("%d (%s)", Environment._interfaceVersion, clientType)
end

--- Check if running on a test realm (PTR or Beta).
---@return boolean isTestRealm
function Environment.IsTestRealm()
    local clientType = Environment.GetClientType()
    return clientType == "PTR" or clientType == "Beta"
end

-- Register with catalog
Catalog:RegisterDomain("Environment", {
    IsMidnight = {
        handler = Environment.IsMidnight,
        description = "Check if running Midnight (12.0+) client",
        params = {},
        returns = { type = "boolean" },
        example = "Environment.IsMidnight() -> true/false",
    },
    GetInterfaceVersion = {
        handler = Environment.GetInterfaceVersion,
        description = "Get current interface version number",
        params = {},
        returns = { type = "number" },
        example = "Environment.GetInterfaceVersion() -> 120001",
    },
    GetVersion = {
        handler = Environment.GetVersion,
        description = "Get WoW version string",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetVersion() -> "12.0.5"',
    },
    GetBuild = {
        handler = Environment.GetBuild,
        description = "Get WoW build number",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetBuild() -> "58238"',
    },
    GetClientType = {
        handler = Environment.GetClientType,
        description = "Detect client type (Retail/PTR/Beta)",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetClientType() -> "Retail"',
    },
    GetVersionString = {
        handler = Environment.GetVersionString,
        description = "Get formatted version with build number",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetVersionString() -> "12.0.5 (58238)"',
    },
    GetInterfaceString = {
        handler = Environment.GetInterfaceString,
        description = "Get interface version with client type",
        params = {},
        returns = { type = "string" },
        example = 'Environment.GetInterfaceString() -> "120001 (Retail)"',
    },
    IsTestRealm = {
        handler = Environment.IsTestRealm,
        description = "Check if running on PTR or Beta",
        params = {},
        returns = { type = "boolean" },
    },
})

FenCore.Environment = Environment
return Environment
