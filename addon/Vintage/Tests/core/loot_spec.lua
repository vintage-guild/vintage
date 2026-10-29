-- Core loot and attendance recording: reading loot messages, drops, boss kills, the start and end
-- snapshots, item data, and an export that carries them, with the real codec.
local Load = dofile("Tests/support/load.lua")

local NOW = 1793060000
-- Mainline enUS (GlobalStrings): the player's own lines have no period.
local FORMATS = {
	LOOT_ITEM = "%s receives loot: %s.",
	LOOT_ITEM_MULTIPLE = "%s receives loot: %sx%d.",
	LOOT_ITEM_SELF = "You receive loot: %s",
	LOOT_ITEM_SELF_MULTIPLE = "You receive loot: %sx%d",
}
local BOOTS = "|cffa335ee|Hitem:16800::::::::60:::::|h[Arcanist Boots]|h|r"
local BOOTS_INFO = { name = "Arcanist Boots", quality = 4, itemLevel = 66, equipLoc = "INVTYPE_FEET", icon = 132539 }

local codec, ns, Core, Loot, Raid, Session

local function member(name, group)
	return { name = name, group = group or 1, class = "mage", online = true }
end

local GROUP = { member("Aeryn"), member("Doran") }

before_each(function()
	codec, ns = Load.codec()
	Core = ns.Core
	Loot = Core.Actions.Loot
	Raid = Core.Actions.Raid
	Session = Core.Session
end)

--- loot-capture's context: an epic for Doran, in a group, at NOW.
local function capture(session, changes)
	local context = {
		session = session,
		drop = { looter = "Doran", itemId = 16800, count = 1 },
		quality = 4,
		threshold = 4,
		inRaid = true,
		now = NOW,
	}
	for key, value in pairs(changes or {}) do
		context[key] = value
	end
	return Loot.Capture(context)
end

describe("Loot.Read", function()
	it("reads who got which item from the game's loot messages", function()
		assert.are.same(
			{ looter = "Doran", itemId = 16800, count = 1 },
			Loot.Read("Doran receives loot: " .. BOOTS .. ".", FORMATS, "Aeryn")
		)
		assert.are.same(
			{ looter = "Aeryn", itemId = 16800, count = 1 },
			Loot.Read("You receive loot: " .. BOOTS, FORMATS, "Aeryn")
		)
	end)

	it("reads a count without taking it into the item link", function()
		assert.are.same(
			{ looter = "Vyra-Area52", itemId = 16800, count = 3 },
			Loot.Read("Vyra-Area52 receives loot: " .. BOOTS .. "x3.", FORMATS, "Aeryn")
		)
		assert.are.same(
			{ looter = "Aeryn", itemId = 16800, count = 2 },
			Loot.Read("You receive loot: " .. BOOTS .. "x2", FORMATS, "Aeryn")
		)
	end)

	it("ignores messages without an item, and names the export would refuse", function()
		assert.is_nil(Loot.Read("You loot 5 Gold.", FORMATS, "Aeryn"))
		assert.is_nil(Loot.Read("Doran receives loot: [Plain text].", FORMATS, "Aeryn"))
		assert.is_nil(Loot.Read("X receives loot: " .. BOOTS .. ".", FORMATS, "Aeryn"))
		assert.is_nil(Loot.Read("Doran receives loot: " .. BOOTS .. ".", {}, "Aeryn"))
		assert.is_nil(Loot.Read(nil, FORMATS, "Aeryn"))
	end)
end)

describe("loot-capture", function()
	it("records a drop, marks the item seen, and makes the last export stale", function()
		local session = Core.With(Session.New(), { state = "exported", lastExport = "!VIN:1!old", lastExportAt = NOW })
		local result = capture(session)
		assert.is_true(result.success)
		local updated = result.data.session
		assert.are.same({ { itemId = 16800, looter = "Doran", at = NOW } }, updated.loot)
		assert.is_true(updated.itemsSeen[16800])
		assert.are.equal("live", updated.state)
		assert.is_nil(updated.lastExport)
		assert.are.same({}, session.loot)
	end)

	it("names the boss killed in the last few minutes as the source", function()
		local session = Core.With(Session.New(), {
			lastEncounter = { id = 1084, name = "Onyxia", endedAt = NOW - 60, killed = true },
		})
		assert.are.equal("Onyxia", capture(session).data.drop.source)
		assert.is_nil(capture(session, { now = NOW - 60 + Loot.SOURCE_WINDOW + 1 }).data.drop.source)
		session.lastEncounter.killed = false
		assert.is_nil(capture(session).data.drop.source)
	end)

	it("keeps a count above one", function()
		local result = capture(Session.New(), { drop = { looter = "Doran", itemId = 16800, count = 2 } })
		assert.are.equal(2, result.data.drop.count)
	end)

	it("skips items below the threshold, but keeps one whose quality isn't known yet", function()
		assert.are.equal("BELOW_THRESHOLD", capture(Session.New(), { quality = 3 }).error.code)
		assert.is_true(capture(Session.New(), { quality = nil }).success)
		-- Without the import's threshold or the game's: rare and better.
		assert.is_true(capture(Session.New(), { quality = 3, threshold = false }).success)
		assert.are.equal("BELOW_THRESHOLD", capture(Session.New(), { quality = 2, threshold = false }).error.code)
	end)

	it("records nothing outside a raid, and stops at the export's cap", function()
		assert.are.equal("NOT_IN_RAID", capture(Session.New(), { inRaid = false }).error.code)
		local full = Session.New()
		for index = 1, Loot.MAX_DROPS do
			full.loot[index] = { itemId = 1, looter = "Doran", at = NOW }
		end
		assert.are.equal("TOO_MANY_DROPS", capture(full).error.code)
	end)
end)

