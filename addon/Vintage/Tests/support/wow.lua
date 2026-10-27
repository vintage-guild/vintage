-- A fake WoW: Forever client for busted: enough of the game API for the embedded libraries
-- and Vintage to load, run their lifecycle, take slash commands, and fire events. It models
-- no rendering, taint, or secure execution; check those in game.
--
--   local host = dofile("Tests/support/wow.lua").New()
--   dofile("Tests/support/load.lua").toc()
--   host:Login()
local Host = {}
Host.__index = Host

local function noop() end

--------------------------------------------------------------------------------
-- Frames, textures, and font strings
--------------------------------------------------------------------------------

local Region = {}

-- Widget methods start with a verb; fields such as frame.Center or frame.Text don't, and
-- libraries test those for nil, so only verb-led names fall back to a no-op.
local VERBS = {
	"Set", "Get", "Is", "Has", "Can", "Enable", "Disable", "Register", "Unregister", "Show", "Hide",
	"Clear", "Hook", "Raise", "Lower", "Start", "Stop", "Play", "Pause", "Finish", "Restart", "Cancel",
	"Add", "Remove", "Insert", "Update", "Lock", "Unlock", "Adjust", "Apply", "Reset", "Release",
	"Refresh", "Highlight", "Unhighlight", "Click", "Scroll", "Fade", "Flash", "Load", "Dock", "Undock",
}

