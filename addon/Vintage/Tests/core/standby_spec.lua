-- The bench in raid-status: standby rows from the import, who is short once the raid has started,
-- and the bench of the short roles first. The fixture's roster is Aeryn (tank), Brann and Élowen
-- (healers), Cyra (ranged), Doran-Stonemaul (melee); its bench is Fenna (healer, standby), Garrick
-- (ranged, queued), and Hollis-Stonemaul (ranged, benched).
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local BENCH_IMPORT = fixtures["raid-import-bench.v1"].encoded
local STARTS_AT = 1793052000

local codec, ns, Raid, session

before_each(function()
	codec, ns = Load.codec()
	Raid = ns.Core.Actions.Raid
	session = Raid.Import({ session = ns.Core.Session.New(), text = BENCH_IMPORT, codec = codec, now = 1 }).data.session
end)

local function status(names, now)
	local members = {}
	for index, name in ipairs(names) do
		members[index] = { name = name, group = 1, class = "warrior", online = true }
	end
	return Raid.Status({ session = session, members = members, invites = {}, now = now }).data
end

local function benchNames(data)
	local out = {}
	for index, row in ipairs(data.bench) do
		out[index] = row.name
	end
	return out
end

describe("raid-status's bench", function()
	it("lists the bench with each reason, in the import's order, before the start", function()
		local data = status({ "Aeryn" }, STARTS_AT - 60)
		assert.is_false(data.started)
		assert.are.same({}, data.short)
		assert.are.same({ "Fenna", "Garrick", "Hollis-Stonemaul" }, benchNames(data))
		assert.are.same(
			{ "standby", "queued", "benched" },
			{ data.bench[1].reason, data.bench[2].reason, data.bench[3].reason }
		)
		assert.are.same({ "missing", "healer" }, { data.bench[1].state, data.bench[1].role })
	end)

	it("counts who is short by role once the raid has started", function()
		local data = status({ "Aeryn", "Brann" }, STARTS_AT)
		assert.is_true(data.started)
		assert.are.same({ healer = 1, ranged = 1, melee = 1 }, data.short)
	end)

	it("puts the bench of the short roles first, keeping the import's order within", function()
		-- Both healers are in: only ranged and melee are short, so Fenna (a healer) goes last.
		local data = status({ "Aeryn", "Brann", "Élowen" }, STARTS_AT + 60)
		assert.are.same({ "Garrick", "Hollis-Stonemaul", "Fenna" }, benchNames(data))
		-- Before the start nothing is short, so the import's order stands.
		assert.are.same({ "Fenna", "Garrick", "Hollis-Stonemaul" }, benchNames(status({ "Aeryn" }, STARTS_AT - 1)))
	end)

	it("counts a promoted bench character against their role's shortage", function()
		-- Brann and Élowen are missing (2 healers short); Fenna, a standby healer, came in.
		local data = status({ "Aeryn", "Cyra", "Doran-Stonemaul", "Fenna" }, STARTS_AT)
		assert.are.same({ healer = 1 }, data.short)
		data = status({ "Aeryn", "Brann", "Cyra", "Doran-Stonemaul", "Fenna" }, STARTS_AT)
		assert.are.same({}, data.short)
	end)

	it("shows a promoted bench character in the group", function()
		local data = status({ "Aeryn", "Hollis" }, STARTS_AT)
		local hollis = data.bench[3]
		assert.are.same({ "Hollis-Stonemaul", true, "in" }, { hollis.name, hollis.inGroup, hollis.state })
	end)

	it("has no bench for an import without one", function()
		session = Raid.Import({
			session = ns.Core.Session.New(),
			text = fixtures["raid-import.v1"].encoded,
			codec = codec,
			now = 1,
		}).data.session
		assert.are.same({}, status({ "Aeryn" }, STARTS_AT).bench)
	end)
end)
