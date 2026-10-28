--------------------------------------------------------------------------------
-- Vintage View: the raid window (/vintage)
-- A FenUI panel with four tabs: Roster, Groups, Loot, Export. It renders what the
-- Executor returns and never computes. Roster imports the guild's string and lists
-- who is in the group; Export takes attendance snapshots and makes the string for
-- the website. Groups and Loot fill in with later PRs.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local RaidWindow = {}
ns.RaidWindow = RaidWindow

local FRAME_NAME = "VintageRaidWindow"
local WIDTH, HEIGHT = 640, 440
local TAB_HEIGHT = 28
local TOOLBAR_HEIGHT = 32
-- Two lines: an error and what to do about it.
local STATUS_HEIGHT = 28
-- FenUI draws an edit box's label above the box, outside it.
local LABEL_HEIGHT = 14
local GAP = 8
local BUTTON_WIDTH = 150

local TABS = {
	{
		key = "roster",
		text = L["Roster"],
		title = L["No raid imported"],
		subtitle = L["Import the guild's string to see the roster and who is in your group."],
	},
	{
		key = "groups",
		text = L["Groups"],
		title = L["No groups planned"],
		subtitle = L["Planned and current raid groups appear here after an import."],
	},
	{
		key = "loot",
		text = L["Loot"],
		title = L["No loot recorded"],
		subtitle = L["Drops are recorded here during the raid."],
	},
	{
		key = "export",
		text = L["Export"],
		title = L["Nothing to export"],
		subtitle = L["Take a snapshot of the group, then make the string for the website."],
	},
}

--- "warrior" → "Warrior".
local function capitalize(text)
	return (tostring(text or ""):gsub("^%l", string.upper))
end

---@param parent Frame
---@param below Frame|nil anchor the region's top under this frame; the parent's top otherwise
---@return Frame
local function region(parent, below)
	local frame = CreateFrame("Frame", nil, parent)
	if below then
		frame:SetPoint("TOPLEFT", below, "BOTTOMLEFT", 0, -GAP)
		frame:SetPoint("TOPRIGHT", below, "BOTTOMRIGHT", 0, -GAP)
	else
		frame:SetPoint("TOPLEFT")
		frame:SetPoint("TOPRIGHT")
	end
	frame:SetPoint("BOTTOM", parent, "BOTTOM")
	return frame
end

---@param parent Frame
---@return Frame toolbar
local function toolbar(FenUI, parent)
	local bar = FenUI:CreateToolbar(parent, { height = TOOLBAR_HEIGHT })
	bar:SetPoint("TOPLEFT")
	bar:SetPoint("TOPRIGHT")
	return bar
