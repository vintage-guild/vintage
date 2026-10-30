-- Boss attempts (#221): the pull remembered at ENCOUNTER_START, an attempt recorded at
-- ENCOUNTER_END (kill or wipe, when it started and ended, how many were there), in a raid only,
-- and carried by the export.
local Load = dofile("Tests/support/load.lua")

local NOW = 1793060000

local codec, ns, Raid, Session

before_each(function()
	codec, ns = Load.codec()
	Raid = ns.Core.Actions.Raid
	Session = ns.Core.Session
end)

local GROUP = {
	{ name = "Aeryn", group = 1, class = "warrior", online = true },
	{ name = "Doran", group = 1, class = "rogue", online = true },
}

local function pull(session, changes)
	local context = {
		session = session,
		encounter = { id = 663, name = "Lucifron", size = 40 },
		inRaid = true,
		now = NOW,
	}
	for key, value in pairs(changes or {}) do
		context[key] = value
	end
	return Raid.EncounterStart(context)
end

local function finish(session, killed, changes)
	local context = {
		session = session,
		encounter = { id = 663, name = "Lucifron", killed = killed },
		members = GROUP,
		inRaid = true,
		now = NOW + 300,
	}
	for key, value in pairs(changes or {}) do
		context[key] = value
	end
	return Raid.Encounter(context)
end

describe("Boss attempts", function()
	it("records an attempt from the pull to its end, with the group's size", function()
		local session = pull(Session.New()).data.session
		session = finish(session, false).data.session
		assert.are.same({
			{ encounterId = 663, name = "Lucifron", startedAt = NOW, endedAt = NOW + 300, killed = false, size = 40 },
		}, session.encounters)
		assert.is_false(session.pull)
	end)

	it("records a wipe and a kill in order, and still snapshots the kill", function()
		local session = finish(pull(Session.New()).data.session, false).data.session
		session = pull(session, { now = NOW + 600 }).data.session
		local killed = finish(session, true, { now = NOW + 900 })
		assert.is_true(killed.data.snapshot)
		local attempts = killed.data.session.encounters
		assert.are.same({ false, true }, { attempts[1].killed, attempts[2].killed })
		assert.are.equal(NOW + 600, attempts[2].startedAt)
	end)

	it("starts an attempt at its end when the pull wasn't seen, or was another boss", function()
		local unseen = finish(Session.New(), false).data.session.encounters[1]
		assert.are.same({ NOW + 300, NOW + 300 }, { unseen.startedAt, unseen.endedAt })
		assert.is_nil(unseen.size)

		local other = pull(Session.New(), { encounter = { id = 664, name = "Magmadar", size = 40 } }).data.session
		assert.are.equal(NOW + 300, finish(other, false).data.session.encounters[1].startedAt)
	end)

	it("records nothing outside a raid", function()
		assert.are.equal("NOT_IN_RAID", pull(Session.New(), { inRaid = false }).error.code)
		local session = finish(Session.New(), true, { inRaid = false }).data.session
		assert.is_nil(session.encounters)
		-- The kill still names the drops after it.
		assert.are.equal("Lucifron", session.lastEncounter.name)
	end)

	it("leaves out an id the game kept secret, and a size that isn't a raid's", function()
		local session = pull(Session.New(), { encounter = { name = "Lucifron", size = 99 } }).data.session
		local recorded = finish(session, false, { encounter = { name = "Lucifron", killed = false } }).data.session
		local attempt = recorded.encounters[1]
		assert.is_nil(attempt.encounterId)
		assert.is_nil(attempt.size)
		-- The pull still counts: neither has an id, so it's the same boss.
		assert.are.equal(NOW, attempt.startedAt)
	end)

	it("stops at the export's cap and makes the last export stale", function()
		local full = Session.New()
		full.encounters = {}
		for index = 1, Raid.MAX_ENCOUNTERS do
			full.encounters[index] = { name = "Lucifron", startedAt = NOW, endedAt = NOW, killed = false }
		end
		full.lastExport = "!VIN:1!old"
		local updated = finish(full, false).data.session
		assert.are.equal(Raid.MAX_ENCOUNTERS, #updated.encounters)
		assert.is_nil(updated.lastExport)
	end)

	it("goes in the export, and an export without attempts has no list", function()
		local session = finish(pull(Session.New()).data.session, true).data.session
		local function exportOf(s)
			local result = Raid.Export({
				session = s,
				codec = codec,
				now = NOW + 3600,
				exporter = "Aeryn",
				addonVersion = "0.1.0",
				members = GROUP,
				inRaid = true,
				items = {},
			})
			assert.is_true(result.success, result.error and result.error.message)
			return codec:DecodeKind(result.data.exportString, "raid-export").data
		end
		assert.are.same({
			{ encounterId = 663, name = "Lucifron", startedAt = NOW, endedAt = NOW + 300, killed = true, size = 40 },
		}, exportOf(session).encounters)
		assert.is_nil(exportOf(Session.New()).encounters)
	end)
end)