describe("encounter-record", function()
	local function encounter(session, killed, changes)
		local context = {
			session = session,
			encounter = { id = 1084, name = "Onyxia", killed = killed },
			members = GROUP,
			inRaid = true,
			now = NOW,
		}
		for key, value in pairs(changes or {}) do
			context[key] = value
		end
		return Raid.Encounter(context)
	end

	it("takes a snapshot labelled with the boss on a kill", function()
		local result = encounter(Session.New(), true)
		assert.is_true(result.data.snapshot)
		local session = result.data.session
		assert.are.equal("Onyxia", session.attendance[1].label)
		assert.are.equal(2, #session.attendance[1].members)
		assert.are.same({ id = 1084, name = "Onyxia", endedAt = NOW, killed = true }, session.lastEncounter)
		assert.are.equal("live", session.state)
	end)

	it("remembers a wipe without a snapshot, and takes none outside a raid", function()
		local wipe = encounter(Session.New(), false).data
		assert.is_false(wipe.snapshot)
		assert.are.same({}, wipe.session.attendance)
		assert.is_false(wipe.session.lastEncounter.killed)

		local alone = encounter(Session.New(), true, { inRaid = false }).data
		assert.is_false(alone.snapshot)
		assert.is_true(alone.session.lastEncounter.killed)
	end)

	it("keeps the kill when the snapshot can't be taken", function()
		local full = Session.New()
		for index = 1, Raid.MAX_SNAPSHOTS do
			full.attendance[index] = { at = NOW, label = "manual", members = GROUP }
		end
		local result = encounter(full, true)
		assert.is_true(result.success)
		assert.is_false(result.data.snapshot)
		assert.are.equal("Onyxia", result.data.session.lastEncounter.name)
	end)

	it("cuts a long name to the export's label limit without splitting a character", function()
		local name = string.rep("a", 63) .. "é"
		local label =
			encounter(Session.New(), true, { encounter = { name = name, killed = true } }).data.session.attendance[1].label
		assert.are.equal(string.rep("a", 63), label)
		assert.is_false(encounter(Session.New(), true, { encounter = { name = "" } }).success)
	end)
end)

describe("attendance-snapshot", function()
	it("keeps one start snapshot per raid", function()
		local first = Raid.Snapshot({ session = Session.New(), members = GROUP, now = NOW, label = "start" })
		assert.is_true(first.success)
		local again = Raid.Snapshot({ session = first.data.session, members = GROUP, now = NOW + 1, label = "start" })
		assert.are.equal("ALREADY_STARTED", again.error.code)
		assert.is_true(Raid.Snapshot({ session = first.data.session, members = GROUP, now = NOW + 1 }).success)
	end)

	it("takes an automatic snapshot in a raid only", function()
		local party =
			Raid.Snapshot({ session = Session.New(), members = GROUP, now = NOW, label = "start", automatic = true })
		assert.are.equal("NOT_IN_RAID", party.error.code)
		local raid = Raid.Snapshot({
			session = Session.New(),
			members = GROUP,
			now = NOW,
			label = "start",
			automatic = true,
			inRaid = true,
		})
		assert.is_true(raid.success)
	end)

	it("waits for a full view of the raid before an automatic snapshot", function()
		local partial = Raid.Snapshot({
			session = Session.New(),
			members = GROUP,
			now = NOW,
			label = "start",
			automatic = true,
			inRaid = true,
			hidden = 1,
		})
		assert.are.equal("PARTLY_HIDDEN", partial.error.code)
		-- By hand, a partial snapshot is still the leader's call.
		assert.is_true(Raid.Snapshot({ session = Session.New(), members = GROUP, now = NOW, hidden = 1 }).success)
	end)

	it("labels a snapshot manual unless given a label the export accepts", function()
		for _, label in ipairs({ "", {}, 5 }) do
			local session =
				Raid.Snapshot({ session = Session.New(), members = GROUP, now = NOW, label = label }).data.session
			assert.are.equal("manual", session.attendance[1].label)
		end
	end)
end)

describe("raid-export with drops and items", function()
	local function exportOf(session, changes)
		local context = {
			session = session,
			codec = codec,
			now = NOW + 3600,
			exporter = "Aeryn",
			addonVersion = "0.1.0",
			members = GROUP,
			inRaid = true,
			items = { [16800] = Loot.ItemEntry(16800, BOOTS_INFO) },
		}
		for key, value in pairs(changes or {}) do
			context[key] = value
		end
		return Raid.Export(context)
	end

	it("records who is here at the end, and refreshes that snapshot when exporting again", function()
		local first = exportOf(Session.New())
		assert.is_true(first.success, first.error and first.error.message)
		assert.are.same({ "end" }, { first.data.session.attendance[1].label })
		local again = exportOf(first.data.session, { now = NOW + 7200 })
		assert.are.equal(1, #again.data.session.attendance)
		assert.are.equal(NOW + 7200, again.data.session.attendance[1].at)
	end)

	it("needs a snapshot when not in a raid", function()
		assert.are.equal("NOTHING_TO_EXPORT", exportOf(Session.New(), { inRaid = false }).error.code)
	end)

	it("carries the drops and the data of the items they were", function()
		local session = Raid.Encounter({
			session = Session.New(),
			encounter = { id = 1084, name = "Onyxia", killed = true },
			members = GROUP,
			inRaid = true,
			now = NOW,
		}).data.session
		session = capture(session).data.session
		-- An item seen whose data never arrived, and a saved record the export would refuse.
		session = capture(session, { drop = { looter = "Doran", itemId = 17000, count = 1 } }).data.session
		session = capture(session, { drop = { looter = "Doran", itemId = 18000, count = 1 } }).data.session

		local result = exportOf(session, {
			items = { [16800] = Loot.ItemEntry(16800, BOOTS_INFO), [18000] = { name = "", quality = 9 } },
		})
		assert.is_true(result.success, result.error and result.error.message)
		assert.are.equal(1, result.data.items)
		local decoded = codec:DecodeKind(result.data.exportString, "raid-export")
		assert.is_true(decoded.success)
		local data = decoded.data
		assert.are.same({ "Onyxia", "end" }, { data.attendance[1].label, data.attendance[2].label })
		assert.are.equal(3, #data.loot)
		assert.are.same({ itemId = 16800, looter = "Doran", at = NOW, source = "Onyxia" }, data.loot[1])
		assert.are.same({
			{
				itemId = 16800,
				name = "Arcanist Boots",
				quality = 4,
				itemLevel = 66,
				equipLoc = "INVTYPE_FEET",
				icon = 132539,
			},
		}, data.items)
	end)
end)

describe("Loot.ItemEntry", function()
	it("keeps what the export accepts and drops the rest", function()
		assert.are.same(
			{ itemId = 5, name = "Rune", quality = 1, classId = 15, subclassId = 0 },
			Loot.ItemEntry(5, { name = "Rune", quality = 1, equipLoc = "", classId = 15, subclassId = 0, icon = -1 })
		)
		assert.is_nil(Loot.ItemEntry(5, { name = "Rune" }))
		assert.is_nil(Loot.ItemEntry(5, { name = "", quality = 1 }))
		assert.is_nil(Loot.ItemEntry(0, BOOTS_INFO))
		assert.are.equal(Loot.MAX_TEXT, #Loot.ItemEntry(5, { name = string.rep("x", 150), quality = 1 }).name)
	end)
end)

describe("loot-list", function()
	it("lists drops newest first, with item data when the client has it", function()
		local session = capture(Session.New()).data.session
		session =
			capture(session, { drop = { looter = "Aeryn", itemId = 17000, count = 1 }, now = NOW + 5 }).data.session
		local drops =
			Loot.List({ session = session, items = { [16800] = Loot.ItemEntry(16800, BOOTS_INFO) } }).data.drops
		assert.are.same({ 17000, 16800 }, { drops[1].itemId, drops[2].itemId })
		assert.is_nil(drops[1].name)
		assert.are.same({ "Arcanist Boots", 4, 132539 }, { drops[2].name, drops[2].quality, drops[2].icon })
	end)
end)

describe("Core.FormatPattern", function()
	it("turns the game's placeholders into captures and escapes the rest", function()
		assert.are.same({ "Doran", "3" }, { ("Doran (x3)."):match(Core.FormatPattern("%s (x%d).")) })
		assert.is_nil(Core.FormatPattern(nil))
		assert.is_nil(Core.FormatPattern(""))
	end)
end)
