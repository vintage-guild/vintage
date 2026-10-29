--------------------------------------------------------------------------------
-- Vintage Bridge: the action executor
-- The one way the View, slash commands, and Mechanic reach Core. Action names are
-- kebab-case and mirror the service commands they pair with (plan D4). Each
-- handler builds a context, runs a Core action, saves what it returns, and gives
-- back an ActionResult. Nothing here throws.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local Core = ns.Core
local Result = Core.Result
local Actions = Core.Actions
local Context = ns.Context
local Secrets = ns.Secrets

local Executor = {}
ns.Executor = Executor

local LISTENER_ERROR_THROTTLE_SECONDS = 10

local listeners = {}

-- run(params) returns an ActionResult. changes = true marks actions that change saved
-- state: listeners hear about those only, so a view that reads during a refresh never
-- triggers another refresh.
local registry = {
	["client-info"] = {
		run = function()
			local client = Context:BuildClientContext()
			local reasoning = client.isForever and "WoW: Forever client" or "Not a WoW: Forever client"
			return Result.success(client, reasoning)
		end,
	},

	["session-get"] = {
		run = function()
			return Actions.Session.Get(Context:BuildSessionContext())
		end,
	},

	["session-clear"] = {
		changes = true,
		run = function(params)
			local result = Actions.Session.Clear(Context:BuildSessionContext(params))
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			ns.Forming:Cancel()
			ns.Invites:Clear()
			return Result.success({ cleared = result.data.cleared }, result.reasoning)
		end,
	},

	["raid-import"] = {
		changes = true,
		run = function(params)
			local result = Actions.Raid.Import(Context:BuildRaidContext(params))
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			-- A new raid: stop any run for the old one and forget its invite answers.
			ns.Forming:Cancel()
			ns.Invites:Clear()
			return Result.success({ title = result.data.title, roster = result.data.roster }, result.reasoning)
		end,
	},

	-- Invites the roster's missing people (or one name), converting to a raid as soon as two
	-- are in. Runs one step per roster update; the window hears each step and the end.
	["raid-invite"] = {
		run = function(params)
			local only = type(params.name) == "string" and params.name ~= "" and params.name or nil
			-- Starting a run stops the one going: say so instead of dropping its queue.
			local running = ns.Forming:Kind()
			if running then
				return Result.error(
					"BUSY",
					running == "invite" and "Still inviting the roster" or "Still arranging groups",
					"Wait for it to finish, or press Stop first"
				)
			end
			local context = Context:BuildRaidContext()
			local import = context.session and context.session.import
			if not import and not only then
				return Result.error("NO_IMPORT", "No raid imported", "Paste the guild's import string with Import")
			end
			if not ns.Game.CanLead() then
				return Result.error(
					"NOT_LEADER",
					"Only the raid leader or an assistant can invite",
					"Ask the leader to promote you to assistant"
				)
			end
			local first = Core.Forming.NextInvite(import, context, only)
			if first.op == "done" then
				if only then
					return Result.error("ALREADY_IN_GROUP", only .. " is already in your group")
				end
				return Result.error("NOTHING_TO_DO", "Everyone on the roster is in your group or has answered")
			end
			ns.Forming:Start("invite", only)
			if only then
				return Result.success({ name = only }, "Inviting " .. only)
			end
			return Result.success({ missing = first.missing }, string.format("Inviting %d people", first.missing or 0))
		end,
	},

	-- Moves the raid into the import's planned groups, one move or swap per roster update.
	["raid-arrange"] = {
		run = function()
			if ns.Forming:Kind() then
				return Result.error(
					"BUSY",
					"Something is already running",
					"Wait for it to finish, or press Stop first"
				)
			end
			local context = Context:BuildRaidContext()
			local import = context.session and context.session.import
			if not import then
				return Result.error("NO_IMPORT", "No raid imported", "Paste the guild's import string with Import")
			end
			if not context.inRaid then
				return Result.error("NOT_IN_RAID", "Groups need a raid", "Invite people first: two make a raid")
			end
			if InCombatLockdown() then
				return Result.error("IN_COMBAT", "You can't move people in combat", "Try again after the fight")
			end
			if not ns.Game.CanLead() then
				return Result.error(
					"NOT_LEADER",
					"Only the raid leader or an assistant can move people",
					"Ask the leader to promote you to assistant"
				)
			end
			local misplaced = Core.Forming.Misplaced(import, context.members)
			if misplaced == 0 then
				return Result.error("NOTHING_TO_DO", "Everyone is already in their planned group")
			end
			ns.Forming:Start("arrange")
			return Result.success({ misplaced = misplaced }, string.format("Moving %d people", misplaced))
		end,
	},

	["raid-stop"] = {
		run = function()
			local was = ns.Forming:Kind()
			ns.Forming:Cancel()
			return Result.success({ stopped = was }, was and "Stopped" or "Nothing was running")
		end,
	},

	["member-whisper"] = {
		run = function(params)
			if type(params.name) ~= "string" or params.name == "" then
				return Result.error("INVALID_PARAMS", "Whisper needs a name")
			end
			return ns.Game.Whisper(params.name)
		end,
	},

	["raid-status"] = {
		run = function()
			local result = Actions.Raid.Status(Context:BuildRaidContext())
			if result.success then
				-- What's running ("invite" or "arrange"), so surfaces can offer Stop.
				result.data.running = ns.Forming:Kind()
			end
			return result
		end,
	},

	["attendance-snapshot"] = {
		changes = true,
		run = function(params)
			local context = Context:BuildRaidContext(params)
			context.automatic = params.automatic == true
			local result = Actions.Raid.Snapshot(context)
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			local reasoning = result.reasoning
			if context.hidden > 0 then
				reasoning = string.format("%s (%d hidden by the game)", reasoning, context.hidden)
			end
			return Result.success(
				{ snapshots = result.data.snapshots, members = result.data.members, hidden = context.hidden },
				reasoning
			)
		end,
	},

	-- A boss attempt ended (ENCOUNTER_END): remembered as the source of the next drops; a kill
	-- in a raid takes a snapshot labelled with the boss.
	["encounter-record"] = {
		changes = true,
		run = function(params)
			local context = Context:BuildRaidContext()
			context.encounter = { id = params.id, name = params.name, killed = params.killed == true }
			local result = Actions.Raid.Encounter(context)
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			return Result.success(
				{ snapshot = result.data.snapshot, snapshots = result.data.snapshots },
				result.reasoning
			)
		end,
	},

	-- A loot message (CHAT_MSG_LOOT): recorded when someone in the raid receives an item at or
	-- above the import's loot threshold (or the game's), then its item data is recorded too.
	["loot-capture"] = {
		changes = true,
		run = function(params)
			local context = Context:BuildRaidContext()
			local drop = Actions.Loot.Read(Secrets.Public(params.message), Context:LootFormats(), context.exporter)
			if not drop then
				return Result.error("NOT_A_DROP", "Not a loot message")
			end
			local import = context.session and context.session.import
			context.drop = drop
			context.quality = Context:ItemQuality(drop.itemId)
			context.threshold = import and import.loot and import.loot.threshold or Context:LootThreshold()
			local result = Actions.Loot.Capture(context)
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			ns.Items:Record(drop.itemId)
			return Result.success({ drop = result.data.drop }, result.reasoning)
		end,
	},

	["loot-list"] = {
		run = function()
			local context = Context:BuildSessionContext()
			context.items = ns.db.global.items
			local result = Actions.Loot.List(context)
			-- The time of day each drop arrived, as the Loot tab shows it.
			for _, drop in ipairs(result.success and result.data.drops or {}) do
				drop.time = date("%H:%M", drop.at)
			end
			return result
		end,
	},

	-- The open loot window's items the popup shows, each with the import's ranked candidates
	-- matched to who may receive it from this corpse.
	["loot-candidates"] = {
		run = function()
			local context = Context:BuildSessionContext()
			local import = context.session and context.session.import
			context.slots = ns.LootWindow:IsOpen() and Context:LootSlots() or {}
			context.eligible = {}
			for _, slot in ipairs(context.slots) do
				context.eligible[slot.slot] = Context:MasterLootCandidates(slot.slot)
			end
			context.threshold = import and import.loot.threshold or ns.db.profile.lootPopupThreshold
			context.realm = Context:PlayerRealm()
			local result = Actions.Loot.Candidates(context)
			if result.success then
				result.data.masterLooter = Context:IsMasterLooter()
			end
			return result
		end,
	},

	-- Sample popup rows from the import and the group, for trying the popup without a corpse
	-- (Mechanic's "Preview loot popup"). Reads only; there is nothing to give.
	["loot-preview"] = {
		run = function()
			local context = Context:BuildRaidContext()
			context.items = ns.db.global.items
			context.realm = Context:PlayerRealm()
			local result = Actions.Loot.Preview(context)
			-- Ask the client for names it doesn't know yet; item-record refreshes the popup.
			for _, slot in ipairs(result.success and result.data.slots or {}) do
				if slot.itemId > 0 and not ns.db.global.items[slot.itemId] then
					ns.Items:Record(slot.itemId)
				end
			end
			return result
		end,
	},

	-- Gives a loot slot to a candidate, only with confirm = true (the popup asks first). Refuses
	-- when the slot or the candidate changed since the popup showed them (plan D6).
	-- { slot, candidateIndex, candidateName (as the game gave it), name, link, itemName, confirm }
	["loot-give"] = {
		changes = true,
		run = function(params)
			local slot, index = tonumber(params.slot), tonumber(params.candidateIndex)
			if not (slot and index) then
				return Result.error("INVALID_PARAMS", "loot-give needs a slot and a candidate")
			end
			local nameNow
			for _, candidate in ipairs(Context:MasterLootCandidates(slot)) do
				if candidate.index == index then
					nameNow = candidate.name
				end
			end
			local check = Actions.Loot.CheckGive({
				isMasterLooter = Context:IsMasterLooter(),
				link = Context:LootSlotLink(slot),
				shownLink = params.link,
				name = nameNow,
				shownName = params.candidateName,
				displayName = params.name,
				itemName = params.itemName,
				confirm = params.confirm == true,
			})
			if not check.success then
				return check
			end
			local given = ns.Game.GiveMasterLoot(slot, index)
			if not given.success then
				return given
			end
			return check
		end,
	},

	-- Sets the game's loot method and threshold as the import says, after a confirm.
	["loot-mode-set"] = {
		run = function(params)
			local context = Context:BuildRaidContext(params)
			context.method = Context:LootMethod()
			context.threshold = Context:LootThreshold()
			context.isMasterLooter = Context:IsMasterLooter()
			context.isLeader = Context:IsLeader()
			context.player = context.exporter
			local plan = Actions.Loot.ModePlan(context)
			if not plan.success then
				return plan
			end
			local set = ns.Game.SetLootMethod(plan.data.method, plan.data.master, plan.data.threshold)
			if not set.success then
				return set
			end
			return plan
		end,
	},

	["item-record"] = {
		changes = true,
		run = function(params)
			return ns.Items:Record(params.itemId)
		end,
	},

	["raid-export"] = {
		changes = true,
		run = function(params)
			local result = Actions.Raid.Export(Context:BuildRaidContext(params))
			if not result.success then
				return result
			end
			ns.db.char.session = result.data.session
			return Result.success({
				exportString = result.data.exportString,
				snapshots = result.data.snapshots,
				loot = result.data.loot,
				items = result.data.items,
			}, result.reasoning)
		end,
	},
}

