--------------------------------------------------------------------------------
-- Vintage Bridge: the calls that change the game
-- Invites, raid conversion, raid group moves, whispers, the loot method, and master
-- loot. Each is guarded: the API exists on this client, the player may do it (leader
-- or assistant), and no roster change is tried in combat. Each returns an
-- ActionResult; nothing throws.
--------------------------------------------------------------------------------

local _, ns = ...

local Result = ns.Core.Result

local Game = {}
ns.Game = Game

--- The first of these that exists, as a function.
local function api(...)
	for index = 1, select("#", ...) do
		local fn = select(index, ...)
		if type(fn) == "function" then
			return fn
		end
	end
	return nil
end

local function party()
	return rawget(_G, "C_PartyInfo") or {}
end

local function missingApi(what)
	return Result.error("API_MISSING", "This client can't " .. what, "Do it by hand for now")
end

local function inCombat()
	return InCombatLockdown() == true
end

--- True when the player leads, assists, or is alone (and so will lead).
---@return boolean
function Game.CanLead()
	if not IsInGroup() then
		return true
	end
	return UnitIsGroupLeader("player") == true or UnitIsGroupAssistant("player") == true
end

local function notLeader()
	return Result.error(
		"NOT_LEADER",
		"Only the raid leader or an assistant can do that",
		"Ask the leader to promote you to assistant"
	)
end

local function guarded(what, combatMatters, fn)
	if combatMatters and inCombat() then
		return Result.error("IN_COMBAT", "You can't " .. what .. " in combat", "Try again after the fight")
	end
	if not Game.CanLead() then
		return notLeader()
	end
	local ok, err = pcall(fn)
	if not ok then
		return Result.error("GAME_REFUSED", "The game refused to " .. what .. ": " .. tostring(err))
	end
	return Result.success(nil)
end

--- Invites a character by "Name" or "Name-Realm".
---@param name string
function Game.Invite(name)
	local invite = api(party().InviteUnit, rawget(_G, "InviteUnit"))
	if not invite then
		return missingApi("invite")
	end
	local canInvite = api(party().CanInvite)
	if canInvite and not canInvite() then
		return notLeader()
	end
	return guarded("invite", false, function()
		invite(name)
	end)
end

--- Turns the party into a raid.
function Game.ConvertToRaid()
	local convert = api(party().ConvertToRaid, rawget(_G, "ConvertToRaid"))
	if not convert then
		return missingApi("make a raid")
	end
	return guarded("make a raid", true, function()
		convert()
	end)
end

--- Moves a raid member (by raid index) into a raid group.
---@param index number
---@param group number
function Game.SetSubgroup(index, group)
	local move = api(rawget(_G, "SetRaidSubgroup"))
	if not move then
		return missingApi("move people between groups")
	end
	return guarded("move people between groups", true, function()
		move(index, group)
	end)
end

--- Swaps two raid members (by raid index) between their groups.
---@param a number
---@param b number
function Game.SwapSubgroups(a, b)
	local swap = api(rawget(_G, "SwapRaidSubgroup"))
	if not swap then
		return missingApi("swap people between groups")
	end
	return guarded("swap people between groups", true, function()
		swap(a, b)
	end)
end

--- Hands a master-loot slot to a candidate (by the game's candidate index). Only loot-give calls
--- it, after the leader confirmed; the game itself refuses anyone but the master looter.
---@param slot number
---@param candidateIndex number
function Game.GiveMasterLoot(slot, candidateIndex)
	local give = api(rawget(_G, "GiveMasterLoot"))
	if not give then
		return missingApi("give loot")
	end
	local ok, err = pcall(give, slot, candidateIndex)
	if not ok then
		return Result.error("GAME_REFUSED", "The game refused to give loot: " .. tostring(err))
	end
	return Result.success(nil)
end

--- Sets the loot method (with the master looter's name for master loot) and the threshold.
--- Either may be nil to leave it. Only the group's leader may.
---@param method number|nil an Enum.LootMethod value
---@param master string|nil
---@param threshold number|nil
function Game.SetLootMethod(method, master, threshold)
	-- Only C_PartyInfo's: the old global takes method names, not Enum.LootMethod.
	local setMethod = api(party().SetLootMethod)
	local setThreshold = api(rawget(_G, "SetLootThreshold"))
	if (method and not setMethod) or (threshold and not setThreshold) then
		return missingApi("set the loot method")
	end
	if IsInGroup() and UnitIsGroupLeader("player") ~= true then
		return Result.error("NOT_LEADER", "Only the raid leader can set the loot method")
	end
	local ok, err = pcall(function()
		if method and setMethod(method, master) == false then
			error("SetLootMethod returned false", 0)
		end
		if threshold then
			setThreshold(threshold)
		end
	end)
	if not ok then
		return Result.error("GAME_REFUSED", "The game refused to set the loot method: " .. tostring(err))
	end
	return Result.success(nil)
end

--- Opens a whisper to a character in the chat box.
---@param name string
function Game.Whisper(name)
	local util = rawget(_G, "ChatFrameUtil")
	local tell = api(util and util.SendTell, rawget(_G, "ChatFrame_SendTell"))
	if not tell then
		return missingApi("open a whisper")
	end
	local ok, err = pcall(tell, name)
	if not ok then
		return Result.error("GAME_REFUSED", "The game refused to open a whisper: " .. tostring(err))
	end
	return Result.success(nil)
end

return Game
