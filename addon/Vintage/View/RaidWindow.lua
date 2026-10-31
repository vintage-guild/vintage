--------------------------------------------------------------------------------
-- Vintage View: the raid window (/vintage)
-- A FenUI panel with four tabs: Roster, Groups, Loot, Export. Under the tabs, a
-- header every tab shares: the raid's name, a line about it (or the last result),
-- and Import. Roster lists people by role and Groups by planned group, in columns;
-- Loot shows the import's loot plan and the drops; Export takes snapshots and makes the string
-- for the website. It renders what the Executor returns and never computes.
--
-- Layout: 16px margins all round, one left edge for tabs, header, and content;
-- 8px between related things, 12px between bands; gold only for the action that
-- moves the night forward.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local RaidWindow = {}
ns.RaidWindow = RaidWindow

local FRAME_NAME = "VintageRaidWindow"
local WIDTH, HEIGHT = 680, 520
local MARGIN = 16
local GAP = 8
local BAND = 12
local TAB_HEIGHT = 28
local HEADER_HEIGHT = 36
local TOOLBAR_HEIGHT = 28
local ROW_HEIGHT = 24
local ICON_SIZE = 16
-- FenUI draws an edit box's label above the box, outside it.
local LABEL_HEIGHT = 14
local BUTTON_WIDTH = 136
-- A row's own buttons (Invite, Whisper), shown on hover.
local ACTION_WIDTH = 72
-- For labels longer than a word or two ("Make export string").
local WIDE_BUTTON_WIDTH = 168
-- An export is a few hundred characters: a box about six lines tall holds it.
local EXPORT_BOX_HEIGHT = 120

-- Roster and Groups columns, from the row's left edge.
local COLUMN = { icon = 4, name = 26, class = 200, detail = 310 }
local NAME_WIDTH, CLASS_WIDTH, DETAIL_WIDTH = 166, 100, 90

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
		subtitle = L["Each boss kill takes a snapshot, and so does making the string."],
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

