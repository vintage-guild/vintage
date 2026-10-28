-- Import and export from the raid window, on the fake client with the whole TOC: the group the
-- game reports, the executor saving each step, and what the Roster and Export tabs show.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded

local function start()
	local host = Host.New()
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	host:TakePrinted()
	return host, ns
end

--- A raid of the given members, as GetRaidRosterInfo reports them.
---@param roster table[] { name, group, class, online }
local function inRaid(roster)
	_G.IsInRaid = function()
		return true
	end
	_G.GetNumGroupMembers = function()
		return #roster
	end
	_G.GetRaidRosterInfo = function(index)
		local m = roster[index]
		return m.name, 0, m.group, 60, m.class, m.class, "Molten Core", m.online
	end
end

--- The player (Aeryn) plus these party units.
---@param party table[] { name, realm, class, online }
local function inParty(party)
	_G.IsInRaid = function()
		return false
	end
	_G.GetNumSubgroupMembers = function()
		return #party
	end
	local player = { name = "Aeryn", class = "WARRIOR", online = true }
	local function unitOf(unit)
		if unit == "player" then
			return player
		end
		return party[tonumber(unit:match("^party(%d+)$"))]
	end
	_G.UnitName = function(unit)
		local m = unitOf(unit)
		return m.name, m.realm
	end
	_G.UnitClass = function(unit)
		local m = unitOf(unit)
		return m.class, m.class
	end
	_G.UnitIsConnected = function(unit)
		return unitOf(unit).online
	end
end