local function Notify(name, result)
	for _, listener in ipairs(listeners) do
		local ok, err = pcall(listener.callback, name, result)
		if not ok then
			local now = GetTime()
			if not listener.lastErrorAt or now - listener.lastErrorAt >= LISTENER_ERROR_THROTTLE_SECONDS then
				listener.lastErrorAt = now
				geterrorhandler()(string.format("%s: listener after %q failed: %s", ADDON_NAME, name, tostring(err)))
			end
		end
	end
end

--- Tells listeners about something that changed outside an action: a forming step, its end, or
--- an invite answer.
---@param name string
---@param result table ActionResult
function Executor:Notify(name, result)
	Notify(name, result)
end

--- Runs a named action.
---@param name string
---@param params table|nil
---@return table ActionResult
function Executor:Execute(name, params)
	local action = registry[name]
	if not action then
		return Result.error(
			"UNKNOWN_ACTION",
			string.format("No action named %q", tostring(name)),
			"See Executor:List() for the actions this version knows"
		)
	end

	local ok, result = pcall(action.run, params or {})
	if not ok then
		return Result.error("EXECUTION_ERROR", tostring(result))
	end

	if action.changes and result.success then
		Notify(name, result)
	end
	return result
end

--- Action names, sorted.
---@return string[]
function Executor:List()
	local names = {}
	for name in pairs(registry) do
		names[#names + 1] = name
	end
	table.sort(names)
	return names
end

--- Calls listener(name, result) after every action that changed saved state, so views
--- can refresh. A listener that errors is reported (throttled) and never stops the others.
---@param listener function
function Executor:Subscribe(listener)
	listeners[#listeners + 1] = { callback = listener }
end

return Executor
