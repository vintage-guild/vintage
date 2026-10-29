-- Import and export from the raid window, on the fake client with the whole TOC: the group the
-- game reports, the executor saving each step, and what the Roster and Export tabs show.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded

--- List text without its inline color escapes.
local function plain(text)
	return (text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

--- A list's items as plain text, headers marked with "#".
local function lines(items)
	local out = {}
	for index, item in ipairs(items) do
		out[index] = (item.isHeader and "# " or "") .. plain(item.text)
	end
	return out
end

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
			"Snapshot 1: 1 person (1 hidden by the game)",
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
		window.importButton.hooks.onClick()
		assert.is_true(window.paste:IsShown())
		assert.is_false(window.pages.roster.list:IsShown())
		-- Only the paste area's own Import shows, so a press can't clear the paste.
		assert.is_false(window.importButton:IsShown())

		local result = window:SubmitImport(IMPORT)
		assert.is_true(result.success)
		assert.is_false(window.paste:IsShown())
		assert.is_true(window.importButton:IsShown())
		assert.is_true(window.pages.roster.list:IsShown())
		assert.is_false(window.pages.roster.empty:IsShown())
		assert.are.equal("Imported Molten Core — week 1: 5 characters", window:GetStatusText())
		-- By role, each with how many are in your group; names in class colors.
		assert.are.same({
			"# Tanks  ·  1 of 1 in your group",
			"Aeryn  ·  Warrior tank  ·  group 1  ·  in your group",
			"# Healers  ·  0 of 2 in your group",
			"Brann  ·  Priest healer  ·  group 1  ·  not in your group",
			"Élowen  ·  Druid healer  ·  group 2  ·  not in your group",
			"# Melee  ·  1 of 1 in your group",
			"Doran-Stonemaul  ·  Rogue melee  ·  group 1  ·  in your group",
			"# Ranged  ·  0 of 1 in your group",
			"Cyra  ·  Mage ranged  ·  group 2  ·  not in your group",
		}, lines(window.rosterItems))
		assert.matches("^|cffc69b6dAeryn|r", window.rosterItems[2].text)
		assert.are.equal("Import again", window.importButton:GetText())
		assert.are.same({}, host.errors)
	end)

	it("says why a pasted string was refused, and keeps the paste area open", function()
		window:BeginImport()
		window:SubmitImport("great raid everyone")
		assert.is_true(window.paste:IsShown())
		assert.matches("^The string does not start with !VIN:%. ", window:GetStatusText())
	end)

	it("asks before replacing a raid, then replaces it on the second press", function()
		window:SubmitImport(IMPORT)
		window:BeginImport()
		local asked = window:SubmitImport(IMPORT)
		assert.are.equal("CONFIRM_REQUIRED", asked.error.code)
		assert.are.equal("Replace the raid", window.submitButton:GetText())
		assert.matches("^Importing replaces", window:GetStatusText())
		assert.is_true(window:SubmitImport(IMPORT).success)
		assert.are.equal("Import", window.submitButton:GetText())
	end)

	it("cancels without importing", function()
		window:BeginImport()
		window:CancelImport()
		assert.is_false(window.paste:IsShown())
		assert.is_true(window.pages.roster.empty:IsShown())
		assert.are.equal("idle", ns.db.char.session.state)
	end)

	it("updates who is in the group when the group changes", function()
		window:SubmitImport(IMPORT)
		inParty({ { name = "Brann", class = "PRIEST", online = true } })
		host:Fire("GROUP_ROSTER_UPDATE")
		assert.are.equal("Brann  ·  Priest healer  ·  group 1  ·  in your group", plain(window.rosterItems[4].text))
	end)

	it("opens the paste area from any tab, says what to paste, and lands on the roster", function()
		window.tabs:Select("loot")
		window.importButton.hooks.onClick()
		assert.is_true(window.paste:IsShown())
		assert.is_false(window.pages.loot:IsShown())
		assert.are.equal(
			"Paste the guild's import string (it starts with !VIN:), then press Import.",
			window:GetStatusText()
		)
		window:SubmitImport(IMPORT)
		assert.are.equal("roster", window.selected)
		assert.is_true(window.pages.roster:IsShown())
	end)

	it("puts the paste away when another tab is picked", function()
		window:BeginImport()
		window.tabs:Select("export")
		assert.is_false(window.paste:IsShown())
		assert.is_true(window.pages.export:IsShown())
		assert.are.equal("", window:GetStatusText())
	end)
end)

describe("The Groups and Loot tabs", function()
	local ns, window

	before_each(function()
		_, ns = start()
		inParty({ { name = "Doran", realm = "Stonemaul", class = "ROGUE", online = true } })
		window = ns.RaidWindow
		window:Show()
	end)

	it("say what an import would show before there is one", function()
		assert.is_true(window.pages.groups.empty:IsShown())
		assert.are.equal(
			"Import the guild's string to see the groups it plans.",
			window.pages.groups.empty.subtitleText:GetText()
		)
		assert.are.equal("Drops are recorded here during the raid.", window.pages.loot.empty.subtitleText:GetText())
	end)

	it("show the groups the import plans, and its loot plan", function()
		window:SubmitImport(IMPORT)
		assert.is_true(window.pages.groups.list:IsShown())
		assert.are.same({
			"# Group 1  ·  2 of 3 in your group",
			"Aeryn  ·  Warrior tank  ·  in your group",
			"Brann  ·  Priest healer  ·  not in your group",
			"Doran-Stonemaul  ·  Rogue melee  ·  in your group",
			"# Group 2  ·  0 of 2 in your group",
			"Cyra  ·  Mage ranged  ·  not in your group",
			"Élowen  ·  Druid healer  ·  not in your group",
		}, lines(window.groupItems))
		assert.are.equal("Master loot  ·  epic or better  ·  2 items with a priority list", window.lootPlanText)
		assert.are.equal(
			"Master loot  ·  epic or better  ·  2 items with a priority list\nDrops are recorded here during the raid.",
			window.pages.loot.empty.subtitleText:GetText()
		)
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
		assert.are.equal("Snapshot 1: 1 person", window:GetStatusText())
		assert.are.equal("Snapshots: 1  ·  Drops: 0", window.pages.export.summary:GetText())
		assert.is_false(window.pages.export.empty:IsShown())

		local result = window:MakeExport()
		assert.is_true(result.success)
		local box = window.pages.export.exportBox
		assert.is_true(box:IsShown())
		assert.are.equal(result.data.exportString, box:GetText())
		assert.matches("^!VIN:1!", box:GetText())
		assert.matches("^Exported 1 snapshot and 0 drops", window:GetStatusText())
		assert.are.same({}, host.errors)
	end)

	it("shows the last export again when the window reopens", function()
		window:TakeSnapshot()
		local made = window:MakeExport().data.exportString
		window:Hide()
		window:Show()
		assert.are.equal(made, window.pages.export.exportBox:GetText())
		assert.are.equal("Raid without an import: exported, 1 snapshot", window:GetStatusText())
	end)

	it("hides an export once a later snapshot makes it out of date", function()
		window:TakeSnapshot()
		window:MakeExport()
		window:TakeSnapshot()
		assert.is_false(window.pages.export.exportBox:IsShown())
		assert.are.equal("Snapshots: 2  ·  Drops: 0", window.pages.export.summary:GetText())
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
