--------------------------------------------------------------------------------
-- Vintage: addon lifecycle and slash commands
-- Every slash command is an Executor action plus a printed result, so the chat
-- surface and the window can't drift apart.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local Vintage = LibStub("AceAddon-3.0"):NewAddon(ADDON_NAME, "AceConsole-3.0")
local L = LibStub("AceLocale-3.0"):GetLocale(ADDON_NAME)

ns.Vintage = Vintage
ns.ICON = "Interface\\Icons\\INV_Misc_Head_Dragon_01"

local DEBUG_BUFFER_SIZE = 200
ns.debugBuffer = {}

--- A debug line for Mechanic's console, kept only while debug logging is on.
---@param message string
---@param category string|nil a MechanicLib.Categories value
function ns.Debug(message, category)
	if not (ns.db and ns.db.profile.debug) then
		return
	end
	local buffer = ns.debugBuffer
	buffer[#buffer + 1] = message
	if #buffer > DEBUG_BUFFER_SIZE then
		table.remove(buffer, 1)
	end
	local MechanicLib = LibStub("MechanicLib-1.0", true)
	if MechanicLib then
		MechanicLib:Log(ADDON_NAME, message, category or MechanicLib.Categories.CORE)
	end
end

--- Prints an ActionResult: its reasoning on success, message and suggestion on failure.
---@param result table ActionResult
function Vintage:PrintResult(result)
	if result.success then
		if result.reasoning then
			self:Print(result.reasoning)
		end
		return
	end
	local err = result.error or {}
	self:Print(L["Error"] .. ": " .. tostring(err.message or err.code))
	if err.suggestion then
		self:Print(err.suggestion)
	end
end

--------------------------------------------------------------------------------
-- Lifecycle
--------------------------------------------------------------------------------

function Vintage:OnInitialize()
	ns.Config:Initialize()
	ns.Options:Initialize()

	self:RegisterChatCommand("vintage", "SlashHandler")
	self:RegisterChatCommand("vin", "SlashHandler")
	self:RegisterCompartment()
end

function Vintage:OnEnable()
	if not ns.Context:IsForever() then
		self:Print(L["Vintage is built for WoW: Forever. Some features may not work on this client."])
	end
	-- At login, not ADDON_LOADED: every embedded FenUI copy resets its theme tables when it
	-- loads, and other addons that embed FenUI may load after Vintage.
	ns.Theme:Register()
	ns.MinimapButton:Initialize()
	-- Invite answers (declined, in another group) arrive as system messages.
	ns.Forming:Initialize()
	-- Loot, boss kills, and item data, recorded as they happen.
	ns.Items:Initialize()
	ns.Recorder:Initialize()
	-- The loot popup beside the game's loot window, for the master looter.
	ns.LootWindow:Initialize()
	ns.LootPopup:Initialize()
	ns.Debug("Enabled")
end

function Vintage:OnDisable()
	ns.Events:OffAll()
	ns.RaidWindow:Hide()
end

--- Blizzard's addon compartment (the addons drop-down by the minimap), when present.
function Vintage:RegisterCompartment()
	local compartment = rawget(_G, "AddonCompartmentFrame")
	if not (compartment and compartment.RegisterAddon) then
		return
	end
	compartment:RegisterAddon({
		text = ADDON_NAME,
		icon = ns.ICON,
		notCheckable = true,
		func = function()
			-- The callback's arguments differ between clients; ask for the button instead (Weekly).
			local clicked = rawget(_G, "GetMouseButtonClicked")
			if clicked and clicked() == "RightButton" then
				ns.Options:Open()
			else
				ns.RaidWindow:Toggle()
			end
		end,
		funcOnEnter = function(owner)
			GameTooltip:SetOwner(owner, "ANCHOR_RIGHT")
			ns.MinimapButton:FillTooltip(GameTooltip)
			GameTooltip:Show()
		end,
		funcOnLeave = function()
			GameTooltip:Hide()
		end,
	})
end

--------------------------------------------------------------------------------
-- Slash commands: /vintage and /vin
--------------------------------------------------------------------------------

local commands = {}

function commands.help(self)
	self:Print(L["Commands:"])
	self:Print("  /vintage - " .. L["Open or close the raid window"])
	self:Print("  /vintage status - " .. L["Show the current raid session"])
	self:Print("  /vintage clear - " .. L["Start an empty raid session (asks to confirm)"])
	self:Print("  /vintage settings - " .. L["Open settings"])
	self:Print("  /vintage debug - " .. L["Turn debug logging on or off"])
end

function commands.status(self)
	self:PrintResult(ns.Executor:Execute("session-get"))
end

function commands.clear(self, rest)
	self:PrintResult(ns.Executor:Execute("session-clear", { confirm = rest == "confirm" }))
end

function commands.settings()
	ns.Options:Open()
end

function commands.debug(self)
	local profile = ns.db.profile
	profile.debug = not profile.debug
	self:Print(profile.debug and L["Debug logging on"] or L["Debug logging off"])
end

commands["?"] = commands.help
commands.config = commands.settings
commands.options = commands.settings

function Vintage:SlashHandler(input)
	local command, rest = self:GetArgs(input or "", 2)
	command = command and command:lower() or ""
	if command == "" then
		ns.RaidWindow:Toggle()
		return
	end
	local handler = commands[command]
	if not handler then
		self:Print(string.format(L["Unknown command %q. Type /vintage help."], command))
		return
	end
	handler(self, rest and rest:lower() or nil)
end
