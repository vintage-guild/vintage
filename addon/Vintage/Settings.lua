--------------------------------------------------------------------------------
-- Vintage: settings panel (AceConfig, in Blizzard's Settings under AddOns)
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local Options = {}
ns.Options = Options

function Options:Build()
	return {
		type = "group",
		name = ADDON_NAME,
		childGroups = "tab",
		args = {
			general = {
				type = "group",
				name = L["General"],
				order = 1,
				args = {
					minimap = {
						type = "toggle",
						name = L["Minimap button"],
						desc = L["Show the Vintage button on the minimap."],
						order = 1,
						width = "full",
						get = function()
							return not ns.db.profile.minimap.hide
						end,
						set = function(_, value)
							ns.db.profile.minimap.hide = not value
							ns.MinimapButton:Refresh()
						end,
					},
					debug = {
						type = "toggle",
						name = L["Debug logging"],
						desc = L["Send debug lines to Mechanic's console, when Mechanic is installed."],
						order = 2,
						width = "full",
						get = function()
							return ns.db.profile.debug
						end,
						set = function(_, value)
							ns.db.profile.debug = value
						end,
					},
				},
			},
			profiles = LibStub("AceDBOptions-3.0"):GetOptionsTable(ns.db),
		},
	}
end

function Options:Initialize()
	LibStub("AceConfig-3.0"):RegisterOptionsTable(ADDON_NAME, self:Build())
	local _, categoryId = LibStub("AceConfigDialog-3.0"):AddToBlizOptions(ADDON_NAME, ADDON_NAME)
	self.categoryId = categoryId
end

--- Opens Vintage's page in the game's settings. The game blocks this in combat.
function Options:Open()
	if InCombatLockdown() then
		ns.Vintage:Print(L["Settings can't open during combat."])
		return
	end
	Settings.OpenToCategory(self.categoryId)
end

return Options
