--------------------------------------------------------------------------------
-- Vintage Bridge: forming the raid, one step at a time
-- Runs Core.Forming's steps against the game: do one call, wait for the roster to
-- update (or 2 seconds), read the group again, ask for the next step. A generation
-- counter cancels a run on stop, a new run, or a new import; late callbacks check it.
-- Also keeps this session's invite answers (invited, declined, in another group),
-- read from the game's system messages.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Forming = Core.Forming
local Secrets = ns.Secrets

local Runner = {}
ns.Forming = Runner

-- Seconds between invites (the game queues them fine; this keeps chat readable).
Runner.INVITE_PACE = 0.3
-- Seconds to wait for a roster update after a move before reading the group again.
Runner.ROSTER_TIMEOUT = 2
-- Seconds a full party waits for an answer before looking again (an expired invite frees a seat).
Runner.WAIT_TIMEOUT = 10
-- A run never takes more steps than this (40 moves and as many swaps, with room to spare).
Runner.MAX_STEPS = 120

local generation = 0
local running

--------------------------------------------------------------------------------
-- Invite answers
--------------------------------------------------------------------------------

-- Seconds before an unanswered invite counts as not sent (the game drops it after about a
-- minute without telling us).
Runner.INVITE_EXPIRES = 90

local Invites = { entries = {} }
ns.Invites = Invites

--- "Doran-Stonemaul" → "doran": answers are kept under both the full name and the bare one,
--- since the game drops the realm for the leader's own realm.
local function baseKey(name)
	return string.lower((name:match("^([^-]+)")) or name)
end

--- { [lowerName] = "invited" | "declined" | "busy" | "offline" } for this session, without
--- invites that went unanswered too long. Each answer is under the full and the bare name.
function Invites:States()
	local now, states = GetTime(), {}
	for name, entry in pairs(self.entries) do
		if not (entry.state == "invited" and now - entry.at > Runner.INVITE_EXPIRES) then
			states[name] = entry.state
		end
	end
	return states
end

function Invites:Set(name, state)
	local entry = { state = state, at = GetTime() }
	self.entries[string.lower(name)] = entry
	self.entries[baseKey(name)] = entry
end

--- Forgets the answers of people now in the group: they came, and if they leave again they
--- are simply missing.
---@param members table[] the group: { name }
function Invites:Forget(members)
	local find = ns.Core.Roster.MemberLookup(members)
	for name in pairs(self.entries) do
		if find(name) then
			self.entries[name] = nil
		end
	end
end

function Invites:Clear()
	self.entries = {}
end

--- A pattern for one of the game's "%s ..." messages, capturing the name.
local function namePattern(format)
	if type(format) ~= "string" then
		return nil
	end
	-- Escape the pattern characters, then turn the "%s" into a capture.
	local escaped = format:gsub("([%^%$%(%)%.%[%]%*%+%-%?])", "%%%1")
	local pattern = escaped:gsub("%%s", "(.+)")
	return "^" .. pattern .. "$"
end

--- Reads an invite answer from a system message.
---@param message string
---@return string|nil name, string|nil state
function Invites:Read(message)
	message = Secrets.Public(message)
	if type(message) ~= "string" then
		return nil
	end
	for global, state in pairs({
		ERR_DECLINE_GROUP_S = "declined",
		ERR_ALREADY_IN_GROUP_S = "busy",
		-- "No player named '%s' is currently playing."
		ERR_BAD_PLAYER_NAME_S = "offline",
	}) do
		local pattern = namePattern(rawget(_G, global))
		local name = pattern and message:match(pattern)
		if name then
			return name, state
		end
	end
	return nil
end

--------------------------------------------------------------------------------
-- The run
--------------------------------------------------------------------------------

---@return boolean
function Runner:IsRunning()
	return running ~= nil
end

---@return string|nil "invite" | "arrange"
function Runner:Kind()
	return running and running.kind or nil
end

--- Stops a run, if one is going.
function Runner:Cancel()
	generation = generation + 1
	running = nil
	ns.Events:Off("GROUP_ROSTER_UPDATE", "Forming")
end

local function finish(result)
	running = nil
	ns.Events:Off("GROUP_ROSTER_UPDATE", "Forming")
	ns.Executor:Notify("forming-done", result)
end

