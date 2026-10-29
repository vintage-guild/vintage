--------------------------------------------------------------------------------
-- Vintage Bridge: item data
-- Keeps what the client reveals about items in VintageDB.global.items, for the Loot
-- tab and the export. The client may not have an item's data yet (Forever hides
-- undiscovered items): then it asks the game to load it, once per item per session,
-- and records it when ITEM_DATA_LOAD_RESULT says it arrived.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Secrets = ns.Secrets

local Items = { requested = {} }
ns.Items = Items

--- Records an item's data, or asks the client to load it.
---@param itemId any
---@return table ActionResult { item } | ITEM_LOADING | ITEM_UNKNOWN
function Items:Record(itemId)
	if type(itemId) ~= "number" or itemId < 1 then
		return Result.error("INVALID_PARAMS", "item-record needs an item id")
	end
	local saved = ns.db.global.items
	local entry = Core.Actions.Loot.ItemEntry(itemId, ns.Context:ItemInfo(itemId))
	if entry then
		saved[itemId] = entry
		return Result.success({ item = entry }, entry.name)
	end
	if Core.Actions.Loot.ItemEntry(itemId, saved[itemId]) then
		return Result.success({ item = saved[itemId] }, saved[itemId].name)
	end
	local items = rawget(_G, "C_Item")
	local request = items and items.RequestLoadItemDataByID
	if self.requested[itemId] or not request then
		return Result.error("ITEM_UNKNOWN", string.format("The client has no data for item %d", itemId))
	end
	self.requested[itemId] = true
	request(itemId)
	return Result.error("ITEM_LOADING", string.format("Loading item %d", itemId), "It is recorded when it arrives")
end

--- Listens for item data the client loaded on request. Called once at login.
function Items:Initialize()
	ns.Events:On("ITEM_DATA_LOAD_RESULT", "Items", function(_, itemId, success)
		itemId = Secrets.Public(itemId)
		if self.requested[itemId] and Secrets.Public(success) then
			ns.Executor:Execute("item-record", { itemId = itemId })
		end
	end)
end

return Items
