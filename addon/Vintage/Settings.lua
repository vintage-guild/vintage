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
					lootPopup = {
						type = "toggle",
						name = L["Loot popup"],
						desc = L["When you are the master looter, show who gets each item beside the loot window."],
						order = 2,
						width = "full",
						get = function()
							return ns.db.profile.lootPopup
						end,
						set = function(_, value)
							ns.db.profile.lootPopup = value
						end,
					},
					lootPopupThreshold = {
						type = "select",
						name = L["Loot popup quality"],
						desc = L["Items without a priority list show from this quality, unless the import sets one."],
						order = 3,
						values = {
							[2] = L["Uncommon"],
							[3] = L["Rare"],
							[4] = L["Epic"],
							[5] = L["Legendary"],
						},
						get = function()
							return ns.db.profile.lootPopupThreshold
						end,
						set = function(_, value)
							ns.db.profile.lootPopupThreshold = value
						end,
					},
					lootPopupPosition = {
						type = "execute",
						name = L["Reset loot popup position"],
						desc = L["Open the loot popup beside the loot window again, after dragging it."],
						order = 3.5,
						func = function()
							ns.LootPopup:ResetPosition()
						end,
					},
					debug = {
						type = "toggle",
						name = L["Debug logging"],
						desc = L["Send debug lines to Mechanic's console, when Mechanic is installed."],
						order = 4,
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
			about = self:BuildAbout(2),
			profiles = LibStub("AceDBOptions-3.0"):GetOptionsTable(ns.db),
		},
	}
end

-- The About tab: what the addon does for an officer through a raid night, and where each
-- thing lives. Keep it in step with the features: a PR that adds, moves, or renames a button
-- updates its line here (addon/Vintage/AGENTS.md).
local ABOUT = {
	{
		lines = {
			L["Vintage runs the guild's raid nights with vintageguild.gg: the website plans the raid, this addon forms it and records it, and the website gets the results back."],
		},
	},
	{
		header = L["Before the raid"],
		lines = {
			L["Import: paste the string the raid coordinator posts. The Import button is above every tab."],
			L["Roster tab: everyone by role, and whether each is in, invited, declined, offline, or in another group. Hover a row to Invite or Whisper."],
			L["Invite missing (Roster tab): invites the roster, tanks and healers first, and makes a raid as soon as two are in."],
			L["Standby (Roster tab): the bench and why each person is on it. Once the start time has passed, the header says what the raid is short."],
			L["Arrange groups (Groups tab): moves everyone into their planned group."],
		},
	},
	{
		header = L["During the raid"],
		lines = {
			L["Every boss attempt is recorded, kill or wipe, and attendance is taken at the first pull and at each kill. Nothing to press."],
			L["Loot tab: the drops at or above the loot threshold, who got each one, and from which boss."],
			L["Set loot method (Loot tab): master loot to you, with the import's threshold, after a confirm."],
			L["Loot popup: beside the loot window, who the guild's priority list says gets each item, and why. Give always asks first."],
		},
	},
	{
		header = L["After the raid"],
		lines = {
			L["Stood by (Export tab): everyone on the bench is ticked. Untick anyone who didn't stand by; standing by counts as full attendance."],
			L["Make export string (Export tab): copy it into the website's Check an export to record attendance, kills, and loot."],
		},
	},
	{
		header = L["What you need"],
		lines = {
			L["Raid leader or assistant to invite and arrange groups."],
			L["Raid leader to set the loot method, and master looter for the loot popup and Give."],
			L["The import string from vintageguild.gg: the raid, its roster, and its loot plan all come from it."],
		},
	},
	{
		header = L["More"],
		lines = {
			L["/vintage opens the raid window, /vintage help lists the commands, and the minimap button opens the window (left-click) or these settings (right-click)."],
			L["Problems or ideas: tell the officers in the guild Discord."],
		},
	},
}

---@param order number the tab's place among the settings tabs
function Options:BuildAbout(order)
	local args = {}
	local index = 0
	local function add(entry)
		index = index + 1
		entry.order = index
		args["line" .. index] = entry
	end
	for _, section in ipairs(ABOUT) do
		if section.header then
			add({ type = "header", name = section.header })
		end
		for _, line in ipairs(section.lines) do
			add({ type = "description", name = line .. "\n", fontSize = "medium", width = "full" })
		end
	end
	add({
		type = "description",
		name = function()
			return string.format(L["Version %s"], C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version") or "?")
		end,
		width = "full",
	})
	return { type = "group", name = L["About"], order = order, args = args }
end

function Options:Initialize()
	LibStub("AceConfig-3.0"):RegisterOptionsTable(ADDON_NAME, self:Build())
	local _, categoryId = LibStub("AceConfigDialog-3.0"):AddToBlizOptions(ADDON_NAME, ADDON_NAME)
	self.categoryId = categoryId
end

--- Opens Vintage's page in the game's settings, on one of its tabs ("about") when given.
--- The game blocks this in combat.
---@param tab string|nil
function Options:Open(tab)
	if InCombatLockdown() then
		ns.Vintage:Print(L["Settings can't open during combat."])
		return
	end
	if tab then
		LibStub("AceConfigDialog-3.0"):SelectGroup(ADDON_NAME, tab)
	end
	Settings.OpenToCategory(self.categoryId)
end

return Options
