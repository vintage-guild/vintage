-- Core.Hash: SHA-256 against the standard test vectors (FIPS 180-2 and NIST's examples).
local Load = dofile("Tests/support/load.lua")

local Hash

before_each(function()
	Hash = Load.files({ "Core/init.lua", "Core/Hash.lua" }).Core.Hash
end)

describe("Core.Hash.Sha256", function()
	it("matches the standard vectors", function()
		assert.are.equal("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Hash.Sha256(""))
		assert.are.equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Hash.Sha256("abc"))
		-- 56 bytes: the padding spills into a second block.
		assert.are.equal(
			"248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
			Hash.Sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
		)
		assert.are.equal(
			"d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
			Hash.Sha256("The quick brown fox jumps over the lazy dog")
		)
	end)

	-- The standard's million-"a" vector passes too, but takes ~11 s on PUC Lua 5.1 (about
	-- 55 ms for a typical few-KB share), so it isn't run with the suite.

	it("hashes every byte value, and lengths around the block edge", function()
		local all = {}
		for value = 0, 255 do
			all[#all + 1] = string.char(value)
		end
		assert.are.equal(
			"40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880",
			Hash.Sha256(table.concat(all))
		)
		local seen = {}
		for length = 54, 66 do
			local digest = Hash.Sha256(string.rep("x", length))
			assert.are.equal(64, #digest)
			assert.is_nil(seen[digest], "a different digest for each length")
			seen[digest] = true
		end
	end)

	it("changes completely when one byte changes", function()
		assert.are_not.equal(Hash.Sha256("!VIN:1!abc"), Hash.Sha256("!VIN:1!abd"))
	end)
end)
