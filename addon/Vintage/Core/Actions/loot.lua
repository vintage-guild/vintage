--------------------------------------------------------------------------------
-- Vintage Core actions: loot and item data
-- loot-capture reads the game's "receives loot" messages into drops; loot-list
-- joins them with the item data the client revealed, for the Loot tab; ItemEntry
-- shapes that data as the export carries it. For the loot popup: loot-candidates
-- ranks each open slot's item, CheckGive guards loot-give, and ModePlan is
-- loot-mode-set. Pure: the Bridge passes in what the game shows and the clock.
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

--------------------------------------------------------------------------------
-- The loot popup: who gets each item, the checks before a hand-out, the loot method
--------------------------------------------------------------------------------

-- The game's loot methods (Enum.LootMethod).
Loot.METHOD = { master = 2, group = 3 }
-- The popup shows items from this quality without a priority list: epic, unless the import
-- says otherwise (plan A6).
Loot.POPUP_THRESHOLD = 4
local QUALITY_NAMES = { [2] = "uncommon", [3] = "rare", [4] = "epic", [5] = "legendary" }

--- The import's ranked list for an item, best first.
local function rankedFor(import, itemId)
	for _, entry in ipairs(import and import.candidates or {}) do
		if entry.itemId == itemId then
			return entry.ranked
		end
	end
	return {}
end

--- "Doran" → "doran-stonemaul" on the player's realm; "Doran-Ashbringer" stays itself. A name
--- without a realm is someone on the player's realm, never a namesake elsewhere.
local function fullKey(name, realm)
	local key = string.lower(name)
	if realm and not key:find("-", 1, true) then
		key = key .. "-" .. string.lower(realm)
	end
	return key
end

--- Who the guild's method ranks for an item, matched to the game's master-loot candidates for
--- the slot (who may receive it from this corpse) by full name; someone not among them can't be
--- given it.
local function ranked(import, itemId, eligible, realm)
	local nameOf = {}
	for _, character in ipairs(import and import.roster or {}) do
		nameOf[character.characterId] = character.name
	end
	local byName = {}
	for _, candidate in ipairs(eligible or {}) do
		byName[fullKey(candidate.name, realm)] = candidate
	end
	local out = {}
	for rank, entry in ipairs(rankedFor(import, itemId)) do
		local name = nameOf[entry.characterId]
		if name then
			local candidate = byName[fullKey(name, realm)]
			out[#out + 1] = {
				rank = rank,
				characterId = entry.characterId,
				name = name,
				reason = entry.reason,
				candidateIndex = candidate and candidate.index or nil,
				-- The name exactly as the game gives it at that index: loot-give checks it again.
				candidateName = candidate and candidate.name or nil,
			}
		end
	end
	return out
end

