--------------------------------------------------------------------------------
-- Vintage Core actions: loot and item data
-- loot-capture reads the game's "receives loot" messages into drops; loot-list
-- joins them with the item data the client revealed, for the Loot tab; ItemEntry
-- shapes that data as the export carries it. Pure: the Bridge passes in the
-- message formats, the item's quality, and the clock.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result

local Loot = {}
Core.Actions.Loot = Loot

--- The export's caps (raid-export in libs/bridge-format).
Loot.MAX_DROPS = 1000
Loot.MAX_TEXT = 100
-- Seconds after a boss kill in which a drop counts as that boss's loot.
Loot.SOURCE_WINDOW = 300
-- With neither the import's threshold nor the game's: rare and better.
Loot.DEFAULT_THRESHOLD = 3

-- The game's loot messages (format globals), the ones with a count first: "%s" would otherwise
-- take the "x2" into the item link.
Loot.MESSAGES = {
	{ format = "LOOT_ITEM_SELF_MULTIPLE", own = true, multiple = true },
	{ format = "LOOT_ITEM_MULTIPLE", multiple = true },
	{ format = "LOOT_ITEM_SELF", own = true },
	{ format = "LOOT_ITEM" },
}

--- Reads a loot message: who got which item, and how many.
---@param message any
---@param formats table { [globalName] = format } the game's loot message formats
---@param player string the player's name, for "You receive loot"
---@return table|nil { looter, itemId, count }
function Loot.Read(message, formats, player)
	if type(message) ~= "string" or type(formats) ~= "table" then
		return nil
	end
	for _, kind in ipairs(Loot.MESSAGES) do
		local pattern = Core.FormatPattern(formats[kind.format])
		local captures = pattern and { message:match(pattern) } or {}
		if #captures > 0 then
			local looter, link, count
			if kind.own then
				looter, link, count = player, captures[1], captures[2]
			else
				looter, link, count = captures[1], captures[2], captures[3]
			end
			local itemId = tonumber(link:match("item:(%d+)"))
			-- The export's name limits (2 to 48 characters); anything else isn't a name.
			if not (itemId and itemId > 0 and type(looter) == "string" and #looter >= 2 and #looter <= 48) then
				return nil
			end
			return { looter = looter, itemId = itemId, count = tonumber(count) or 1 }
		end
	end
	return nil
end

--- The boss a drop came from: the last kill, if it ended in the last few minutes.
---@param encounter table|nil session.lastEncounter
---@param now number
---@return string|nil
function Loot.Source(encounter, now)
	if type(encounter) ~= "table" or not encounter.killed or type(encounter.endedAt) ~= "number" then
		return nil
	end
	if now - encounter.endedAt > Loot.SOURCE_WINDOW then
		return nil
	end
	return encounter.name
end

--- loot-capture: record a drop someone in the raid received. Items below the loot threshold
--- are skipped; an item whose quality the client doesn't know yet is kept.
---@param context table { session, drop = { looter, itemId, count }, quality, threshold, inRaid, now }
---@return table ActionResult { session, drop }
function Loot.Capture(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local drop = context.drop
	if type(drop) ~= "table" then
		return Result.error("NOT_A_DROP", "Not a loot message")
	end
	-- A raid group only: a party the next day must not land in the imported raid's export.
	if not context.inRaid then
		return Result.error("NOT_IN_RAID", "Loot is recorded in a raid only")
	end
	local threshold = context.threshold or Loot.DEFAULT_THRESHOLD
	if type(context.quality) == "number" and context.quality < threshold then
		return Result.error("BELOW_THRESHOLD", "Below the loot threshold")
	end
	local loot = Core.CopyList(session.loot)
	if #loot >= Loot.MAX_DROPS then
		return Result.error(
			"TOO_MANY_DROPS",
			string.format("This raid already has %d drops", Loot.MAX_DROPS),
			"Export it, then clear the session"
		)
	end
	local entry = {
		itemId = drop.itemId,
		looter = drop.looter,
		at = context.now,
		count = (drop.count or 1) > 1 and drop.count or nil,
		source = Loot.Source(session.lastEncounter, context.now),
	}
	loot[#loot + 1] = entry
	local seen = {}
	for itemId in pairs(session.itemsSeen or {}) do
		seen[itemId] = true
	end
	seen[drop.itemId] = true
	local updated = Core.With(session, { state = "live", loot = loot, itemsSeen = seen })
	-- The last export no longer holds the whole night.
	updated.lastExport, updated.lastExportAt = nil, nil
	return Result.success({ session = updated, drop = entry }, string.format("Drop %d: %s", #loot, drop.looter))
end

local function whole(value, min, max)
	if type(value) ~= "number" or value ~= math.floor(value) or value < min or (max and value > max) then
		return nil
	end
	return value
end

--- Item data as the export carries it, or nil when the client gave too little (no name or
--- quality). Fields the export would refuse are left out.
---@param itemId number
---@param info table|nil { name, quality, itemLevel, equipLoc, classId, subclassId, icon }
---@return table|nil
function Loot.ItemEntry(itemId, info)
	if type(info) ~= "table" or not whole(itemId, 1) then
		return nil
	end
	local quality = whole(info.quality, 0, 8)
	if type(info.name) ~= "string" or info.name == "" or not quality then
		return nil
	end
	local equipLoc = type(info.equipLoc) == "string" and info.equipLoc ~= "" and info.equipLoc or nil
	return {
		itemId = itemId,
		name = Core.Truncate(info.name, Loot.MAX_TEXT),
		quality = quality,
		itemLevel = whole(info.itemLevel, 0),
		equipLoc = equipLoc and #equipLoc <= 40 and equipLoc or nil,
		classId = whole(info.classId, 0),
		subclassId = whole(info.subclassId, 0),
		icon = whole(info.icon, 0),
	}
end

--- loot-list: this raid's drops, newest first, with the item data the client revealed.
---@param context table { session, items }
---@return table ActionResult { drops = { itemId, looter, at, count, source, name?, quality?, icon? } }
function Loot.List(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local items = type(context.items) == "table" and context.items or {}
	local drops = {}
	local loot = session.loot or {}
	for index = #loot, 1, -1 do
		local drop = loot[index]
		local item = Loot.ItemEntry(drop.itemId, items[drop.itemId])
		drops[#drops + 1] = {
			itemId = drop.itemId,
			looter = drop.looter,
			at = drop.at,
			count = drop.count,
			source = drop.source,
			name = item and item.name or nil,
			quality = item and item.quality or nil,
			icon = item and item.icon or nil,
		}
	end
	return Result.success({ drops = drops }, Core.Plural(#drops, "drop", "drops"))
end

return Loot
