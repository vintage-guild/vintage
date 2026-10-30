-- Recording the raid on the fake client with the whole TOC: loot messages, item data that loads
-- late, boss kills, the start snapshot, the Loot tab, and an export that carries all of it.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded
local BOOTS = "|cffa335ee|Hitem:16800::::::::60:::::|h[Arcanist Boots]|h|r"
local TOME = "|cff0070dd|Hitem:17000::::::::60:::::|h[Tome]|h|r"

--- List text without its inline color escapes.
local function plain(text)
	return (text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

--- A client in a raid of Aeryn and Doran (or, with party, a party of the two), with the game's loot formats and item data. Items in
--- `loaded` have data at once; others arrive only after the client is asked for them.
local function start(options)
	options = options or {}
	local host = Host.New()
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	host:TakePrinted()

	_G.LOOT_ITEM = "%s receives loot: %s."
	_G.LOOT_ITEM_MULTIPLE = "%s receives loot: %sx%d."
	-- Mainline enUS: the player's own lines have no period.
	_G.LOOT_ITEM_SELF = "You receive loot: %s"
	_G.LOOT_ITEM_SELF_MULTIPLE = "You receive loot: %sx%d"
	_G.GetLootThreshold = function()
		return 2
	end

	local roster = {
		{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
		{ name = "Doran", group = 1, class = "ROGUE", online = true },
	}
	_G.IsInRaid = function()
		return not options.party
	end
	_G.GetNumGroupMembers = function()
		return #roster
	end
	_G.GetNumSubgroupMembers = function()
		return #roster - 1
	end
	_G.UnitName = function(unit)
		return unit == "player" and "Aeryn" or "Doran", nil
	end
	_G.UnitIsConnected = function()
		return true
	end
	_G.GetRaidRosterInfo = function(index)
		local m = roster[index]
		return m.name, 0, m.group, 60, m.class, m.class, "Onyxia's Lair", m.online
	end

	local data = {
		[16800] = { "Arcanist Boots", 4, 66, "INVTYPE_FEET", 132539, 4, 1 },
		[17000] = { "Tome", 3, 60, "", 133733, 9, 0 },
	}
	local item = { loaded = {}, requested = {} }
	for itemId in pairs(options.loaded or { [16800] = true, [17000] = true }) do
		item.loaded[itemId] = true
	end
	_G.C_Item = {
		GetItemInfo = function(itemId)
			local d = item.loaded[itemId] and data[itemId]
			if not d then
				return nil
			end
			return d[1], "link", d[2], d[3], 60, "Armor", "Cloth", 1, d[4], d[5], 0, d[6], d[7]
		end,
		RequestLoadItemDataByID = function(itemId)
			item.requested[#item.requested + 1] = itemId
		end,
	}
	-- The client finishes loading an item it was asked for.
	function item.arrive(itemId)
		item.loaded[itemId] = true
		host:Fire("ITEM_DATA_LOAD_RESULT", itemId, true)
	end
	return host, ns, item
end

local function loot(host, message)
	host:Fire("CHAT_MSG_LOOT", message, "", "", "", "")
end

local function labels(ns)
	local out = {}
	for index, snapshot in ipairs(ns.db.char.session.attendance) do
		out[index] = snapshot.label
	end
	return out
end

describe("Recording loot", function()
	it("records an epic someone in the raid received, with its item data", function()
		local host, ns = start()
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		assert.are.same({ { itemId = 16800, looter = "Doran", at = host.clock } }, ns.db.char.session.loot)
		assert.are.equal("Arcanist Boots", ns.db.global.items[16800].name)
	end)

	it("keeps to the import's threshold, or the game's without one", function()
		local host, ns = start()
		-- The game's threshold (uncommon) lets a rare in.
		loot(host, "Doran receives loot: " .. TOME .. ".")
		assert.are.equal(1, #ns.db.char.session.loot)

		ns.Executor:Execute("raid-import", { text = IMPORT, confirm = true })
		-- The import's threshold is epic.
		loot(host, "Doran receives loot: " .. TOME .. ".")
		loot(host, "You receive loot: " .. BOOTS)
		assert.are.same({ "Aeryn" }, { ns.db.char.session.loot[1].looter, ns.db.char.session.loot[2] })
	end)

	it("records nothing from a party, even with a raid imported", function()
		local host, ns = start({ party = true })
		ns.Executor:Execute("raid-import", { text = IMPORT })
		host:Fire("ENCOUNTER_START", 639, "Edwin VanCleef", 1, 5)
		host:Fire("ENCOUNTER_END", 639, "Edwin VanCleef", 1, 5, 1)
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		assert.are.same({}, ns.db.char.session.loot)
		assert.are.same({}, labels(ns))
		-- Nor does exporting add the party as the raid's end.
		assert.are.equal("NOTHING_TO_EXPORT", ns.Executor:Execute("raid-export").error.code)
	end)

	it("ignores a loot message the game keeps secret", function()
		local host, ns = start()
		loot(host, host:Secret())
		assert.are.same({}, ns.db.char.session.loot)
	end)

	it("asks once for an item the client hasn't loaded, and records it when it arrives", function()
		local host, ns, item = start({ loaded = {} })
		ns.RaidWindow:Show()
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		loot(host, "Aeryn receives loot: " .. BOOTS .. ".")
		assert.are.same({ 16800 }, item.requested)
		assert.are.equal("Item 16800", ns.RaidWindow.lootItems[2].name)

		item.arrive(16800)
		assert.are.equal("Arcanist Boots", ns.db.global.items[16800].name)
		assert.are.equal("Arcanist Boots", ns.RaidWindow.lootItems[2].name)
		-- An answer for an item nobody asked about is not recorded.
		item.arrive(17000)
		assert.is_nil(ns.db.global.items[17000])
	end)
end)

describe("Recording boss kills", function()
	it("snapshots the raid on a kill, not a wipe, and names the boss on the drops after it", function()
		local host, ns = start()
		host:Fire("ENCOUNTER_START", 1084, "Onyxia", 9, 40)
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 0)
		-- The pull took the start; the wipe took nothing.
		assert.are.same({ "start" }, labels(ns))
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 1)
		assert.are.same({ "start", "Onyxia" }, labels(ns))
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		assert.are.equal("Onyxia", ns.db.char.session.loot[1].source)
	end)

	it("takes the start at a later pull when the game hid names at the first", function()
		local host, ns = start()
		local hide = true
		local readRoster = _G.GetRaidRosterInfo
		_G.GetRaidRosterInfo = function(index)
			local name, rank, group, level, class, file, zone, online = readRoster(index)
			return (hide and index == 2) and host:Secret() or name, rank, group, level, class, file, zone, online
		end
		host:Fire("ENCOUNTER_START", 1084, "Onyxia", 9, 40)
		assert.are.same({}, labels(ns))
		hide = false
		host:Fire("ENCOUNTER_START", 1084, "Onyxia", 9, 40)
		assert.are.same({ "start" }, labels(ns))
		assert.are.equal(2, #ns.db.char.session.attendance[1].members)
	end)

	it("takes the start snapshot at the first pull, once", function()
		local host, ns = start()
		host:Fire("ENCOUNTER_START", 1084, "Onyxia", 9, 40)
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 0)
		host:Fire("ENCOUNTER_START", 1084, "Onyxia", 9, 40)
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 1)
		assert.are.same({ "start", "Onyxia" }, labels(ns))
	end)
end)

describe("The Loot tab and the export", function()
	it("lists the drops under the loot plan, newest first, in their quality color", function()
		local host, ns = start()
		ns.Executor:Execute("raid-import", { text = IMPORT })
		ns.RaidWindow:Show()
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 1)
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		loot(host, "You receive loot: " .. BOOTS .. "x2")
		local items = ns.RaidWindow.lootItems
		local when = date("%H:%M", host.clock)
		assert.are.same({
			"Drops  2 drops",
			"Arcanist Boots x2  ·  Aeryn  ·  Onyxia  ·  " .. when,
			"Arcanist Boots  ·  Doran  ·  Onyxia  ·  " .. when,
		}, {
			plain(items[1].text),
			plain(items[2].text),
			plain(items[3].text),
		})
		assert.are.equal(4, items[2].quality)
		assert.is_true(ns.RaidWindow.lootPlan ~= nil)
	end)

	it("exports the kill, the end of the night, the drops, and their items", function()
		local host, ns = start()
		ns.Executor:Execute("raid-import", { text = IMPORT })
		host:Fire("ENCOUNTER_END", 1084, "Onyxia", 9, 40, 1)
		loot(host, "Doran receives loot: " .. BOOTS .. ".")
		local result = ns.Executor:Execute("raid-export")
		assert.is_true(result.success, result.error and result.error.message)
		local decoded = ns.BridgeCodec:DecodeKind(result.data.exportString, "raid-export")
		assert.is_true(decoded.success)
		assert.are.same({ "Onyxia", "end" }, { decoded.data.attendance[1].label, decoded.data.attendance[2].label })
		assert.are.equal("Onyxia", decoded.data.loot[1].source)
		assert.are.equal("Arcanist Boots", decoded.data.items[1].name)
		assert.are.equal("evt_mc_0001", decoded.data.eventId)
	end)
end)