--- loot-candidates: the open loot window's items the popup shows (those with a priority list,
--- and those at or above the threshold), each with its ranked candidates.
---@param context table { session, slots = { slot, link, itemId, name, quality, icon, quantity }, eligible = { [slot] = { index, name } }, threshold, realm }
---@return table ActionResult { slots = { slot, link, itemId, name, quality, icon, quantity, ranked } }
function Loot.Candidates(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local threshold = context.threshold or Loot.POPUP_THRESHOLD
	local shown = {}
	for _, slot in ipairs(context.slots or {}) do
		local list =
			ranked(session.import, slot.itemId, context.eligible and context.eligible[slot.slot], context.realm)
		if #list > 0 or (type(slot.quality) == "number" and slot.quality >= threshold) then
			shown[#shown + 1] = {
				slot = slot.slot,
				link = slot.link,
				itemId = slot.itemId,
				name = slot.name,
				quality = slot.quality,
				icon = slot.icon,
				quantity = slot.quantity,
				ranked = list,
			}
		end
	end
	return Result.success({ slots = shown }, Core.Plural(#shown, "item", "items"))
end

-- The preview shows at most this many of the import's ranked items.
local PREVIEW_ITEMS = 3

--- loot-preview: sample popup rows for trying the popup without a master-loot corpse: the
--- import's items (ranked or not), with everyone on its roster standing in for the game's
--- candidates (the group first), so Give shows even alone; without an import, one sample item
--- ranked by the group. It is
--- never a real loot window, and the popup gives nothing in preview.
---@param context table { session, members = { name }, items, realm }
---@return table ActionResult { slots, preview = true }
function Loot.Preview(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local import = session.import
	local members = context.members or {}
	-- A mockup: the group, then the rest of the roster, all as if the game offered them.
	local eligible, inGroup = {}, {}
	for index, member in ipairs(members) do
		eligible[index] = { index = index, name = member.name }
		inGroup[fullKey(member.name, context.realm)] = true
	end
	for _, character in ipairs(import and import.roster or {}) do
		if not inGroup[fullKey(character.name, context.realm)] then
			eligible[#eligible + 1] = { index = #eligible + 1, name = character.name }
		end
	end
	local items = type(context.items) == "table" and context.items or {}
	local slots = {}
	-- Every kind of row: ranked items, and an item the import lists with nobody ranked.
	for _, entry in ipairs(import and import.candidates or {}) do
		if #slots < PREVIEW_ITEMS then
			local info = Loot.ItemEntry(entry.itemId, items[entry.itemId])
			slots[#slots + 1] = {
				slot = #slots + 1,
				link = "preview:" .. entry.itemId,
				itemId = entry.itemId,
				name = info and info.name or string.format("Item %d", entry.itemId),
				quality = info and info.quality or 4,
				icon = info and info.icon or nil,
				ranked = ranked(import, entry.itemId, eligible, context.realm),
			}
		end
	end
	if #slots == 0 then
		local list = {}
		for index = 1, math.min(#members, 5) do
			local name = members[index].name
			list[index] = {
				rank = index,
				characterId = "preview:" .. index,
				name = name,
				reason = "Sample reason",
				candidateIndex = index,
				candidateName = name,
			}
		end
		slots[1] = { slot = 1, link = "preview:0", itemId = 0, name = "Sample item", quality = 4, ranked = list }
	end
	return Result.success({ slots = slots, preview = true }, "Preview: nothing is given")
end

--- loot-give's checks before the game call: the player is the master looter, the slot still
--- holds the item the popup showed, the candidate index still gives exactly the name the popup
--- showed (ignoring case; never a same-named player from another realm), and the leader
--- confirmed. Without confirm it answers with the question to ask.
---@param context table { isMasterLooter, link, shownLink, name, shownName, displayName, itemName, confirm }
---@return table ActionResult
function Loot.CheckGive(context)
	if not context.isMasterLooter then
		return Result.error("NOT_MASTER_LOOTER", "Only the master looter can give loot")
	end
	if type(context.shownLink) ~= "string" or context.link ~= context.shownLink then
		return Result.error("SLOT_CHANGED", "That loot slot holds something else now", "Pick the item again")
	end
	local shownName = context.shownName
	local who = context.displayName or shownName
	local same = type(shownName) == "string"
		and type(context.name) == "string"
		and string.lower(context.name) == string.lower(shownName)
	if not same then
		return Result.error(
			"CANDIDATE_CHANGED",
			string.format("%s can't receive it from this corpse", tostring(who)),
			"They may have left the raid or be out of range"
		)
	end
	if not context.confirm then
		return Result.error(
			"CONFIRM_REQUIRED",
			string.format("Give %s to %s?", tostring(context.itemName or "this item"), who),
			"Press Confirm to give it"
		)
	end
	-- The game answers later (the slot empties, or an error for full bags): "Giving", not "Gave".
	return Result.success({}, string.format("Giving %s to %s", tostring(context.itemName or "the item"), who))
end

--- loot-mode-set: the game's loot method and threshold, as the import sets them. The player
--- becomes the master looter. Asks before changing anything.
---@param context table { session, method, threshold, isMasterLooter, isLeader, inRaid, player, confirm }
---@return table ActionResult { method?, master?, threshold? }
function Loot.ModePlan(context)
	local session = context.session
	if type(session) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	local import = session.import
	if not import then
		return Result.error("NO_IMPORT", "No raid imported", "Paste the guild's import string with Import")
	end
	if not context.inRaid then
		return Result.error("NOT_IN_RAID", "Set the loot method once the raid has formed")
	end
	if not context.isLeader then
		return Result.error("NOT_LEADER", "Only the raid leader can set the loot method")
	end
	local mode = import.loot.mode
	local method = Loot.METHOD[mode]
	local threshold = import.loot.threshold
	local methodMatches = context.method == method and (mode ~= "master" or context.isMasterLooter == true)
	local thresholdMatches = threshold == nil or context.threshold == threshold
	if methodMatches and thresholdMatches then
		return Result.error("NOTHING_TO_DO", "The loot method already matches the import")
	end
	local description = mode == "master" and "master loot (you)" or "group loot"
	if QUALITY_NAMES[threshold] then
		description = string.format("%s, %s and better", description, QUALITY_NAMES[threshold])
	end
	if not context.confirm then
		return Result.error("CONFIRM_REQUIRED", "Set the loot to " .. description .. "?", "Press Confirm to set it")
	end
	return Result.success({
		method = not methodMatches and method or nil,
		master = not methodMatches and mode == "master" and context.player or nil,
		threshold = not thresholdMatches and threshold or nil,
	}, "Loot set to " .. description)
end

return Loot