end

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

	-- The session and the last action, under the pages (FenUI's panel subtitle overlaps the
	-- tab bar, so the window doesn't use it).
	local status = safeZone:CreateFontString(nil, "OVERLAY")
	status:SetFontObject(FenUI:GetFont("fontSmall"))
	status:SetPoint("BOTTOMLEFT")
	status:SetPoint("BOTTOMRIGHT")
	status:SetHeight(STATUS_HEIGHT)
	status:SetJustifyH("LEFT")
	status:SetJustifyV("TOP")
	status:SetWordWrap(true)
	status:SetMaxLines(2)
	self.status = status

	local content = CreateFrame("Frame", nil, safeZone)
	content:SetPoint("TOPLEFT", tabBar, "BOTTOMLEFT", 0, -GAP)
	content:SetPoint("BOTTOMRIGHT", 0, STATUS_HEIGHT + GAP)

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
	self:BuildRoster(FenUI, self.pages.roster)
	self:BuildExport(FenUI, self.pages.export)

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

--------------------------------------------------------------------------------
-- Roster: import and who is in the group
--------------------------------------------------------------------------------

function RaidWindow:BuildRoster(FenUI, page)
	page.toolbar = toolbar(FenUI, page)
	page.importButton = page.toolbar:AddButton({
		text = L["Import"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:BeginImport()
		end,
	})

	local list = FenUI:CreateVirtualList(page, {})
	list:SetPoint("TOPLEFT", page.toolbar, "BOTTOMLEFT", 0, -GAP)
	list:SetPoint("BOTTOMRIGHT")
	list:Hide()
	page.list = list

	-- The paste area replaces the list while importing.
	local paste = region(page, page.toolbar)
	paste:Hide()
	local actions = FenUI:CreateToolbar(paste, { height = TOOLBAR_HEIGHT })
	actions:SetPoint("BOTTOMLEFT")
	actions:SetPoint("BOTTOMRIGHT")
	page.submitButton = actions:AddButton({
		text = L["Import"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:SubmitImport(page.pasteBox:GetText())
		end,
	})
	actions:AddButton({
		text = L["Cancel"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:CancelImport()
		end,
	})
	page.pasteBox = FenUI:CreateMultiLineEditBox(paste, {
		label = L["Paste the guild's import string (it starts with !VIN:)"],
	})
	page.pasteBox:SetPoint("TOPLEFT", 0, -LABEL_HEIGHT)
	page.pasteBox:SetPoint("BOTTOMRIGHT", actions, "TOPRIGHT", 0, GAP)
	page.paste = paste
end

--- Opens the paste area.
function RaidWindow:BeginImport()
	if not self:Create() then
		return
	end
	self:ShowPage("roster")
	self.importing = true
	self.confirmImport = false
	local page = self.pages.roster
	page.pasteBox:Clear()
	page.submitButton:SetText(L["Import"])
	self:RefreshRoster()
	page.pasteBox:SelectAll()
end

function RaidWindow:CancelImport()
	self.importing = false
	self.confirmImport = false
	self:RefreshRoster()
end

--- Imports a pasted string. A session that already holds a raid asks first: the button turns
--- into "Replace the raid", and the next press confirms.
---@param text string
---@return table ActionResult
function RaidWindow:SubmitImport(text)
	local result = ns.Executor:Execute("raid-import", { text = text, confirm = self.confirmImport })
	local page = self.pages and self.pages.roster
	if not result.success and result.error and result.error.code == "CONFIRM_REQUIRED" then
		self.confirmImport = true
		if page then
			page.submitButton:SetText(L["Replace the raid"])
		end
		self:SetMessage(result)
		return result
	end
	self.confirmImport = false
	if page then
		page.submitButton:SetText(L["Import"])
	end
	if result.success then
		self.importing = false
	end
	self:SetMessage(result)
	self:Refresh()
	return result
end

--- The roster from raid-status, or the empty state.
function RaidWindow:RefreshRoster()
	local page = self.pages and self.pages.roster
	if not page then
		return
	end
	page.paste:SetShown(self.importing == true)
	-- The paste area has its own Import; a second one above it would clear the paste.
	page.importButton:SetShown(not self.importing)
	if self.importing then
		page.list:Hide()
		page.empty:Hide()
		return
	end
	local result = ns.Executor:Execute("raid-status")
	local rows = result.success and result.data.rows or {}
	local items = {}
	for _, row in ipairs(rows) do
		local parts = { capitalize(row.class) .. " " .. row.role }
		if row.group then
			parts[#parts + 1] = string.format(L["group %d"], row.group)
		end
		parts[#parts + 1] = row.inGroup and L["in your group"] or L["not in your group"]
		items[#items + 1] = { key = row.characterId, text = row.name .. "  ·  " .. table.concat(parts, "  ·  ") }
	end
	page.list:SetItems(items)
	page.list:SetShown(#items > 0)
	page.empty:SetShown(#items == 0)
	page.importButton:SetText(result.success and L["Import again"] or L["Import"])
	self.rosterItems = items
end

--------------------------------------------------------------------------------
-- Export: snapshots and the string for the website
--------------------------------------------------------------------------------

function RaidWindow:BuildExport(FenUI, page)
	page.toolbar = toolbar(FenUI, page)
	page.toolbar:AddButton({
		text = L["Take a snapshot"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:TakeSnapshot()
		end,
	})
	page.toolbar:AddButton({
		text = L["Make export string"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:MakeExport()
		end,
	})

	page.summary = page:CreateFontString(nil, "OVERLAY")
	page.summary:SetFontObject(FenUI:GetFont("fontSmall"))
	page.summary:SetPoint("TOPLEFT", page.toolbar, "BOTTOMLEFT", 0, -GAP)
	page.summary:SetJustifyH("LEFT")

	page.exportBox = FenUI:CreateMultiLineEditBox(page, {
		label = L["Copy this into the website's Check an export (Ctrl+C)"],
		readOnly = true,
	})
	page.exportBox:SetPoint("TOPLEFT", page.summary, "BOTTOMLEFT", 0, -(GAP + LABEL_HEIGHT))
	page.exportBox:SetPoint("BOTTOMRIGHT")
	page.exportBox:Hide()
end

---@return table ActionResult
function RaidWindow:TakeSnapshot()
	local result = ns.Executor:Execute("attendance-snapshot")
	self:SetMessage(result)
	self:Refresh()
	return result
end

--- Makes the export string, shows it, and selects it for copying.
---@return table ActionResult
function RaidWindow:MakeExport()
	local result = ns.Executor:Execute("raid-export")
	self:SetMessage(result)
	self:Refresh()
	local page = self.pages and self.pages.export
	if result.success and page then
		page.exportBox:SelectAll()
	end
	return result
end

---@param summary table|nil session-get's data
function RaidWindow:RefreshExport(summary)
	local page = self.pages and self.pages.export
	if not page then
		return
	end
	local snapshots = summary and summary.snapshots or 0
	local lastExport = summary and summary.lastExport
	page.summary:SetText(string.format(L["%d snapshots, %d drops recorded"], snapshots, summary and summary.loot or 0))
	page.summary:SetShown(snapshots > 0 or lastExport ~= nil)
	page.exportBox:SetText(lastExport or "")
	page.exportBox:SetShown(lastExport ~= nil)
	page.empty:SetShown(snapshots == 0 and lastExport == nil)
end

--------------------------------------------------------------------------------
-- The window
--------------------------------------------------------------------------------

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

--- Shows an action's result in the status line until the next one: its reasoning, or its
--- error and what to do about it.
---@param result table ActionResult
function RaidWindow:SetMessage(result)
	if result.success then
		self.message = result.reasoning
		self.messageIsError = false
	else
		local err = result.error or {}
		local text = tostring(err.message or err.code)
		if err.suggestion then
			text = text .. ". " .. err.suggestion
		end
		self.message = text
		self.messageIsError = true
	end
	self:RefreshStatus()
end

--- The status line: the last action's message, else the session's own line.
---@param reasoning string|nil session-get's reasoning, when it was just read
function RaidWindow:RefreshStatus(reasoning)
	if not self.status then
		return
	end
	if reasoning then
		self.sessionLine = reasoning
	end
	local FenUI = rawget(_G, "FenUI")
	local token = self.message and self.messageIsError and "feedbackError" or "textMuted"
	if FenUI and FenUI.GetColor then
		local r, g, b = FenUI:GetColor(token)
		if r then
			self.status:SetTextColor(r, g, b)
		end
	end
	self.status:SetText(self.message or self.sessionLine or "")
end

--- Re-reads the session and redraws the pages.
function RaidWindow:Refresh()
	if not self.frame then
		return
	end
	local result = ns.Executor:Execute("session-get")
	if result.success then
		self:RefreshStatus(result.reasoning)
		self:RefreshExport(result.data)
	else
		self:RefreshStatus(result.error and result.error.message or "")
		self:RefreshExport(nil)
	end
	self:RefreshRoster()
end

--- The text in the status line now.
---@return string
function RaidWindow:GetStatusText()
	return self.status and self.status:GetText() or ""
end

function RaidWindow:Show()
	local frame = self:Create()
	if not frame then
		return
	end
	self.message = nil
	frame:Show()
	-- Who is in the group changes while the window is open.
	ns.Events:On("GROUP_ROSTER_UPDATE", "RaidWindow", function()
		if frame:IsShown() then
			self:RefreshRoster()
		end
	end)
	self:Refresh()
end

function RaidWindow:Hide()
	if self.frame then
		self.frame:Hide()
	end
	ns.Events:Off("GROUP_ROSTER_UPDATE", "RaidWindow")
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
	self.frame:SetPoint(
		window.point or "CENTER",
		UIParent,
		window.relativePoint or "CENTER",
		window.x or 0,
		window.y or 0
	)
end

return RaidWindow
