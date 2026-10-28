--------------------------------------------------------------------------------
-- Vintage Bridge: context builders
-- Reads the game and saved state into plain tables for Core actions. Every game
-- read in the addon happens here; game mutations get their own Bridge file when
-- the first one arrives (invites, PR4).
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

--- The group now: the raid roster in a raid, else you and your party (all in group 1). A
--- member whose name the game keeps secret, or hasn't loaded yet, is counted, not listed.
---@return table[] members { name, group, class, online }, number hidden
function Context:BuildGroupSnapshot()
	local members, hidden = {}, 0
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
			add(member(name, nil, subgroup, classFile, online))
		end
		return members, hidden
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
	return members, hidden
end

--- The session, the group, the codec, and the clock, for the raid actions.
---@param params table|nil { text, confirm, label }
---@return table
function Context:BuildRaidContext(params)
	params = type(params) == "table" and params or {}
	local context = self:BuildSessionContext(params)
	local members, hidden = self:BuildGroupSnapshot()
	local groupNames = {}
	for index, entry in ipairs(members) do
		groupNames[index] = entry.name
	end
	context.text = params.text
	context.label = params.label
	context.members = members
	context.hidden = hidden
	context.groupNames = groupNames
	context.codec = ns.BridgeCodec
	context.now = time()
	context.exporter = self.FullName(Secrets.Public((UnitName("player")))) or "Unknown"
	context.addonVersion = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version") or "0.0.0"
	return context
end

return Context
