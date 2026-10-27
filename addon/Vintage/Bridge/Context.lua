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

return Context
