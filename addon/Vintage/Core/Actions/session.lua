--------------------------------------------------------------------------------
-- Vintage Core actions: the raid session
-- session-get and session-clear. Each takes a context the Bridge built and returns
-- an ActionResult; the Bridge saves any new session the result carries.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Session = Core.Session

local SessionActions = {}
Core.Actions.Session = SessionActions

--- session-get: what the current raid session holds.
---@param context table { session }
---@return table ActionResult
function SessionActions.Get(context)
	if type(context) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end
	return Session.Summary(context.session)
end

--- session-clear: start an empty session. Destructive, so it needs confirm = true.
---@param context table { session, confirm }
---@return table ActionResult { session, cleared }
function SessionActions.Clear(context)
	if type(context) ~= "table" then
		return Result.error("INVALID_CONTEXT", "Session context is missing")
	end

	local previous = Session.Summary(context.session)
	local cleared = previous.success and previous.data or nil

	if not context.confirm then
		return Result.error(
			"CONFIRM_REQUIRED",
			"Clearing drops this raid's import, attendance, and loot",
			"Export first, then run /vintage clear confirm"
		)
	end

	return Result.success({ session = Session.New(), cleared = cleared }, "Started an empty raid session")
end

return SessionActions
