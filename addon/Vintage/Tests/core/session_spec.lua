-- Core: the raid session and its actions (pure Lua, no client)
local Load = dofile("Tests/support/load.lua")

describe("Core.Session", function()
	local ns

	before_each(function()
		ns = Load.files(Load.CORE)
	end)

	it("starts idle and empty", function()
		local session = ns.Core.Session.New()
		assert.are.equal("idle", session.state)
		assert.are.equal(ns.Core.Session.SCHEMA_VERSION, session.schemaVersion)
		assert.are.same({}, session.attendance)
		assert.are.same({}, session.loot)
		assert.are.same({}, session.itemsSeen)
	end)

	it("summarizes an empty session", function()
		local result = ns.Core.Session.Summary(ns.Core.Session.New())
		assert.is_true(result.success)
		assert.are.equal("idle", result.data.state)
		assert.are.equal(0, result.data.roster)
		assert.is_nil(result.data.title)
		assert.are.equal("No raid imported", result.reasoning)
	end)

	it("counts what an imported raid holds", function()
		local session = ns.Core.Session.New()
		session.state = "live"
		session.import = {
			raid = { eventId = "evt_mc_0001", title = "Molten Core — week 1" },
			roster = { { characterId = "c_aeryn" }, { characterId = "c_brann" }, { characterId = "c_cyra" } },
		}
		session.attendance = { { at = 1, members = {} } }
		session.loot = { { itemId = 16800 }, { itemId = 17076 } }
		session.itemsSeen = { [16800] = true, [17076] = true, [18803] = true }

		local result = ns.Core.Session.Summary(session)
		assert.is_true(result.success)
		assert.are.same({
			state = "live",
			title = "Molten Core — week 1",
			eventId = "evt_mc_0001",
			roster = 3,
			snapshots = 1,
			loot = 2,
			items = 3,
		}, result.data)
		assert.matches("3 characters", result.reasoning)
	end)

	it("refuses a missing or unreadable session", function()
		for _, session in ipairs({ false, "idle", { state = "dancing" } }) do
			local result = ns.Core.Session.Summary(session)
			assert.is_false(result.success)
			assert.are.equal("INVALID_SESSION", result.error.code)
			assert.is_not_nil(result.error.suggestion)
		end
		assert.are.equal("INVALID_SESSION", ns.Core.Session.Summary(nil).error.code)
	end)
end)

describe("Core.Actions.Session", function()
	local ns, Actions

	before_each(function()
		ns = Load.files(Load.CORE)
		Actions = ns.Core.Actions.Session
	end)

	it("session-get returns the summary", function()
		local result = Actions.Get({ session = ns.Core.Session.New() })
		assert.is_true(result.success)
		assert.are.equal("idle", result.data.state)
	end)

	it("session-get refuses a missing context", function()
		assert.are.equal("INVALID_CONTEXT", Actions.Get(nil).error.code)
	end)

	it("session-clear needs confirmation and changes nothing without it", function()
		local session = ns.Core.Session.New()
		session.state = "live"
		local result = Actions.Clear({ session = session })
		assert.is_false(result.success)
		assert.are.equal("CONFIRM_REQUIRED", result.error.code)
		assert.matches("confirm", result.error.suggestion)
		assert.are.equal("live", session.state)
	end)

	it("session-clear with confirmation returns an empty session and what it cleared", function()
		local session = ns.Core.Session.New()
		session.state = "exported"
		session.loot = { { itemId = 16800 } }
		local result = Actions.Clear({ session = session, confirm = true })
		assert.is_true(result.success)
		assert.are.equal("idle", result.data.session.state)
		assert.are.same({}, result.data.session.loot)
		assert.are.equal("exported", result.data.cleared.state)
		assert.are.equal(1, result.data.cleared.loot)
	end)

	it("session-clear recovers an unreadable session", function()
		local result = Actions.Clear({ session = { state = "broken" }, confirm = true })
		assert.is_true(result.success)
		assert.is_nil(result.data.cleared)
		assert.are.equal("idle", result.data.session.state)
	end)
end)

describe("Core.Result", function()
	it("falls back to its own ActionResult without FenCore", function()
		local ns = Load.files(Load.CORE)
		local ok = ns.Core.Result.success({ a = 1 }, "why")
		assert.are.same({ success = true, data = { a = 1 }, reasoning = "why" }, ok)
		local err = ns.Core.Result.error("CODE", "message", "suggestion")
		assert.are.same({ success = false, error = { code = "CODE", message = "message", suggestion = "suggestion" } }, err)
	end)

	it("uses FenCore's ActionResult when FenCore is loaded", function()
		dofile("Tests/support/wow.lua").New() -- FenCore registers a slash command at load
		dofile("Libs/FenCore/Core/FenCore.lua")
		dofile("Libs/FenCore/Core/ActionResult.lua")
		local ns = Load.files(Load.CORE)
		assert.are.equal(_G.FenCore.ActionResult, ns.Core.Result)
		assert.are.equal("idle", ns.Core.Actions.Session.Get({ session = ns.Core.Session.New() }).data.state)
	end)
end)
