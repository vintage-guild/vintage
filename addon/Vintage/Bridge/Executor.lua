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
			return Result.success({ title = result.data.title, roster = result.data.roster }, result.reasoning)
		end,
	},

	["raid-status"] = {
		run = function()
			return Actions.Raid.Status(Context:BuildRaidContext())
		end,
	},

	["attendance-snapshot"] = {
		changes = true,
		run = function(params)
			local context = Context:BuildRaidContext(params)
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
