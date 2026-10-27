--------------------------------------------------------------------------------
-- Vintage View: the raid window (/vintage)
-- A FenUI panel with four tabs: Roster, Groups, Loot, Export. It renders what the
-- Executor returns and never computes; each later PR fills one tab.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local RaidWindow = {}
ns.RaidWindow = RaidWindow

local FRAME_NAME = "VintageRaidWindow"
local WIDTH, HEIGHT = 640, 440
local TAB_HEIGHT = 28
local GAP = 8

local TABS = {
	{ key = "roster", text = L["Roster"], title = L["No raid imported"], subtitle = L["The roster from the guild's import string appears here."] },
	{ key = "groups", text = L["Groups"], title = L["No groups planned"], subtitle = L["Planned and current raid groups appear here after an import."] },
	{ key = "loot", text = L["Loot"], title = L["No loot recorded"], subtitle = L["Drops are recorded here during the raid."] },
	{ key = "export", text = L["Export"], title = L["Nothing to export"], subtitle = L["The string for the website appears here after the raid."] },
}

--- Builds the window on first use. Returns nil when FenUI did not load.
---@return table|nil frame
function RaidWindow:Create()
	if self.frame then
		return self.frame
	end
	local FenUI = rawget(_G, "FenUI")
	if not (FenUI and FenUI.CreatePanel) then
		ns.Vintage:Print(L["FenUI did not load. Reinstall Vintage."])
		return nil
	end
	ns.Theme:Ensure()

	local frame = FenUI:CreatePanel(UIParent, {
		name = FRAME_NAME,
		title = ADDON_NAME,
		width = WIDTH,
		height = HEIGHT,
		theme = ns.Theme.DEFAULT,
		movable = true,
		closable = true,
		background = "surfacePanel",
		onMoved = function()
			self:SavePosition()
		end,
	})
	frame:SetFrameStrata("HIGH")
	frame:Hide()
	-- Escape closes the window.
	table.insert(UISpecialFrames, FRAME_NAME)

	local safeZone = frame:GetSafeZone()
	local tabBar = CreateFrame("Frame", nil, safeZone)
	tabBar:SetPoint("TOPLEFT")
	tabBar:SetPoint("TOPRIGHT")
	tabBar:SetHeight(TAB_HEIGHT)

	local content = CreateFrame("Frame", nil, safeZone)
	content:SetPoint("TOPLEFT", tabBar, "BOTTOMLEFT", 0, -GAP)
	content:SetPoint("BOTTOMRIGHT")

	self.pages = {}
	local tabDefs = {}
	for _, tab in ipairs(TABS) do
		local page = CreateFrame("Frame", nil, content)
		page:SetAllPoints()
		page:Hide()
		page.empty = FenUI:CreateEmptyState(page, { title = tab.title, subtitle = tab.subtitle })
		self.pages[tab.key] = page
		tabDefs[#tabDefs + 1] = { key = tab.key, text = tab.text }
	end

	self.tabs = FenUI:CreateTabGroup(tabBar, {
		tabs = tabDefs,
		onChange = function(key)
			self:ShowPage(key)
		end,
	})
	self.tabs:SetPoint("TOPLEFT")
	self.tabs:SetPoint("TOPRIGHT")

	self.frame = frame
	self:RestorePosition()
	self:ShowPage("roster")

	-- The Executor notifies only after actions that change saved state, so this refresh
	-- (which reads) can't trigger itself.
	ns.Executor:Subscribe(function()
		if frame:IsShown() then
			self:Refresh()
		end
	end)
	return frame
end

---@param key string
function RaidWindow:ShowPage(key)
	if not self.pages or not self.pages[key] then
		return
	end
	for pageKey, page in pairs(self.pages) do
		page:SetShown(pageKey == key)
	end
	self.selected = key
end

--- Re-reads the session and updates the subtitle.
function RaidWindow:Refresh()
	if not self.frame then
		return
	end
	local result = ns.Executor:Execute("session-get")
	if result.success then
		self.frame:SetSubtitle(result.reasoning or "")
	else
		self.frame:SetSubtitle(result.error and result.error.message or "")
	end
end

function RaidWindow:Show()
	local frame = self:Create()
	if not frame then
		return
	end
	frame:Show()
	self:Refresh()
end

function RaidWindow:Hide()
	if self.frame then
		self.frame:Hide()
	end
end

function RaidWindow:Toggle()
	if self.frame and self.frame:IsShown() then
		self:Hide()
	else
		self:Show()
	end
end

function RaidWindow:IsShown()
	return self.frame ~= nil and self.frame:IsShown() == true
end

function RaidWindow:SavePosition()
	if not self.frame then
		return
	end
	local point, _, relativePoint, x, y = self.frame:GetPoint(1)
	local window = ns.db.profile.window
	window.point, window.relativePoint, window.x, window.y = point, relativePoint, x, y
end

function RaidWindow:RestorePosition()
	if not self.frame then
		return
	end
	local window = ns.db.profile.window
	self.frame:ClearAllPoints()
	self.frame:SetPoint(window.point or "CENTER", UIParent, window.relativePoint or "CENTER", window.x or 0, window.y or 0)
end

return RaidWindow