describe("Context:BuildGroupSnapshot", function()
	it("reads the raid roster: realm names as given, classes as the game names them", function()
		local _, ns = start()
		inRaid({
			{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
			{ name = "Doran-Stonemaul", group = 2, class = "ROGUE", online = nil },
			{ name = "Vyra-Area52", group = 2, class = "EVOKER", online = true },
		})
		local members, hidden = ns.Context:BuildGroupSnapshot()
		assert.are.equal(0, hidden)
		assert.are.same({
			{ name = "Aeryn", group = 1, class = "warrior", online = true },
			{ name = "Doran-Stonemaul", group = 2, class = "rogue", online = false },
			{ name = "Vyra-Area52", group = 2, class = "evoker", online = true },
		}, members)
	end)

	it("reads a party, joining another realm to the name without its spaces", function()
		local _, ns = start()
		inParty({ { name = "Brann", realm = "Area 52", class = "PRIEST", online = true } })
		local members = ns.Context:BuildGroupSnapshot()
		assert.are.same({
			{ name = "Aeryn", group = 1, class = "warrior", online = true },
			{ name = "Brann-Area52", group = 1, class = "priest", online = true },
		}, members)
	end)

	it("counts members whose names the game kept secret, and leaves them out", function()
		local host, ns = start()
		inRaid({
			{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
			{ name = host:Secret(), group = 1, class = "MAGE", online = true },
		})
		local members, hidden = ns.Context:BuildGroupSnapshot()
		assert.are.equal(1, #members)
		assert.are.equal(1, hidden)
	end)

	it("counts a member the client hasn't loaded yet (Unknown) instead of listing them", function()
		local _, ns = start()
		_G.UNKNOWNOBJECT = "Unknown"
		inParty({ { name = "Unknown", class = "PRIEST", online = true } })
		local members, hidden = ns.Context:BuildGroupSnapshot()
		assert.are.same({ "Aeryn" }, { members[1].name, members[2] and members[2].name })
		assert.are.equal(1, hidden)
	end)
end)

describe("The raid actions through the executor", function()
	it("imports, snapshots, and exports, saving the session at each step", function()
		local _, ns = start()
		inParty({ { name = "Brann", class = "PRIEST", online = true } })
		local imported = ns.Executor:Execute("raid-import", { text = IMPORT })
		assert.is_true(imported.success)
		assert.are.equal("imported", ns.db.char.session.state)

		local status = ns.Executor:Execute("raid-status")
		assert.are.equal("Molten Core — week 1: 2 of 5 in the group", status.reasoning)

		local snapshot = ns.Executor:Execute("attendance-snapshot")
		assert.are.equal("Snapshot 1: 2 people", snapshot.reasoning)
		assert.are.equal(1, #ns.db.char.session.attendance)

		local exported = ns.Executor:Execute("raid-export")
		assert.is_true(exported.success)
		assert.are.equal("exported", ns.db.char.session.state)
		local decoded = ns.BridgeCodec:DecodeKind(exported.data.exportString, "raid-export")
		assert.are.equal("evt_mc_0001", decoded.data.eventId)
		assert.are.equal("Aeryn", decoded.data.exporter)
		assert.are.equal("0.1.0", decoded.data.addonVersion)
	end)

	it("says how many the game hid when it takes a snapshot", function()
		local host, ns = start()
		inRaid({
			{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
			{ name = host:Secret(), group = 1, class = "MAGE", online = true },
		})
		assert.are.equal(
			"Snapshot 1: 1 people (1 hidden by the game)",
			ns.Executor:Execute("attendance-snapshot").reasoning
		)
	end)
end)

describe("The Roster tab", function()
	local host, ns, window

	before_each(function()
		host, ns = start()
		inParty({ { name = "Doran", realm = "Stonemaul", class = "ROGUE", online = true } })
		window = ns.RaidWindow
		window:Show()
	end)

	it("imports a pasted string and lists who is in the group", function()
		window.pages.roster.importButton.hooks.onClick()
		assert.is_true(window.pages.roster.paste:IsShown())
		assert.is_false(window.pages.roster.list:IsShown())
		-- Only the paste area's own Import shows, so a press can't clear the paste.
		assert.is_false(window.pages.roster.importButton:IsShown())

		local result = window:SubmitImport(IMPORT)
		assert.is_true(result.success)
		assert.is_false(window.pages.roster.paste:IsShown())
		assert.is_true(window.pages.roster.importButton:IsShown())
		assert.is_true(window.pages.roster.list:IsShown())
		assert.is_false(window.pages.roster.empty:IsShown())
		assert.are.equal("Imported Molten Core — week 1: 5 characters", window:GetStatusText())
		assert.are.equal("Aeryn  ·  Warrior tank  ·  group 1  ·  in your group", window.rosterItems[1].text)
		assert.are.equal("Brann  ·  Priest healer  ·  group 1  ·  not in your group", window.rosterItems[2].text)
		assert.matches("Doran%-Stonemaul.*in your group$", window.rosterItems[4].text)
		assert.are.equal("Import again", window.pages.roster.importButton:GetText())
		assert.are.same({}, host.errors)
	end)

	it("says why a pasted string was refused, and keeps the paste area open", function()
		window:BeginImport()
		window:SubmitImport("great raid everyone")
		assert.is_true(window.pages.roster.paste:IsShown())
		assert.matches("^The string does not start with !VIN:%. ", window:GetStatusText())
	end)

	it("asks before replacing a raid, then replaces it on the second press", function()
		window:SubmitImport(IMPORT)
		window:BeginImport()
		local asked = window:SubmitImport(IMPORT)
		assert.are.equal("CONFIRM_REQUIRED", asked.error.code)
		assert.are.equal("Replace the raid", window.pages.roster.submitButton:GetText())
		assert.matches("^Importing replaces", window:GetStatusText())
		assert.is_true(window:SubmitImport(IMPORT).success)
		assert.are.equal("Import", window.pages.roster.submitButton:GetText())
	end)

	it("cancels without importing", function()
		window:BeginImport()
		window:CancelImport()
		assert.is_false(window.pages.roster.paste:IsShown())
		assert.is_true(window.pages.roster.empty:IsShown())
		assert.are.equal("idle", ns.db.char.session.state)
	end)

	it("updates who is in the group when the group changes", function()
		window:SubmitImport(IMPORT)
		inParty({ { name = "Brann", class = "PRIEST", online = true } })
		host:Fire("GROUP_ROSTER_UPDATE")
		assert.are.equal("Brann  ·  Priest healer  ·  group 1  ·  in your group", window.rosterItems[2].text)
	end)
end)

describe("The Export tab", function()
	local host, ns, window

	before_each(function()
		host, ns = start()
		inParty({})
		window = ns.RaidWindow
		window:Show()
		window.tabs.config.onChange("export")
	end)

	it("asks for a snapshot before it makes a string", function()
		assert.is_true(window.pages.export.empty:IsShown())
		local result = window:MakeExport()
		assert.are.equal("NOTHING_TO_EXPORT", result.error.code)
		assert.are.equal("No attendance recorded yet. Take a snapshot first", window:GetStatusText())
		assert.is_false(window.pages.export.exportBox:IsShown())
	end)

	it("takes a snapshot, then shows the export string ready to copy", function()
		window:TakeSnapshot()
		assert.are.equal("Snapshot 1: 1 people", window:GetStatusText())
		assert.are.equal("1 snapshots, 0 drops recorded", window.pages.export.summary:GetText())
		assert.is_false(window.pages.export.empty:IsShown())

		local result = window:MakeExport()
		assert.is_true(result.success)
		local box = window.pages.export.exportBox
		assert.is_true(box:IsShown())
		assert.are.equal(result.data.exportString, box:GetText())
		assert.matches("^!VIN:1!", box:GetText())
		assert.matches("^Exported 1 snapshots and 0 drops", window:GetStatusText())
		assert.are.same({}, host.errors)
	end)

	it("shows the last export again when the window reopens", function()
		window:TakeSnapshot()
		local made = window:MakeExport().data.exportString
		window:Hide()
		window:Show()
		assert.are.equal(made, window.pages.export.exportBox:GetText())
		assert.are.equal("Raid without an import: exported, 1 snapshots", window:GetStatusText())
	end)

	it("hides an export once a later snapshot makes it out of date", function()
		window:TakeSnapshot()
		window:MakeExport()
		window:TakeSnapshot()
		assert.is_false(window.pages.export.exportBox:IsShown())
		assert.are.equal("2 snapshots, 0 drops recorded", window.pages.export.summary:GetText())
		assert.is_nil(ns.db.char.session.lastExport)
	end)
end)

describe("The Export tab after a reload", function()
	it("shows the export the saved session kept", function()
		local host = Host.New()
		local session = {
			schemaVersion = 1,
			state = "exported",
			attendance = { { at = 1, label = "manual", members = {} } },
			loot = {},
			itemsSeen = {},
			lastExport = "!VIN:1!saved",
			lastExportAt = 1,
		}
		_G.VintageDB = { char = { ["Aeryn - Stonemaul"] = { schemaVersion = 1, session = session } } }
		local ns = Load.toc()
		host:Login()
		ns.RaidWindow:Show()
		assert.are.equal("!VIN:1!saved", ns.RaidWindow.pages.export.exportBox:GetText())
		assert.is_true(ns.RaidWindow.pages.export.exportBox:IsShown())
	end)
end)
