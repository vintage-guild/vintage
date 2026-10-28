--------------------------------------------------------------------------------
-- Vintage Core: the imported roster against the group
-- Who the guild's import string lists, their planned group, and whether they are in
-- the player's group now. Names match as the game shows them: "Name" on the
-- player's realm, "Name-Realm" otherwise, ignoring case.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core

local Roster = {}
Core.Roster = Roster

local function key(name)
	return string.lower(name)
end

--- "Doran-Stonemaul" → "doran"; "Aeryn" → "aeryn".
local function baseKey(name)
	return key((string.match(name, "^([^-]+)")) or name)
end

--- A lookup of the names in the group: by full name, and by name without the realm when
--- only one member has that name.
---@param names string[]
---@return function inGroup(name) → boolean
function Roster.GroupLookup(names)
	local full, bases = {}, {}
	for _, name in ipairs(names) do
		full[key(name)] = true
		local base = baseKey(name)
		bases[base] = (bases[base] or 0) + 1
	end
	return function(name)
		return full[key(name)] == true or bases[baseKey(name)] == 1
	end
end

--- One row per imported character, in roster order: name, class, role, planned group, and
--- whether they are in the group now.
---@param import table|nil a raid-import payload
---@param groupNames string[] the names in the player's group now
---@return table[] rows { characterId, name, class, role, group, inGroup }
function Roster.Rows(import, groupNames)
	if type(import) ~= "table" or type(import.roster) ~= "table" then
		return {}
	end
	local plannedGroup = {}
	for _, group in ipairs(import.groups or {}) do
		for _, characterId in ipairs(group.characterIds) do
			plannedGroup[characterId] = group.group
		end
	end
	local inGroup = Roster.GroupLookup(groupNames or {})
	local rows = {}
	for _, character in ipairs(import.roster) do
		rows[#rows + 1] = {
			characterId = character.characterId,
			name = character.name,
			class = character.class,
			role = character.role,
			group = plannedGroup[character.characterId],
			inGroup = inGroup(character.name),
		}
	end
	return rows
end

return Roster
