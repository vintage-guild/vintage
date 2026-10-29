--------------------------------------------------------------------------------
-- Vintage Core: forming the raid
-- What to do next to get the imported roster into the raid and into its planned
-- groups. Pure: each function looks at the group as the Bridge read it and returns
-- one step; the Bridge does it, waits for the roster to update, and asks again.
--
--   invites:  convert to a raid once two are in → invite the next missing person
--             (tanks and healers first) → wait while a party has no room → done
--   arrange:  move someone into a planned group with room → swap with someone who
--             doesn't belong there when it is full → done
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Roster = Core.Roster

local Forming = {}
Core.Forming = Forming

Forming.PARTY_SIZE = 5
Forming.GROUP_SIZE = 5
Forming.GROUPS = 8

-- Tanks, then healers, then everyone else in roster order.
local ROLE_ORDER = { tank = 1, healer = 2 }

--- The import's roster in invite order: tanks, then healers, then the rest, each in roster order.
---@param roster table[]
---@return table[]
function Forming.InviteOrder(roster)
	local ordered = {}
	for index, character in ipairs(roster or {}) do
		ordered[index] = { character = character, index = index }
	end
	table.sort(ordered, function(a, b)
		local ra, rb = ROLE_ORDER[a.character.role] or 3, ROLE_ORDER[b.character.role] or 3
		if ra ~= rb then
			return ra < rb
		end
		return a.index < b.index
	end)
	local out = {}
	for index, entry in ipairs(ordered) do
		out[index] = entry.character
	end
	return out
end

--- Answers that end an invite: they won't come from this invite.
local FINAL = { declined = true, busy = true }

--- The next invite step.
---@param import table a raid-import payload
---@param group table { inRaid, size, members (or names), invites = { [lowerName] = state } }
---@param only string|nil invite just this name
---@return table step { op = "convert" | "invite" | "wait" | "done", name?, missing? }
function Forming.NextInvite(import, group, only)
	local inGroup = Roster.GroupLookup(group.members or group.names or {})
	local size = group.size or 1

	-- One person, from their row: invite them whatever their last answer was (a standby or a
	-- pick-up may not be on the roster at all).
	if only then
		if inGroup(only) then
			return { op = "done", pending = 0 }
		end
		if not group.inRaid and size >= 2 then
			return { op = "convert" }
		end
		return { op = "invite", name = only, missing = 1 }
	end

	local invites = group.invites or {}
	local pending, missing = 0, {}
	for _, character in ipairs(Forming.InviteOrder(import and import.roster)) do
		if not inGroup(character.name) then
			local state = Roster.InviteState(invites, character.name)
			if state == "invited" then
				pending = pending + 1
			elseif not FINAL[state] then
				missing[#missing + 1] = character.name
			end
		end
	end

	if not group.inRaid and size >= 2 and (#missing > 0 or pending > 0) then
		return { op = "convert", missing = #missing }
	end
	if #missing == 0 then
		return { op = "done", pending = pending }
	end
	if not group.inRaid and size + pending >= Forming.PARTY_SIZE then
		-- A party is full with the invites already out: wait for someone to accept.
		return { op = "wait", missing = #missing }
	end
	return { op = "invite", name = missing[1], missing = #missing }
end

--- The next arrange step.
---@param import table a raid-import payload
---@param members table[] the raid now: { name, index, group }
---@param hiddenGroups table|nil people the game didn't name, counted by group (they take room)
---@return table step { op = "move" | "swap" | "done", index?, group?, other?, name?, stuck? }
function Forming.NextMove(import, members, hiddenGroups)
	local planned = Roster.PlannedGroups(import, members)
	local counts = {}
	for group = 1, Forming.GROUPS do
		counts[group] = hiddenGroups and hiddenGroups[group] or 0
	end
	for _, m in ipairs(members) do
		counts[m.group] = (counts[m.group] or 0) + 1
	end

	local stuck = 0
	for _, m in ipairs(members) do
		local target = planned[m.index]
		if target and target ~= m.group then
			if counts[target] < Forming.GROUP_SIZE then
				return { op = "move", index = m.index, group = target, name = m.name }
			end
			-- The group is full: swap with someone there who isn't planned for it, preferring
			-- someone who belongs where this person is now.
			local best
			for _, other in ipairs(members) do
				if other.group == target and planned[other.index] ~= target then
					if planned[other.index] == m.group then
						best = other
						break
					end
					best = best or other
				end
			end
			if best then
				return { op = "swap", index = m.index, other = best.index, name = m.name, group = target }
			end
			stuck = stuck + 1
		end
	end
	return { op = "done", stuck = stuck }
end

--- How many people in the raid are not in their planned group.
---@param import table
---@param members table[]
---@return number
function Forming.Misplaced(import, members)
	local planned = Roster.PlannedGroups(import, members)
	local count = 0
	for _, m in ipairs(members) do
		if planned[m.index] and planned[m.index] ~= m.group then
			count = count + 1
		end
	end
	return count
end

return Forming
