--------------------------------------------------------------------------------
-- Vintage Bridge: game events
-- One event frame; handlers subscribe by event and id. A handler that errors is
-- reported to the error handler (throttled per handler) and never stops the
-- others (Flightsim's pattern).
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local Events = {}
ns.Events = Events

local ERROR_THROTTLE_SECONDS = 10

local frame
local handlers = {} -- event -> { [id] = { callback, lastErrorAt } }

local function Report(event, id, entry, err)
	local now = GetTime()
	if entry.lastErrorAt and now - entry.lastErrorAt < ERROR_THROTTLE_SECONDS then
		return
	end
	entry.lastErrorAt = now
	geterrorhandler()(string.format("%s: %s handler %q failed: %s", ADDON_NAME, event, id, tostring(err)))
end

local function Dispatch(_, event, ...)
	local list = handlers[event]
	if not list then
		return
	end
	for id, entry in pairs(list) do
		local ok, err = pcall(entry.callback, event, ...)
		if not ok then
			Report(event, id, entry, err)
		end
	end
end

--- Calls callback(event, ...) for each event until Off.
---@param event string
---@param id string
---@param callback function
function Events:On(event, id, callback)
	if not frame then
		frame = CreateFrame("Frame")
		frame:SetScript("OnEvent", Dispatch)
	end
	local list = handlers[event]
	if not list then
		list = {}
		handlers[event] = list
		frame:RegisterEvent(event)
	end
	list[id] = { callback = callback }
end

---@param event string
---@param id string
function Events:Off(event, id)
	local list = handlers[event]
	if not list then
		return
	end
	list[id] = nil
	if next(list) == nil then
		handlers[event] = nil
		frame:UnregisterEvent(event)
	end
end

--- Drops every handler (addon disable).
function Events:OffAll()
	if frame then
		frame:UnregisterAllEvents()
	end
	handlers = {}
end

--- Whether any handler listens for an event.
---@param event string
---@return boolean
function Events:IsListening(event)
	return handlers[event] ~= nil
end

return Events