--- Calls next() after the roster updates, or after the timeout, whichever comes first. Returns the
--- trigger, so an invite answer can wake a waiting party early.
local function afterRoster(gen, timeout, next)
	local fired = false
	local function go()
		if fired or gen ~= generation then
			return
		end
		fired = true
		ns.Events:Off("GROUP_ROSTER_UPDATE", "Forming")
		next()
	end
	ns.Events:On("GROUP_ROSTER_UPDATE", "Forming", go)
	if timeout then
		C_Timer.After(timeout, go)
	end
	return go
end

--- The group as a string, to tell whether a step changed anything.
local function shape(members)
	local parts = {}
	for index, m in ipairs(members) do
		parts[index] = m.name .. ":" .. tostring(m.group)
	end
	return table.concat(parts, ",")
end

local function done(kind, step)
	if kind == "arrange" then
		if step.stuck and step.stuck > 0 then
			return Result.success(
				{ stuck = step.stuck },
				string.format("Groups arranged, but %d couldn't be placed: their groups are full", step.stuck)
			)
		end
		return Result.success({}, "Groups match the plan")
	end
	if step.pending and step.pending > 0 then
		return Result.success(
			{ pending = step.pending },
			string.format("Invites sent; %d still to answer", step.pending)
		)
	end
	return Result.success({}, "Everyone on the roster has been invited")
end

--- Starts inviting ("invite", with an optional single name) or arranging ("arrange").
---@param kind string
---@param only string|nil
function Runner:Start(kind, only)
	self:Cancel()
	local gen = generation
	running = { kind = kind, steps = 0 }

	local step
	step = function()
		if gen ~= generation then
			return
		end
		running.steps = running.steps + 1
		if running.steps > Runner.MAX_STEPS then
			finish(Result.error("TOO_MANY_STEPS", "Stopped after too many steps", "Check the groups and try again"))
			return
		end
		local context = ns.Context:BuildRaidContext()
		local import = context.session and context.session.import
		local next = kind == "arrange" and Forming.NextMove(import, context.members, context.hiddenGroups)
			or Forming.NextInvite(import, context, only)

		-- The same move again on an unchanged group means the game ignored it (it does so
		-- silently, for example when a group is full of people we can't see): stop and say so.
		if next.op == "move" or next.op == "swap" then
			local signature = table.concat({ next.op, next.index, next.group, tostring(next.other) }, ":")
			local now = shape(context.members)
			if running.lastStep == signature and running.lastShape == now then
				finish(
					Result.error(
						"NO_PROGRESS",
						string.format("The game didn't move %s", tostring(next.name)),
						"Move them by hand in the raid panel, then press Arrange groups again"
					)
				)
				return
			end
			running.lastStep, running.lastShape = signature, now
		end

		if next.op == "done" then
			finish(done(kind, next))
			return
		end
		if next.op == "wait" then
			-- A full party: wait for someone to accept (then convert), an answer, or the timeout.
			running.wake = afterRoster(gen, Runner.WAIT_TIMEOUT, step)
			ns.Executor:Notify("forming-step", Result.success(next))
			return
		end

		running.wake = nil
		local called
		if next.op == "convert" then
			called = ns.Game.ConvertToRaid()
		elseif next.op == "invite" then
			called = ns.Game.Invite(next.name)
			if called.success then
				Invites:Set(next.name, "invited")
			end
		elseif next.op == "move" then
			called = ns.Game.SetSubgroup(next.index, next.group)
		elseif next.op == "swap" then
			called = ns.Game.SwapSubgroups(next.index, next.other)
		end
		if not called.success then
			finish(called)
			return
		end
		ns.Executor:Notify("forming-step", Result.success(next))

		if next.op == "invite" then
			if only then
				finish(Result.success({ name = next.name }, "Invited " .. next.name))
				return
			end
			C_Timer.After(Runner.INVITE_PACE, function()
				if gen == generation then
					step()
				end
			end)
		else
			afterRoster(gen, Runner.ROSTER_TIMEOUT, step)
		end
	end
	step()
end

--- Listens for invite answers. Called once at login.
function Runner:Initialize()
	ns.Events:On("CHAT_MSG_SYSTEM", "Invites", function(_, message)
		local name, state = Invites:Read(message)
		if name then
			Invites:Set(name, state)
			ns.Executor:Notify("invite-answer", Result.success({ name = name, state = state }))
			-- A decline frees a seat in a full party: look again now.
			if running and running.wake then
				local wake = running.wake
				running.wake = nil
				wake()
			end
		end
	end)
end

return Runner