-- Class icons: one sheet, a square per class (the game's own CLASS_ICON_TCOORDS).
local CLASS_ICONS = "Interface\\WorldStateFrame\\Icons-Classes"
local CLASS_ICON_COORDS = {
	warrior = { 0, 0.25, 0, 0.25 },
	mage = { 0.25, 0.49609375, 0, 0.25 },
	rogue = { 0.49609375, 0.7421875, 0, 0.25 },
	druid = { 0.7421875, 0.98828125, 0, 0.25 },
	hunter = { 0, 0.25, 0.25, 0.5 },
	shaman = { 0.25, 0.49609375, 0.25, 0.5 },
	priest = { 0.49609375, 0.7421875, 0.25, 0.5 },
	warlock = { 0.7421875, 0.98828125, 0.25, 0.5 },
	paladin = { 0, 0.25, 0.5, 0.75 },
}
local IN_GROUP_ICON = "Interface\\RaidFrame\\ReadyCheck-Ready"

local ROLE_ORDER = { "tank", "healer", "melee", "ranged" }
local ROLE_HEADERS = { tank = L["Tanks"], healer = L["Healers"], melee = L["Melee"], ranged = L["Ranged"] }
local ROLE_NAMES = { tank = L["Tank"], healer = L["Healer"], melee = L["Melee"], ranged = L["Ranged"] }
-- "1 healer", "2 healers": what the raid is short of, in the header.
local ROLE_COUNTS = {
	tank = { L["1 tank"], L["%d tanks"] },
	healer = { L["1 healer"], L["%d healers"] },
	melee = { L["1 melee"], L["%d melee"] },
	ranged = { L["1 ranged"], L["%d ranged"] },
}
-- Why someone on the bench isn't rostered, where the roster says "Not in group".
local BENCH_REASONS = { standby = L["Standby"], queued = L["Queued"], benched = L["Benched"] }

-- Item quality names for the loot threshold (0 poor … 5 legendary).
local QUALITY = {
	[0] = L["Poor"],
	[1] = L["Common"],
	[2] = L["Uncommon"],
	[3] = L["Rare"],
	[4] = L["Epic"],
	[5] = L["Legendary"],
}

local function FenUI()
	return rawget(_G, "FenUI")
end

---@param token string a FenUI color token
local function color(fontString, token)
	local F = FenUI()
	if F and F.GetColor then
		local r, g, b = F:GetColor(token)
		fontString:SetTextColor(r, g, b)
	end
end

---@param parent Frame
---@param font string a FenUI font token
---@param token string a FenUI color token
---@return FontString
local function label(parent, font, token)
	local fs = parent:CreateFontString(nil, "OVERLAY")
	fs:SetFontObject(FenUI():GetFont(font))
	fs:SetJustifyH("LEFT")
	fs:SetWordWrap(false)
	color(fs, token)
	return fs
end

---@param parent Frame
---@return Texture a 1px divider in the subtle border color
local function divider(parent)
	local line = parent:CreateTexture(nil, "ARTWORK")
	line:SetHeight(1)
	line:SetColorTexture(FenUI():GetColor("borderSubtle"))
	return line
end

--- "1 character", "10 characters".
local function count(n, one, many)
	return n == 1 and one or string.format(many, n)
end

--------------------------------------------------------------------------------
-- List items and rows
--------------------------------------------------------------------------------

--- A section header: "TANKS" and "1 / 2 in group".
local function header(key, title, rows)
	local present = 0
	for _, row in ipairs(rows) do
		if row.inGroup then
			present = present + 1
		end
	end
	local tally = string.format(L["%d / %d in group"], present, #rows)
	return {
		key = key,
		isHeader = true,
		title = title,
		tally = tally,
		text = title .. "  " .. tally,
	}
end

-- Where someone is, as the status column says it: label, color token, and the check mark.
local STATUS = {
	["in"] = { label = L["In group"], token = "feedbackSuccess", check = true },
	invited = { label = L["Invited"], token = "feedbackInfo" },
	declined = { label = L["Declined"], token = "feedbackError" },
	busy = { label = L["In another group"], token = "feedbackWarning" },
	offline = { label = L["Offline"], token = "textDisabled" },
	missing = { label = L["Not in group"], token = "textDisabled" },
}

--- A person: name in class color, class, a detail column (group or role), and where they are.
--- With checkGroup, someone in the raid but outside their planned group says which group
--- they are in (in yellow): Arrange will move them. missingLabel replaces "Not in group" (the
--- bench says why they're on it).
local function person(row, detail, checkGroup, missingLabel)
	local status = STATUS[row.state] or STATUS.missing
	local text, token, check = status.label, status.token, status.check
	if row.state == "missing" and missingLabel then
		text = missingLabel
	end
	if checkGroup and row.inGroup and row.subgroup and row.group and row.subgroup ~= row.group then
		text, token, check = string.format(L["In group %d"], row.subgroup), "feedbackWarning", false
	end
	return {
		key = row.characterId,
		class = row.class,
		name = row.name,
		classLabel = capitalize(row.class),
		detail = detail,
		inGroup = row.inGroup,
		state = row.state,
		status = text,
		statusToken = token,
		statusCheck = check == true,
		text = table.concat({ row.name, capitalize(row.class), detail or "", text }, "  ·  "),
	}
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
			items[#items + 1] = header("role:" .. role, ROLE_HEADERS[role], inRole)
			for _, row in ipairs(inRole) do
				items[#items + 1] = person(row, row.group and string.format(L["Group %d"], row.group) or "")
			end
		end
	end
	return items
end

---@param rows table[] raid-status rows
---@return table[] list items: a header per planned group, then its people (none without groups)
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
			items[#items + 1] = header("group:" .. group, string.format(L["Group %d"], group), members)
			for _, row in ipairs(members) do
				items[#items + 1] = person(row, ROLE_NAMES[row.role], true)
			end
		end
	end
	if #items > 0 and #unplaced > 0 then
		items[#items + 1] = header("group:none", L["Not in a group"], unplaced)
		for _, row in ipairs(unplaced) do
			items[#items + 1] = person(row, ROLE_NAMES[row.role], true)
		end
	end
	return items
end

--- On hover, a person's row trades its status for its actions: Invite (when not in the group)
--- and Whisper. Leaving onto a row's own button keeps them (the row still has the mouse).
local function showActions(row, show)
	local item = row.itemData
	local isPerson = show and item and not item.isHeader
	row.actions:SetShown(isPerson == true)
	row.inviteButton:SetShown(isPerson == true and not item.inGroup)
	row.status:SetShown(not isPerson and item ~= nil and not item.isHeader)
	row.statusIcon:SetShown(not isPerson and item ~= nil and item.statusCheck == true)
end

local function buildActions(row)
	local F = FenUI()
	local actions = CreateFrame("Frame", nil, row)
	actions:SetPoint("TOPRIGHT", -GAP, 0)
	actions:SetPoint("BOTTOMRIGHT", -GAP, 0)
	actions:SetWidth(2 * ACTION_WIDTH + 4)
	actions:Hide()
	local function leave()
		if not row:IsMouseOver() then
			showActions(row, false)
		end
	end
	row.whisperButton = F:CreateButton(actions, {
		text = L["Whisper"],
		width = ACTION_WIDTH,
		height = ROW_HEIGHT - 4,
		onClick = function()
			RaidWindow:WhisperName(row.itemData and row.itemData.name)
		end,
		onLeave = leave,
	})
	row.whisperButton:SetPoint("RIGHT")
	row.inviteButton = F:CreateButton(actions, {
		text = L["Invite"],
		width = ACTION_WIDTH,
		height = ROW_HEIGHT - 4,
		onClick = function()
			RaidWindow:InviteName(row.itemData and row.itemData.name)
		end,
		onLeave = leave,
	})
	row.inviteButton:SetPoint("RIGHT", row.whisperButton, "LEFT", -4, 0)
	row.actions = actions
	row:HookScript("OnEnter", function()
		showActions(row, true)
	end)
	row:HookScript("OnLeave", leave)
end

--- A section header's parts: the caption (the row's own text), a tally, and a hairline.
local function buildHeader(row)
	row.tally = label(row, "fontCaption", "textMuted")
	row.tally:SetPoint("RIGHT", -GAP, 0)
	row.tally:SetJustifyH("RIGHT")
	row.rule = divider(row)
	row.rule:SetPoint("BOTTOMLEFT", COLUMN.icon, 2)
	row.rule:SetPoint("BOTTOMRIGHT", -GAP, 2)
end

--- Shows or hides a row's header parts; a header row reads, it doesn't hover or click.
local function renderHeader(row, item)
	local isHeader = item.isHeader == true
	row.text:SetShown(isHeader)
	row.tally:SetShown(isHeader)
	row.rule:SetShown(isHeader)
	if not isHeader then
		row.hover:Show()
		row:Enable()
		return false
	end
	row.text:SetFontObject(FenUI():GetFont("fontCaption"))
	row.text:SetText(string.upper(item.title))
	row.text:ClearAllPoints()
	row.text:SetPoint("BOTTOMLEFT", COLUMN.icon, 6)
	color(row.text, "textHeading")
	row.tally:ClearAllPoints()
	row.tally:SetPoint("BOTTOMRIGHT", -GAP, 6)
	row.tally:SetText(item.tally)
	row.hover:Hide()
	row:Disable()
	return true
end

--- Draws one list row. Rows are pooled, so every part is set or hidden each time.
local function renderRow(row, item)
	if not row.vintage then
		buildActions(row)
		buildHeader(row)
		row.vintage = true
		row.icon = row:CreateTexture(nil, "ARTWORK")
		row.icon:SetSize(ICON_SIZE, ICON_SIZE)
		row.icon:SetPoint("LEFT", COLUMN.icon, 0)
		row.name = label(row, "fontBody", "textDefault")
		row.name:SetPoint("LEFT", COLUMN.name, 0)
		row.name:SetWidth(NAME_WIDTH)
		row.classLabel = label(row, "fontSmall", "textMuted")
		row.classLabel:SetPoint("LEFT", COLUMN.class, 0)
		row.classLabel:SetWidth(CLASS_WIDTH)
		row.detail = label(row, "fontSmall", "textMuted")
		row.detail:SetPoint("LEFT", COLUMN.detail, 0)
		row.detail:SetWidth(DETAIL_WIDTH)
		row.status = label(row, "fontSmall", "textMuted")
		row.status:SetPoint("RIGHT", -GAP, 0)
		row.status:SetJustifyH("RIGHT")
		row.statusIcon = row:CreateTexture(nil, "ARTWORK")
		row.statusIcon:SetSize(14, 14)
		row.statusIcon:SetPoint("RIGHT", row.status, "LEFT", -4, 0)
	end
	-- Lists here are for reading: no selection mark.
	row.bg:Hide()
	row.accent:Hide()

	local isHeader = item.isHeader == true
	for _, part in ipairs({ row.icon, row.name, row.classLabel, row.detail, row.status, row.statusIcon }) do
		part:SetShown(not isHeader)
	end
	row.actions:Hide()
	if renderHeader(row, item) then
		return
	end

	local coords = CLASS_ICON_COORDS[item.class]
	row.icon:SetTexture(coords and CLASS_ICONS or nil)
	if coords then
		row.icon:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
	end
	row.name:SetText(string.format("|cff%s%s|r", CLASS_COLORS[item.class] or "ffffff", item.name))
	row.classLabel:SetText(item.classLabel)
	row.detail:SetText(item.detail or "")
	-- "Not in group" stays quiet (textDisabled), so the people who are in stand out.
	row.status:SetText(item.status)
	color(row.status, item.statusToken)
	row.statusIcon:SetTexture(IN_GROUP_ICON)
	row.statusIcon:SetShown(item.statusCheck == true)
	if row:IsMouseOver() then
		showActions(row, true)
	end
end

-- Drop columns: the item's icon, the item in its quality color, who got it, then where and when.
local DROP_COLUMN = { icon = 4, item = 26, looter = 300 }
local ITEM_WIDTH, LOOTER_WIDTH = 266, 150
local UNKNOWN_ITEM_ICON = "Interface\\Icons\\INV_Misc_QuestionMark"

---@param drops table[] loot-list's drops, newest first
---@return table[] list items: a header, then one per drop
local function lootItems(drops)
	if #drops == 0 then
		return {}
	end
	local tally = count(#drops, L["1 drop"], L["%d drops"])
	local items =
		{ { key = "drops", isHeader = true, title = L["Drops"], tally = tally, text = L["Drops"] .. "  " .. tally } }
	for index, drop in ipairs(drops) do
		local name = drop.name or string.format(L["Item %d"], drop.itemId)
		if drop.count and drop.count > 1 then
			name = name .. " x" .. drop.count
		end
		local when = drop.time or ""
		local detail = drop.source and (drop.source .. "  ·  " .. when) or when
		items[#items + 1] = {
			key = "drop:" .. index,
			itemId = drop.itemId,
			name = name,
			quality = drop.quality,
			icon = drop.icon,
			looter = drop.looter,
			detail = detail,
			text = table.concat({ name, drop.looter, detail }, "  ·  "),
		}
	end
	return items
end

--- Draws one drop row; hovering shows the item's tooltip.
-- The Export tab's stood-by list: a check per bench person (gone for someone who came in).
local STOOD_BY_ICON, NOT_STOOD_BY_ICON = IN_GROUP_ICON, "Interface\\RaidFrame\\ReadyCheck-NotReady"

---@param bench table[] raid-status's bench rows
---@return table[] list items: a header, then one per bench person
local function standbyItems(bench)
	if #bench == 0 then
		return {}
	end
	local counted = 0
	for _, row in ipairs(bench) do
		if row.stoodBy and not row.attended then
			counted = counted + 1
		end
	end
	local tally = string.format(L["%d stood by"], counted)
	local items = {
		{ key = "stood", isHeader = true, title = L["Stood by"], tally = tally, text = L["Stood by"] .. "  " .. tally },
	}
	for _, row in ipairs(bench) do
		-- Someone who came in is in the attendance; the check is only for who waited.
		local status = row.attended and L["Came in"] or (row.stoodBy and L["Stood by"] or L["Didn't stand by"])
		local reason = BENCH_REASONS[row.reason] or ""
		items[#items + 1] = {
			key = "stood:" .. row.characterId,
			characterId = row.characterId,
			class = row.class,
			name = row.name,
			reason = reason,
			stoodBy = row.stoodBy == true and not row.attended,
			toggles = not row.attended,
			status = status,
			text = table.concat({ row.name, reason, status }, "  ·  "),
		}
	end
	return items
end

--- Draws one stood-by row: the check, the name in class color, why they were on the bench, and
--- where they are. A click on the row toggles the check (BuildExport's onSelect).
local function renderStandby(row, item)
	if not row.vintage then
		buildHeader(row)
		row.vintage = true
		row.check = row:CreateTexture(nil, "ARTWORK")
		row.check:SetSize(ICON_SIZE, ICON_SIZE)
		row.check:SetPoint("LEFT", COLUMN.icon, 0)
		row.name = label(row, "fontBody", "textDefault")
		row.name:SetPoint("LEFT", COLUMN.name, 0)
		row.name:SetWidth(NAME_WIDTH)
		row.reason = label(row, "fontSmall", "textMuted")
		row.reason:SetPoint("LEFT", COLUMN.class, 0)
		row.reason:SetWidth(CLASS_WIDTH)
		row.state = label(row, "fontSmall", "textMuted")
		row.state:SetPoint("RIGHT", -GAP, 0)
		row.state:SetJustifyH("RIGHT")
	end
	row.bg:Hide()
	row.accent:Hide()
	local isHeader = item.isHeader == true
	for _, part in ipairs({ row.check, row.name, row.reason, row.state }) do
		part:SetShown(not isHeader)
	end
	if renderHeader(row, item) then
		return
	end
	row.check:SetShown(item.toggles)
	row.check:SetTexture(item.stoodBy and STOOD_BY_ICON or NOT_STOOD_BY_ICON)
	row.check:SetAlpha(item.stoodBy and 1 or 0.5)
	row.name:SetText(string.format("|cff%s%s|r", CLASS_COLORS[item.class] or "ffffff", item.name))
	row.reason:SetText(item.reason)
	row.state:SetText(item.status)
	color(row.state, item.toggles and "textMuted" or "feedbackSuccess")
	row.hover:SetShown(item.toggles)
end

local function renderDrop(row, item)
	if not row.vintage then
		buildHeader(row)
		row.vintage = true
		row.icon = row:CreateTexture(nil, "ARTWORK")
		row.icon:SetSize(ICON_SIZE, ICON_SIZE)
		row.icon:SetPoint("LEFT", DROP_COLUMN.icon, 0)
		row.item = label(row, "fontBody", "textDefault")
		row.item:SetPoint("LEFT", DROP_COLUMN.item, 0)
		row.item:SetWidth(ITEM_WIDTH)
		row.looter = label(row, "fontSmall", "textDefault")
		row.looter:SetPoint("LEFT", DROP_COLUMN.looter, 0)
		row.looter:SetWidth(LOOTER_WIDTH)
		row.detail = label(row, "fontSmall", "textMuted")
		row.detail:SetPoint("RIGHT", -GAP, 0)
		row.detail:SetJustifyH("RIGHT")
		row:HookScript("OnEnter", function()
			local data = row.itemData
			if data and data.itemId and GameTooltip.SetItemByID then
				GameTooltip:SetOwner(row, "ANCHOR_RIGHT")
				GameTooltip:SetItemByID(data.itemId)
				GameTooltip:Show()
			end
		end)
		row:HookScript("OnLeave", function()
			GameTooltip:Hide()
		end)
	end
	row.bg:Hide()
	row.accent:Hide()

	local isHeader = item.isHeader == true
	for _, part in ipairs({ row.icon, row.item, row.looter, row.detail }) do
		part:SetShown(not isHeader)
	end
	if renderHeader(row, item) then
		return
	end
	row.icon:SetTexCoord(0, 1, 0, 1)
	row.icon:SetTexture(item.icon or UNKNOWN_ITEM_ICON)
	-- An item the client hasn't loaded yet has no quality: its "Item 123" stays muted.
	local hex = ns.Theme:QualityHex(item.quality)
	row.item:SetText(hex and string.format("|cff%s%s|r", hex, item.name) or item.name)
	color(row.item, hex and "textDefault" or "textMuted")
	row.looter:SetText(item.looter)
	row.detail:SetText(item.detail)
end

--------------------------------------------------------------------------------
-- The window
--------------------------------------------------------------------------------

--- Builds the window on first use. Returns nil when FenUI did not load.
---@return table|nil frame
function RaidWindow:Create()
	if self.frame then
		return self.frame
	end
	local F = FenUI()
	if not (F and F.CreatePanel) then
		ns.Vintage:Print(L["FenUI did not load. Reinstall Vintage."])
		return nil
	end
	ns.Theme:Ensure()

	local frame = F:CreatePanel(UIParent, {
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

	-- One inner area with the window's margins: tabs, header, and content share its left edge.
	local inner = CreateFrame("Frame", nil, frame:GetSafeZone())
	inner:SetPoint("TOPLEFT", MARGIN, 0)
	inner:SetPoint("BOTTOMRIGHT", -MARGIN, MARGIN)

	local tabBar = CreateFrame("Frame", nil, inner)
	tabBar:SetPoint("TOPLEFT")
	tabBar:SetPoint("TOPRIGHT")
	tabBar:SetHeight(TAB_HEIGHT)

	self:BuildHeader(F, inner, tabBar)

	local content = CreateFrame("Frame", nil, inner)
	-- Below the header's divider (GAP under it) with a band of space.
	content:SetPoint("TOPLEFT", self.header, "BOTTOMLEFT", 0, -(GAP + 1 + BAND))
	content:SetPoint("BOTTOMRIGHT")

	self.pages = {}
	local tabDefs = {}
	for _, tab in ipairs(TABS) do
		local page = CreateFrame("Frame", nil, content)
		page:SetAllPoints()
		page:Hide()
		page.empty = F:CreateEmptyState(page, { title = tab.title, subtitle = tab.subtitle })
		self.pages[tab.key] = page
		tabDefs[#tabDefs + 1] = { key = tab.key, text = tab.text }
	end
	self:BuildList(F, self.pages.roster, function()
		self:ToggleRun("invite")
	end)
	self:BuildList(F, self.pages.groups, function()
		self:ToggleRun("arrange")
	end)
	self:BuildLoot(F, self.pages.loot)
	self:BuildExport(F, self.pages.export)
	self:BuildPaste(F, content)

	self.tabs = F:CreateTabGroup(tabBar, {
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
	ns.Executor:Subscribe(function(name, result)
		if name == "forming-done" then
			self:SetMessage(result)
		end
		-- A new or cleared raid forgets a half-asked loot method change: its plan may differ.
		if name == "raid-import" or name == "session-clear" then
			self.confirmLootMode = false
		end
		if frame:IsShown() then
			self:Refresh()
		end
	end)
	return frame
end

--------------------------------------------------------------------------------
-- The header every tab shares: the raid, a line about it, and Import
--------------------------------------------------------------------------------

function RaidWindow:BuildHeader(F, parent, tabBar)
	local bar = CreateFrame("Frame", nil, parent)
	bar:SetPoint("TOPLEFT", tabBar, "BOTTOMLEFT", 0, -BAND)
	bar:SetPoint("TOPRIGHT", tabBar, "BOTTOMRIGHT", 0, -BAND)
	bar:SetHeight(HEADER_HEIGHT)

	self.importButton = F:CreateButton(bar, {
		text = L["Import"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:BeginImport()
		end,
	})
	self.importButton:SetPoint("RIGHT")

	-- The panel's own subtitle overlaps FenUI's tab bar, so the raid's name lives here.
	self.title = label(bar, "fontHeading", "textHeading")
	self.title:SetPoint("TOPLEFT")
	self.title:SetPoint("RIGHT", self.importButton, "LEFT", -BAND, 0)

	self.status = label(bar, "fontSmall", "textMuted")
	self.status:SetPoint("BOTTOMLEFT")
	self.status:SetPoint("RIGHT", self.importButton, "LEFT", -BAND, 0)

	local rule = divider(bar)
	rule:SetPoint("TOPLEFT", bar, "BOTTOMLEFT", 0, -GAP)
	rule:SetPoint("TOPRIGHT", bar, "BOTTOMRIGHT", 0, -GAP)
	self.header = bar
end

--------------------------------------------------------------------------------
-- Import: a paste area over the tabs' content
--------------------------------------------------------------------------------

function RaidWindow:BuildPaste(F, content)
	local paste = CreateFrame("Frame", nil, content)
	paste:SetAllPoints()
	paste:Hide()
	-- Actions at the bottom right, the one that moves forward last (and gold).
	local actions = F:CreateToolbar(paste, { height = TOOLBAR_HEIGHT, align = "right", gap = GAP })
	actions:SetPoint("BOTTOMLEFT")
	actions:SetPoint("BOTTOMRIGHT")
	actions:AddButton({
		text = L["Cancel"],
		width = BUTTON_WIDTH,
		onClick = function()
			self:CancelImport()
		end,
	})
	self.submitButton = actions:AddButton({
		text = L["Import"],
		width = BUTTON_WIDTH,
		variant = "primary",
		onClick = function()
			self:SubmitImport(self.pasteBox:GetText())
		end,
	})
	-- What to paste is said in the header, so the box gets the whole area.
	self.pasteBox = F:CreateMultiLineEditBox(paste, {})
	self.pasteBox:SetPoint("TOPLEFT")
	self.pasteBox:SetPoint("BOTTOMRIGHT", actions, "TOPRIGHT", 0, BAND)
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
	self:RefreshHeader()
	self.pasteBox:SelectAll()
end

function RaidWindow:CancelImport()
	self.importing = false
	self.confirmImport = false
	self.message = nil
	self:RefreshImporting()
	self:RefreshHeader()
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

--- The paste area replaces the pages while importing, and its own Import replaces the
--- header's (a second press of the header's would clear the paste).
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
-- Roster (by role) and Groups (as the import plans them)
--------------------------------------------------------------------------------

--- A list with one action above it: Invite missing (Roster) or Arrange groups (Groups).
function RaidWindow:BuildList(F, page, onAction)
	local bar = F:CreateToolbar(page, { height = TOOLBAR_HEIGHT, gap = GAP })
	bar:SetPoint("TOPLEFT")
	bar:SetPoint("TOPRIGHT")
	bar:Hide()
	page.actionButton = bar:AddButton({ text = "", width = WIDE_BUTTON_WIDTH, onClick = onAction })
	page.toolbar = bar

	local list = F:CreateVirtualList(page, { itemHeight = ROW_HEIGHT, renderItem = renderRow })
	list:SetPoint("TOPLEFT", bar, "BOTTOMLEFT", 0, -BAND)
	list:SetPoint("BOTTOMRIGHT")
	list:Hide()
	page.list = list
end

---@param button Button
---@param text string
---@param enabled boolean
---@param primary boolean
local function setAction(button, text, enabled, primary)
	button:SetText(text)
	button:SetEnabled(enabled)
	button.vintageEnabled = enabled
	button:SetVariant(primary and enabled and "primary" or nil)
end

--- Starts inviting or arranging, or stops the run that's going.
---@param kind string "invite" | "arrange"
function RaidWindow:ToggleRun(kind)
	if self.running then
		self:SetMessage(ns.Executor:Execute("raid-stop"))
	else
		self:SetMessage(ns.Executor:Execute(kind == "invite" and "raid-invite" or "raid-arrange"))
	end
	self:Refresh()
end

--- A row's Invite.
---@param name string|nil
function RaidWindow:InviteName(name)
	if not name then
		return
	end
	self:SetMessage(ns.Executor:Execute("raid-invite", { name = name }))
	self:Refresh()
end

--- A row's Whisper: opens the chat box; says so only when it can't.
---@param name string|nil
function RaidWindow:WhisperName(name)
	if not name then
		return
	end
	local result = ns.Executor:Execute("member-whisper", { name = name })
	if not result.success then
		self:SetMessage(result)
	end
end

---@param page Frame
---@param items table[]
local function showList(page, items)
	page.list:SetItems(items)
	page.list:SetShown(#items > 0)
	page.empty:SetShown(#items == 0)
end

---@param status table|nil raid-status's data
function RaidWindow:RefreshLists(status)
	local rows = status and status.rows or {}
	self.rosterItems = byRole(rows)
	-- The bench after the roles, the roles the raid is short of first (raid-status orders it).
	local bench = status and status.bench or {}
	if #bench > 0 then
		self.rosterItems[#self.rosterItems + 1] = header("standby", L["Standby"], bench)
		for _, row in ipairs(bench) do
			self.rosterItems[#self.rosterItems + 1] =
				person(row, ROLE_NAMES[row.role], false, BENCH_REASONS[row.reason])
		end
	end
	showList(self.pages.roster, self.rosterItems)

	self.groupItems = byGroup(rows)
	showList(self.pages.groups, self.groupItems)
	self.pages.groups.empty:SetSubtitle(
		status and L["This raid's import plans no groups."]
			or L["Import the guild's string to see the groups it plans."]
	)

	-- The actions above the lists: gold when there is work to do, "Stop" while it runs.
	local running = status and status.running or nil
	self.running = running
	local roster, groups = self.pages.roster, self.pages.groups
	roster.toolbar:SetShown(status ~= nil)
	groups.toolbar:SetShown(status ~= nil and #self.groupItems > 0)
	if not status then
		return
	end
	if running == "invite" then
		setAction(roster.actionButton, L["Stop inviting"], true, false)
	elseif status.toInvite > 0 then
		setAction(roster.actionButton, string.format(L["Invite missing (%d)"], status.toInvite), running == nil, true)
	else
		setAction(roster.actionButton, L["Invite missing"], false, false)
	end
	if running == "arrange" then
		setAction(groups.actionButton, L["Stop arranging"], true, false)
	elseif status.inRaid and status.misplaced > 0 then
		setAction(groups.actionButton, string.format(L["Arrange groups (%d)"], status.misplaced), running == nil, true)
	else
		setAction(groups.actionButton, L["Arrange groups"], false, false)
	end
end

--------------------------------------------------------------------------------
-- Loot: the import's plan, then the drops recorded so far
--------------------------------------------------------------------------------

function RaidWindow:BuildLoot(F, page)
	local plan = CreateFrame("Frame", nil, page)
	plan:SetPoint("TOPLEFT")
	plan:SetPoint("TOPRIGHT")
	plan:SetHeight(4 * ROW_HEIGHT)
	plan:Hide()
	-- A caption like the lists' section headers.
	local caption = label(plan, "fontCaption", "textHeading")
	caption:SetPoint("TOPLEFT", COLUMN.icon, -GAP)
	caption:SetText(string.upper(L["Loot plan"]))
	local captionRule = divider(plan)
	captionRule:SetPoint("TOPLEFT", COLUMN.icon, -(ROW_HEIGHT - 2))
	captionRule:SetPoint("TOPRIGHT", -GAP, -(ROW_HEIGHT - 2))
	-- Sets the game's loot method as the plan says; on the caption's line, like a section action.
	plan.modeButton = F:CreateButton(plan, {
		text = L["Set loot method"],
		width = WIDE_BUTTON_WIDTH,
		height = ROW_HEIGHT - 4,
		onClick = function()
			self:SetLootMode()
		end,
	})
	plan.modeButton:SetPoint("TOPRIGHT", -GAP, 0)
	plan.lines = {}
	for index = 1, 3 do
		local name = label(plan, "fontSmall", "textMuted")
		name:SetPoint("TOPLEFT", COLUMN.icon, -index * ROW_HEIGHT - 4)
		name:SetWidth(120)
		local value = label(plan, "fontBody", "textDefault")
		value:SetPoint("LEFT", name, "RIGHT", BAND, 0)
		plan.lines[index] = { name = name, value = value }
	end
	page.plan = plan

	local list = F:CreateVirtualList(page, { itemHeight = ROW_HEIGHT, renderItem = renderDrop })
	list:Hide()
	page.list = list
end

--- Sets the game's loot method as the import says. The first press asks (the button turns into
--- Confirm, in gold); the second sets it.
---@return table ActionResult
function RaidWindow:SetLootMode()
	local result = ns.Executor:Execute("loot-mode-set", { confirm = self.confirmLootMode == true })
	self.confirmLootMode = not result.success and result.error ~= nil and result.error.code == "CONFIRM_REQUIRED"
	local button = self.pages and self.pages.loot.plan.modeButton
	if button then
		button:SetText(self.confirmLootMode and L["Confirm"] or L["Set loot method"])
		button:SetVariant(self.confirmLootMode and "primary" or nil)
	end
	self:SetMessage(result)
	return result
end

--- The loot plan (with an import) and the drops under it.
---@param plan table|nil raid-status's loot { mode, threshold, prioritized }
---@param drops table[] loot-list's drops
function RaidWindow:RefreshLoot(plan, drops)
	local page = self.pages and self.pages.loot
	if not page then
		return
	end
	self.lootItems = lootItems(drops)
	page.list:ClearAllPoints()
	if plan then
		page.list:SetPoint("TOPLEFT", page.plan, "BOTTOMLEFT", 0, -BAND)
	else
		page.list:SetPoint("TOPLEFT")
	end
	page.list:SetPoint("BOTTOMRIGHT")
	showList(page, self.lootItems)
	self:RefreshLootPlan(plan)
end

---@param plan table|nil raid-status's loot { mode, threshold, prioritized }
function RaidWindow:RefreshLootPlan(plan)
	local page = self.pages and self.pages.loot
	if not page then
		return
	end
	page.plan:SetShown(plan ~= nil)
	page.plan.modeButton:SetText(self.confirmLootMode and L["Confirm"] or L["Set loot method"])
	page.plan.modeButton:SetVariant(self.confirmLootMode and "primary" or nil)
	self.lootPlan = nil
	if not plan then
		return
	end
	local values = {
		{ L["Loot method"], plan.mode == "master" and L["Master loot"] or L["Group loot"] },
		{
			L["Threshold"],
			QUALITY[plan.threshold] and string.format(L["%s or better"], QUALITY[plan.threshold]) or L["Not set"],
		},
		{
			L["Priority lists"],
			count(plan.prioritized, L["1 item"], L["%d items"]),
		},
	}
	for index, pair in ipairs(values) do
		page.plan.lines[index].name:SetText(pair[1])
		page.plan.lines[index].value:SetText(pair[2])
	end
	self.lootPlan = values
end

--------------------------------------------------------------------------------
-- Export: snapshots and the string for the website
--------------------------------------------------------------------------------

function RaidWindow:BuildExport(F, page)
	local bar = F:CreateToolbar(page, { height = TOOLBAR_HEIGHT, gap = GAP })
	bar:SetPoint("TOPLEFT")
	bar:SetPoint("TOPRIGHT")
	bar:AddButton({
		text = L["Take a snapshot"],
		width = WIDE_BUTTON_WIDTH,
		onClick = function()
			self:TakeSnapshot()
		end,
	})
	page.exportButton = bar:AddButton({
		text = L["Make export string"],
		width = WIDE_BUTTON_WIDTH,
		variant = "primary",
		onClick = function()
			self:MakeExport()
		end,
	})
	page.toolbar = bar

	-- What has been recorded, on the same line as the buttons that record it.
	page.summary = label(page, "fontSmall", "textMuted")
	page.summary:SetPoint("RIGHT", bar, "RIGHT", 0, 0)
	page.summary:SetJustifyH("RIGHT")

	page.exportBox = F:CreateMultiLineEditBox(page, {
		label = L["Copy this into the website's Check an export (Ctrl+C)"],
		readOnly = true,
	})
	page.exportBox:SetPoint("TOPLEFT", bar, "BOTTOMLEFT", 0, -(BAND + LABEL_HEIGHT))
	page.exportBox:SetPoint("TOPRIGHT", bar, "BOTTOMRIGHT", 0, -(BAND + LABEL_HEIGHT))
	page.exportBox:SetHeight(EXPORT_BOX_HEIGHT)
	page.exportBox:Hide()

	-- Who stood by: the import's bench, ticked unless the leader says otherwise; the export
	-- carries the ticked ones (raid-export's standby).
	page.standbyList = F:CreateVirtualList(page, {
		itemHeight = ROW_HEIGHT,
		renderItem = renderStandby,
		onSelect = function(_, item)
			if item.toggles then
				self:SetStandby(item.characterId, not item.stoodBy)
			end
		end,
	})
	page.standbyList:Hide()
end

--- Ticks or unticks someone on the bench as having stood by.
---@param characterId string
---@param stoodBy boolean
---@return table ActionResult
function RaidWindow:SetStandby(characterId, stoodBy)
	local result = ns.Executor:Execute("standby-set", { characterId = characterId, stoodBy = stoodBy })
	self:SetMessage(result)
	self:Refresh()
	return result
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
---@param status table|nil raid-status's data (its bench)
function RaidWindow:RefreshExport(summary, status)
	local page = self.pages and self.pages.export
	if not page then
		return
	end
	self.standbyItems = standbyItems(status and status.bench or {})
	page.standbyList:ClearAllPoints()
	if summary and summary.lastExport then
		page.standbyList:SetPoint("TOPLEFT", page.exportBox, "BOTTOMLEFT", 0, -BAND)
	else
		page.standbyList:SetPoint("TOPLEFT", page.toolbar, "BOTTOMLEFT", 0, -BAND)
	end
	page.standbyList:SetPoint("BOTTOMRIGHT")
	page.standbyList:SetItems(self.standbyItems)
	page.standbyList:SetShown(#self.standbyItems > 0)
	local snapshots = summary and summary.snapshots or 0
	local lastExport = summary and summary.lastExport
	local counts = {
		string.format(L["Snapshots: %d"], snapshots),
		string.format(L["Drops: %d"], summary and summary.loot or 0),
	}
	-- Boss attempts once there are any: the export carries them.
	if summary and summary.kills + summary.wipes > 0 then
		counts[#counts + 1] = string.format(L["Kills: %d"], summary.kills)
		counts[#counts + 1] = string.format(L["Wipes: %d"], summary.wipes)
	end
	page.summary:SetText(table.concat(counts, "  ·  "))
	page.summary:SetShown(snapshots > 0 or lastExport ~= nil)
	page.exportBox:SetText(lastExport or "")
	page.exportBox:SetShown(lastExport ~= nil)
	page.empty:SetShown(snapshots == 0 and lastExport == nil and #self.standbyItems == 0)
end

--------------------------------------------------------------------------------
-- Header text and refresh
--------------------------------------------------------------------------------

---@param key string
function RaidWindow:ShowPage(key)
	if not self.pages or not self.pages[key] then
		return
	end
	self.selected = key
	self:RefreshImporting()
end

--- Shows an action's result under the raid's name until the next one: its reasoning, or its
--- error and what to do about it.
---@param result table ActionResult
function RaidWindow:SetMessage(result)
	if result.success then
		self.message = result.reasoning
		self.messageIsError = false
	else
		local err = result.error or {}
		self.message = ns.Theme.JoinMessage(err.message or err.code, err.suggestion)
		self.messageIsError = true
	end
	self:RefreshHeader()
end

--- The header: the raid's name and a line about it, or the last action's message. Nothing
--- before a raid, since each tab's empty state says what to do.
function RaidWindow:RefreshHeader()
	if not self.title then
		return
	end
	self.title:SetText(self.raidTitle or "")
	self.status:SetText(self.message or self.raidLine or "")
	color(self.status, self.message and self.messageIsError and "feedbackError" or "textMuted")
	-- Gold for Import only while there is no raid: then it is the next step.
	self.importButton:SetVariant(self.raidTitle == nil and "primary" or nil)
end

---@param summary table|nil session-get's data
---@param status table|nil raid-status's data
function RaidWindow:DescribeRaid(summary, status)
	self.raidTitle, self.raidLine = nil, nil
	if not summary then
		return
	end
	if summary.title then
		local parts = {
			capitalize(summary.state),
			count(summary.roster, L["1 character"], L["%d characters"]),
		}
		if summary.kills + summary.wipes > 0 then
			parts[#parts + 1] = count(summary.kills, L["1 kill"], L["%d kills"])
				.. ", "
				.. count(summary.wipes, L["1 wipe"], L["%d wipes"])
		end
		if status then
			parts[#parts + 1] = string.format(L["%d in your group"], status.inGroup)
			local short = {}
			for _, role in ipairs(ROLE_ORDER) do
				local n = status.short and status.short[role]
				if n then
					short[#short + 1] = count(n, ROLE_COUNTS[role][1], ROLE_COUNTS[role][2])
				end
			end
			if #short > 0 then
				parts[#parts + 1] = string.format(L["Short %s"], table.concat(short, ", "))
			end
		end
		self.raidTitle, self.raidLine = summary.title, table.concat(parts, "  ·  ")
	elseif summary.snapshots > 0 then
		self.raidTitle = L["Raid without an import"]
		self.raidLine = capitalize(summary.state)
			.. "  ·  "
			.. count(summary.snapshots, L["1 snapshot"], L["%d snapshots"])
	end
end

--- Re-reads the session and the roster, and redraws everything.
function RaidWindow:Refresh()
	if not self.frame then
		return
	end
	local session = ns.Executor:Execute("session-get")
	local summary = session.success and session.data or nil
	local raid = ns.Executor:Execute("raid-status")
	local status = raid.success and raid.data or nil

	self:DescribeRaid(summary, status)
	if not session.success then
		self.raidLine = session.error and session.error.message or nil
	end
	self:RefreshHeader()
	self:RefreshLists(status)
	local loot = ns.Executor:Execute("loot-list")
	self:RefreshLoot(status and status.loot or nil, loot.success and loot.data.drops or {})
	self:RefreshExport(summary, status)
	self.importButton:SetText(status and L["Import again"] or L["Import"])
end

--- The line under the raid's name now.
---@return string
function RaidWindow:GetStatusText()
	return self.status and self.status:GetText() or ""
end

--- The raid's name in the header now.
---@return string
function RaidWindow:GetTitleText()
	return self.title and self.title:GetText() or ""
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
			self:Refresh()
		end
	end)
	self:Refresh()
end

function RaidWindow:Hide()
	if self.frame then
		self.frame:Hide()
	end
	-- A half-asked loot method change doesn't survive closing the window.
	self.confirmLootMode = false
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
