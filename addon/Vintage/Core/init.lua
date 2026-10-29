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

--- "1 snapshot", "3 snapshots".
---@param count number
---@param one string
---@param many string
---@return string
function Core.Plural(count, one, many)
	return string.format("%d %s", count, count == 1 and one or many)
end

--- A copy of a list.
---@param list table|nil
---@return table
function Core.CopyList(list)
	local out = {}
	for index, value in ipairs(list or {}) do
		out[index] = value
	end
	return out
end

--- A shallow copy of a table with changes applied, so a failed action changes nothing.
---@param record table
---@param changes table
---@return table
function Core.With(record, changes)
	local out = {}
	for k, v in pairs(record) do
		out[k] = v
	end
	for k, v in pairs(changes) do
		out[k] = v
	end
	return out
end

--- Text cut to at most `max` bytes without splitting a UTF-8 character (the export's limits).
---@param text string
---@param max number
---@return string
function Core.Truncate(text, max)
	if #text <= max then
		return text
	end
	-- Drop a trailing lead byte and its continuation bytes: the character may be cut short.
	return (text:sub(1, max):gsub("[\192-\255][\128-\191]*$", ""))
end

--- A Lua pattern for one of the game's message formats ("%s receives loot: %s."): each "%s"
--- captures text and each "%d" a number.
---@param format any
---@return string|nil
function Core.FormatPattern(format)
	if type(format) ~= "string" or format == "" then
		return nil
	end
	-- Escape the pattern characters, then turn the placeholders into captures.
	local pattern = format:gsub("([%^%$%(%)%.%[%]%*%+%-%?])", "%%%1")
	pattern = pattern:gsub("%%s", "(.+)"):gsub("%%d", "(%%d+)")
	return "^" .. pattern .. "$"
end

return Core
