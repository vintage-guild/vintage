--------------------------------------------------------------------------------
-- Vintage Core: the imported roster against the group
-- Who the guild's import string lists, their planned group, and where they are now:
-- in the group (and which raid group), invited, declined, or missing. Names match
-- as the game shows them: "Name" on the player's realm, "Name-Realm" otherwise,
-- ignoring case.
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

--- Group members as tables: names alone become { name = name }.
local function asMembers(members)
	local out = {}
	for index, member in ipairs(members or {}) do
		out[index] = type(member) == "table" and member or { name = member }
	end
	return out
end

--- A lookup of the people in the group: by full name, and by name without the realm when only
--- one member has that name.
---@param members table[]|string[] { name, ... } or names
---@return function find(name) → the member, or nil
function Roster.MemberLookup(members)
	local byFull, byBase, bases = {}, {}, {}
	for _, member in ipairs(asMembers(members)) do
		byFull[key(member.name)] = member
		local base = baseKey(member.name)
		bases[base] = (bases[base] or 0) + 1
		byBase[base] = member
	end
	return function(name)
		local member = byFull[key(name)]
		if member then
			return member
		end
		local base = baseKey(name)
		if bases[base] == 1 then
			return byBase[base]
		end
		return nil
	end
end

--- Whether a name is in the group (see MemberLookup).
---@param names table[]|string[]
---@return function inGroup(name) → boolean
function Roster.GroupLookup(names)
	local find = Roster.MemberLookup(names)
	return function(name)
		return find(name) ~= nil
	end
end

--- A name's invite answer: under its full name, or the bare name (the game drops the realm for
--- the player's own realm, so "Doran declines" answers for "Doran-Stonemaul").
---@param invites table|nil { [lowerName] = state }
---@param name string
---@return string|nil
function Roster.InviteState(invites, name)
	if not invites then
		return nil
	end
	return invites[key(name)] or invites[baseKey(name)]
end

--- characterId → planned group, from the import's groups.
local function plannedGroups(import)
	local groupOf = {}
	for _, group in ipairs(import.groups or {}) do
		for _, characterId in ipairs(group.characterIds) do
			groupOf[characterId] = group.group
		end
	end
	return groupOf
end

--- The planned group of each raid member the import names, keyed by raid index.
---@param import table|nil a raid-import payload
---@param members table[] the raid now: { name, index }
---@return table<number, number> raid index → planned group
function Roster.PlannedGroups(import, members)
	local planned = {}
	if type(import) ~= "table" then
		return planned
	end
	local groupOf = plannedGroups(import)
	local find = Roster.MemberLookup(members)
	for _, character in ipairs(import.roster or {}) do
		local target = groupOf[character.characterId]
		local member = target and find(character.name)
		if member and member.index then
			planned[member.index] = target
		end
	end
	return planned
end

--- One row per imported character, in roster order: name, class, role, planned group, where they
--- are now, and the answer to an invite.
---@param import table|nil a raid-import payload
---@param members table[]|string[] the group now: { name, group, online } or names
---@param invites table|nil { [lowerName] = "invited" | "declined" | "busy" | "offline" }
---@return table[] rows { characterId, name, class, role, group, inGroup, subgroup, online, state }
function Roster.Rows(import, members, invites)
	if type(import) ~= "table" or type(import.roster) ~= "table" then
		return {}
	end
	local groupOf = plannedGroups(import)
	local find = Roster.MemberLookup(members)
	invites = invites or {}
	local rows = {}
	for _, character in ipairs(import.roster) do
		local member = find(character.name)
		local state
		if member then
			state = "in"
		else
			state = Roster.InviteState(invites, character.name) or "missing"
		end
		rows[#rows + 1] = {
			characterId = character.characterId,
			name = character.name,
			class = character.class,
			role = character.role,
			group = groupOf[character.characterId],
			inGroup = member ~= nil,
			subgroup = member and member.group or nil,
			online = member and member.online ~= false or nil,
			state = state,
		}
	end
	return rows
end

return Roster
