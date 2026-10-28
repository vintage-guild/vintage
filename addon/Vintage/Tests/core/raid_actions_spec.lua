-- Core raid actions: import, roster status, attendance snapshots, and export, with the real codec.
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded
local NOW = 1793060000

local codec, ns, Raid, Session

local function member(name, group)
	return { name = name, group = group or 1, class = "warrior", online = true }
end

before_each(function()
	codec, ns = Load.codec()
	Raid = ns.Core.Actions.Raid
	Session = ns.Core.Session
end)

describe("raid-import", function()
	it("starts the night with the decoded import", function()
		local result = Raid.Import({ session = Session.New(), text = IMPORT, codec = codec, now = NOW })
		assert.is_true(result.success)
		assert.are.equal("Imported Molten Core — week 1: 5 characters", result.reasoning)
		local session = result.data.session
		assert.are.equal("imported", session.state)
		assert.are.equal(NOW, session.importedAt)
		assert.are.equal("evt_mc_0001", session.import.raid.eventId)
	end)

	it("refuses an export string with the codec's code, and changes nothing", function()
		local session = Session.New()
		local result = Raid.Import({
			session = session,
			text = fixtures["raid-export.v1"].encoded,
			codec = codec,
			now = NOW,
		})
		assert.is_false(result.success)
		assert.are.equal("WRONG_KIND", result.error.code)
		assert.are.equal("idle", session.state)
	end)

	it("asks before replacing a raid that has an import or attendance", function()
		local imported = Raid.Import({ session = Session.New(), text = IMPORT, codec = codec, now = NOW }).data.session
		local again = Raid.Import({ session = imported, text = IMPORT, codec = codec, now = NOW + 60 })
		assert.is_false(again.success)
		assert.are.equal("CONFIRM_REQUIRED", again.error.code)

		local pickUp = Raid.Snapshot({ session = Session.New(), members = { member("Aeryn") }, now = NOW }).data.session
		assert.are.equal(
			"CONFIRM_REQUIRED",
			Raid.Import({ session = pickUp, text = IMPORT, codec = codec, now = NOW }).error.code
		)

		local replaced = Raid.Import({ session = pickUp, text = IMPORT, codec = codec, now = NOW, confirm = true })
		assert.is_true(replaced.success)
		assert.are.same({}, replaced.data.session.attendance)
	end)
end)

describe("raid-status", function()
	it("lists the roster with each planned group and who is in the group now", function()
		local session = Raid.Import({ session = Session.New(), text = IMPORT, codec = codec, now = NOW }).data.session
		local result = Raid.Status({ session = session, groupNames = { "Aeryn", "Doran-Stonemaul", "Cyra-Bloodfen" } })
		assert.is_true(result.success)
		assert.are.equal("Molten Core — week 1: 3 of 5 in the group", result.reasoning)
		local seen = {}
		for _, row in ipairs(result.data.rows) do
			seen[#seen + 1] = { row.name, row.group or 0, row.inGroup }
		end
		assert.are.same({
			{ "Aeryn", 1, true },
			{ "Brann", 1, false },
			-- One Cyra in the group, from another realm: the same name without the realm.
			{ "Cyra", 2, true },
			{ "Doran-Stonemaul", 1, true },
			{ "Élowen", 2, false },
		}, seen)
	end)

	it("matches a name without the realm only when one member has it", function()
		local inGroup = ns.Core.Roster.GroupLookup({ "Cyra-Bloodfen", "Cyra-Stonemaul", "aeryn" })
		assert.is_false(inGroup("Cyra"))
		assert.is_true(inGroup("Cyra-Bloodfen"))
		assert.is_true(inGroup("Aeryn"))
	end)

	it("says there is nothing to show before an import", function()
		local result = Raid.Status({ session = Session.New(), groupNames = {} })
		assert.are.equal("NO_IMPORT", result.error.code)
	end)
end)

describe("attendance-snapshot", function()
	it("adds a manual snapshot and marks the raid live", function()
		local result =
			Raid.Snapshot({ session = Session.New(), members = { member("Aeryn"), member("Brann", 2) }, now = NOW })
		assert.is_true(result.success)
		assert.are.equal("Snapshot 1: 2 people", result.reasoning)
		local session = result.data.session
		assert.are.equal("live", session.state)
		assert.are.same(
			{ at = NOW, label = "manual", members = { member("Aeryn"), member("Brann", 2) } },
			session.attendance[1]
		)
	end)

	it("leaves the old session alone", function()
		local before = Session.New()
		Raid.Snapshot({ session = before, members = { member("Aeryn") }, now = NOW })
		assert.are.same({}, before.attendance)
		assert.are.equal("idle", before.state)
	end)

	it("refuses an empty group and a raid at the export's snapshot cap", function()
		assert.are.equal("NOBODY_SEEN", Raid.Snapshot({ session = Session.New(), members = {}, now = NOW }).error.code)
		local full = Session.New()
		for index = 1, Raid.MAX_SNAPSHOTS do
			full.attendance[index] = { at = NOW, members = { member("Aeryn") } }
		end
		assert.are.equal(
			"TOO_MANY_SNAPSHOTS",
			Raid.Snapshot({ session = full, members = { member("Aeryn") }, now = NOW }).error.code
		)
	end)
end)

describe("raid-export", function()
	local function exportOf(session)
		return Raid.Export({
			session = session,
			codec = codec,
			now = NOW + 3600,
			exporter = "Aeryn",
			addonVersion = "0.1.0",
		})
	end

	it("needs a snapshot first", function()
		local result = exportOf(Session.New())
		assert.are.equal("NOTHING_TO_EXPORT", result.error.code)
		assert.are.equal("Take a snapshot first", result.error.suggestion)
	end)

	it("makes a string the codec reads back, carrying the import's guild and raid", function()
		local session = Raid.Import({ session = Session.New(), text = IMPORT, codec = codec, now = NOW }).data.session
		session = Raid.Snapshot({
			session = session,
			members = { member("Aeryn"), member("Doran-Stonemaul") },
			now = NOW,
		}).data.session
		local result = exportOf(session)
		assert.is_true(result.success, result.error and result.error.message)
		assert.are.equal("exported", result.data.session.state)
		assert.are.equal(result.data.exportString, result.data.session.lastExport)

		local decoded = codec:DecodeKind(result.data.exportString, "raid-export")
		assert.is_true(decoded.success)
		assert.are.equal("g_vintage", decoded.data.guildId)
		assert.are.equal("evt_mc_0001", decoded.data.eventId)
		assert.are.equal("Aeryn", decoded.data.exporter)
		assert.are.equal(NOW + 3600, decoded.data.exportedAt)
		assert.are.equal(2, #decoded.data.attendance[1].members)
	end)

	it("exports a pick-up raid without a guild or raid id", function()
		local session =
			Raid.Snapshot({ session = Session.New(), members = { member("Aeryn") }, now = NOW }).data.session
		local decoded = codec:DecodeKind(exportOf(session).data.exportString, "raid-export")
		assert.is_nil(decoded.data.guildId)
		assert.is_nil(decoded.data.eventId)
	end)
end)
