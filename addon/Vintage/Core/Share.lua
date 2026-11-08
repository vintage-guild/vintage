--------------------------------------------------------------------------------
-- Vintage Core: the members' view of an import (docs/features/active/addon-for-members)
-- An officer's addon cuts a raid-share from the import it holds and shares it with the
-- guild. It is libs/bridge-format/src/share.ts in Lua: the same fields in the import's
-- order, and the bench without its reasons, which stay with the officers. Two officers
-- holding the same import make the same share, byte for byte, so the sync's fingerprints
-- agree: nothing here depends on who builds it or when.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core

local Share = {}
Core.Share = Share

local function copy(value)
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for key, child in pairs(value) do
		out[key] = copy(child)
	end
	return out
end

--- The share for a checked import (a raid-import payload that passed Schema.Validate).
---@param import table
---@return table raid-share payload
function Share.FromImport(import)
	local share = {
		v = import.v,
		kind = "raid-share",
		guildId = import.guildId,
		generatedAt = import.generatedAt,
		raid = copy(import.raid),
		roster = copy(import.roster),
		groups = copy(import.groups),
		loot = copy(import.loot),
		candidates = copy(import.candidates),
	}
	if import.bench then
		local bench = {}
		for index, entry in ipairs(import.bench) do
			bench[index] = {
				characterId = entry.characterId,
				name = entry.name,
				class = entry.class,
				spec = entry.spec,
				role = entry.role,
			}
		end
		share.bench = bench
	end
	return share
end

return Share
