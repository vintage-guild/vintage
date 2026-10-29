-- Bridge: secrets, client detection, the executor, and events, on the fake client
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")

local FENCORE = { "Core/FenCore.lua", "Core/ActionResult.lua", "Core/Catalog.lua", "Domains/Secrets.lua" }

---@param hostOptions table|nil
---@param withFenCore boolean|nil load FenCore first, as embeds.xml does in the game
local function loadBridge(hostOptions, withFenCore)
	local host = Host.New(hostOptions)
	if withFenCore then
		for _, file in ipairs(FENCORE) do
			dofile("Libs/FenCore/" .. file)
		end
	end
	for _, path in ipairs(Load.BRIDGE_LIBRARIES) do
		assert(loadfile(path))()
	end
	local ns = Load.files(Load.CORE)
	ns.db = { char = { session = ns.Core.Session.New() } }
	Load.files(Load.BRIDGE, ns)
	return host, ns
end

describe("Bridge.Secrets", function()
	it("passes public values and drops secret ones", function()
		local host, ns = loadBridge()
		assert.are.equal(5, ns.Secrets.Public(5))
		assert.are.equal("Aeryn", ns.Secrets.Public("Aeryn"))
		assert.is_true(ns.Secrets.IsSecret(host:Secret()))
		assert.is_nil(ns.Secrets.Public(host:Secret()))
	end)

	it("treats everything as public on a client without secret values, even with FenCore loaded", function()
		-- In the game FenCore loads before the Bridge; its own fallback would call every string secret.
		local host, ns = loadBridge(nil, true)
		assert.is_not_nil(_G.FenCore.Secrets)
		_G.issecretvalue = nil
		assert.is_false(ns.Secrets.IsSecret(host:Secret()))
		assert.are.equal("Aeryn", ns.Secrets.Public("Aeryn"))
		assert.are.equal("1.60.1", ns.Context:BuildClientContext().gameVersion)
	end)
end)

describe("Bridge.BridgeStrings", function()
	it("gives the addon a codec over the embedded libraries", function()
		local _, ns = loadBridge()
		local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures
		local decoded = ns.BridgeCodec:DecodeKind(fixtures["raid-import.v1"].encoded, "raid-import")
		assert.is_true(decoded.success)
		assert.are.equal("Molten Core — week 1", decoded.data.raid.title)
	end)
end)

describe("Bridge.Context", function()
	it("recognizes Forever by its project constant", function()
		local _, ns = loadBridge()
		assert.is_true(ns.Context:IsForever())
	end)

	it("refuses another project when the constant exists", function()
		local _, ns = loadBridge({ projectId = 1 })
		assert.is_false(ns.Context:IsForever())
	end)

	it("falls back to the interface number without a project constant", function()
		local _, forever = loadBridge({ foreverConstant = false, projectId = 2 })
		assert.is_true(forever.Context:IsForever())
		local _, classicEra = loadBridge({ foreverConstant = false, projectId = 2, interface = 11507 })
		assert.is_false(classicEra.Context:IsForever())
	end)

	it("describes the client", function()
		local host, ns = loadBridge()
		host.combat = true
		local client = ns.Context:BuildClientContext()
		assert.are.equal("0.1.0", client.addonVersion)
		assert.are.equal(16001, client.interface)
		assert.are.equal("1.60.1", client.gameVersion)
		assert.is_true(client.isForever)
		assert.is_true(client.inCombat)
	end)

	it("passes confirmation through only when it is exactly true", function()
		local _, ns = loadBridge()
		assert.is_true(ns.Context:BuildSessionContext({ confirm = true }).confirm)
		assert.is_false(ns.Context:BuildSessionContext({ confirm = "yes" }).confirm)
		assert.is_false(ns.Context:BuildSessionContext().confirm)
	end)
end)

