--------------------------------------------------------------------------------
-- Vintage Core
-- Pure Lua shared by every Core file. Core never calls a WoW API, so it runs the
-- same in busted, Mechanic's sandbox, and the game (Weekly layout, PLAN §3.6).
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core or {}
ns.Core = Core

Core.Actions = Core.Actions or {}

-- FenCore's ActionResult when it is loaded (always, in game). The fallback has the
-- same shape, so Core tests run without FenCore.
local fallback = {}

function fallback.success(data, reasoning)
	return { success = true, data = data, reasoning = reasoning }
end

function fallback.error(code, message, suggestion)
	return {
		success = false,
		error = { code = code, message = message, suggestion = suggestion },
	}
end

local FenCore = rawget(_G, "FenCore")
Core.Result = (FenCore and FenCore.ActionResult) or fallback

--- Number of keys in a table, for sets keyed by id.
---@param tbl table|nil
---@return number
function Core.Count(tbl)
	local count = 0
	if type(tbl) == "table" then
		for _ in pairs(tbl) do
			count = count + 1
		end
	end
	return count
end

return Core
