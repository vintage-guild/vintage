-- Core: saved-data migrations (pure Lua, no client)
local Load = dofile("Tests/support/load.lua")

describe("Core.Migrations", function()
	local ns, Migrations

	before_each(function()
		ns = Load.files(Load.CORE)
		Migrations = ns.Core.Migrations
	end)

	it("brings a new record of each scope to the latest version", function()
		for _, scope in ipairs({ "global", "char", "profile" }) do
			local record = {}
			local result = Migrations.Run(scope, record)
			assert.is_true(result.success, scope)
			assert.are.equal(0, result.data.from)
			assert.are.equal(Migrations.Latest(scope), result.data.to)
			assert.are.equal(Migrations.Latest(scope), record.schemaVersion)
		end
	end)

	it("gives a character an empty raid session and the account an item table", function()
		local char, global = {}, {}
		Migrations.Run("char", char)
		Migrations.Run("global", global)
		assert.are.equal("idle", char.session.state)
		assert.are.same({}, global.items)
	end)

	it("keeps an existing session and items", function()
		local session = ns.Core.Session.New()
		session.state = "live"
		local char = { session = session }
		local global = { items = { [16800] = { name = "Felheart Robes" } } }
		Migrations.Run("char", char)
		Migrations.Run("global", global)
		assert.are.equal(session, char.session)
		assert.are.equal("Felheart Robes", global.items[16800].name)
	end)

	it("is a no-op on current data", function()
		local char = {}
		Migrations.Run("char", char)
		local session = char.session
		local result = Migrations.Run("char", char)
		assert.is_true(result.success)
		assert.are.equal(result.data.from, result.data.to)
		assert.are.equal(session, char.session)
	end)

	it("refuses data written by a newer version and leaves it alone", function()
		local record = { schemaVersion = 99, future = true }
		local result = Migrations.Run("char", record)
		assert.is_false(result.success)
		assert.are.equal("NEWER_SAVED_DATA", result.error.code)
		assert.are.equal(99, record.schemaVersion)
		assert.is_nil(record.session)
	end)

	it("refuses unknown scopes and non-tables", function()
		assert.are.equal("UNKNOWN_SCOPE", Migrations.Run("realm", {}).error.code)
		assert.are.equal("INVALID_RECORD", Migrations.Run("char", nil).error.code)
		assert.is_nil(Migrations.Latest("realm"))
	end)
end)
