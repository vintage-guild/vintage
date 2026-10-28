--------------------------------------------------------------------------------
-- Vintage Core actions: import, attendance, and export
-- raid-import, raid-status, attendance-snapshot, and raid-export. Each takes a
-- context the Bridge built (the session, what the game showed, the codec, the
-- time) and returns an ActionResult; the Bridge saves any new session it carries.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Session = Core.Session
local Roster = Core.Roster

local RaidActions = {}
Core.Actions.Raid = RaidActions

--- The schema's caps on an export (raid-export in libs/bridge-format).
RaidActions.MAX_SNAPSHOTS = 100
RaidActions.MAX_MEMBERS = 40

local function copy(list)
	local out = {}
	for index, value in ipairs(list or {}) do
		out[index] = value
	end
	return out
end

--- A shallow copy of the session with changes applied, so a failed action changes nothing.
local function with(session, changes)
	local out = {}
	for k, v in pairs(session) do
		out[k] = v
	end
	for k, v in pairs(changes) do
		out[k] = v
	end
	return out
end

--- True when the session holds anything an import would replace.
local function hasRaid(session)
	return session.import ~= nil or #(session.attendance or {}) > 0 or #(session.loot or {}) > 0
end

--- raid-import: decode the guild's import string and start the night with it. Replacing a
--- session that already holds a raid needs confirm = true.
---@param context table { session, text, codec, now, confirm }
---@return table ActionResult { session, title, roster }
function RaidActions.Import(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local decoded = context.codec:DecodeKind(context.text, "raid-import")
	if not decoded.success then
		return decoded
	end
	if hasRaid(session) and not context.confirm then
		return Result.error(
			"CONFIRM_REQUIRED",
			"Importing replaces this raid's import, attendance, and loot",
			"Export first if you need them, then import again to confirm"
		)
	end
	local import = decoded.data
	local fresh = Session.New()
	fresh.state = "imported"
	fresh.import = import
	fresh.importedAt = context.now
	return Result.success(
		{ session = fresh, title = import.raid.title, roster = #import.roster },
		string.format("Imported %s: %d characters", import.raid.title, #import.roster)
	)
end

--- raid-status: the imported roster, each character marked in the group or not.
---@param context table { session, groupNames }
---@return table ActionResult { title, rows, inGroup, total }
function RaidActions.Status(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local import = session.import
	if not import then
		return Result.error("NO_IMPORT", "No raid imported", "Paste the guild's import string with Import")
	end
	local rows = Roster.Rows(import, context.groupNames)
	local present = 0
	for _, row in ipairs(rows) do
		if row.inGroup then
			present = present + 1
		end
	end
	return Result.success(
		{ title = import.raid.title, rows = rows, inGroup = present, total = #rows },
		string.format("%s: %d of %d in the group", import.raid.title, present, #rows)
	)
end

--- attendance-snapshot: record who is in the group now.
---@param context table { session, members, now, label }
---@return table ActionResult { session, snapshots, members }
function RaidActions.Snapshot(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local members = context.members or {}
	if #members == 0 then
		return Result.error("NOBODY_SEEN", "The game named nobody in the group", "Try again in a moment")
	end
	if #members > RaidActions.MAX_MEMBERS then
		return Result.error(
			"TOO_MANY_MEMBERS",
			string.format("A snapshot holds at most %d people", RaidActions.MAX_MEMBERS)
		)
	end
	local attendance = copy(session.attendance)
	if #attendance >= RaidActions.MAX_SNAPSHOTS then
		return Result.error(
			"TOO_MANY_SNAPSHOTS",
			string.format("This raid already has %d snapshots", RaidActions.MAX_SNAPSHOTS),
			"Export it, then clear the session"
		)
	end
	attendance[#attendance + 1] = { at = context.now, label = context.label or "manual", members = members }
	local updated = with(session, { state = "live", attendance = attendance })
	-- The last export no longer holds the whole night; make a new one.
	updated.lastExport, updated.lastExportAt = nil, nil
	return Result.success({
		session = updated,
		snapshots = #attendance,
		members = #members,
	}, string.format("Snapshot %d: %d people", #attendance, #members))
end

--- raid-export: the night as a string for the website. Carries the import's guild and raid
--- when there is one, so the website matches it without being told.
---@param context table { session, codec, now, exporter, addonVersion }
---@return table ActionResult { session, exportString, snapshots, loot }
function RaidActions.Export(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local attendance = session.attendance or {}
	if #attendance == 0 then
		return Result.error("NOTHING_TO_EXPORT", "No attendance recorded yet", "Take a snapshot first")
	end
	local import = session.import
	local payload = {
		v = 1,
		kind = "raid-export",
		exportedAt = context.now,
		addonVersion = context.addonVersion,
		exporter = context.exporter,
		guildId = import and import.guildId or nil,
		eventId = import and import.raid.eventId or nil,
		attendance = attendance,
		loot = session.loot or {},
		-- Item data arrives with loot capture (PR5); the website reads names from its own data.
		items = {},
	}
	local encoded = context.codec:Encode(payload)
	if not encoded.success then
		return encoded
	end
	return Result.success(
		{
			session = with(session, { state = "exported", lastExport = encoded.data, lastExportAt = context.now }),
			exportString = encoded.data,
			snapshots = #attendance,
			loot = #payload.loot,
		},
		string.format(
			"Exported %d snapshots and %d drops. Copy the string into the website.",
			#attendance,
			#payload.loot
		)
	)
end

return RaidActions
