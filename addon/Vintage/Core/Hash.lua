--------------------------------------------------------------------------------
-- Vintage Core: SHA-256
-- The raid sync's fingerprint (docs/features/active/addon-for-members, Trust): a client
-- keeps shared bytes only when their SHA-256 matches one an officer announced. Plain
-- Lua 5.1 arithmetic, no `bit` library, so busted and the game run the same code.
-- Bitwise AND and XOR go four bits at a time through 16x16 tables.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core

local Hash = {}
Core.Hash = Hash

local floor = math.floor
local byte, char, format, rep = string.byte, string.char, string.format, string.rep
local concat = table.concat

local TWO32 = 4294967296

-- AND_NIBBLE[a * 16 + b + 1], XOR_NIBBLE likewise, for 0 <= a, b < 16.
local AND_NIBBLE, XOR_NIBBLE = {}, {}
for a = 0, 15 do
	for b = 0, 15 do
		local andValue, xorValue, bitValue = 0, 0, 1
		local x, y = a, b
		for _ = 1, 4 do
			local xb, yb = x % 2, y % 2
			if xb == 1 and yb == 1 then
				andValue = andValue + bitValue
			end
			if xb ~= yb then
				xorValue = xorValue + bitValue
			end
			x, y, bitValue = floor(x / 2), floor(y / 2), bitValue * 2
		end
		AND_NIBBLE[a * 16 + b + 1] = andValue
		XOR_NIBBLE[a * 16 + b + 1] = xorValue
	end
end

local function nibbleOp(tbl, x, y)
	local result, place = 0, 1
	for _ = 1, 8 do
		local xn, yn = x % 16, y % 16
		result = result + tbl[xn * 16 + yn + 1] * place
		x, y, place = (x - xn) / 16, (y - yn) / 16, place * 16
	end
	return result
end

local function band(x, y)
	return nibbleOp(AND_NIBBLE, x, y)
end

local function bxor(x, y)
	return nibbleOp(XOR_NIBBLE, x, y)
end

local function bnot(x)
	return TWO32 - 1 - x
end

local function rotr(x, n)
	local low = x % 2 ^ n
	return (x - low) / 2 ^ n + low * 2 ^ (32 - n)
end

local function shr(x, n)
	return floor(x / 2 ^ n)
end

-- stylua: ignore
local K = {
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

-- stylua: ignore
local INITIAL = {
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
}

--- The message with SHA-256's padding: a 1 bit, zeros, and the length in bits.
local function pad(message)
	local length = #message
	local zeros = (55 - length) % 64
	local bits = length * 8
	local lengthBytes = {}
	for index = 8, 1, -1 do
		lengthBytes[index] = bits % 256
		bits = floor(bits / 256)
	end
	return message .. "\128" .. rep("\0", zeros) .. char(unpack(lengthBytes))
end

local function compress(state, block, offset, w)
	for index = 1, 16 do
		local at = offset + (index - 1) * 4
		local b1, b2, b3, b4 = byte(block, at + 1, at + 4)
		w[index] = ((b1 * 256 + b2) * 256 + b3) * 256 + b4
	end
	for index = 17, 64 do
		local w15, w2 = w[index - 15], w[index - 2]
		local s0 = bxor(bxor(rotr(w15, 7), rotr(w15, 18)), shr(w15, 3))
		local s1 = bxor(bxor(rotr(w2, 17), rotr(w2, 19)), shr(w2, 10))
		w[index] = (w[index - 16] + s0 + w[index - 7] + s1) % TWO32
	end

	local a, b, c, d, e, f, g, h = state[1], state[2], state[3], state[4], state[5], state[6], state[7], state[8]
	for index = 1, 64 do
		local s1 = bxor(bxor(rotr(e, 6), rotr(e, 11)), rotr(e, 25))
		local ch = bxor(band(e, f), band(bnot(e), g))
		local temp1 = (h + s1 + ch + K[index] + w[index]) % TWO32
		local s0 = bxor(bxor(rotr(a, 2), rotr(a, 13)), rotr(a, 22))
		local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
		local temp2 = (s0 + maj) % TWO32
		h, g, f, e = g, f, e, (d + temp1) % TWO32
		d, c, b, a = c, b, a, (temp1 + temp2) % TWO32
	end

	state[1] = (state[1] + a) % TWO32
	state[2] = (state[2] + b) % TWO32
	state[3] = (state[3] + c) % TWO32
	state[4] = (state[4] + d) % TWO32
	state[5] = (state[5] + e) % TWO32
	state[6] = (state[6] + f) % TWO32
	state[7] = (state[7] + g) % TWO32
	state[8] = (state[8] + h) % TWO32
end

--- The SHA-256 of a string, as 64 lowercase hex digits.
---@param message string
---@return string
function Hash.Sha256(message)
	assert(type(message) == "string", "Hash.Sha256 takes a string")
	local padded = pad(message)
	local state = { unpack(INITIAL) }
	local w = {}
	for offset = 0, #padded - 1, 64 do
		compress(state, padded, offset, w)
	end
	local hex = {}
	for index = 1, 8 do
		hex[index] = format("%08x", state[index])
	end
	return concat(hex)
end

return Hash
