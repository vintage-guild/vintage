--------------------------------------------------------------------------------
-- Vintage: saved data (AceDB, VintageDB)
--   ns.db.profile  settings
--   ns.db.char     the current raid session (survives /reload and disconnects)
--   ns.db.global   item data the client revealed, across characters
-- Each scope migrates through Core/Migrations.lua on load and on profile changes.
--------------------------------------------------------------------------------

local _, ns = ...

local Config = {}
ns.Config = Config

Config.defaults = {
	profile = {
		debug = false,
		-- The loot popup beside the loot window, for the master looter.
		lootPopup = true,
		-- Without the import's threshold, the popup shows items from this quality (4 epic).
		lootPopupThreshold = 4,
		minimap = { hide = false },
		window = { point = "CENTER", relativePoint = "CENTER", x = 0, y = 0 },
	},
}

function Config:Initialize()
	ns.db = LibStub("AceDB-3.0"):New("VintageDB", self.defaults, true)
	self:Migrate({ "global", "char", "profile" })

	ns.db.RegisterCallback(self, "OnProfileChanged", "OnProfileChanged")
	ns.db.RegisterCallback(self, "OnProfileCopied", "OnProfileChanged")
	ns.db.RegisterCallback(self, "OnProfileReset", "OnProfileChanged")
end

--- Migrates the given scopes and reports any that fail.
---@param scopes string[]
---@return boolean ok
function Config:Migrate(scopes)
	local ok = true
	for _, scope in ipairs(scopes) do
		local result = ns.Core.Migrations.Run(scope, ns.db[scope])
		if result.success then
			ns.Debug(result.reasoning)
		else
			ok = false
			ns.Vintage:PrintResult(result)
		end
	end
	return ok
end

function Config:OnProfileChanged()
	self:Migrate({ "profile" })
	ns.MinimapButton:Refresh()
	ns.RaidWindow:RestorePosition()
end

return Config
