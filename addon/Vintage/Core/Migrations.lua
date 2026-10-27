--------------------------------------------------------------------------------
-- Vintage Core: saved-data migrations
-- Each saved scope (global, char, profile) keeps its own schemaVersion. Steps are
-- ordered and idempotent. schemaVersion never goes in AceDB defaults: a default
-- would hide an old record that still needs migrating (Weekly's rule).
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Session = Core.Session

local Migrations = {}
Core.Migrations = Migrations

-- steps[scope][n] brings a record from version n - 1 to version n.
Migrations.steps = {
	global = {
		-- 1: item data the client revealed, kept across characters (PLAN §3.5)
		function(record)
			if type(record.items) ~= "table" then
				record.items = {}
			end
		end,
	},
	char = {
		-- 1: the current raid session
		function(record)
			if type(record.session) ~= "table" then
				record.session = Session.New()
			end
		end,
	},
	profile = {
		-- 1: settings live in AceDB defaults; nothing to move yet
		function() end,
	},
}

--- The newest version of a scope.
---@param scope string
---@return number|nil
function Migrations.Latest(scope)
	local steps = Migrations.steps[scope]
	return steps and #steps or nil
end

--- Brings one saved record up to the latest version of its scope, in place.
---@param scope string "global" | "char" | "profile"
---@param record table
---@return table ActionResult { scope, from, to }
function Migrations.Run(scope, record)
	local steps = Migrations.steps[scope]
	if not steps then
		return Result.error("UNKNOWN_SCOPE", "No migrations for saved scope " .. tostring(scope))
	end
	if type(record) ~= "table" then
		return Result.error("INVALID_RECORD", "Saved " .. scope .. " data is not a table")
	end

	local from = tonumber(record.schemaVersion) or 0
	local latest = #steps
	if from > latest then
		return Result.error(
			"NEWER_SAVED_DATA",
			string.format("Saved %s data is version %d; this Vintage reads up to %d", scope, from, latest),
			"Update Vintage from CurseForge"
		)
	end

	for version = from + 1, latest do
		steps[version](record)
		record.schemaVersion = version
	end

	return Result.success(
		{ scope = scope, from = from, to = latest },
		from == latest and (scope .. " data is current") or string.format("Migrated %s data from version %d to %d", scope, from, latest)
	)
end

return Migrations
