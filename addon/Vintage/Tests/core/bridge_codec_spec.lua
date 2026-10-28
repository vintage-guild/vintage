-- Core: the bridge string codec and payload schemas against the shared golden fixtures
-- (libs/bridge-format/fixtures, rendered to Tests/fixtures/bridge_fixtures.lua), with the
-- real LibSerialize and LibDeflate.
local Load = dofile("Tests/support/load.lua")
local LuaMade = dofile("Tests/support/lua_made.lua")
local F = dofile("Tests/fixtures/bridge_fixtures.lua")

-- While rewriting lua-made.json, the committed Lua-made strings may be for old payloads.
local WRITING = os.getenv("VINTAGE_WRITE_FIXTURES") == "1"

local function names()
	local list = {}
	for name in pairs(F.fixtures) do
		list[#list + 1] = name
	end
	table.sort(list)
	return list
end

local function copy(value)
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for key, child in pairs(value) do
		out[key] = copy(child)
	end
	return out
end

local function issuePaths(result)
	local paths = {}
	for i, issue in ipairs(result.error.details.issues) do
		paths[i] = issue.path
	end
	return paths
end

describe("Bridge golden fixtures", function()
	local codec

	before_each(function()
		codec = Load.codec()
	end)

	it("covers every fixture with a Lua-made string, and nothing else", function()
		if WRITING then
			return
		end
		local fixtureNames, madeNames = names(), {}
		for name in pairs(F.luaMade) do
			madeNames[#madeNames + 1] = name
		end
		table.sort(madeNames)
		assert.are.same(fixtureNames, madeNames)
		assert.truthy(#fixtureNames >= 6)
	end)

	for _, name in ipairs(names()) do
		local fixture = F.fixtures[name]

		it(name .. ": decodes the TS-made string", function()
			local decoded = codec:Decode(fixture.encoded)
			if fixture.error then
				assert.is_false(decoded.success)
				assert.are.equal(fixture.error, decoded.error.code)
				assert.is_not_nil(decoded.error.suggestion)
			else
				assert.is_true(decoded.success, decoded.error and decoded.error.message)
				assert.are.same(fixture.payload, decoded.data)
			end
		end)

		it(name .. ": decodes the Lua-made string", function()
			if WRITING then
				return
			end
			local decoded = codec:Decode(F.luaMade[name])
			if fixture.error then
				assert.are.equal(fixture.error, decoded.error.code)
			else
				assert.are.same(fixture.payload, decoded.data)
			end
		end)

		it(name .. ": the committed Lua-made string is what this Lua encodes", function()
			if WRITING then
				return
			end
			local encoded = codec:EncodeValue(fixture.payload)
			assert.is_true(encoded.success)
			assert.are.equal(
				F.luaMade[name],
				encoded.data,
				"lua-made.json differs from this Lua's encoding; regenerate it (Tests/support/lua_made.lua)"
			)
		end)

		if not fixture.error then
			it(name .. ": passes its schema and round-trips through Encode", function()
				local encoded = codec:Encode(fixture.payload)
				assert.is_true(encoded.success, encoded.error and encoded.error.message)
				assert.matches("^!VIN:1!", encoded.data)
				assert.are.same(fixture.payload, codec:Decode(encoded.data).data)
			end)
		end
	end

	it("rewrites lua-made.json when VINTAGE_WRITE_FIXTURES=1", function()
		if not WRITING then
			return
		end
		local strings = {}
		for _, name in ipairs(names()) do
			strings[name] = codec:EncodeValue(F.fixtures[name].payload).data
		end
		LuaMade.Write(strings)
	end)
end)

describe("Bridge envelope", function()
	local codec, Codec

	before_each(function()
		local ns
		codec, ns = Load.codec()
		Codec = ns.Core.BridgeFormat.Codec
	end)

	local function code(result)
		return result.success and "ok" or result.error.code
	end

	it("accepts surrounding whitespace, as a paste often has", function()
		local text = "  \n" .. F.fixtures["raid-export-empty.v1"].encoded .. " \r\n"
		assert.is_true(codec:Decode(text).success)
	end)

	it("refuses things that aren't bridge strings", function()
		assert.are.equal("NOT_A_BRIDGE_STRING", code(codec:Decode(nil)))
		assert.are.equal("NOT_A_BRIDGE_STRING", code(codec:Decode("hello raid")))
		assert.are.equal("NOT_A_BRIDGE_STRING", code(codec:Decode("VIN:1!abc")))
	end)

	it("refuses a newer envelope", function()
		local result = codec:Decode("!VIN:2!abcd")
		assert.are.equal("UNSUPPORTED_ENCODING", code(result))
		assert.are.same({ version = 2, supported = 1 }, result.error.details)
	end)

	it("calls damaged strings corrupt", function()
		assert.are.equal("CORRUPT", code(codec:Decode("!VIN:1!@@@@")))
		local encoded = F.fixtures["raid-import.v1"].encoded
		assert.are.equal("CORRUPT", code(codec:Decode(encoded:sub(1, #encoded - 40))))
		assert.are.equal("CORRUPT", code(codec:Decode(Codec.PREFIX .. "aaaaaaaaaaaa")))
	end)

	it("refuses strings over the length limit", function()
		local limits = copy(Codec.DEFAULT_LIMITS)
		limits.maxEncodedLength = 20
		assert.are.equal("TOO_LARGE", code(codec:Decode(F.fixtures["raid-import.v1"].encoded, limits)))
	end)

	it("refuses payloads that inflate past the limit", function()
		local limits = copy(Codec.DEFAULT_LIMITS)
		limits.maxSerializedBytes = 64
		local big = codec:EncodeValue({ v = 1, kind = "raid-export", filler = string.rep("x", 500) }).data
		assert.are.equal("TOO_LARGE", code(codec:Decode(big, limits)))
	end)

	it("refuses tables nested too deep or with too many values", function()
		local deep = {}
		local cursor = deep
		for _ = 1, 40 do
			cursor.next = {}
			cursor = cursor.next
		end
		local result = codec:DecodeValue(codec:EncodeValue(deep).data)
		assert.are.equal("CORRUPT", code(result))
		assert.matches("nested deeper than 32", result.error.message)

		local limits = copy(Codec.DEFAULT_LIMITS)
		limits.maxNodes = 10
		local wide = {}
		for i = 1, 20 do
			wide[i] = i
		end
		assert.matches("More than 10 values", codec:DecodeValue(codec:EncodeValue(wide).data, limits).error.message)
	end)

	it("trims whitespace, no-break spaces, and byte order marks in linear time", function()
		local encoded = F.fixtures["raid-export-empty.v1"].encoded
		assert.is_true(codec:Decode("\239\187\191\194\160 " .. encoded .. "\194\160\r\n").success)
		assert.are.equal("", Codec.TrimPaste(" \194\160\239\187\191 "))
		local started = os.clock()
		local result = codec:Decode("!VIN:1!" .. string.rep(" ", 200000) .. "x")
		assert.are.equal("CORRUPT", code(result))
		assert.truthy(os.clock() - started < 1, "trimming a long run of spaces took too long")
	end)

	--- A bridge string around whatever LibSerialize wrote, bypassing EncodeValue.
	local function wrap(serialized)
		local deflate = LibStub("LibDeflate")
		return Codec.PREFIX .. deflate:EncodeForPrint(deflate:CompressDeflate(serialized))
	end

	it("refuses a second value after the payload, as the TS side does", function()
		local two = LibStub("LibSerialize"):Serialize({ v = 1, kind = "raid-export" }, "extra")
		local result = codec:DecodeValue(wrap(two))
		assert.are.equal("CORRUPT", code(result))
		assert.matches("exactly one serialized value", result.error.message)
		assert.are.equal("CORRUPT", code(codec:DecodeValue(wrap(LibStub("LibSerialize"):Serialize()))))
	end)

	it("refuses keys that aren't strings or numbers, and invalid UTF-8 anywhere", function()
		local boolKey = codec:DecodeValue(wrap(LibStub("LibSerialize"):Serialize({ [true] = 1 })))
		assert.matches("Unsupported table key type boolean", boolKey.error.message)
		local badText = codec:DecodeValue(codec:EncodeValue({ note = "Ab\195" }).data)
		assert.are.equal("CORRUPT", code(badText))
		assert.matches("not valid UTF%-8", badText.error.message)
	end)

	it("counts values the TS way: map keys and values, not array positions", function()
		local list = {}
		for i = 1, 20 do
			list[i] = i
		end
		local text = codec:EncodeValue(list).data
		local limits = copy(Codec.DEFAULT_LIMITS)
		limits.maxNodes = 21 -- the table and its 20 values
		assert.is_true(codec:DecodeValue(text, limits).success)
		limits.maxNodes = 20
		assert.are.equal("CORRUPT", code(codec:DecodeValue(text, limits)))

		local map = codec:EncodeValue({ a = 1, b = 2 }).data
		limits.maxNodes = 5 -- the table, two keys, two values
		assert.is_true(codec:DecodeValue(map, limits).success)
		limits.maxNodes = 4
		assert.are.equal("CORRUPT", code(codec:DecodeValue(map, limits)))
	end)

	it("tells an import from an export", function()
		local export = F.fixtures["raid-export.v1"].encoded
		assert.is_true(codec:DecodeKind(export, "raid-export").success)
		local wrong = codec:DecodeKind(export, "raid-import")
		assert.are.equal("WRONG_KIND", code(wrong))
		assert.are.same({ expected = "raid-import", actual = "raid-export" }, wrong.error.details)
	end)

	it("won't encode a payload that breaks its schema", function()
		local payload = copy(F.fixtures["raid-import.v1"].payload)
		payload.groups[1].group = 9
		local result = codec:Encode(payload)
		assert.are.equal("INVALID_PAYLOAD", code(result))
		assert.are.same({ "groups.0.group" }, issuePaths(result))
	end)
end)

describe("Bridge payload schema", function()
	local Schema, import, export

	before_each(function()
		local _, ns = Load.codec()
		Schema = ns.Core.BridgeFormat.Schema
		import = copy(F.fixtures["raid-import.v1"].payload)
		export = copy(F.fixtures["raid-export.v1"].payload)
	end)

	local function check(payload)
		return Schema.Validate(payload)
	end

	it("accepts both kinds of version 1 payload", function()
		assert.is_true(check(import).success)
		assert.is_true(check(export).success)
		assert.is_true(check(F.fixtures["raid-export-empty.v1"].payload).success)
	end)

	it("checks the version before anything else", function()
		import.v = nil
		assert.are.equal("INVALID_PAYLOAD", check(import).error.code)
		import.v = 0
		assert.are.equal("INVALID_PAYLOAD", check(import).error.code)
		import.v = 1.5
		assert.are.equal("INVALID_PAYLOAD", check(import).error.code)
		import.v, import.kind = 2, "raid-teleport"
		local newer = check(import)
		assert.are.equal("UNSUPPORTED_VERSION", newer.error.code)
		assert.matches("newer than", newer.error.message)
		import.v = 2 ^ 60 -- Number.isInteger has no 2^53 bound, so this is a newer version too
		assert.are.equal("UNSUPPORTED_VERSION", check(import).error.code)
	end)

	it("then the kind", function()
		import.kind = "raid-teleport"
		assert.are.same({ kind = "raid-teleport" }, check(import).error.details)
		import.kind = 7
		assert.are.same({ kind = "number" }, check(import).error.details)
		assert.are.equal("INVALID_PAYLOAD", check({ 1, 2, 3 }).error.code)
		assert.are.equal("INVALID_PAYLOAD", check("raid").error.code)
	end)

	it("requires fields and checks their types", function()
		import.guildId = nil
		import.generatedAt = 1793000000.5
		import.raid.title = 12
		import.loot.mode = "council"
		import.roster[1].class = "deathknight"
		import.roster[2].role = "dps"
		assert.are.same({
			"guildId",
			"generatedAt",
			"raid.title",
			"roster.0.class",
			"roster.1.role",
			"loot.mode",
		}, issuePaths(check(import)))
	end)

	it("uses the class and role lists from @vintage/wow-data", function()
		assert.are.same(F.wowData.classes, Schema.CLASSES)
		assert.are.same(F.wowData.roles, Schema.ROLES)
	end)

	it("refuses invalid UTF-8 and integers past 2^53, which the website would refuse", function()
		export.exporter = "Ab\195" -- truncated two-byte character
		export.exportedAt = 2 ^ 60
		export.loot[1].looter = "Br\237\160\128n" -- an encoded surrogate
		export.items[1].name = "Over\192\175long" -- an overlong slash
		assert.are.same({ "exportedAt", "exporter", "loot.0.looter", "items.0.name" }, issuePaths(check(export)))
		assert.is_false(Schema.Utf8("\244\144\128\128")) -- past U+10FFFF
		assert.is_true(Schema.Utf8("\244\143\191\191")) -- U+10FFFF itself
	end)

	it("judges a huge string without reading it, however often it repeats", function()
		local huge = string.rep("é", 1000000)
		for i = 1, 5000 do
			export.items[i] = { itemId = i, name = huge, quality = 1 }
		end
		local started = os.clock()
		local result = check(export)
		assert.are.equal(5000, result.error.details.issueCount)
		assert.truthy(os.clock() - started < 1, "checking repeated huge strings took too long")
	end)

	it("counts string length the way JavaScript does", function()
		assert.are.equal(6, Schema.Utf16Length("Élowen"))
		assert.are.equal(2, Schema.Utf16Length("\240\159\152\128")) -- one emoji, a surrogate pair
		assert.is_nil(Schema.Utf16Length("\255"))
		import.roster[1].name = "A"
		import.roster[2].name = string.rep("é", 48)
		import.roster[3].name = string.rep("é", 49)
		assert.are.same({ "roster.0.name", "roster.2.name" }, issuePaths(check(import)))
	end)

	it("limits list sizes", function()
		import.groups[2].characterIds = { "c_cyra", "c_elowen", "c_a", "c_b", "c_c", "c_d" }
		assert.are.same({ "groups.1.characterIds" }, issuePaths(check(import)))
	end)

	it("checks every import cross-reference rule", function()
		import.roster[2].characterId = "c_aeryn" -- duplicate roster id (and c_brann is gone)
		import.groups[2].group = 1 -- duplicate group number
		import.groups[2].characterIds = { "c_cyra", "c_aeryn", "c_ghost" } -- in two groups, not rostered
		import.candidates[2].itemId = 16800 -- duplicate item
		import.candidates[1].ranked[2].characterId = "c_doran" -- ranked twice
		import.candidates[2].ranked = { { characterId = "c_nobody", reason = "?" } }
		assert.are.same({
			"roster.1.characterId",
			"groups.1.group",
			"groups.0.characterIds.1",
			"groups.1.characterIds.2",
			"groups.1.characterIds.1",
			"candidates.1.itemId",
			"candidates.0.ranked.1.characterId",
			"candidates.1.ranked.0.characterId",
		}, issuePaths(check(import)))
	end)

	it("checks the export's snapshots, loot, and items", function()
		export.attendance[1].members[1].group = 9
		export.attendance[1].members[2].online = "yes"
		export.loot[1].count = 0
		export.items[1].quality = 9
		export.items[2].equipLoc = string.rep("x", 41)
		export.eventId = ""
		assert.are.same({
			"eventId",
			"attendance.0.members.0.group",
			"attendance.0.members.1.online",
			"loot.0.count",
			"items.0.quality",
			"items.1.equipLoc",
		}, issuePaths(check(export)))
	end)

	it("ignores fields it doesn't know, as Zod does", function()
		export.futureField = { anything = true }
		assert.is_true(check(export).success)
	end)

	it("reports at most 20 issues but counts them all", function()
		for i = 1, 30 do
			export.loot[i] = { itemId = 0, looter = "Aeryn", at = 1 }
		end
		local result = check(export)
		assert.are.equal(20, #result.error.details.issues)
		assert.are.equal(30, result.error.details.issueCount)
	end)
end)

describe("lua-made.json writer", function()
	it("renders sorted, escaped JSON with the provenance comment", function()
		local text = LuaMade.Render({ b = "!VIN:1!b", a = 'say "hi"\n' })
		assert.matches('^{\n  "%$comment": "Encoded by the addon', text)
		assert.truthy(text:find('"a": "say \\"hi\\"\\u000a",\n    "b": "!VIN:1!b"\n  }\n}\n', 1, true))
	end)
end)