local function IsMethodName(key)
	if type(key) ~= "string" then
		return false
	end
	for _, verb in ipairs(VERBS) do
		if key == verb or (key:sub(1, #verb) == verb and key:sub(#verb + 1, #verb + 1):match("%u")) then
			return true
		end
	end
	return false
end

local function NewRegion(host, objectType, name, parent)
	local region = {
		host = host,
		objectType = objectType,
		name = name,
		parent = parent,
		shown = true,
		points = {},
		scripts = {},
		events = {},
		width = 0,
		height = 0,
		alpha = 1,
		level = 1,
		strata = "MEDIUM",
	}
	-- Get...Texture and Get...FontString return a child region (made on first use); other
	-- unknown widget methods are no-ops; unknown fields stay nil.
	setmetatable(region, {
		__index = function(_, key)
			local method = Region[key]
			if method then
				return method
			end
			if not IsMethodName(key) then
				return nil
			end
			local kind = key:match("^Get%a*(Texture)$") or key:match("^Get%a*(FontString)$")
			if kind then
				return function(self)
					self.children = self.children or {}
					self.children[key] = self.children[key] or NewRegion(self.host, kind, nil, self)
					return self.children[key]
				end
			end
			return noop
		end,
	})
	host.regions[#host.regions + 1] = region
	if name then
		_G[name] = region
	end
	return region
end

function Region:GetObjectType()
	return self.objectType
end
function Region:IsObjectType(kind)
	return self.objectType == kind or kind == "Region" or (kind == "Frame" and self.objectType == "Button")
end
function Region:GetName()
	return self.name
end
function Region:GetDebugName()
	return self.name or self.objectType
end
function Region:GetParent()
	return self.parent
end
function Region:SetParent(parent)
	self.parent = parent
end

function Region:Show()
	self.shown = true
	local onShow = self.scripts.OnShow
	if onShow then
		onShow(self)
	end
end
function Region:Hide()
	local wasShown = self.shown
	self.shown = false
	local onHide = self.scripts.OnHide
	if wasShown and onHide then
		onHide(self)
	end
end
function Region:SetShown(shown)
	if shown then
		self:Show()
	else
		self:Hide()
	end
end
function Region:IsShown()
	return self.shown
end
function Region:IsVisible()
	local region = self
	while region do
		if not region.shown then
			return false
		end
		region = region.parent
	end
	return true
end

function Region:SetSize(width, height)
	self.width, self.height = width or 0, height or 0
end
function Region:SetWidth(width)
	self.width = width or 0
end
function Region:SetHeight(height)
	self.height = height or 0
end
function Region:GetWidth()
	return self.width
end
function Region:GetHeight()
	return self.height
end
function Region:GetSize()
	return self.width, self.height
end
function Region:GetScale()
	return 1
end
function Region:GetEffectiveScale()
	return 1
end
function Region:GetAlpha()
	return self.alpha
end
function Region:SetAlpha(alpha)
	self.alpha = alpha
end
function Region:GetFrameLevel()
	return self.level
end
function Region:SetFrameLevel(level)
	self.level = level
end
function Region:GetFrameStrata()
	return self.strata
end
function Region:SetFrameStrata(strata)
	self.strata = strata
end
function Region:GetLeft()
	return 0
end
Region.GetRight = Region.GetLeft
Region.GetTop = Region.GetLeft
Region.GetBottom = Region.GetLeft
function Region:GetCenter()
	return 0, 0
end
function Region:GetRect()
	return 0, 0, self.width, self.height
end
function Region:IsMouseOver()
	return false
end
function Region:GetID()
	return self.id or 0
end
function Region:SetID(id)
	self.id = id
end

function Region:SetPoint(point, relativeTo, relativePoint, x, y)
	if type(relativeTo) == "number" then
		relativeTo, relativePoint, x, y = nil, nil, relativeTo, relativePoint
	end
	self.points[#self.points + 1] = { point, relativeTo, relativePoint or point, x or 0, y or 0 }
end
function Region:SetAllPoints(relativeTo)
	self:ClearAllPoints()
	self:SetPoint("TOPLEFT", relativeTo)
	self:SetPoint("BOTTOMRIGHT", relativeTo)
end
function Region:ClearAllPoints()
	self.points = {}
end
function Region:GetNumPoints()
	return #self.points
end
function Region:GetPoint(index)
	local p = self.points[index or 1]
	if p then
		return p[1], p[2], p[3], p[4], p[5]
	end
end

function Region:SetScript(name, fn)
	self.scripts[name] = fn
end
function Region:GetScript(name)
	return self.scripts[name]
end
function Region:HasScript()
	return true
end
function Region:HookScript(name, fn)
	local previous = self.scripts[name]
	self.scripts[name] = function(...)
		if previous then
			previous(...)
		end
		fn(...)
	end
end

function Region:RegisterEvent(event)
	self.events[event] = true
	return true
end
Region.RegisterUnitEvent = Region.RegisterEvent
function Region:UnregisterEvent(event)
	self.events[event] = nil
end
function Region:UnregisterAllEvents()
	self.events = {}
end
function Region:IsEventRegistered(event)
	return self.events[event] == true
end
function Region:RegisterAllEvents()
	self.allEvents = true
end

function Region:SetText(text)
	self.text = text
end
function Region:GetText()
	return self.text
end
function Region:SetFormattedText(pattern, ...)
	self.text = string.format(pattern, ...)
end
function Region:GetStringWidth()
	return self.text and #tostring(self.text) * 6 or 0
end
function Region:GetStringHeight()
	return 12
end
function Region:GetFont()
	return self.fontFile or "Fonts\\FRIZQT__.TTF", self.fontSize or 12, self.fontFlags or ""
end
function Region:SetFont(file, size, flags)
	self.fontFile, self.fontSize, self.fontFlags = file, size, flags
	return true
end
function Region:GetTextColor()
	return 1, 1, 1, 1
end
function Region:GetVertexColor()
	return 1, 1, 1, 1
end

function Region:CreateTexture(name)
	return NewRegion(self.host, "Texture", name, self)
end
function Region:CreateMaskTexture(name)
	return NewRegion(self.host, "MaskTexture", name, self)
end
function Region:CreateLine(name)
	return NewRegion(self.host, "Line", name, self)
end
function Region:CreateFontString(name)
	return NewRegion(self.host, "FontString", name, self)
end
function Region:CreateAnimationGroup(name)
	return NewRegion(self.host, "AnimationGroup", name, self)
end
function Region:CreateAnimation(kind, name)
	return NewRegion(self.host, kind or "Animation", name, self)
end
function Region:GetChildren() end
function Region:GetRegions() end

--------------------------------------------------------------------------------
-- The host
--------------------------------------------------------------------------------

local function copyMixins(object, ...)
	for i = 1, select("#", ...) do
		local mixin = select(i, ...)
		if mixin then
			for key, value in pairs(mixin) do
				object[key] = value
			end
		end
	end
	return object
end

local function split(delimiter, text, pieces)
	local results, start = {}, 1
	while true do
		if pieces and #results == pieces - 1 then
			results[#results + 1] = text:sub(start)
			break
		end
		local first, last = text:find(delimiter, start, true)
		if not first then
			results[#results + 1] = text:sub(start)
			break
		end
		results[#results + 1] = text:sub(start, first - 1)
		start = last + 1
	end
	return unpack(results)
end

local function trim(text)
	return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

local SECRET = {}

-- Lua 5.1's xpcall takes no arguments for the function; the game's does, and AceAddon relies
-- on it to pass `self` to OnInitialize. Wrap the stock one once, whatever runs the specs.
local nativeXpcall = xpcall
local function ForwardingXpcall(fn, handler, ...)
	local args, count = { ... }, select("#", ...)
	return nativeXpcall(function()
		return fn(unpack(args, 1, count))
	end, handler)
end

--- A fresh client: installs the game API into _G.
---@param options table|nil { realm, player, interface, projectId, foreverConstant }
function Host.New(options)
	options = options or {}
	local host = setmetatable({
		regions = {},
		timers = {},
		printed = {},
		errors = {},
		openedCategories = {},
		compartment = {},
		clock = 1793050000,
		uptime = 1000,
		combat = false,
		loggedIn = false,
	}, Host)
	host:Install(options)
	return host
end

-- Globals a fresh client doesn't have yet: libraries and saved variables from an earlier
-- client in the same spec file.
local LIBRARY_GLOBALS = { "LibStub", "FenUI", "FenCore", "FenUIDB", "VintageDB", "MechanicDB" }

function Host:Install(options)
	local host = self
	local G = _G

	for _, name in ipairs(LIBRARY_GLOBALS) do
		G[name] = nil
	end

	-- Build and client identity (Forever 1.60.1 by default)
	local interface = options.interface or 16001
	G.GetBuildInfo = function()
		return options.version or "1.60.1", "70532", "Oct 1 2026", interface
	end
	G.WOW_PROJECT_ID = options.projectId or 18
	G.WOW_PROJECT_CAMELOT = options.foreverConstant ~= false and 18 or nil
	G.GetLocale = function()
		return "enUS"
	end
	G.GetCurrentRegion = function()
		return 1
	end
	G.GetCurrentRegionName = function()
		return "US"
	end

	-- Player
	G.UnitName = function()
		return options.player or "Aeryn", nil
	end
	G.GetRealmName = function()
		return options.realm or "Stonemaul"
	end
	G.GetNormalizedRealmName = G.GetRealmName
	G.UnitClass = function()
		return "Warrior", "WARRIOR", 1
	end
	G.UnitRace = function()
		return "Human", "Human", 1
	end
	G.UnitFactionGroup = function()
		return "Alliance", "Alliance"
	end
	G.UnitGUID = function()
		return "Player-1-00000001"
	end

	-- Time
	G.GetTime = function()
		return host.uptime
	end
	G.time = function()
		return host.clock
	end
	G.date = os.date
	G.GetServerTime = G.time
	G.debugprofilestop = function()
		return os.clock() * 1000
	end
	G.C_Timer = {
		After = function(delay, callback)
			host.timers[#host.timers + 1] = { delay = delay, callback = callback }
		end,
		NewTimer = function(delay, callback)
			local timer = { delay = delay, callback = callback }
			timer.Cancel = function()
				timer.cancelled = true
			end
			timer.IsCancelled = function()
				return timer.cancelled == true
			end
			host.timers[#host.timers + 1] = timer
			return timer
		end,
	}
	G.C_Timer.NewTicker = G.C_Timer.NewTimer

	-- State
	G.InCombatLockdown = function()
		return host.combat
	end
	G.IsLoggedIn = function()
		return host.loggedIn
	end
	G.issecretvalue = function(value)
		return type(value) == "table" and getmetatable(value) == SECRET
	end

	-- Addons
	G.C_AddOns = {
		GetAddOnMetadata = function(name, field)
			if name ~= "Vintage" then
				return nil
			end
			local file = io.open("Vintage.toc", "r")
			local toc = file:read("*a")
			file:close()
			return toc:match("## " .. field .. ":%s*([^\r\n]+)")
		end,
		IsAddOnLoaded = function(name)
			return name == "Vintage"
		end,
	}
	G.AddonCompartmentFrame = {
		RegisterAddon = function(_, info)
			host.compartment[#host.compartment + 1] = info
		end,
	}
	G.GetMouseButtonClicked = function()
		return host.mouseButton or "LeftButton"
	end

	-- Errors and secure execution
	G.xpcall = ForwardingXpcall
	G.geterrorhandler = function()
		return function(err)
			host.errors[#host.errors + 1] = tostring(err)
		end
	end
	G.seterrorhandler = noop
	G.securecallfunction = function(fn, ...)
		return fn(...)
	end
	G.securecall = function(fn, ...)
		if type(fn) == "string" then
			fn = G[fn]
		end
		return fn(...)
	end
	G.issecurevariable = function()
		return true
	end
	G.hooksecurefunc = function(target, name, hook)
		if type(target) == "string" then
			target, name, hook = G, target, name
		end
		local original = target[name]
		target[name] = function(...)
			local results = { original(...) }
			hook(...)
			return unpack(results)
		end
	end
	G.debugstack = function()
		return "Interface/AddOns/Vintage/Libs/FenUI/Core/FenUI.lua:1: in main chunk"
	end

	-- WoW's string and table helpers
	G.wipe = function(t)
		for key in pairs(t) do
			t[key] = nil
		end
		return t
	end
	string.trim = trim
	string.split = function(text, delimiter, pieces)
		return split(delimiter, text, pieces)
	end
	G.strtrim = trim
	G.strsplit = split
	G.strjoin = function(delimiter, ...)
		return table.concat({ ... }, delimiter)
	end
	G.strmatch, G.strfind, G.strsub, G.strlen = string.match, string.find, string.sub, string.len
	G.strlower, G.strupper, G.strrep, G.strbyte = string.lower, string.upper, string.rep, string.byte
	G.format, G.gsub, G.gmatch = string.format, string.gsub, string.gmatch
	G.tinsert, G.tremove, G.tconcat, G.sort = table.insert, table.remove, table.concat, table.sort
	G.floor, G.ceil, G.abs, G.min, G.max, G.sqrt = math.floor, math.ceil, math.abs, math.min, math.max, math.sqrt
	G.random, G.mod = math.random, math.fmod
	G.tContains = function(t, value)
		for _, v in pairs(t) do
			if v == value then
				return true
			end
		end
		return false
	end
	G.CopyTable = function(t)
		local copy = {}
		for key, value in pairs(t) do
			copy[key] = type(value) == "table" and G.CopyTable(value) or value
		end
		return copy
	end
	G.Mixin = copyMixins
	G.CreateFromMixins = function(...)
		return copyMixins({}, ...)
	end

	-- Frames and UI objects
	G.CreateFrame = function(objectType, name, parent)
		return NewRegion(host, objectType or "Frame", name, parent)
	end
	G.CreateFont = function(name)
		return NewRegion(host, "Font", name)
	end
	G.UIParent = NewRegion(host, "Frame", "UIParent")
	G.WorldFrame = NewRegion(host, "Frame", "WorldFrame")
	G.Minimap = NewRegion(host, "Frame", "Minimap")
	G.GameTooltip = NewRegion(host, "GameTooltip", "GameTooltip")
	G.DEFAULT_CHAT_FRAME = NewRegion(host, "ScrollingMessageFrame", "DEFAULT_CHAT_FRAME")
	G.DEFAULT_CHAT_FRAME.AddMessage = function(_, text)
		host.printed[#host.printed + 1] = tostring(text)
	end
	G.print = function(...)
		local parts = {}
		for i = 1, select("#", ...) do
			parts[i] = tostring((select(i, ...)))
		end
		host.printed[#host.printed + 1] = table.concat(parts, " ")
	end
	G.GetScreenWidth = function()
		return 1920
	end
	G.GetScreenHeight = function()
		return 1080
	end
	G.GetCVar = noop
	G.GetCVarBool = function()
		return false
	end
	G.UISpecialFrames = {}
	G.SlashCmdList = {}
	G.hash_SlashCmdList = {}
	G.STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
	for _, font in ipairs({ "GameFontNormal", "GameFontHighlight", "GameFontNormalSmall", "GameFontHighlightSmall", "GameFontNormalLarge", "GameFontDisable" }) do
		G[font] = NewRegion(host, "Font", font)
	end

	-- Settings (Blizzard's 10.0+ panel)
	G.Settings = {
		RegisterCanvasLayoutCategory = function(_, name)
			local category = { ID = name, name = name }
			category.GetID = function()
				return category.ID
			end
			return category
		end,
		RegisterAddOnCategory = noop,
		GetCategory = function(id)
			return { ID = id }
		end,
		OpenToCategory = function(id)
			host.openedCategories[#host.openedCategories + 1] = id
		end,
	}
end

--------------------------------------------------------------------------------
-- Driving the client
--------------------------------------------------------------------------------

--- An opaque secret value, as Midnight's rules return during encounters.
function Host:Secret()
	return setmetatable({}, SECRET)
end

--- Fires an event at every frame registered for it.
function Host:Fire(event, ...)
	for _, region in ipairs(self.regions) do
		if region.events[event] or region.allEvents then
			local onEvent = region.scripts.OnEvent
			if onEvent then
				onEvent(region, event, ...)
			end
		end
	end
end

--- Runs every queued timer, including ones queued while running.
function Host:RunTimers()
	local guard = 0
	while #self.timers > 0 do
		guard = guard + 1
		assert(guard < 1000, "timers keep re-queuing")
		local timer = table.remove(self.timers, 1)
		if not timer.cancelled then
			timer.callback(timer)
		end
	end
end

--- ADDON_LOADED, then login and entering the world, as the client does.
function Host:Login(addonName)
	self:Fire("ADDON_LOADED", addonName or "Vintage")
	self.loggedIn = true
	self:Fire("PLAYER_LOGIN")
	self:Fire("PLAYER_ENTERING_WORLD", true, false)
	self:RunTimers()
end

--- Runs a slash command the way the chat box does: "/vintage status".
function Host:Slash(line)
	local command, rest = line:match("^(/%S+)%s*(.-)$")
	command = command:lower()
	for key, handler in pairs(SlashCmdList) do
		local i = 1
		while _G["SLASH_" .. key .. i] do
			if _G["SLASH_" .. key .. i]:lower() == command then
				handler(rest)
				return true
			end
			i = i + 1
		end
	end
	return false
end

--- Everything printed to chat since the last call, joined by newlines.
function Host:TakePrinted()
	local text = table.concat(self.printed, "\n")
	self.printed = {}
	return text
end

return Host
