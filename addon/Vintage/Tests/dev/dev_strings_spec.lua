-- Dev tools: /vintage dev export and import on the fake client, with the whole TOC loaded
-- (debug blocks included, as from a source checkout).
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")

local function start()
	local host = Host.New()
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	host:TakePrinted()
	-- AceGUI's multi-line box needs scroll-frame templates the fake client doesn't have.
	host.boxes = {}
	ns.DevStrings.OpenBox = function(title, text, onRead)
		host.boxes[#host.boxes + 1] = { title = title, text = text, onRead = onRead }
	end
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

--- Alone or in a party: the player plus these party units.
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

describe("/vintage dev export", function()
	it("encodes the raid as one manual snapshot the codec reads back", function()
		local host, ns = start()
		inRaid({
			{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
			{ name = "Doran-Stonemaul", group = 2, class = "ROGUE", online = nil },
			{ name = "Vyra-Area52", group = 2, class = "EVOKER", online = true },
		})
		local result = ns.DevStrings.Export()
		assert.is_true(result.success, result.error and result.error.message)
		assert.matches("^!VIN:1!", result.data)
		local decoded = ns.BridgeCodec:DecodeKind(result.data, "raid-export")
		assert.is_true(decoded.success)
		local snapshot = decoded.data.attendance[1]
		assert.are.equal("manual", snapshot.label)
		assert.are.same({
			{ name = "Aeryn", group = 1, class = "warrior", online = true },
			{ name = "Doran-Stonemaul", group = 2, class = "rogue", online = false },
			-- Forever has no Evokers: the class is left out, the person kept.
			{ name = "Vyra-Area52", group = 2, online = true },
		}, snapshot.members)
		assert.are.equal("Aeryn", decoded.data.exporter)
		assert.are.equal("0.1.0", decoded.data.addonVersion)
		assert.are.same({}, decoded.data.loot)
		assert.are.same({}, host.errors)
	end)

	it("reads a party, joining another realm to the name without its spaces", function()
		local _, ns = start()
		inParty({ { name = "Bramble", realm = "Area 52", class = "PRIEST", online = true } })
		local members, hidden = ns.DevStrings.ReadGroup()
		assert.are.equal(0, hidden)
		assert.are.same({
			{ name = "Aeryn", group = 1, class = "warrior", online = true },
			{ name = "Bramble-Area52", group = 1, class = "priest", online = true },
		}, members)
	end)

	it("counts members whose names the game kept secret, and leaves them out", function()
		local host, ns = start()
		inRaid({
			{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
			{ name = host:Secret(), group = 1, class = "MAGE", online = true },
		})
		local members, hidden = ns.DevStrings.ReadGroup()
		assert.are.equal(1, #members)
		assert.are.equal(1, hidden)
	end)

	it("runs from the slash command, says how many it took, and opens the copy box", function()
		local host = start()
		inParty({})
		host:Slash("/vintage dev export")
		assert.matches("Export of 1 people %(0 hidden by the game%)", host:TakePrinted())
		assert.are.equal(1, #host.boxes)
		assert.are.equal("Vintage raid export", host.boxes[1].title)
		assert.matches("^!VIN:1!", host.boxes[1].text)
		assert.is_nil(host.boxes[1].onRead)
		assert.are.same({}, host.errors)
	end)
end)

describe("/vintage dev import", function()
	it("describes an import and an export, and says why a string was refused", function()
		local _, ns = start()
		local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures
		local import = ns.DevStrings.Read(fixtures["raid-import.v1"].encoded)
		assert.is_true(import.success)
		assert.matches(
			"^Import for Molten Core — week 1: %d+ in the roster, %d+ groups, loot %a+%.$",
			import.reasoning
		)
		local export = ns.DevStrings.Read(fixtures["raid-export-night.v1"].encoded)
		assert.are.equal("Export by Aeryn: 3 snapshots, 3 people, 2 drops.", export.reasoning)
		local refused = ns.DevStrings.Read("great raid everyone")
		assert.is_false(refused.success)
		assert.are.equal("NOT_A_BRIDGE_STRING", refused.error.code)
	end)

	it("opens the paste box from the slash command, and help lists dev", function()
		local host = start()
		host:Slash("/vintage dev import")
		local box = host.boxes[1]
		assert.are.equal("Read a bridge string", box.title)
		assert.matches("^NOT_A_BRIDGE_STRING: ", box.onRead("hello"))
		local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures
		assert.matches("^Export by Aeryn", box.onRead(fixtures["raid-export-night.v1"].encoded))
		host:TakePrinted()
		assert.are.same({}, host.errors)
		host:Slash("/vintage dev")
		assert.matches("/vintage dev export", host:TakePrinted())
		host:Slash("/vintage help")
		assert.matches("/vintage dev %-", host:TakePrinted())
	end)
end)
