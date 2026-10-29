--------------------------------------------------------------------------------
-- Vintage View: the raid window (/vintage)
-- A FenUI panel with four tabs: Roster, Groups, Loot, Export. Under the tabs, a
-- bar that every tab shares: the raid (or the last action's result) and Import.
-- It renders what the Executor returns and never computes. Roster lists who is in
-- the group; Export takes attendance snapshots and makes the string for the
-- website. Groups and Loot fill in with later PRs.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local RaidWindow = {}
ns.RaidWindow = RaidWindow

local FRAME_NAME = "VintageRaidWindow"
local WIDTH, HEIGHT = 640, 440
local TAB_HEIGHT = 28
local BAR_HEIGHT = 32
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
		subtitle = L["Import the guild's string to see the groups it plans."],
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

-- Class colors (the game's raid colors for Forever's classes), for names in lists.
local CLASS_COLORS = {
	warrior = "c69b6d",
	paladin = "f48cba",
	hunter = "aad372",
	rogue = "fff468",
	priest = "ffffff",
	shaman = "0070dd",
	mage = "3fc7eb",
	warlock = "8788ee",
	druid = "ff7c0a",
}

local ROLE_ORDER = { "tank", "healer", "melee", "ranged" }
local ROLE_HEADERS = { tank = L["Tanks"], healer = L["Healers"], melee = L["Melee"], ranged = L["Ranged"] }

-- Item quality names for the loot threshold (0 poor … 5 legendary).
local QUALITY = {
	[0] = L["poor"],
	[1] = L["common"],
	[2] = L["uncommon"],
	[3] = L["rare"],
	[4] = L["epic"],
	[5] = L["legendary"],
}

--- A FenUI color token as an inline color escape: "|cffrrggbb".
local function colorCode(token)
	local FenUI = rawget(_G, "FenUI")
	local r, g, b = 1, 1, 1
	if FenUI and FenUI.GetColor then
		r, g, b = FenUI:GetColor(token)
	end
	return string.format("|cff%02x%02x%02x", math.floor(r * 255), math.floor(g * 255), math.floor(b * 255))
end

--- One roster row as list text: the name in its class color, the class and role, where the
--- import puts them, and whether they are in your group (green) or not (muted).
local function rowText(row, withGroup)
	local name = string.format("|cff%s%s|r", CLASS_COLORS[row.class] or "ffffff", row.name)
	local parts = { name, capitalize(row.class) .. " " .. row.role }
	if withGroup and row.group then
		parts[#parts + 1] = string.format(L["group %d"], row.group)
	end
	local status = row.inGroup and (colorCode("feedbackSuccess") .. L["in your group"] .. "|r")
		or (colorCode("textMuted") .. L["not in your group"] .. "|r")
	parts[#parts + 1] = status
	return table.concat(parts, "  ·  ")
end

--- "Tanks  1 of 2 in your group".
local function headerText(label, rows)
	local present = 0
	for _, row in ipairs(rows) do
		if row.inGroup then
			present = present + 1
		end
	end
	return string.format(L["%s  ·  %d of %d in your group"], label, present, #rows)
end

---@param parent Frame
---@return Frame toolbar
local function toolbar(FenUI, parent)
	local bar = FenUI:CreateToolbar(parent, { height = BAR_HEIGHT })
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

	self:BuildBar(FenUI, safeZone, tabBar)

	local content = CreateFrame("Frame", nil, safeZone)
	content:SetPoint("TOPLEFT", self.bar, "BOTTOMLEFT", 0, -GAP)
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
	self:BuildRoster(FenUI, self.pages.roster)
	self:BuildRoster(FenUI, self.pages.groups)
	self:BuildExport(FenUI, self.pages.export)
	self:BuildPaste(FenUI, content)

	self.tabs = FenUI:CreateTabGroup(tabBar, {
		tabs = tabDefs,
		onChange = function(key)
			-- Moving to another tab puts the paste away.
			if self.importing then
				self:CancelImport()
			end
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
-- The bar every tab shares: the raid or the last result, and Import
--------------------------------------------------------------------------------

function RaidWindow:BuildBar(FenUI, parent, tabBar)
	local bar = CreateFrame("Frame", nil, parent)
	bar:SetPoint("TOPLEFT", tabBar, "BOTTOMLEFT", 0, -GAP)
	bar:SetPoint("TOPRIGHT", tabBar, "BOTTOMRIGHT", 0, -GAP)
	bar:SetHeight(BAR_HEIGHT)

	self.importButton = FenUI:CreateButton(bar, {
		text = L["Import"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:BeginImport()
		end,
	})
	self.importButton:SetPoint("RIGHT")

	-- The panel's own subtitle overlaps FenUI's tab bar, so the raid's line lives here.
	local status = bar:CreateFontString(nil, "OVERLAY")
	status:SetFontObject(FenUI:GetFont("fontSmall"))
	status:SetPoint("LEFT")
	status:SetPoint("RIGHT", self.importButton, "LEFT", -GAP, 0)
	status:SetHeight(BAR_HEIGHT)
	status:SetJustifyH("LEFT")
	status:SetJustifyV("MIDDLE")
	status:SetWordWrap(true)
	-- Two lines: an error and what to do about it.
	status:SetMaxLines(2)
	self.status = status
	self.bar = bar
end

--------------------------------------------------------------------------------
-- Import: a paste area over the tabs' content
--------------------------------------------------------------------------------

function RaidWindow:BuildPaste(FenUI, content)
	local paste = CreateFrame("Frame", nil, content)
	paste:SetAllPoints()
	paste:Hide()
	local actions = FenUI:CreateToolbar(paste, { height = BAR_HEIGHT })
	actions:SetPoint("BOTTOMLEFT")
	actions:SetPoint("BOTTOMRIGHT")
	self.submitButton = actions:AddButton({
		text = L["Import"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:SubmitImport(self.pasteBox:GetText())
		end,
	})
	actions:AddButton({
		text = L["Cancel"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:CancelImport()
		end,
	})
	-- What to paste is said in the bar above, so the box gets the whole area.
	self.pasteBox = FenUI:CreateMultiLineEditBox(paste, {})
	self.pasteBox:SetPoint("TOPLEFT")
	self.pasteBox:SetPoint("BOTTOMRIGHT", actions, "TOPRIGHT", 0, GAP)
	self.paste = paste
end

--- Opens the paste area over whichever tab is showing.
function RaidWindow:BeginImport()
	if not self:Create() then
		return
	end
	self.importing = true
	self.confirmImport = false
	self.message = L["Paste the guild's import string (it starts with !VIN:), then press Import."]
	self.messageIsError = false
	self.pasteBox:Clear()
	self.submitButton:SetText(L["Import"])
	self:RefreshImporting()
	self:RefreshStatus()
	self.pasteBox:SelectAll()
end

function RaidWindow:CancelImport()
	self.importing = false
	self.confirmImport = false
	self.message = nil
	self:RefreshImporting()
	self:RefreshStatus()
end

--- Imports a pasted string. A session that already holds a raid asks first: the button turns
--- into "Replace the raid", and the next press confirms. A successful import shows the roster.
---@param text string
---@return table ActionResult
function RaidWindow:SubmitImport(text)
	local result = ns.Executor:Execute("raid-import", { text = text, confirm = self.confirmImport })
	if not result.success and result.error and result.error.code == "CONFIRM_REQUIRED" then
		self.confirmImport = true
		if self.submitButton then
			self.submitButton:SetText(L["Replace the raid"])
		end
		self:SetMessage(result)
		return result
	end
	self.confirmImport = false
	if self.submitButton then
		self.submitButton:SetText(L["Import"])
	end
	self:SetMessage(result)
	if result.success then
		self.importing = false
		self:RefreshImporting()
		if self.tabs then
			self.tabs:Select("roster")
		end
	end
	self:Refresh()
	return result
end

--- The paste area replaces the pages while importing, and its own Import replaces the bar's
--- (a second press of the bar's would clear the paste).
function RaidWindow:RefreshImporting()
	if not self.paste then
		return
	end
	local importing = self.importing == true
	self.paste:SetShown(importing)
	self.importButton:SetShown(not importing)
	for key, page in pairs(self.pages) do
		page:SetShown(not importing and key == self.selected)
	end
end

--------------------------------------------------------------------------------
-- Roster (by role), Groups (as the import plans them), and the Loot plan
--------------------------------------------------------------------------------

function RaidWindow:BuildRoster(FenUI, page)
	local list = FenUI:CreateVirtualList(page, {})
	list:SetAllPoints()
	list:Hide()
	page.list = list
end

---@param rows table[] raid-status rows
---@return table[] list items: a header per role, then its people
local function byRole(rows)
	local items = {}
	for _, role in ipairs(ROLE_ORDER) do
		local inRole = {}
		for _, row in ipairs(rows) do
			if row.role == role then
				inRole[#inRole + 1] = row
			end
		end
		if #inRole > 0 then
			items[#items + 1] =
				{ key = "role:" .. role, text = headerText(ROLE_HEADERS[role], inRole), isHeader = true }
			for _, row in ipairs(inRole) do
				items[#items + 1] = { key = row.characterId, text = rowText(row, true), indent = 1 }
			end
		end
	end
	return items
end

---@param rows table[] raid-status rows
---@return table[] list items: a header per planned group, then its people; nil when none
local function byGroup(rows)
	local groups, unplaced = {}, {}
	for _, row in ipairs(rows) do
		if row.group then
			groups[row.group] = groups[row.group] or {}
			table.insert(groups[row.group], row)
		else
			unplaced[#unplaced + 1] = row
		end
	end
	local items = {}
	for group = 1, 8 do
		local members = groups[group]
		if members then
			local label = string.format(L["Group %d"], group)
			items[#items + 1] = { key = "group:" .. group, text = headerText(label, members), isHeader = true }
			for _, row in ipairs(members) do
				items[#items + 1] = { key = row.characterId, text = rowText(row, false), indent = 1 }
			end
		end
	end
	if #items == 0 then
		return nil
	end
	if #unplaced > 0 then
		items[#items + 1] = { key = "group:none", text = headerText(L["Not in a group"], unplaced), isHeader = true }
		for _, row in ipairs(unplaced) do
			items[#items + 1] = { key = row.characterId, text = rowText(row, false), indent = 1 }
		end
	end
	return items
end

--- Roster, Groups, and the Loot plan from raid-status, or their empty states.
function RaidWindow:RefreshRoster()
	local roster = self.pages and self.pages.roster
	if not roster then
		return
	end
	local result = ns.Executor:Execute("raid-status")
	local rows = result.success and result.data.rows or {}

	local items = byRole(rows)
	roster.list:SetItems(items)
	roster.list:SetShown(#items > 0)
	roster.empty:SetShown(#items == 0)
	self.rosterItems = items

	local groups = self.pages.groups
	local groupItems = byGroup(rows) or {}
	groups.list:SetItems(groupItems)
	groups.list:SetShown(#groupItems > 0)
	groups.empty:SetShown(#groupItems == 0)
	groups.empty:SetSubtitle(
		result.success and L["This raid's import plans no groups."]
			or L["Import the guild's string to see the groups it plans."]
	)
	self.groupItems = groupItems

	self:RefreshLootPlan(result.success and result.data.loot or nil)
	self.importButton:SetText(result.success and L["Import again"] or L["Import"])
end

--- Until drops are recorded, the Loot tab says how the import plans to hand out loot.
---@param plan table|nil raid-status's loot { mode, threshold, prioritized }
function RaidWindow:RefreshLootPlan(plan)
	local page = self.pages and self.pages.loot
	if not page then
		return
	end
	if not plan then
		page.empty:SetSubtitle(L["Drops are recorded here during the raid."])
		self.lootPlanText = nil
		return
	end
	local method = plan.mode == "master" and L["Master loot"] or L["Group loot"]
	local parts = { method }
	if plan.threshold and QUALITY[plan.threshold] then
		parts[#parts + 1] = string.format(L["%s or better"], QUALITY[plan.threshold])
	end
	if plan.prioritized > 0 then
		parts[#parts + 1] = plan.prioritized == 1 and L["1 item with a priority list"]
			or string.format(L["%d items with a priority list"], plan.prioritized)
	end
	self.lootPlanText = table.concat(parts, "  ·  ")
	page.empty:SetSubtitle(self.lootPlanText .. "\n" .. L["Drops are recorded here during the raid."])
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
	page.summary:SetText(string.format(L["Snapshots: %d  ·  Drops: %d"], snapshots, summary and summary.loot or 0))
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
	self.selected = key
	self:RefreshImporting()
end

--- Shows an action's result in the bar until the next one: its reasoning, or its error and
--- what to do about it.
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

--- The bar's line: the last action's message, else the raid. Nothing before a raid: the tab's
--- own empty state says what to do.
---@param summary table|nil session-get's data, when it was just read
---@param reasoning string|nil session-get's reasoning, with summary
function RaidWindow:RefreshStatus(summary, reasoning)
	if not self.status then
		return
	end
	if summary then
		local idle = summary.state == "idle" and (summary.snapshots or 0) == 0
		self.sessionLine = not idle and reasoning or nil
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
		self:RefreshStatus(result.data, result.reasoning)
		self:RefreshExport(result.data)
	else
		self.sessionLine = result.error and result.error.message or nil
		self:RefreshStatus()
		self:RefreshExport(nil)
	end
	self:RefreshRoster()
end

--- The text in the bar now.
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
