--------------------------------------------------------------------------------
-- Vintage View: the loot popup
-- Beside the game's loot window, for the master looter: each item the guild ranks
-- (or at the loot threshold), its candidates best first with the website's reason,
-- and Give. Give asks first: the button turns into Confirm and the question shows
-- below, and only the second press gives the item (plan D6). It renders what
-- loot-candidates returns and never computes. Preview (Mechanic's tool) shows
-- loot-preview's sample rows instead and only pretends to give.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

local LootPopup = {}
ns.LootPopup = LootPopup

local FRAME_NAME = "VintageLootPopup"
local WIDTH = 380
local MARGIN = 12
local GAP = 8
local ROW_HEIGHT = 24
local MAX_ROWS = 14
local ICON_SIZE = 18
local GIVE_WIDTH = 76
-- The panel's title bar, and the message line under the list.
local TITLE_HEIGHT = 32
local MESSAGE_HEIGHT = 32
-- Confirm sits where Give was, so a press this soon after Give is a double-click, not a choice.
LootPopup.CONFIRM_DELAY = 0.5

local function FenUI()
	return rawget(_G, "FenUI")
end

local function color(fontString, token)
	local r, g, b = FenUI():GetColor(token)
	fontString:SetTextColor(r, g, b)
end

local function label(parent, font, token)
	local fs = parent:CreateFontString(nil, "OVERLAY")
	fs:SetFontObject(FenUI():GetFont(font))
	fs:SetJustifyH("LEFT")
	fs:SetWordWrap(false)
	color(fs, token)
	return fs
end

--- The popup's rows: per item a header, then its candidates, or a note when nobody is ranked.
---@param slots table[] loot-candidates' slots
---@return table[]
local function rows(slots)
	local items = {}
	for _, slot in ipairs(slots) do
		local hex = ns.Theme:QualityHex(slot.quality)
		local name = slot.name or slot.link or "?"
		items[#items + 1] = {
			key = "slot:" .. slot.slot,
			isHeader = true,
			icon = slot.icon,
			text = hex and string.format("|cff%s%s|r", hex, name) or name,
		}
		for _, candidate in ipairs(slot.ranked) do
			items[#items + 1] = {
				key = "give:" .. slot.slot .. ":" .. candidate.characterId,
				slot = slot.slot,
				link = slot.link,
				itemName = name,
				candidateIndex = candidate.candidateIndex,
				candidateName = candidate.candidateName,
				name = candidate.name,
				text = string.format("%d. %s  —  %s", candidate.rank, candidate.name, candidate.reason),
				-- Someone the game won't let receive it from this corpse (left, or out of range).
				status = not candidate.candidateIndex and L["Not here"] or nil,
			}
		end
		if #slot.ranked == 0 then
			items[#items + 1] = {
				key = "none:" .. slot.slot,
				isNote = true,
				text = L["No priority list. Use the game's loot menu."],
			}
		end
	end
	return items
end

local function renderRow(row, item)
	if not row.vintage then
		row.vintage = true
		row.icon = row:CreateTexture(nil, "ARTWORK")
		row.icon:SetSize(ICON_SIZE, ICON_SIZE)
		row.icon:SetPoint("LEFT", 4, 0)
		row.label = label(row, "fontBody", "textDefault")
		row.status = label(row, "fontSmall", "textDisabled")
		row.status:SetPoint("RIGHT", -GAP, 0)
		row.status:SetJustifyH("RIGHT")
		row.give = FenUI():CreateButton(row, {
			text = L["Give"],
			width = GIVE_WIDTH,
			height = ROW_HEIGHT - 4,
			onClick = function()
				LootPopup:Give(row.itemData)
			end,
		})
		row.give:SetPoint("RIGHT", -GAP, 0)
	end
	row.bg:Hide()
	row.accent:Hide()
	row.text:Hide()
	row.hover:Hide()

	local isHeader, isNote = item.isHeader == true, item.isNote == true
	row.icon:SetShown(isHeader)
	row.label:ClearAllPoints()
	-- Candidates and the note sit indented under their item.
	row.label:SetPoint("LEFT", isHeader and (ICON_SIZE + GAP + 4) or 12, 0)
	row.label:SetPoint("RIGHT", -(GIVE_WIDTH + 2 * GAP), 0)
	row.label:SetText(item.text)
	row.label:SetFontObject(FenUI():GetFont(isNote and "fontSmall" or "fontBody"))
	color(row.label, isNote and "textMuted" or "textDefault")
	if isHeader then
		row.icon:SetTexture(item.icon or "Interface\\Icons\\INV_Misc_QuestionMark")
	end

	local canGive = not isHeader and not isNote and item.candidateIndex ~= nil
	row.give:SetShown(canGive)
	row.status:SetShown(not isHeader and not isNote and item.status ~= nil)
	row.status:SetText(item.status or "")
	if canGive then
		local armed = LootPopup.armed == item.key
		row.give:SetText(armed and L["Confirm"] or L["Give"])
		row.give:SetVariant(armed and "primary" or nil)
	end
end

--- Builds the popup on first use. Returns nil when FenUI did not load.
---@return table|nil frame
function LootPopup:Create()
	if self.frame then
		return self.frame
	end
	local F = FenUI()
	if not (F and F.CreatePanel) then
		return nil
	end
	ns.Theme:Ensure()
	local frame = F:CreatePanel(UIParent, {
		name = FRAME_NAME,
		title = L["Loot priority"],
		width = WIDTH,
		height = 200,
		theme = ns.Theme.DEFAULT,
		closable = true,
		movable = true,
		background = "surfacePanel",
		-- Dragged somewhere: it opens there from now on, not beside the loot window.
		onMoved = function()
			self:SavePosition()
		end,
	})
	frame:SetFrameStrata("HIGH")
	frame:Hide()
	-- Closing the popup ends a preview.
	frame:HookScript("OnHide", function()
		self.preview = false
		self.armed = nil
	end)

	local inner = CreateFrame("Frame", nil, frame:GetSafeZone())
	inner:SetPoint("TOPLEFT", MARGIN, 0)
	inner:SetPoint("BOTTOMRIGHT", -MARGIN, MARGIN)

	self.message = label(inner, "fontSmall", "textMuted")
	self.message:SetPoint("BOTTOMLEFT")
	self.message:SetPoint("BOTTOMRIGHT")
	self.message:SetWordWrap(true)

	self.list = F:CreateVirtualList(inner, { itemHeight = ROW_HEIGHT, renderItem = renderRow })
	self.list:SetPoint("TOPLEFT")
	self.list:SetPoint("BOTTOMRIGHT", 0, MESSAGE_HEIGHT)
	self.frame = frame
	return frame
end

--- Where the leader dragged it; else beside the game's loot window when it is there, else in the
--- middle of the screen.
function LootPopup:Place()
	local lootFrame = rawget(_G, "LootFrame")
	local saved = ns.db.profile.lootPopupPosition
	self.frame:ClearAllPoints()
	if saved then
		self.frame:SetPoint(saved.point, UIParent, saved.relativePoint, saved.x, saved.y)
	elseif lootFrame and lootFrame.IsShown and lootFrame:IsShown() then
		self.frame:SetPoint("TOPLEFT", lootFrame, "TOPRIGHT", GAP, 0)
	else
		self.frame:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
	end
end

function LootPopup:SavePosition()
	local point, _, relativePoint, x, y = self.frame:GetPoint(1)
	ns.db.profile.lootPopupPosition = { point = point, relativePoint = relativePoint, x = x, y = y }
end

--- Forgets a dragged position: the popup opens beside the loot window again.
function LootPopup:ResetPosition()
	ns.db.profile.lootPopupPosition = nil
	if self:IsShown() then
		self:Place()
	end
end

--- Reads the open loot window again and shows the popup when the master looter has something to
--- hand out; hides it otherwise. A real loot window ends a preview; without one, a preview
--- shows loot-preview's sample rows.
function LootPopup:Refresh()
	local result = ns.Executor:Execute("loot-candidates")
	local data = result.success and result.data or nil
	local real = data ~= nil and data.masterLooter and #data.slots > 0 and ns.db.profile.lootPopup
	if real then
		self.preview = false
	elseif self.preview then
		local preview = ns.Executor:Execute("loot-preview")
		data = preview.success and preview.data or nil
	else
		data = nil
	end
	if not (data and #data.slots > 0) then
		self.armed = nil
		self.items = nil
		if self.frame then
			self.frame:Hide()
		end
		return
	end
	if not self:Create() then
		return
	end
	self.frame:SetTitle(self.preview and L["Loot priority (preview)"] or L["Loot priority"])
	self.items = rows(data.slots)
	self.frame:SetHeight(TITLE_HEIGHT + math.min(#self.items, MAX_ROWS) * ROW_HEIGHT + MESSAGE_HEIGHT + MARGIN)
	if not self.frame:IsShown() then
		self.armed = nil
		self.message:SetText(self.preview and L["Preview: Give and Confirm work as usual, but nothing is given."] or "")
		color(self.message, "textMuted")
		self:Place()
		self.frame:Show()
	end
	-- After Show: FenUI's list sizes its rows from its own width, which is 0 while the popup is
	-- hidden. Once more next frame, when the new height has laid out.
	self.list:SetItems(self.items)
	C_Timer.After(0, function()
		if self:IsShown() then
			self.list:Refresh()
		end
	end)
end

--- Shows the popup with sample rows, for trying it without a master-loot corpse (Mechanic's
--- "Preview loot popup"). Give and Confirm behave as usual but never reach the game.
function LootPopup:Preview()
	self.preview = true
	self:Refresh()
end

--- A preview row's Give: asks, then on Confirm says what it would have given. Never calls
--- loot-give, so the game is never asked to hand anything out.
local function previewGive(self, item, confirming)
	if confirming then
		self.armed, self.armedAt, self.armedName = nil, nil, nil
		self.message:SetText(string.format(L["Preview: would give %s to %s"], item.itemName, item.name))
	else
		self.armed, self.armedAt, self.armedName = item.key, GetTime(), item.candidateName
		self.message:SetText(string.format(L["Preview: give %s to %s? Press Confirm."], item.itemName, item.name))
	end
	color(self.message, "textDefault")
	self.list:SetItems(self.items or {})
	return { success = confirming, preview = true }
end

--- A row's Give: the first press asks (loot-give without confirm checks the slot and the person,
--- and answers with the question); Confirm on the same row gives it, but not straight after
--- Give (a double-click). A refusal because the slot or person changed reads the window again.
---@param item table|nil a candidate row
---@return table|nil ActionResult
function LootPopup:Give(item)
	if not (item and item.candidateIndex) then
		return nil
	end
	-- Confirm counts only while the row still points at the name it asked about; if the game's
	-- candidate there changed, this press asks again.
	local confirming = self.armed == item.key and self.armedName == item.candidateName
	if confirming and GetTime() - (self.armedAt or 0) < LootPopup.CONFIRM_DELAY then
		return nil
	end
	if self.preview then
		return previewGive(self, item, confirming)
	end
	local result = ns.Executor:Execute("loot-give", {
		slot = item.slot,
		candidateIndex = item.candidateIndex,
		candidateName = item.candidateName,
		name = item.name,
		link = item.link,
		itemName = item.itemName,
		confirm = confirming,
	})
	local code = not result.success and result.error and result.error.code or nil
	local asking = code == "CONFIRM_REQUIRED"
	self.armed = asking and item.key or nil
	self.armedAt = asking and GetTime() or nil
	self.armedName = asking and item.candidateName or nil
	if result.success then
		self.message:SetText(result.reasoning or "")
		color(self.message, "textMuted")
	else
		local err = result.error or {}
		self.message:SetText(ns.Theme.JoinMessage(err.message or err.code, err.suggestion))
		color(self.message, asking and "textDefault" or "feedbackError")
	end
	if code == "SLOT_CHANGED" or code == "CANDIDATE_CHANGED" then
		self:Refresh()
	end
	if self.list then
		self.list:SetItems(self.items or {})
	end
	return result
end

---@return boolean
function LootPopup:IsShown()
	return self.frame ~= nil and self.frame:IsShown() == true
end

--- The question or result under the list now.
---@return string
function LootPopup:GetMessageText()
	return self.message and self.message:GetText() or ""
end

--- Listens for the loot window, and for the raid changing under an open popup (candidate
--- indexes move when someone leaves). Called once at login.
function LootPopup:Initialize()
	ns.Executor:Subscribe(function(name)
		if name == "loot-window" or name == "loot-give" or (name == "item-record" and self:IsShown()) then
			self:Refresh()
		end
	end)
	ns.Events:On("GROUP_ROSTER_UPDATE", "LootPopup", function()
		if self:IsShown() then
			self:Refresh()
		end
	end)
end

return LootPopup
