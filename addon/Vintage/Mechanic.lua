--------------------------------------------------------------------------------
-- Vintage: Mechanic integration (optional)
-- Registers with MechanicLib when !Mechanic is installed: in-game tests, the debug
-- console buffer, a tools panel, and settings. A no-op without Mechanic.
--------------------------------------------------------------------------------

local ADDON_NAME, ns = ...

local MechanicLib = LibStub("MechanicLib-1.0", true)
if not MechanicLib then
	return
end

local function Detail(label, value, passed)
	return { label = label, value = tostring(value), status = passed and "pass" or "fail" }
end

local tests = {
	{
		id = "core.session.empty",
		name = "An empty session summarizes as idle",
		category = "Core",
		run = function()
			local result = ns.Core.Session.Summary(ns.Core.Session.New())
			local passed = result.success and result.data.state == "idle"
			return passed, { Detail("state", result.data and result.data.state, passed) }
		end,
	},
	{
		id = "core.session.clear-confirm",
		name = "Clearing a session needs confirmation",
		category = "Core",
		run = function()
			local result = ns.Core.Actions.Session.Clear({ session = ns.Core.Session.New() })
			local code = result.error and result.error.code
			local passed = code == "CONFIRM_REQUIRED"
			return passed, { Detail("error", code, passed) }
		end,
	},
	{
		id = "bridge.client",
		name = "Running on a WoW: Forever client",
		category = "Bridge",
		run = function()
			local result = ns.Executor:Execute("client-info")
			local client = result.data or {}
			local passed = result.success and client.isForever == true
			return passed,
				{
					Detail("isForever", client.isForever, passed),
					Detail("interface", client.interface, true),
					Detail("projectId", client.projectId, true),
				}
		end,
	},
	{
		id = "bridge.saved-data",
		name = "Saved data is at the latest version",
		category = "Bridge",
		run = function()
			local details, passed = {}, true
			for _, scope in ipairs({ "global", "char", "profile" }) do
				local version = ns.db[scope].schemaVersion
				local ok = version == ns.Core.Migrations.Latest(scope)
				passed = passed and ok
				details[#details + 1] = Detail(scope, version, ok)
			end
			return passed, details
		end,
	},
	{
		id = "bridge.codec",
		name = "Bridge strings: decodes a website string and round-trips its own",
		category = "Bridge",
		run = function()
			-- libs/bridge-format/fixtures/raid-export-empty.v1.json, made by the website's codec
			local websiteMade = "!VIN:1!JX2ouIPKs(5fwQfvCM5NxqgONH6zWIsSKssnVusmVKtLRfLAffKFrLKAkowIgz9awxqtq5xuqoMArvMxqzwsQ5wmxoLDM5LYMkkXmtrxiY7uo5NFjCjuzmda"
			local decoded = ns.BridgeCodec:DecodeKind(websiteMade, "raid-export")
			local payload = {
				v = 1,
				kind = "raid-export",
				exportedAt = time(),
				addonVersion = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version"),
				exporter = "Mechanic",
				attendance = {},
				loot = { { itemId = 16800, looter = "Mechanic", at = time() } },
				items = {},
			}
			local encoded = ns.BridgeCodec:Encode(payload)
			local back = encoded.success and ns.BridgeCodec:Decode(encoded.data)
			local roundTrip = back and back.success and back.data.loot[1].itemId == 16800
			local passed = decoded.success and roundTrip == true
			return passed,
				{
					Detail("website string", decoded.success and "decoded" or decoded.error.code, decoded.success),
					Detail("round trip", roundTrip and "ok" or (encoded.error and encoded.error.code or "failed"), roundTrip),
				}
		end,
	},
	{
		id = "view.themes",
		name = "Vintage themes are registered with FenUI",
		category = "View",
		run = function()
			local dark, parchment = ns.Theme:Exists("VintageDark"), ns.Theme:Exists("VintageParchment")
			local passed = dark and parchment
			return passed, { Detail("VintageDark", dark, dark), Detail("VintageParchment", parchment, parchment) }
		end,
	},
}

local results = {}

local function Run(test)
	local started = debugprofilestop()
	local ok, passed, details = pcall(test.run)
	local result = {
		passed = ok and passed == true,
		duration = (debugprofilestop() - started) / 1000,
		timestamp = time(),
	}
	if ok then
		result.details = details
		result.message = result.passed and "Passed" or "Failed"
	else
		result.message = tostring(passed)
	end
	results[test.id] = result
	return result.passed
end

local function CreateToolButton(parent, x, y, width, text, onClick)
	local button = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
	button:SetPoint("TOPLEFT", parent, "TOPLEFT", x, y)
	button:SetSize(width, 24)
	button:SetText(text)
	button:SetScript("OnClick", onClick)
	return button
end

MechanicLib:Register(ADDON_NAME, {
	version = C_AddOns.GetAddOnMetadata(ADDON_NAME, "Version"),

	getDebugBuffer = function()
		return ns.debugBuffer
	end,
	clearDebugBuffer = function()
		wipe(ns.debugBuffer)
	end,

	tests = {
		getAll = function()
			local list = {}
			for _, test in ipairs(tests) do
				list[#list + 1] = { id = test.id, name = test.name, category = test.category }
			end
			return list
		end,
		getCategories = function()
			return { "Core", "Bridge", "View" }
		end,
		run = function(id)
			for _, test in ipairs(tests) do
				if test.id == id then
					return Run(test)
				end
			end
			return false
		end,
		runAll = function()
			local passed = 0
			for _, test in ipairs(tests) do
				if Run(test) then
					passed = passed + 1
				end
			end
			return passed, #tests
		end,
		getResult = function(id)
			return results[id]
		end,
		clearResults = function()
			wipe(results)
		end,
	},

	tools = {
		createPanel = function(container)
			local title = container:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
			title:SetPoint("TOPLEFT", 10, -10)
			title:SetText("Vintage")
			CreateToolButton(container, 10, -40, 140, "Toggle raid window", function()
				ns.RaidWindow:Toggle()
			end)
			CreateToolButton(container, 160, -40, 140, "Session status", function()
				ns.Vintage:PrintResult(ns.Executor:Execute("session-get"))
			end)
			CreateToolButton(container, 310, -40, 140, "Client info", function()
				ns.Vintage:PrintResult(ns.Executor:Execute("client-info"))
			end)
		end,
	},

	inspect = {
		getWatchFrames = function()
			local frames = {}
			if ns.RaidWindow.frame then
				frames[1] = { label = "Vintage raid window", frame = ns.RaidWindow.frame, property = "Visibility" }
			end
			return frames
		end,
	},

	-- Same shape as Weekly's (Mechanic calls get() and set(value)).
	settings = {
		debugMode = {
			type = "toggle",
			name = "Debug logging",
			get = function()
				return ns.db ~= nil and ns.db.profile.debug == true
			end,
			set = function(value)
				if ns.db then
					ns.db.profile.debug = value == true
				end
			end,
		},
	},
})
