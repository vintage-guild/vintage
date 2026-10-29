-- Core rules behind the loot popup: which open slots it shows and who is ranked for them, the
-- checks before a hand-out, and the loot method plan. Uses the fixture import (16800 ranks
-- Doran-Stonemaul, then Aeryn; 17076 has an empty list; threshold epic; master loot).
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded
local BOOTS = "|cffa335ee|Hitem:16800::::::::60:::::|h[Arcanist Boots]|h|r"

local codec, ns, Loot, session

before_each(function()
	codec, ns = Load.codec()
	Loot = ns.Core.Actions.Loot
	session =
		ns.Core.Actions.Raid.Import({ session = ns.Core.Session.New(), text = IMPORT, codec = codec, now = 1 }).data.session
end)

local function slot(slotIndex, itemId, quality)
	return { slot = slotIndex, link = "item:" .. itemId, itemId = itemId, name = "Item " .. itemId, quality = quality }
end

describe("loot-candidates", function()
	it("ranks a slot's item best first, matched to who may receive it", function()
		local result = Loot.Candidates({
			session = session,
			slots = { slot(1, 16800, 4) },
			eligible = { [1] = { { index = 1, name = "Aeryn" }, { index = 3, name = "Doran-Stonemaul" } } },
			threshold = 4,
		})
		local ranked = result.data.slots[1].ranked
		assert.are.same({
			{
				rank = 1,
				characterId = "c_doran",
				name = "Doran-Stonemaul",
				reason = "Soft-reserved (1 of 2)",
				candidateIndex = 3,
				candidateName = "Doran-Stonemaul",
			},
			{
				rank = 2,
				characterId = "c_aeryn",
				name = "Aeryn",
				reason = "Soft-reserved (2 of 2)",
				candidateIndex = 1,
				candidateName = "Aeryn",
			},
		}, ranked)
	end)

	it("keeps someone ranked who can't receive it, without a candidate index", function()
		local result = Loot.Candidates({
			session = session,
			slots = { slot(1, 16800, 4) },
			eligible = { [1] = { { index = 1, name = "Aeryn" } } },
		})
		local ranked = result.data.slots[1].ranked
		assert.are.same({ "Doran-Stonemaul", "Aeryn" }, { ranked[1].name, ranked[2].name })
		assert.is_nil(ranked[1].candidateIndex)
	end)

	it("matches by full name: a name without a realm is the player's realm, never a namesake", function()
		local function indexFor(eligible, realm)
			local ranked = Loot.Candidates({
				session = session,
				slots = { slot(1, 16800, 4) },
				eligible = { [1] = eligible },
				realm = realm,
			}).data.slots[1].ranked
			return ranked[1].candidateIndex, ranked[2].candidateIndex
		end
		-- Doran-Stonemaul is ranked first, Aeryn second.
		assert.are.same({ nil, nil }, { indexFor({ { index = 5, name = "Doran-Ashbringer" } }, "Stonemaul") })
		assert.are.same({ 4, nil }, { indexFor({ { index = 4, name = "Doran" } }, "Stonemaul") })
		assert.are.same({ nil, nil }, { indexFor({ { index = 4, name = "Doran" } }, "Area52") })
		assert.are.same({ nil, 2 }, { indexFor({ { index = 2, name = "Aeryn-Stonemaul" } }, "Stonemaul") })
		-- Without the realm, only the exact name matches.
		assert.are.same({ 5, nil }, { indexFor({ { index = 5, name = "doran-stonemaul" } }, nil) })
		assert.are.same({ nil, nil }, { indexFor({ { index = 4, name = "Doran" } }, nil) })
	end)

	it("shows ranked items and items at the threshold, and nothing else", function()
		local slots = { slot(1, 16800, 3), slot(2, 17076, 4), slot(3, 17076, 3), slot(4, 999, nil) }
		local shown = Loot.Candidates({ session = session, slots = slots, eligible = {}, threshold = 4 }).data.slots
		-- 16800 has a list (shown at any quality); 17076 at epic has none but meets the threshold.
		assert.are.same({ 1, 2 }, { shown[1].slot, shown[2].slot })
		assert.are.same({}, shown[2].ranked)
		assert.are.equal(2, #shown)
	end)

	it("shows items by quality alone without an import", function()
		local shown = Loot.Candidates({ session = ns.Core.Session.New(), slots = { slot(1, 16800, 4) } }).data.slots
		assert.are.same({}, shown[1].ranked)
	end)
end)

describe("loot-give's checks", function()
	local function check(changes)
		local context = {
			isMasterLooter = true,
			link = BOOTS,
			shownLink = BOOTS,
			-- The game's name at that index now, and the one the popup read; the import's for text.
			name = "Doran-Stonemaul",
			shownName = "Doran-Stonemaul",
			displayName = "Doran-Stonemaul",
			itemName = "Arcanist Boots",
			confirm = true,
		}
		for key, value in pairs(changes or {}) do
			context[key] = value
		end
		return Loot.CheckGive(context)
	end

	it("asks first, then allows the hand-out", function()
		local asked = check({ confirm = false })
		assert.are.equal("CONFIRM_REQUIRED", asked.error.code)
		assert.are.equal("Give Arcanist Boots to Doran-Stonemaul?", asked.error.message)
		local given = check()
		assert.is_true(given.success)
		-- The game answers later (the slot empties), so it says what it is doing.
		assert.are.equal("Giving Arcanist Boots to Doran-Stonemaul", given.reasoning)
	end)

	it("refuses when the player isn't master looter, the slot changed, or the person changed", function()
		assert.are.equal("NOT_MASTER_LOOTER", check({ isMasterLooter = false }).error.code)
		assert.are.equal("SLOT_CHANGED", check({ link = "|Hitem:17076|h" }).error.code)
		-- The slot emptied.
		assert.are.equal("SLOT_CHANGED", check({ link = false }).error.code)
		assert.are.equal("CANDIDATE_CHANGED", check({ name = "Brann" }).error.code)
		-- Nobody at that candidate index any more.
		assert.are.equal("CANDIDATE_CHANGED", check({ name = false }).error.code)
		-- A player of the same name on another realm now at that index never gets it.
		assert.are.equal("CANDIDATE_CHANGED", check({ name = "Doran-Ashbringer" }).error.code)
		assert.are.equal("CANDIDATE_CHANGED", check({ name = "Doran" }).error.code)
		-- Only case is ignored.
		assert.is_true(check({ name = "doran-stonemaul" }).success)
	end)
end)

describe("loot-mode-set", function()
	local function plan(changes)
		local context = {
			session = session,
			method = 3,
			threshold = 2,
			isMasterLooter = false,
			isLeader = true,
			inRaid = true,
			player = "Aeryn",
			confirm = true,
		}
		for key, value in pairs(changes or {}) do
			context[key] = value
		end
		return Loot.ModePlan(context)
	end

	it("asks, then sets master loot to the player with the import's threshold", function()
		local asked = plan({ confirm = false })
		assert.are.equal("CONFIRM_REQUIRED", asked.error.code)
		assert.are.equal("Set the loot to master loot (you), epic and better?", asked.error.message)
		assert.are.same({ method = 2, master = "Aeryn", threshold = 4 }, plan().data)
	end)

	it("changes only what differs, and nothing when it all matches", function()
		assert.are.same({ threshold = 4 }, plan({ method = 2, isMasterLooter = true }).data)
		assert.are.same({ method = 2, master = "Aeryn" }, plan({ method = 2, threshold = 4 }).data)
		assert.are.equal("NOTHING_TO_DO", plan({ method = 2, isMasterLooter = true, threshold = 4 }).error.code)
	end)

	it("needs an import, a raid, and the leader", function()
		assert.are.equal("NO_IMPORT", plan({ session = ns.Core.Session.New() }).error.code)
		assert.are.equal("NOT_IN_RAID", plan({ inRaid = false }).error.code)
		assert.are.equal("NOT_LEADER", plan({ isLeader = false }).error.code)
	end)
end)
