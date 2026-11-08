-- Core.Share: the members' view of an import, against the shared fixtures. raid-share.v1 is
-- what libs/bridge-format's raidShareFromImport makes from raid-import-bench.v1, so Lua and
-- TypeScript agree on every field.
local Load = dofile("Tests/support/load.lua")
local F = dofile("Tests/fixtures/bridge_fixtures.lua")

local codec, Share, Schema, Hash

before_each(function()
	local ns
	codec, ns = Load.codec()
	Share = ns.Core.Share
	Schema = ns.Core.BridgeFormat.Schema
	Hash = ns.Core.Hash
end)

local function payload(name)
	local fixture = F.fixtures[name]
	assert(fixture, "no fixture " .. name)
	return fixture.payload
end

--- The same table built with its keys inserted in the opposite order.
local function reversed(value)
	if type(value) ~= "table" then
		return value
	end
	local keys = {}
	for key in pairs(value) do
		keys[#keys + 1] = key
	end
	table.sort(keys, function(a, b)
		return tostring(a) > tostring(b)
	end)
	local out = {}
	for _, key in ipairs(keys) do
		out[key] = reversed(value[key])
	end
	return out
end

describe("Core.Share.FromImport", function()
	it("makes what the TypeScript side makes from the same import", function()
		assert.are.same(payload("raid-share.v1"), Share.FromImport(payload("raid-import-bench.v1")))
	end)

	it("keeps who is on the bench and drops why", function()
		local share = Share.FromImport(payload("raid-import-bench.v1"))
		assert.are.equal(#payload("raid-import-bench.v1").bench, #share.bench)
		for _, entry in ipairs(share.bench) do
			assert.is_nil(entry.reason)
		end
	end)

	it("has no bench when the import has none, and passes the schema", function()
		local share = Share.FromImport(payload("raid-import.v1"))
		assert.is_nil(share.bench)
		assert.is_true(Schema.Validate(share).success)
		assert.is_true(Schema.Validate(Share.FromImport(payload("raid-import-bench.v1"))).success)
	end)

	it("encodes to the same string whoever builds it, so fingerprints agree", function()
		local import = payload("raid-import-bench.v1")
		local first = codec:Encode(Share.FromImport(import))
		local second = codec:Encode(Share.FromImport(reversed(import)))
		assert.is_true(first.success)
		assert.are.equal(first.data, second.data)
		assert.are.equal(Hash.Sha256(first.data), Hash.Sha256(second.data))
	end)

	it("doesn't share tables with the import", function()
		local import = payload("raid-import-bench.v1")
		local share = Share.FromImport(import)
		share.roster[1].name = "Changed"
		assert.are_not.equal("Changed", import.roster[1].name)
	end)

	it("reads back through the codec as a raid-share", function()
		local encoded = codec:Encode(Share.FromImport(payload("raid-import-bench.v1")))
		local decoded = codec:DecodeKind(encoded.data, "raid-share")
		assert.is_true(decoded.success)
		local asImport = codec:DecodeKind(encoded.data, "raid-import")
		assert.are.equal("WRONG_KIND", asImport.error.code)
	end)
end)
