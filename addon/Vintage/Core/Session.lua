--------------------------------------------------------------------------------
-- Vintage Core: the raid session
-- One raid night: the pasted import, attendance snapshots, loot, and the items the
-- client revealed. Saved per character so a disconnect or /reload keeps the night.
--
--   idle ─raid-import─▶ imported ─raid-invite─▶ forming ─▶ live ─raid-export─▶ exported
--
-- Pure: functions take a session table and return results; the Bridge saves them.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result

local Session = {}
Core.Session = Session

Session.SCHEMA_VERSION = 1

Session.STATES = {
	idle = true,
	imported = true,
	forming = true,
	live = true,
	exported = true,
}

--- An empty session.
---@return table
function Session.New()
	return {
		schemaVersion = Session.SCHEMA_VERSION,
		state = "idle",
		attendance = {},
		loot = {},
		itemsSeen = {},
	}
end

--- What a session holds, for the window, slash commands, and Mechanic.
---@param session table|nil
---@return table ActionResult
function Session.Summary(session)
	if type(session) ~= "table" or not Session.STATES[session.state] then
		return Result.error(
			"INVALID_SESSION",
			"The saved raid session is missing or unreadable",
			"Clear it with /vintage clear"
		)
	end

	local import = session.import
	local raid = import and import.raid
	local summary = {
		state = session.state,
		title = raid and raid.title or nil,
		eventId = raid and raid.eventId or nil,
		roster = import and import.roster and #import.roster or 0,
		snapshots = session.attendance and #session.attendance or 0,
		loot = session.loot and #session.loot or 0,
		items = Core.Count(session.itemsSeen),
		kills = 0,
		wipes = 0,
		lastExport = session.lastExport,
		lastExportAt = session.lastExportAt,
	}

	for _, attempt in ipairs(session.encounters or {}) do
		if attempt.killed then
			summary.kills = summary.kills + 1
		else
			summary.wipes = summary.wipes + 1
		end
	end

	local reasoning
	if summary.title then
		reasoning = string.format(
			"%s: %s, %s",
			summary.title,
			summary.state,
			Core.Plural(summary.roster, "character", "characters")
		)
	elseif summary.snapshots > 0 then
		reasoning = string.format(
			"Raid without an import: %s, %s",
			summary.state,
			Core.Plural(summary.snapshots, "snapshot", "snapshots")
		)
	else
		reasoning = "No raid imported"
	end
	return Result.success(summary, reasoning)
end

return Session
