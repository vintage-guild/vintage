-- The whole addon on the fake client: every TOC file with the real embedded libraries,
-- AceAddon's initialize/enable, saved data, slash commands, the window, and Mechanic.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")

local CHAR_KEY = "Aeryn - Stonemaul"

--- A fresh client with Vintage loaded and logged in.
---@param options table|nil { saved, host, mechanic }
local function start(options)
	options = options or {}
	local host = Host.New(options.host)
	_G.VintageDB = options.saved
	if options.mechanic then
		dofile("Libs/LibStub/LibStub.lua")
		local MechanicLib = LibStub:NewLibrary("MechanicLib-1.0", 1)
		MechanicLib.Categories = { CORE = "[Core]" }
		MechanicLib.logs = {}
		MechanicLib.registered = {}
		function MechanicLib:Register(name, capabilities)
			self.registered[name] = capabilities
		end
		function MechanicLib:Log(name, message)
			self.logs[#self.logs + 1] = name .. ": " .. message
		end
	end
	local ns, loaded = Load.toc()
	host:Login()
	return host, ns, loaded
end

describe("Vintage on the client", function()
	it("loads every TOC file and its libraries without errors", function()
		local host, ns, loaded = start()
		assert.are.same({}, host.errors)
		assert.truthy(#loaded > 50, "libraries and addon files")
		for _, module in ipairs({
			"Core",
			"Executor",
			"Context",
			"Events",
			"Config",
			"Options",
			"RaidWindow",
			"MinimapButton",
			"Theme",
		}) do
			assert.is_not_nil(ns[module], module)
		end
		assert.is_true(LibStub("AceAddon-3.0"):GetAddon("Vintage"):IsEnabled())
	end)

	it("creates saved data at the latest version for every scope", function()
		local _, ns = start()
		for _, scope in ipairs({ "global", "char", "profile" }) do
			assert.are.equal(ns.Core.Migrations.Latest(scope), ns.db[scope].schemaVersion, scope)
		end
		assert.are.equal("idle", ns.db.char.session.state)
		assert.are.same({}, ns.db.global.items)
		assert.is_false(ns.db.profile.debug)
	end)

	it("migrates a character saved before schema versions", function()
		local _, ns = start({ saved = { char = { [CHAR_KEY] = { note = "old" } } } })
		assert.are.equal(1, ns.db.char.schemaVersion)
		assert.are.equal("old", ns.db.char.note)
		assert.are.equal("idle", ns.db.char.session.state)
	end)

	it("keeps the raid session across a reload", function()
		local session =
			{ schemaVersion = 1, state = "live", attendance = {}, loot = { { itemId = 16800 } }, itemsSeen = {} }
		local _, ns = start({ saved = { char = { [CHAR_KEY] = { schemaVersion = 1, session = session } } } })
		assert.are.equal("live", ns.db.char.session.state)
		assert.are.equal(1, #ns.db.char.session.loot)
	end)

	it("says so when saved data comes from a newer Vintage", function()
		local host = start({ saved = { char = { [CHAR_KEY] = { schemaVersion = 42 } } } })
		assert.matches("version 42", host:TakePrinted())
	end)

	it("registers its FenUI themes without switching FenUI's global theme", function()
		local _, ns = start()
		assert.is_true(ns.Theme:Exists("VintageDark"))
		assert.is_true(ns.Theme:Exists("VintageParchment"))
		assert.are.same({ 0.063, 0.059, 0.082, 1 }, FenUI.Tokens.colors.vintageDarkSurfaceCanvas)
		assert.is_true(FenUI:GetGlobalTheme() ~= "VintageDark")
	end)

	it("adds a settings page, a compartment entry, and a minimap button", function()
		local host, ns = start()
		assert.is_not_nil(ns.Options.categoryId)
		assert.are.equal("Vintage", host.compartment[1].text)
		assert.is_true(LibStub("LibDBIcon-1.0"):IsRegistered("Vintage"))
	end)

	it("warns on a client that is not WoW: Forever", function()
		local host = start({ host = { projectId = 1 } })
		assert.matches("built for WoW: Forever", host:TakePrinted())
	end)
end)

describe("Slash commands", function()
	local host, ns

	before_each(function()
		host, ns = start()
		host:TakePrinted()
	end)

	it("/vintage status reports the session", function()
		assert.is_true(host:Slash("/vintage status"))
		assert.matches("No raid imported", host:TakePrinted())
	end)

	it("/vin help lists the commands", function()
		assert.is_true(host:Slash("/vin help"))
		local printed = host:TakePrinted()
		assert.matches("/vintage status", printed)
		assert.matches("/vintage clear", printed)
	end)

	it("/vintage clear asks for confirmation before clearing", function()
		ns.db.char.session.state = "live"
		host:Slash("/vintage clear")
		assert.matches("/vintage clear confirm", host:TakePrinted())
		assert.are.equal("live", ns.db.char.session.state)

		host:Slash("/vintage clear confirm")
		assert.matches("Started an empty raid session", host:TakePrinted())
		assert.are.equal("idle", ns.db.char.session.state)
	end)

	it("/vintage debug flips debug logging", function()
		host:Slash("/vintage debug")
		assert.is_true(ns.db.profile.debug)
		assert.matches("on", host:TakePrinted())
		host:Slash("/vintage debug")
		assert.is_false(ns.db.profile.debug)
	end)

	it("/vintage settings opens the page, except in combat", function()
		host:Slash("/vintage settings")
		assert.are.same({ ns.Options.categoryId }, host.openedCategories)
		host.combat = true
		host:Slash("/vintage config")
		assert.are.equal(1, #host.openedCategories)
		assert.matches("combat", host:TakePrinted())
	end)

	it("names an unknown command", function()
		host:Slash("/vintage dance")
		assert.matches('"dance"', host:TakePrinted())
	end)
end)

describe("The raid window", function()
	local host, ns

	before_each(function()
		host, ns = start()
	end)

	it("/vintage opens and closes it", function()
		assert.is_false(ns.RaidWindow:IsShown())
		host:Slash("/vintage")
		assert.is_true(ns.RaidWindow:IsShown())
		host:Slash("/vintage")
		assert.is_false(ns.RaidWindow:IsShown())
		assert.are.same({}, host.errors)
	end)

	it("closes with Escape and shows the roster tab first", function()
		ns.RaidWindow:Show()
		assert.are.same({ "VintageRaidWindow" }, UISpecialFrames)
		assert.are.equal("roster", ns.RaidWindow.selected)
		assert.is_true(ns.RaidWindow.pages.roster:IsShown())
		assert.is_false(ns.RaidWindow.pages.loot:IsShown())
	end)

	it("follows the session after an action", function()
		ns.RaidWindow:Show()
		ns.db.char.session.state = "live"
		ns.Executor:Execute("session-clear", { confirm = true })
		assert.are.equal("No raid imported", ns.RaidWindow:GetStatusText())
		-- The panel subtitle overlaps FenUI's tab bar, so the window keeps it empty.
		assert.are.equal("", ns.RaidWindow.frame:GetSubtitle())
	end)

	it("reads the session once each time it opens", function()
		local executed = {}
		local execute = ns.Executor.Execute
		ns.Executor.Execute = function(self, name, params)
			executed[#executed + 1] = name
			return execute(self, name, params)
		end
		ns.RaidWindow:Show()
		assert.are.same({ "session-get", "raid-status" }, executed)
		ns.Executor:Execute("session-clear", { confirm = true })
		assert.are.same({ "session-get", "raid-status", "session-clear", "session-get", "raid-status" }, executed)
	end)

	it("registers its themes again when a FenUI copy that loaded later wiped them", function()
		-- Another addon's embedded FenUI loading after Vintage resets FenUI's tables.
		dofile("Libs/FenUI/Core/ThemeManager.lua")
		assert.is_false(ns.Theme:Exists("VintageDark"))
		ns.RaidWindow:Show()
		assert.is_true(ns.Theme:Exists("VintageDark"))
		assert.are.same({}, host.errors)
	end)

	it("keeps its position in the profile", function()
		ns.RaidWindow:Show()
		ns.db.profile.window.point, ns.db.profile.window.x, ns.db.profile.window.y = "TOPLEFT", 40, -60
		ns.RaidWindow:RestorePosition()
		local point, _, _, x, y = ns.RaidWindow.frame:GetPoint(1)
		assert.are.same({ "TOPLEFT", 40, -60 }, { point, x, y })
	end)
end)

describe("Mechanic", function()
	it("registers tests that pass on a Forever client", function()
		local _, ns = start({ mechanic = true })
		local MechanicLib = LibStub("MechanicLib-1.0")
		local capabilities = MechanicLib.registered.Vintage
		assert.is_not_nil(capabilities)
		assert.are.equal("0.1.0", capabilities.version)

		local passed, total = capabilities.tests.runAll()
		for _, test in ipairs(capabilities.tests.getAll()) do
			local result = capabilities.tests.getResult(test.id)
			assert.is_true(result.passed, test.id .. ": " .. tostring(result.message))
		end
		assert.are.equal(total, passed)
		assert.truthy(total >= 6)
		assert.is_not_nil(ns)
	end)

	it("logs debug lines only while debug logging is on", function()
		local _, ns = start({ mechanic = true })
		local MechanicLib = LibStub("MechanicLib-1.0")
		local before = #MechanicLib.logs
		ns.Debug("quiet")
		assert.are.equal(before, #MechanicLib.logs)
		ns.db.profile.debug = true
		ns.Debug("loud")
		assert.are.equal("Vintage: loud", MechanicLib.logs[#MechanicLib.logs])
		assert.are.equal("loud", ns.debugBuffer[#ns.debugBuffer])
	end)
end)
