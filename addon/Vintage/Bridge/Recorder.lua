--------------------------------------------------------------------------------
-- Vintage Bridge: recording the raid as it happens
-- Turns game events into actions: a loot message into loot-capture, the end of a
-- boss attempt into encounter-record (a kill takes a snapshot), and the first pull
-- or a finished Arrange into the raid's start snapshot. The actions decide what
-- counts (a raid group only); this only listens.
--------------------------------------------------------------------------------

local _, ns = ...

local Secrets = ns.Secrets

local Recorder = {}
ns.Recorder = Recorder

local function debug(name, result)
	if result.success then
		ns.Debug(name .. ": " .. tostring(result.reasoning))
	else
		ns.Debug(name .. ": " .. tostring(result.error and result.error.code))
	end
end

--- Starts listening. Called once at login.
function Recorder:Initialize()
	ns.Events:On("CHAT_MSG_LOOT", "Recorder", function(_, message)
		debug("loot-capture", ns.Executor:Execute("loot-capture", { message = message }))
	end)

	-- encounterID, encounterName, difficultyID, groupSize, success (1 for a kill)
	ns.Events:On("ENCOUNTER_END", "Recorder", function(_, id, name, _, _, success)
		success = Secrets.Public(success)
		debug(
			"encounter-record",
			ns.Executor:Execute("encounter-record", {
				id = Secrets.Public(id),
				name = Secrets.Public(name),
				killed = success == 1 or success == true,
			})
		)
	end)

	-- The raid's start: the first pull, or Arrange finishing, whichever comes first. (Invites end
	-- with answers still pending, so they don't say the raid has formed.) attendance-snapshot
	-- keeps one "start" and takes it in a raid only.
	local function start()
		debug("attendance-snapshot", ns.Executor:Execute("attendance-snapshot", { label = "start", automatic = true }))
	end
	-- encounterID, encounterName, difficultyID, groupSize
	ns.Events:On("ENCOUNTER_START", "Recorder", function(_, id, name, _, size)
		debug(
			"encounter-start",
			ns.Executor:Execute("encounter-start", {
				id = Secrets.Public(id),
				name = Secrets.Public(name),
				size = Secrets.Public(size),
			})
		)
		start()
	end)
	ns.Executor:Subscribe(function(name, result)
		if
			name == "forming-done"
			and result.success
			and type(result.data) == "table"
			and result.data.kind == "arrange"
		then
			start()
		end
	end)
end

return Recorder
