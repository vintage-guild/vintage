--------------------------------------------------------------------------------
-- Vintage Dev: bridge strings by hand
-- For trying the addon before its Import and Export tabs exist, and on clients
-- other than Forever (retail, before Forever's servers open). Loads only from a
-- source checkout: the TOC lists it in a debug block, which the packager strips.
--   /vintage dev export   a raid-export of the group as it is now, ready to copy
--   /vintage dev import   paste any bridge string and see what it decodes to
-- Dev-only, so it reads the group itself instead of through Bridge/Context; the
-- real snapshot arrives with attendance (PR5).
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)
local Schema = ns.Core.BridgeFormat.Schema
local Secrets = ns.Secrets

local DevStrings = {}
ns.DevStrings = DevStrings

local FOREVER_CLASS = {}
for _, class in ipairs(Schema.CLASSES) do
	FOREVER_CLASS[class] = true
end

--- "Name", or "Name-Realm" for another realm, as the export carries names (realm spaces
--- dropped, as the raid roster shows them).
---@param name any
---@param realm any
---@return string|nil
function DevStrings.FullName(name, realm)
	if type(name) ~= "string" or name == "" then
		return nil
	end
	if type(realm) == "string" and realm ~= "" then
		return name .. "-" .. (realm:gsub("%s", ""))
	end
	return name
end

--- One group member as the export schema takes it, or nil when the game hid their name.
--- A class Forever doesn't have (a retail Evoker) is left out rather than refused.
---@param fields table { name, realm, group, class, online }
---@return table|nil
function DevStrings.Member(fields)
	local name = DevStrings.FullName(Secrets.Public(fields.name), Secrets.Public(fields.realm))
	if not name then
		return nil
	end
	local member = { name = name, group = fields.group or 1, online = Secrets.Public(fields.online) == true }
	local class = Secrets.Public(fields.class)
	if type(class) == "string" and FOREVER_CLASS[class:lower()] then
		member.class = class:lower()
	end
	return member
end

--- A raid-export payload with one snapshot (label "manual") of these members and no loot.
---@param members table[]
---@param now number unix seconds
---@param exporter string
---@param addonVersion string
---@return table
function DevStrings.BuildExport(members, now, exporter, addonVersion)
	return {
		v = Schema.VERSION,
		kind = "raid-export",
		exportedAt = now,
		addonVersion = addonVersion,
		exporter = exporter,
		attendance = { { at = now, label = "manual", members = members } },
		loot = {},
		items = {},
	}
end

--- The group now: the raid roster in a raid, else you and your party (all in group 1).
---@return table[] members, number hidden how many the game didn't name
function DevStrings.ReadGroup()
	local members, hidden = {}, 0
	local function add(fields)
		local member = DevStrings.Member(fields)
		if member then
			members[#members + 1] = member
		else
			hidden = hidden + 1
		end
	end
	if IsInRaid() then
		for index = 1, GetNumGroupMembers() do
			-- Already "Name-Realm" for another realm.
			local name, _, subgroup, _, _, classFile, _, online = GetRaidRosterInfo(index)
			add({ name = name, group = subgroup, class = classFile, online = online })
		end
		return members, hidden
	end
	local units = { "player" }
	for index = 1, GetNumSubgroupMembers() do
		units[#units + 1] = "party" .. index
	end
	for _, unit in ipairs(units) do
		local name, realm = UnitName(unit)
		local _, classFile = UnitClass(unit)
		add({ name = name, realm = realm, group = 1, class = classFile, online = UnitIsConnected(unit) })
	end
	return members, hidden
end

--- The group as an export string.
---@return table ActionResult with the string as data
function DevStrings.Export()
	local members, hidden = DevStrings.ReadGroup()
	local exporter = DevStrings.FullName(Secrets.Public((UnitName("player")))) or "Unknown"
	local version = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version") or "0.0.0"
	local encoded = ns.BridgeCodec:Encode(DevStrings.BuildExport(members, time(), exporter, version))
	if encoded.success then
		encoded.reasoning =
			string.format(L["Export of %d people (%d hidden by the game). Copy it with Ctrl+C."], #members, hidden)
	end
	return encoded
end

--- What a decoded payload holds, in one line.
---@param payload table a payload that passed its schema
---@return string
function DevStrings.Describe(payload)
	if payload.kind == "raid-import" then
		return string.format(
			L["Import for %s: %d in the roster, %d groups, loot %s."],
			payload.raid.title,
			#payload.roster,
			#payload.groups,
			payload.loot.mode
		)
	end
	if payload.kind == "raid-export" then
		local people, count = {}, 0
		for _, snapshot in ipairs(payload.attendance) do
			for _, member in ipairs(snapshot.members) do
				if not people[member.name] then
					people[member.name] = true
					count = count + 1
				end
			end
		end
		return string.format(
			L["Export by %s: %d snapshots, %d people, %d drops."],
			payload.exporter,
			#payload.attendance,
			count,
			#payload.loot
		)
	end
	return string.format(L["A %s string."], tostring(payload.kind))
end

--- A pasted string, decoded and described.
---@param text string
---@return table ActionResult with the payload as data
function DevStrings.Read(text)
	local decoded = ns.BridgeCodec:Decode(text)
	if decoded.success then
		decoded.reasoning = DevStrings.Describe(decoded.data)
	end
	return decoded
end

--------------------------------------------------------------------------------
-- The box: AceGUI, since this never ships
--------------------------------------------------------------------------------

local box

--- An AceGUI window around a multi-line edit box. With onRead, its button reads the text and
--- the window's status line shows what onRead returns. A field so specs can stand in for it:
--- the fake client has no scroll-frame templates.
---@param title string
---@param text string|nil selected for copying
---@param onRead function|nil
function DevStrings.OpenBox(title, text, onRead)
	local AceGUI = LibStub("AceGUI-3.0")
	if box then
		AceGUI:Release(box)
		box = nil
	end
	local frame = AceGUI:Create("Frame")
	frame:SetTitle(title)
	frame:SetLayout("Fill")
	frame:SetWidth(560)
	frame:SetHeight(340)
	frame:SetCallback("OnClose", function(widget)
		AceGUI:Release(widget)
		box = nil
	end)
	local edit = AceGUI:Create("MultiLineEditBox")
	edit:SetLabel(onRead and L["Paste a bridge string (it starts with !VIN:)"] or L["Bridge string"])
	edit:SetText(text or "")
	if onRead then
		edit:SetButtonText(L["Read"])
		edit:SetCallback("OnEnterPressed", function(_, _, value)
			frame:SetStatusText(onRead(value))
		end)
	else
		edit:DisableButton(true)
	end
	frame:AddChild(edit)
	edit:SetFocus()
	if text then
		edit:HighlightText()
	end
	box = frame
end

--------------------------------------------------------------------------------
-- /vintage dev
--------------------------------------------------------------------------------

ns.SlashCommands.dev = function(addon, rest)
	if rest == "export" then
		local result = DevStrings.Export()
		addon:PrintResult(result)
		if result.success then
			DevStrings.OpenBox(L["Vintage raid export"], result.data)
		end
	elseif rest == "import" then
		DevStrings.OpenBox(L["Read a bridge string"], nil, function(text)
			local result = DevStrings.Read(text)
			addon:PrintResult(result)
			if result.success then
				return result.reasoning
			end
			return string.format("%s: %s", result.error.code, tostring(result.error.message))
		end)
	else
		addon:Print("  /vintage dev export - " .. L["Encode the group as a raid export to copy"])
		addon:Print("  /vintage dev import - " .. L["Paste a bridge string and see what it holds"])
	end
end

return DevStrings
