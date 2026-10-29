--------------------------------------------------------------------------------
-- Vintage Bridge: context builders
-- Reads the game and saved state into plain tables for Core actions. Every game
-- read in the addon happens here; every call that changes the game is in
-- Bridge/Game.lua.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local Secrets = ns.Secrets

local Context = {}
ns.Context = Context

-- Forever's interface numbers are 16xxx (1.60.1 is 16001). Classic Era (11xxx) is not
-- Forever even though both report a 1.x client.
local FOREVER_INTERFACE_MIN, FOREVER_INTERFACE_MAX = 16000, 19999

--- True on a WoW: Forever client (internal name Camelot).
---@return boolean
function Context:IsForever()
	local project = rawget(_G, "WOW_PROJECT_ID")
	local forever = rawget(_G, "WOW_PROJECT_CAMELOT") or rawget(_G, "WOW_PROJECT_FOREVER")
	if project ~= nil and forever ~= nil then
		return project == forever
	end
	local _, _, _, interface = GetBuildInfo()
	interface = Secrets.Public(interface)
	return type(interface) == "number" and interface >= FOREVER_INTERFACE_MIN and interface <= FOREVER_INTERFACE_MAX
end

--- The client and addon, for client-info and diagnostics.
---@return table
function Context:BuildClientContext()
	local version, build, _, interface = GetBuildInfo()
	return {
		addonVersion = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version"),
		gameVersion = Secrets.Public(version),
		build = Secrets.Public(build),
		interface = Secrets.Public(interface),
		projectId = rawget(_G, "WOW_PROJECT_ID"),
		isForever = self:IsForever(),
		inCombat = InCombatLockdown() == true,
	}
end

--- The saved raid session, plus the caller's confirmation for destructive actions.
---@param params table|nil { confirm }
---@return table { session, confirm }
function Context:BuildSessionContext(params)
	local char = ns.db and ns.db.char
	return {
		session = char and char.session or nil,
		confirm = type(params) == "table" and params.confirm == true,
	}
end

--- "Name", or "Name-Realm" for another realm, as the export carries names. Realm spaces are
--- dropped, as the raid roster shows them.
---@param name any
---@param realm any
---@return string|nil
function Context.FullName(name, realm)
	-- "Unknown" (UNKNOWNOBJECT) is a unit the client hasn't loaded yet, not a name.
	if type(name) ~= "string" or name == "" or name == rawget(_G, "UNKNOWNOBJECT") then
		return nil
	end
	if type(realm) == "string" and realm ~= "" then
		return name .. "-" .. (realm:gsub("%s", ""))
	end
	return name
end

local function member(name, realm, group, classFile, online)
	local full = Context.FullName(Secrets.Public(name), Secrets.Public(realm))
	if not full then
		return nil
	end
	local entry = { name = full, group = Secrets.Public(group) or 1, online = Secrets.Public(online) == true }
	classFile = Secrets.Public(classFile)
	if type(classFile) == "string" and classFile ~= "" then
		entry.class = classFile:lower()
	end
	return entry
end

