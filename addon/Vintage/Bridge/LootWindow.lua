--------------------------------------------------------------------------------
-- Vintage Bridge: the game's loot window
-- Whether a loot window is open, from LOOT_OPENED to LOOT_CLOSED. The popup hears
-- "loot-window" when it opens, when a slot empties (LOOT_SLOT_CLEARED), and when it
-- closes, and then asks loot-candidates for what to show. The slots themselves are
-- read fresh each time (Context:LootSlots), so nothing here goes stale.
--------------------------------------------------------------------------------

local _, ns = ...

local Result = ns.Core.Result

local LootWindow = { open = false }
ns.LootWindow = LootWindow

local function changed(self)
	ns.Executor:Notify("loot-window", Result.success({ open = self.open }))
end

--- Starts listening. Called once at login.
function LootWindow:Initialize()
	ns.Events:On("LOOT_OPENED", "LootWindow", function()
		self.open = true
		changed(self)
	end)
	ns.Events:On("LOOT_SLOT_CLEARED", "LootWindow", function()
		changed(self)
	end)
	ns.Events:On("LOOT_CLOSED", "LootWindow", function()
		self.open = false
		changed(self)
	end)
end

---@return boolean
function LootWindow:IsOpen()
	return self.open == true
end

return LootWindow