describe("Recording boss attempts", function()
	it("records each pull to its end, and the window counts kills and wipes", function()
		local host, ns = start()
		ns.Executor:Execute("raid-import", { text = IMPORT })
		ns.RaidWindow:Show()
		host:Fire("ENCOUNTER_START", 663, "Lucifron", 9, 40)
		host.clock = host.clock + 300
		host:Fire("ENCOUNTER_END", 663, "Lucifron", 9, 40, 0)
		host.clock = host.clock + 300
		host:Fire("ENCOUNTER_START", 663, "Lucifron", 9, 40)
		host.clock = host.clock + 300
		host:Fire("ENCOUNTER_END", 663, "Lucifron", 9, 40, 1)

		local attempts = ns.db.char.session.encounters
		assert.are.same({ false, true }, { attempts[1].killed, attempts[2].killed })
		assert.are.equal(attempts[2].endedAt - 300, attempts[2].startedAt)
		assert.are.equal(40, attempts[1].size)

		ns.RaidWindow:Refresh()
		assert.are.equal(
			"Snapshots: 2  ·  Drops: 0  ·  Kills: 1  ·  Wipes: 1",
			ns.RaidWindow.pages.export.summary:GetText()
		)
		assert.matches("1 kill, 1 wipe", ns.RaidWindow:GetStatusText())
	end)

	it("records nothing from a party's boss", function()
		local host, ns = start({ party = true })
		host:Fire("ENCOUNTER_START", 639, "Edwin VanCleef", 1, 5)
		host:Fire("ENCOUNTER_END", 639, "Edwin VanCleef", 1, 5, 1)
		assert.is_nil(ns.db.char.session.encounters)
	end)
end)