--- The group now: the raid roster in a raid (with each member's raid index, for moves), else
--- you and your party (all in group 1). A member whose name the game keeps secret, or hasn't
--- loaded yet, is counted, not listed; in a raid, their groups are counted too, so a move is
--- never planned into a group that is really full.
---@return table[] members { name, group, class, online, index? }, number hidden, table hiddenGroups
function Context:BuildGroupSnapshot()
	local members, hidden, hiddenGroups = {}, 0, {}
	local function add(entry)
		if entry then
			members[#members + 1] = entry
		else
			hidden = hidden + 1
		end
	end
	if IsInRaid() then
		for index = 1, GetNumGroupMembers() do
			-- Already "Name-Realm" for another realm.
			local name, _, subgroup, _, _, classFile, _, online = GetRaidRosterInfo(index)
			local entry = member(name, nil, subgroup, classFile, online)
			if entry then
				entry.index = index
			else
				local group = Secrets.Public(subgroup)
				if type(group) == "number" then
					hiddenGroups[group] = (hiddenGroups[group] or 0) + 1
				end
			end
			add(entry)
		end
		return members, hidden, hiddenGroups
	end
	local units = { "player" }
	for index = 1, GetNumSubgroupMembers() do
		units[#units + 1] = "party" .. index
	end
	for _, unit in ipairs(units) do
		local name, realm = UnitName(unit)
		local _, classFile = UnitClass(unit)
		add(member(name, realm, 1, classFile, UnitIsConnected(unit)))
	end
	return members, hidden, hiddenGroups
end

--- The session, the group, the codec, and the clock, for the raid actions.
---@param params table|nil { text, confirm, label }
---@return table
function Context:BuildRaidContext(params)
	params = type(params) == "table" and params or {}
	local context = self:BuildSessionContext(params)
	local members, hidden, hiddenGroups = self:BuildGroupSnapshot()
	local groupNames = {}
	for index, entry in ipairs(members) do
		groupNames[index] = entry.name
	end
	context.text = params.text
	context.label = params.label
	context.members = members
	context.hidden = hidden
	context.groupNames = groupNames
	context.inRaid = IsInRaid() == true
	context.size = math.max(1, #members + hidden)
	if ns.Invites then
		ns.Invites:Forget(members)
		context.invites = ns.Invites:States()
	else
		context.invites = {}
	end
	context.hiddenGroups = hiddenGroups
	context.items = ns.db and ns.db.global and ns.db.global.items or {}
	context.codec = ns.BridgeCodec
	context.now = time()
	context.exporter = self.FullName(Secrets.Public((UnitName("player")))) or "Unknown"
	context.addonVersion = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version") or "0.0.0"
	return context
end

--- The game's item lookup: C_Item on current clients, the old global otherwise.
local function itemInfoApi()
	local items = rawget(_G, "C_Item")
	return items and items.GetItemInfo or rawget(_G, "GetItemInfo")
end

--- What the client knows about an item, or nil until it has loaded the item's data.
---@param itemId number
---@return table|nil { name, quality, itemLevel, equipLoc, classId, subclassId, icon }
function Context:ItemInfo(itemId)
	local getInfo = itemInfoApi()
	if not getInfo then
		return nil
	end
	local name, _, quality, itemLevel, _, _, _, _, equipLoc, icon, _, classId, subclassId = getInfo(itemId)
	name = Secrets.Public(name)
	if type(name) ~= "string" or name == "" then
		return nil
	end
	return {
		name = name,
		quality = Secrets.Public(quality),
		itemLevel = Secrets.Public(itemLevel),
		equipLoc = Secrets.Public(equipLoc),
		classId = Secrets.Public(classId),
		subclassId = Secrets.Public(subclassId),
		icon = Secrets.Public(icon),
	}
end

--- An item's quality (0 poor … 5 legendary), or nil while the client doesn't know it.
---@param itemId number
---@return number|nil
function Context:ItemQuality(itemId)
	local info = self:ItemInfo(itemId)
	if info and type(info.quality) == "number" then
		return info.quality
	end
	local items = rawget(_G, "C_Item")
	local byId = items and items.GetItemQualityByID
	local quality = byId and Secrets.Public(byId(itemId))
	return type(quality) == "number" and quality or nil
end

--- The game's loot message formats ("%s receives loot: %s."), for reading CHAT_MSG_LOOT.
---@return table { [globalName] = format }
function Context:LootFormats()
	local formats = {}
	for _, kind in ipairs(ns.Core.Actions.Loot.MESSAGES) do
		formats[kind.format] = rawget(_G, kind.format)
	end
	return formats
end

--- The group's loot threshold (2 uncommon … 5 legendary), when the game says.
---@return number|nil
function Context:LootThreshold()
	local getThreshold = rawget(_G, "GetLootThreshold")
	local threshold = getThreshold and Secrets.Public(getThreshold())
	return type(threshold) == "number" and threshold or nil
end

return Context
