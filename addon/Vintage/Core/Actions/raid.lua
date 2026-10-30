--------------------------------------------------------------------------------
-- Vintage Core actions: import, attendance, boss kills, and export
-- raid-import, raid-status, attendance-snapshot, encounter-record, and raid-export.
-- Each takes a context the Bridge built (the session, what the game showed, the
-- codec, the time) and returns an ActionResult; the Bridge saves any new session.
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

--- The export's caps on a snapshot label and an item name (libs/bridge-format).
RaidActions.MAX_LABEL = 64
RaidActions.MAX_ITEMS = 5000

local copy, with = Core.CopyList, Core.With

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
		string.format("Imported %s: %s", import.raid.title, Core.Plural(#import.roster, "character", "characters"))
	)
end

--- Whether a name is in any of the night's snapshots (matched as the roster matches the group).
---@param attendance table[]|nil
---@return function attended(name) → boolean
local function attendedLookup(attendance)
	local names = {}
	for _, snapshot in ipairs(attendance or {}) do
		for _, member in ipairs(snapshot.members or {}) do
			names[#names + 1] = member.name
		end
	end
	return Roster.GroupLookup(names)
end

--- raid-status: the imported roster, each character marked in the group (and which raid group),
--- invited, declined, or missing; how many still need an invite, and how many sit outside their
--- planned group. Also the bench, and once the raid's start time has passed, which roles are
--- short (`short`, role → count), with the bench of those roles first.
---@param context table { session, members | groupNames, invites, inRaid }
---@return table ActionResult { title, rows, bench, started, short, inGroup, total, toInvite, misplaced, inRaid, loot }
function RaidActions.Status(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local import = session.import
	if not import then
		return Result.error("NO_IMPORT", "No raid imported", "Paste the guild's import string with Import")
	end
	local members = context.members or context.groupNames
	local rows = Roster.Rows(import, members, context.invites)
	local present, toInvite = 0, 0
	for _, row in ipairs(rows) do
		if row.inGroup then
			present = present + 1
		elseif row.state == "missing" or row.state == "offline" then
			toInvite = toInvite + 1
		end
	end
	local misplaced = 0
	if context.inRaid and context.members then
		misplaced = Core.Forming.Misplaced(import, context.members)
	end
	-- Once the raid's start time has passed, who is missing counts as short, and the bench
	-- lists the roles the raid is short of first.
	local started = type(context.now) == "number" and context.now >= import.raid.startsAt
	local bench = Roster.BenchRows(import, members, context.invites)
	-- For the export's standby list: who the leader unticked, and who came in (a snapshot has them).
	local off, attended = session.standbyOff or {}, attendedLookup(session.attendance)
	for _, row in ipairs(bench) do
		row.stoodBy = not off[row.characterId]
		row.attended = attended(row.name)
	end
	local short = started and Roster.Short(rows, bench) or {}
	local loot = import.loot or {}
	return Result.success({
		bench = Roster.OrderBench(bench, short),
		started = started,
		short = short,
		title = import.raid.title,
		rows = rows,
		inGroup = present,
		total = #rows,
		toInvite = toInvite,
		misplaced = misplaced,
		inRaid = context.inRaid == true,
		-- The loot plan the import carries, for the Loot tab until drops are recorded.
		loot = { mode = loot.mode, threshold = loot.threshold, prioritized = #(import.candidates or {}) },
	}, string.format("%s: %d of %d in the group", import.raid.title, present, #rows))
end

--- The session's attendance with a snapshot of `members` added. With replaceLast, a last
--- snapshot with the same label is replaced instead (exporting again refreshes "end").
---@return table|nil attendance, table|nil error ActionResult
local function addSnapshot(session, members, now, label, replaceLast)
	if #members == 0 then
		return nil, Result.error("NOBODY_SEEN", "The game named nobody in the group", "Try again in a moment")
	end
	if #members > RaidActions.MAX_MEMBERS then
		return nil,
			Result.error(
				"TOO_MANY_MEMBERS",
				string.format("A snapshot holds at most %d people", RaidActions.MAX_MEMBERS)
			)
	end
	local attendance = copy(session.attendance)
	local last = attendance[#attendance]
	if replaceLast and last and last.label == label then
		attendance[#attendance] = nil
	end
	if #attendance >= RaidActions.MAX_SNAPSHOTS then
		return nil,
			Result.error(
				"TOO_MANY_SNAPSHOTS",
				string.format("This raid already has %d snapshots", RaidActions.MAX_SNAPSHOTS),
				"Export it, then clear the session"
			)
	end
	-- Only what the export carries (the group read also has raid indexes for arranging).
	local recorded = {}
	for index, member in ipairs(members) do
		recorded[index] = { name = member.name, class = member.class, group = member.group, online = member.online }
	end
	attendance[#attendance + 1] = { at = now, label = Core.Truncate(label, RaidActions.MAX_LABEL), members = recorded }
	return attendance
end

--- The session with something new recorded: live, and its last export no longer holds the
--- whole night.
local function live(session, changes)
	local updated = with(session, changes)
	updated.state = "live"
	updated.lastExport, updated.lastExportAt = nil, nil
	return updated
end

--- attendance-snapshot: record who is in the group now. A raid has one "start" snapshot (taken
--- at the first pull or when Arrange finishes); asking for another is refused. An automatic
--- snapshot needs a raid group.
---@param context table { session, members, now, label, automatic, inRaid, hidden }
---@return table ActionResult { session, snapshots, members }
function RaidActions.Snapshot(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	-- Anything but a label the export accepts is a manual snapshot.
	local label = type(context.label) == "string" and context.label ~= "" and context.label or "manual"
	if context.automatic and not context.inRaid then
		return Result.error("NOT_IN_RAID", "Snapshots are taken automatically in a raid only")
	end
	-- The game may hide names at a pull: an automatic snapshot waits for a full view (the next
	-- pull or Arrange tries again) instead of locking in a partial "start".
	if context.automatic and (context.hidden or 0) > 0 then
		return Result.error("PARTLY_HIDDEN", "The game is hiding some of the raid", "Taken at the next pull")
	end
	if label == "start" then
		for _, snapshot in ipairs(session.attendance or {}) do
			if snapshot.label == "start" then
				return Result.error("ALREADY_STARTED", "This raid already has its start snapshot")
			end
		end
	end
	local members = context.members or {}
	local attendance, err = addSnapshot(session, members, context.now, label)
	if not attendance then
		return err
	end
	return Result.success({
		session = live(session, { attendance = attendance }),
		snapshots = #attendance,
		members = #members,
	}, string.format("Snapshot %d: %s", #attendance, Core.Plural(#members, "person", "people")))
end

--- standby-set: whether a bench character stood by, for the export's standby list. Everyone on
--- the bench stood by until the leader unticks them.
---@param context table { session, characterId, stoodBy }
---@return table ActionResult { session, stoodBy }
function RaidActions.SetStandby(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local bench = session.import and session.import.bench or {}
	local entry
	for _, character in ipairs(bench) do
		if character.characterId == context.characterId then
			entry = character
		end
	end
	if not entry then
		return Result.error("NOT_ON_BENCH", "That character isn't on this raid's bench")
	end
	local off = {}
	for characterId in pairs(session.standbyOff or {}) do
		off[characterId] = true
	end
	off[entry.characterId] = not context.stoodBy or nil
	local updated = with(session, { standbyOff = off })
	-- The last export no longer says who stood by.
	updated.lastExport, updated.lastExportAt = nil, nil
	return Result.success(
		{ session = updated, stoodBy = context.stoodBy == true },
		string.format(context.stoodBy and "%s stood by" or "%s didn't stand by", entry.name)
	)
end

--- encounter-record: a boss attempt ended. Remembers it (drops in the next few minutes are its
--- loot), and a kill in a raid takes a snapshot labelled with the boss's name.
---@param context table { session, encounter = { id, name, killed }, members, inRaid, now }
---@return table ActionResult { session, snapshot, snapshots? }
function RaidActions.Encounter(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local encounter = context.encounter
	if type(encounter) ~= "table" or type(encounter.name) ~= "string" or encounter.name == "" then
		return Result.error("INVALID_PARAMS", "An encounter needs a name")
	end
	local name = Core.Truncate(encounter.name, RaidActions.MAX_LABEL)
	local last = { id = encounter.id, name = name, endedAt = context.now, killed = encounter.killed == true }
	local updated = with(session, { lastEncounter = last })
	if not last.killed then
		return Result.success({ session = updated, snapshot = false }, name .. ": wipe")
	end
	if not context.inRaid then
		return Result.success({ session = updated, snapshot = false }, name .. " killed")
	end
	local attendance, err = addSnapshot(updated, context.members or {}, context.now, name)
	if not attendance then
		-- The kill is kept even when the snapshot can't be taken.
		return Result.success({ session = updated, snapshot = false }, name .. " killed; " .. err.error.message)
	end
	return Result.success(
		{ session = live(updated, { attendance = attendance }), snapshot = true, snapshots = #attendance },
		string.format("%s killed: snapshot %d", name, #attendance)
	)
end

--- The item data the client revealed for the items this raid saw, in item id order, leaving out
--- any saved record the export would refuse.
--- The export's standby list: the import's bench, less anyone the leader unticked and anyone
--- who came in (they are in the attendance). nil for an import without a bench, so older
--- exports keep their shape.
local function stoodBy(session, attendance)
	local bench = session.import and session.import.bench
	if type(bench) ~= "table" or #bench == 0 then
		return nil
	end
	local off, attended = session.standbyOff or {}, attendedLookup(attendance)
	local list = {}
	for _, entry in ipairs(bench) do
		if not off[entry.characterId] and not attended(entry.name) then
			list[#list + 1] = { characterId = entry.characterId, name = entry.name, reason = entry.reason }
		end
	end
	return list
end

local function seenItems(seen, known)
	local ItemEntry = Core.Actions.Loot.ItemEntry
	local ids = {}
	for itemId in pairs(seen or {}) do
		if type(itemId) == "number" and type(known) == "table" and ItemEntry(itemId, known[itemId]) then
			ids[#ids + 1] = itemId
		end
	end
	table.sort(ids)
	local items = {}
	for index = 1, math.min(#ids, RaidActions.MAX_ITEMS) do
		items[index] = ItemEntry(ids[index], known[ids[index]])
	end
	return items
end

--- raid-export: the night as a string for the website. Carries the import's guild and raid
--- when there is one, so the website matches it without being told. In a raid, it first
--- records who is here at the end (replacing the last "end" when exporting again).
---@param context table { session, codec, now, exporter, addonVersion, members, inRaid, items }
---@return table ActionResult { session, exportString, snapshots, loot, items }
function RaidActions.Export(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local attendance = session.attendance or {}
	if context.inRaid and #(context.members or {}) > 0 then
		attendance = addSnapshot(session, context.members, context.now, "end", true) or attendance
	end
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
		items = seenItems(session.itemsSeen, context.items),
		standby = stoodBy(session, attendance),
	}
	local encoded = context.codec:Encode(payload)
	if not encoded.success then
		return encoded
	end
	return Result.success(
		{
			session = with(session, {
				attendance = attendance,
				state = "exported",
				lastExport = encoded.data,
				lastExportAt = context.now,
			}),
			exportString = encoded.data,
			snapshots = #attendance,
			loot = #payload.loot,
			items = #payload.items,
		},
		string.format(
			"Exported %s and %s. Copy the string into the website.",
			Core.Plural(#attendance, "snapshot", "snapshots"),
			Core.Plural(#payload.loot, "drop", "drops")
		)
	)
end

return RaidActions
