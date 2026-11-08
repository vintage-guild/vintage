--------------------------------------------------------------------------------
-- Vintage Bridge: name forms (docs/features/active/addon-for-members, Q6)
-- A Forever character's unique name is two words ("Bloodfen Il"), and the APIs may not
-- agree on which form they return. /vintage names prints what each one gives, then
-- sends one addon message to the guild and prints the sender as the game reports it
-- back (the client hears its own guild messages). The raid sync trusts senders by
-- that name, and roster matching (D10) compares the import's names with these.
--------------------------------------------------------------------------------

local _, ns = ...

local Secrets = ns.Secrets

local Diagnostics = {}
ns.Diagnostics = Diagnostics

Diagnostics.PREFIX = "VINTAGE"
Diagnostics.PING = "names-ping"

local function show(...)
	local parts = {}
	for index = 1, select("#", ...) do
		local value = select(index, ...)
		if Secrets.IsSecret(value) then
			parts[index] = "<secret>"
		elseif value == nil or type(value) == "number" or type(value) == "boolean" then
			parts[index] = tostring(value)
		else
			parts[index] = string.format("%q", tostring(value))
		end
	end
	return table.concat(parts, ", ")
end

--- One line per API: what it returns for you, your guild entry, and your group.
---@return string[]
function Diagnostics:NameLines()
	local lines = {}
	local function add(label, ...)
		lines[#lines + 1] = label .. " = " .. show(...)
	end
	local call = function(name, ...)
		local fn = rawget(_G, name)
		if type(fn) ~= "function" then
			return "(missing)"
		end
		return fn(...)
	end

	add('UnitName("player")', UnitName("player"))
	add('GetUnitName("player", true)', call("GetUnitName", "player", true))
	add('UnitFullName("player")', call("UnitFullName", "player"))
	add("GetRealmName()", GetRealmName())
	add("GetNormalizedRealmName()", call("GetNormalizedRealmName"))

	if IsInGuild() then
		add('GetGuildInfo("player")', GetGuildInfo("player"))
		-- Your own roster entry: the one whose name starts with your first name.
		local first = Secrets.Public((UnitName("player"))) or ""
		for index = 1, GetNumGuildMembers() do
			local name, rankName, rankIndex = GetGuildRosterInfo(index)
			if type(name) == "string" and name:sub(1, #first) == first then
				add("GetGuildRosterInfo(" .. index .. ")", name, rankName, rankIndex)
			end
		end
	end

	if IsInRaid() then
		for index = 1, math.min(GetNumGroupMembers(), 3) do
			add("GetRaidRosterInfo(" .. index .. ")", (GetRaidRosterInfo(index)))
		end
	elseif IsInGroup() then
		add('UnitName("party1")', UnitName("party1"))
		add('GetUnitName("party1", true)', call("GetUnitName", "party1", true))
	end
	return lines
end

--- Sends one addon message to the guild; onSender(sender) gets the sender as the game
--- reports it when the message comes back. False when not in a guild.
---@param onSender fun(sender: string)
---@return boolean
function Diagnostics:Ping(onSender)
	if not IsInGuild() then
		return false
	end
	C_ChatInfo.RegisterAddonMessagePrefix(self.PREFIX)
	ns.Events:On("CHAT_MSG_ADDON", "diagnostics", function(_, prefix, text, _, sender)
		if prefix == self.PREFIX and text == self.PING then
			ns.Events:Off("CHAT_MSG_ADDON", "diagnostics")
			onSender(show(sender))
		end
	end)
	C_ChatInfo.SendAddonMessage(self.PREFIX, self.PING, "GUILD")
	return true
end

return Diagnostics
