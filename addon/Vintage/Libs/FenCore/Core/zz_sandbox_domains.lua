-- zz_sandbox_domains.lua
-- Loads FenCore domains in sandbox mode
-- Named with zz prefix to load last in Core/
--
-- The sandbox test runner only loads Core/*.lua files.
-- This file loads all Domains when running in sandbox mode.

-- Only run in sandbox mode (detected by _sandboxMode flag set by bootstrap)
if not (_G.FenCore and _G.FenCore._sandboxMode) then
    return
end

-- Get the path to this file's directory using debug.getinfo
local function getScriptPath()
    local info = debug.getinfo(1, "S")
    if info and info.source then
        local path = info.source:sub(2)  -- Remove @ prefix
        -- Handle both forward and back slashes
        return path:match("(.*/)")  or path:match("(.*\\)") or ""
    end
    return ""
end

local corePath = getScriptPath()
local rootPath = corePath:gsub("Core[/\\]?$", "")

-- Determine separator
local sep = corePath:match("[/\\]") or "/"

-- Domains path
local domainsPath = rootPath .. "Domains" .. sep

-- Helper to load a file safely
local function loadFile(path)
    local fn, err = loadfile(path)
    if fn then
        local ok, result = pcall(fn)
        if not ok then
            print("[Sandbox] Error executing: " .. path .. " - " .. tostring(result))
            return false
        end
        return true
    else
        -- File might not exist, which is OK
        return false
    end
end

-- Load all Domain files in dependency order
local domainOrder = {
    "Math.lua",        -- Base math utilities
    "Tables.lua",      -- Table utilities
    "Secrets.lua",     -- Secret value handling
    "Environment.lua", -- Client detection
    "Progress.lua",    -- Uses Math
    "Charges.lua",     -- Uses Math, Secrets
    "Cooldowns.lua",   -- Uses Math, Secrets
    "Color.lua",       -- Uses Math
    "Time.lua",        -- Uses Math
    "Text.lua",        -- Uses Math
}

for _, filename in ipairs(domainOrder) do
    loadFile(domainsPath .. filename)
end
