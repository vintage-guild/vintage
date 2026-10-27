-- !sandbox_bootstrap.lua
-- Sandbox initialization for FenCore testing
-- Named with ! prefix to load first alphabetically
--
-- This file provides WoW API stubs needed by FenCore when running in sandbox mode.
-- The sandbox test runner loads files in alphabetical order, so this loads first
-- and creates the _G.FenCore namespace before other Core files try to access it.

-- ============================================================================
-- SANDBOX STUBS - WoW globals needed by FenCore
-- ============================================================================
-- These ALWAYS override existing stubs because wow_stubs.lua may have set up
-- error-throwing protected versions that FenCore actually needs to call.

-- C_Timer stub (ALWAYS override - wow_stubs marks these as protected)
C_Timer = C_Timer or {}
function C_Timer.After(delay, callback)
    -- In sandbox, just call immediately (no async)
    if callback then callback() end
end

function C_Timer.NewTimer(delay, callback)
    if callback then callback() end
    return { Cancel = function() end }
end

function C_Timer.NewTicker(interval, callback, iterations)
    return { Cancel = function() end }
end

-- LibStub stub (minimal - FenCore checks for it)
LibStub = LibStub or function(name, silent)
    return nil  -- No libraries in sandbox
end

-- Slash command stubs
SlashCmdList = SlashCmdList or {}

-- String extensions (WoW extends string library)
if not string.trim then
    function string.trim(s)
        return s:match("^%s*(.-)%s*$") or s
    end
end

-- GetTime stub (returns monotonic time)
GetTime = GetTime or function()
    return os.clock()
end

-- GetBuildInfo stub (for Environment domain)
GetBuildInfo = GetBuildInfo or function()
    -- Return mock 12.0 values (Midnight)
    return "12.0.0", "55000", "Jan 1 2026", 120000
end

-- issecretvalue stub (for Secrets domain - WoW 12.0+)
-- In sandbox, no values are secrets, so always return false
function issecretvalue(value)
    return false
end

-- ============================================================================
-- CREATE FENCORE NAMESPACE
-- ============================================================================
-- The sandbox loads files alphabetically: !sandbox_bootstrap, ActionResult, Catalog, FenCore
-- ActionResult and Catalog expect _G.FenCore to exist, so we create it here first.
-- FenCore.lua will enhance it when it loads later.

if not _G.FenCore then
    local FenCore = {
        version = "1.0.0",
        major = "FenCore",
        minor = 1,
        debugMode = false,
        _sandboxMode = true,

        -- Namespace placeholders (set by their respective modules)
        ActionResult = nil,
        Catalog = nil,
        Math = nil,
        Secrets = nil,
        Progress = nil,
        Charges = nil,
        Cooldowns = nil,
        Color = nil,
        Time = nil,
        Text = nil,
        Tables = nil,
        Environment = nil,
    }

    -- Debug logging (simplified for sandbox)
    function FenCore:Log(message, category)
        if self.debugMode then
            print("[FenCore]" .. (category or "") .. " " .. message)
        end
    end

    _G.FenCore = FenCore
end