describe("Bridge.Executor", function()
	local host, ns

	before_each(function()
		host, ns = loadBridge()
	end)

	it("lists its actions in kebab-case", function()
		local names = ns.Executor:List()
		assert.are.same({
			"attendance-snapshot",
			"client-info",
			"encounter-record",
			"item-record",
			"loot-capture",
			"loot-list",
			"member-whisper",
			"raid-arrange",
			"raid-export",
			"raid-import",
			"raid-invite",
			"raid-status",
			"raid-stop",
			"session-clear",
			"session-get",
		}, names)
		for _, name in ipairs(names) do
			assert.matches("^[a-z]+%-[a-z]+$", name)
		end
	end)

	it("refuses an unknown action", function()
		local result = ns.Executor:Execute("raid-teleport")
		assert.is_false(result.success)
		assert.are.equal("UNKNOWN_ACTION", result.error.code)
	end)

	it("reads the session", function()
		local result = ns.Executor:Execute("session-get")
		assert.is_true(result.success)
		assert.are.equal("idle", result.data.state)
	end)

	it("clears the saved session only with confirmation", function()
		ns.db.char.session.state = "live"
		assert.are.equal("CONFIRM_REQUIRED", ns.Executor:Execute("session-clear").error.code)
		assert.are.equal("live", ns.db.char.session.state)

		local result = ns.Executor:Execute("session-clear", { confirm = true })
		assert.is_true(result.success)
		assert.are.equal("live", result.data.cleared.state)
		assert.are.equal("idle", ns.db.char.session.state)
		assert.is_nil(result.data.session)
	end)

	it("turns a thrown error into an ActionResult", function()
		ns.Context.BuildSessionContext = function()
			error("boom")
		end
		local result = ns.Executor:Execute("session-get")
		assert.is_false(result.success)
		assert.are.equal("EXECUTION_ERROR", result.error.code)
		assert.matches("boom", result.error.message)
	end)

	it("tells subscribers only about actions that changed saved state", function()
		local seen = {}
		ns.Executor:Subscribe(function(name, result)
			seen[#seen + 1] = name .. ":" .. tostring(result.success)
		end)
		ns.Executor:Execute("session-get")
		ns.Executor:Execute("client-info")
		ns.Executor:Execute("session-clear") -- refused: nothing changed
		ns.Executor:Execute("not-an-action")
		ns.Executor:Execute("session-clear", { confirm = true })
		assert.are.same({ "session-clear:true" }, seen)
	end)

	it("reports a failing subscriber, throttled, and still runs the others", function()
		local calls = 0
		ns.Executor:Subscribe(function()
			error("listener broke")
		end)
		ns.Executor:Subscribe(function()
			calls = calls + 1
		end)
		ns.Executor:Execute("session-clear", { confirm = true })
		ns.Executor:Execute("session-clear", { confirm = true })
		assert.are.equal(2, calls)
		assert.are.equal(1, #host.errors)
		assert.matches('listener after "session%-clear" failed', host.errors[1])
		host.uptime = host.uptime + 11
		ns.Executor:Execute("session-clear", { confirm = true })
		assert.are.equal(2, #host.errors)
	end)
end)

describe("Bridge.Events", function()
	local host, ns

	before_each(function()
		host, ns = loadBridge()
	end)

	it("calls handlers with the event's arguments", function()
		local got
		ns.Events:On("GROUP_ROSTER_UPDATE", "test", function(event, a, b)
			got = { event, a, b }
		end)
		host:Fire("GROUP_ROSTER_UPDATE", 1, "x")
		assert.are.same({ "GROUP_ROSTER_UPDATE", 1, "x" }, got)
		assert.is_true(ns.Events:IsListening("GROUP_ROSTER_UPDATE"))
	end)

	it("reports a failing handler, throttled, and still runs the others", function()
		local calls = 0
		ns.Events:On("LOOT_OPENED", "broken", function()
			error("bad loot")
		end)
		ns.Events:On("LOOT_OPENED", "fine", function()
			calls = calls + 1
		end)

		host:Fire("LOOT_OPENED")
		host:Fire("LOOT_OPENED")
		assert.are.equal(2, calls)
		assert.are.equal(1, #host.errors)
		assert.matches('LOOT_OPENED handler "broken" failed', host.errors[1])

		host.uptime = host.uptime + 11
		host:Fire("LOOT_OPENED")
		assert.are.equal(2, #host.errors)
	end)

	it("stops listening when the last handler leaves", function()
		local calls = 0
		ns.Events:On("CHAT_MSG_LOOT", "a", function()
			calls = calls + 1
		end)
		ns.Events:On("CHAT_MSG_LOOT", "b", function()
			calls = calls + 1
		end)
		ns.Events:Off("CHAT_MSG_LOOT", "a")
		host:Fire("CHAT_MSG_LOOT")
		assert.are.equal(1, calls)
		ns.Events:Off("CHAT_MSG_LOOT", "b")
		assert.is_false(ns.Events:IsListening("CHAT_MSG_LOOT"))
		host:Fire("CHAT_MSG_LOOT")
		assert.are.equal(1, calls)
	end)

	it("drops everything on OffAll", function()
		local calls = 0
		ns.Events:On("ENCOUNTER_END", "a", function()
			calls = calls + 1
		end)
		ns.Events:OffAll()
		host:Fire("ENCOUNTER_END")
		assert.are.equal(0, calls)
		assert.is_false(ns.Events:IsListening("ENCOUNTER_END"))
	end)
end)
