--------------------------------------------------------------------------------
-- Vintage View: minimap button (LibDataBroker launcher + LibDBIcon)
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local MinimapButton = {}
ns.MinimapButton = MinimapButton

---@param tooltip table GameTooltip or a LibDataBroker tooltip
function MinimapButton:FillTooltip(tooltip)
	tooltip:AddLine(ADDON_NAME)
	tooltip:AddLine(L["Left-click: open the raid window"], 0.8, 0.8, 0.8)
	tooltip:AddLine(L["Right-click: settings"], 0.8, 0.8, 0.8)
end

function MinimapButton:Initialize()
	local LDB = LibStub("LibDataBroker-1.1", true)
	local DBIcon = LibStub("LibDBIcon-1.0", true)
	if not (LDB and DBIcon) then
		return
	end
	if not self.launcher then
		self.launcher = LDB:NewDataObject(ADDON_NAME, {
			type = "launcher",
			text = ADDON_NAME,
			icon = ns.ICON,
			OnClick = function(_, button)
				if button == "RightButton" then
					ns.Options:Open()
				else
					ns.RaidWindow:Toggle()
				end
			end,
			OnTooltipShow = function(tooltip)
				self:FillTooltip(tooltip)
			end,
		})
		DBIcon:Register(ADDON_NAME, self.launcher, ns.db.profile.minimap)
	end
	self:Refresh()
end

--- Re-reads the profile's minimap settings (after a toggle or a profile change).
--- LibDBIcon shows or hides the button from the table's `hide` field.
function MinimapButton:Refresh()
	local DBIcon = LibStub("LibDBIcon-1.0", true)
	if not (DBIcon and self.launcher) then
		return
	end
	DBIcon:Refresh(ADDON_NAME, ns.db.profile.minimap)
end

return MinimapButton
