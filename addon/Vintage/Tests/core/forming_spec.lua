-- Core.Forming: the next invite step and the next arrange step, from the group as read.
local Load = dofile("Tests/support/load.lua")

local Forming

before_each(function()
	local _, ns = Load.codec()
	Forming = ns.Core.Forming
end)

local function character(id, name, role)
	return { characterId = id, name = name, class = "warrior", role = role }
end

local IMPORT = {
	roster = {
		character("c1", "Aeryn", "tank"),
		character("c2", "Cyra", "ranged"),
		character("c3", "Brann", "healer"),
		character("c4", "Doran", "melee"),
		character("c5", "Elowen", "healer"),
		character("c6", "Fenwick", "ranged"),
	},
	groups = {
		{ group = 1, characterIds = { "c1", "c3", "c4" } },
		{ group = 2, characterIds = { "c2", "c5", "c6" } },
	},
}

describe("Forming.NextInvite", function()
	it("invites tanks, then healers, then the rest, in roster order", function()
		local names = {}
		for _, c in ipairs(Forming.InviteOrder(IMPORT.roster)) do
			names[#names + 1] = c.name
		end
		assert.are.same({ "Aeryn", "Brann", "Elowen", "Cyra", "Doran", "Fenwick" }, names)
		local step = Forming.NextInvite(IMPORT, { inRaid = false, size = 1, names = { "Aeryn" } })
		assert.are.same({ op = "invite", name = "Brann", missing = 5 }, step)
	end)

	it("converts to a raid as soon as two are in a party", function()
		local step = Forming.NextInvite(IMPORT, {
			inRaid = false,
			size = 2,
			names = { "Aeryn", "Brann" },
			invites = { brann = "invited" },
		})
		-- With how many it will invite once the raid exists.
		assert.are.same({ op = "convert", missing = 4 }, step)
	end)

	it("waits while a party is full with invites out", function()
		local step = Forming.NextInvite(IMPORT, {
			inRaid = false,
			size = 1,
			names = { "Aeryn" },
			invites = { brann = "invited", elowen = "invited", cyra = "invited", doran = "invited" },
		})
		assert.are.same({ op = "wait", missing = 1 }, step)
	end)

	it("skips people already invited or who answered, and is done when nobody is left", function()
		local step = Forming.NextInvite(IMPORT, {
			inRaid = true,
			size = 2,
			names = { "Aeryn", "Brann" },
			invites = { elowen = "declined", cyra = "busy", doran = "invited" },
		})
		assert.are.same({ op = "invite", name = "Fenwick", missing = 1 }, step)
		local finished = Forming.NextInvite(IMPORT, {
			inRaid = true,
			size = 2,
			names = { "Aeryn", "Brann" },
			invites = { elowen = "declined", cyra = "busy", doran = "invited", fenwick = "invited" },
		})
		assert.are.same({ op = "done", pending = 2 }, finished)
	end)

	it("invites one person from their row, whatever they answered before", function()
		local group = { inRaid = true, size = 3, names = { "Aeryn" }, invites = { elowen = "declined" } }
		assert.are.same({ op = "invite", name = "Elowen", missing = 1 }, Forming.NextInvite(IMPORT, group, "Elowen"))
		-- Someone not on the roster too (a standby).
		assert.are.equal("Galdor", Forming.NextInvite(IMPORT, group, "Galdor").name)
		assert.are.equal("done", Forming.NextInvite(IMPORT, group, "aeryn").op)
	end)
end)

describe("Forming.NextMove", function()
	local function member(index, name, group)
		return { index = index, name = name, group = group }
	end

	it("moves someone into their planned group when it has room", function()
		local members = { member(1, "Aeryn", 1), member(2, "Cyra", 1), member(3, "Brann", 2) }
		assert.are.same({ op = "move", index = 2, group = 2, name = "Cyra" }, Forming.NextMove(IMPORT, members))
		assert.are.equal(2, Forming.Misplaced(IMPORT, members))
	end)

	it("swaps with someone who doesn't belong in a full group, preferring a straight trade", function()
		local members = {
			member(1, "Aeryn", 2),
			member(2, "X1", 1),
			member(3, "X2", 1),
			member(4, "Cyra", 1),
			member(5, "X3", 1),
			member(6, "X4", 1),
		}
		-- Group 1 is full of people not planned for it. X1 comes first, but Cyra (planned for 2,
		-- where Aeryn is now) is the straight trade: one swap fixes both.
		assert.are.same(
			{ op = "swap", index = 1, other = 4, name = "Aeryn", group = 1 },
			Forming.NextMove(IMPORT, members)
		)
	end)

	it("counts people the game didn't name: their group has no room", function()
		local members = { member(1, "Cyra", 1), member(2, "Aeryn", 1) }
		-- Group 2 looks empty, but five people the game won't name are in it.
		local step = Forming.NextMove(IMPORT, members, { [2] = 5 })
		assert.are.equal("done", step.op)
		assert.are.equal(1, step.stuck)
	end)

	it("matches an answer to the bare name when the game drops the realm", function()
		local _, ns = Load.codec()
		local Roster = ns.Core.Roster
		assert.are.equal("declined", Roster.InviteState({ doran = "declined" }, "Doran-Stonemaul"))
		assert.are.equal("busy", Roster.InviteState({ ["doran-stonemaul"] = "busy" }, "Doran-Stonemaul"))
		assert.is_nil(Roster.InviteState({}, "Doran"))
	end)

	it("leaves people the plan doesn't name where they are, and is done when everyone fits", function()
		local members = { member(1, "Aeryn", 1), member(2, "Brann", 1), member(3, "Pug", 7) }
		assert.are.same({ op = "done", stuck = 0 }, Forming.NextMove(IMPORT, members))
	end)

	it("swaps into a full group with someone who doesn't belong there", function()
		local members = {
			member(1, "Cyra", 1),
			member(2, "Elowen", 2),
			member(3, "Fenwick", 2),
			member(4, "A", 2),
			member(5, "B", 2),
			member(6, "C", 2),
		}
		-- Group 2 is full: Elowen and Fenwick belong; A, B and C don't, so Cyra swaps with A.
		assert.are.equal("swap", Forming.NextMove(IMPORT, members).op)
	end)
end)
