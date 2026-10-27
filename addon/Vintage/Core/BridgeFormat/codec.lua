--------------------------------------------------------------------------------
-- Vintage Core: the bridge string codec
-- The Lua twin of libs/bridge-format's envelope and bridge.ts:
--
--   !VIN:1!  +  EncodeForPrint( CompressDeflate( SerializeEx({ stable = true }, payload) ) )
--
-- LibSerialize and LibDeflate are passed in (Bridge/BridgeStrings.lua hands over the
-- embedded copies), so Core stays free of LibStub and the specs load the real
-- libraries directly. Pasted strings are untrusted: the TS side's limits and error
-- codes, and nothing here throws. One difference: LibDeflate can't stop mid-stream, so
-- the inflated-size cap is checked after inflating (the TS side stops at the cap).
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result
local Schema = Core.BridgeFormat.Schema

local Codec = {}
Core.BridgeFormat.Codec = Codec

Codec.ENVELOPE_VERSION = 1
Codec.PREFIX = "!VIN:" .. Codec.ENVELOPE_VERSION .. "!"

-- libs/bridge-format DEFAULT_DECODE_LIMITS
Codec.DEFAULT_LIMITS = {
	maxEncodedLength = 1000000, -- characters in the pasted string
	maxSerializedBytes = 2 * 1024 * 1024, -- after inflating
	maxDepth = 32, -- table nesting
	maxNodes = 200000, -- values, counting repeated table references each time
}

local CodecMixin = {}

--- A codec over the given libraries.
---@param LibSerialize table LibSerialize, MINOR 7 or later (stable serialization)
---@param LibDeflate table
---@return table codec
function Codec.New(LibSerialize, LibDeflate)
	local codec = { LibSerialize = LibSerialize, LibDeflate = LibDeflate }
	for name, method in pairs(CodecMixin) do
		codec[name] = method
	end
	return codec
end

--- Refuses what the TS deserializer refuses: cycles, nesting past maxDepth, more than
--- maxNodes values (map keys and values count, array positions don't; a repeated table
--- reference counts each time), keys that aren't strings or numbers, and invalid UTF-8
--- (TextDecoder with fatal = true). Each distinct string is checked once.
---@return string|nil problem
local function CheckShape(value, limits)
	local nodes, onStack, checkedStrings = 0, {}, {}
	local function walk(current, depth)
		nodes = nodes + 1
		if nodes > limits.maxNodes then
			return "More than " .. limits.maxNodes .. " values"
		end
		local kind = type(current)
		if kind == "string" then
			if not checkedStrings[current] then
				if not Schema.Utf8(current) then
					return "A string is not valid UTF-8"
				end
				checkedStrings[current] = true
			end
			return nil
		end
		if kind ~= "table" then
			return nil
		end
		if depth > limits.maxDepth then
			return "Tables nested deeper than " .. limits.maxDepth
		end
		if onStack[current] then
			return "A table contains itself"
		end
		onStack[current] = true
		local length = #current
		for key, child in pairs(current) do
			local keyKind = type(key)
			if keyKind ~= "string" and keyKind ~= "number" then
				return "Unsupported table key type " .. keyKind
			end
			local isPosition = keyKind == "number" and key >= 1 and key <= length and key == math.floor(key)
			local problem = (not isPosition and walk(key, depth + 1)) or walk(child, depth + 1)
			if problem then
				return problem
			end
		end
		onStack[current] = nil
		return nil
	end
	return walk(value, 1)
end

--- The number of values passed, nils included, and a table of them.
local function Pack(...)
	return select("#", ...), { ... }
end

-- JavaScript's String.prototype.trim also strips these; a paste can carry them.
local NO_BREAK_SPACE, BYTE_ORDER_MARK = "\194\160", "\239\187\191"

--- Trims whitespace, no-break spaces, and byte order marks from both ends, in linear time.
local function TrimPaste(text)
	local first, last = 1, #text
	while first <= last do
		if text:find("^%s", first) then
			first = first + 1
		elseif text:sub(first, first + 1) == NO_BREAK_SPACE then
			first = first + 2
		elseif text:sub(first, first + 2) == BYTE_ORDER_MARK then
			first = first + 3
		else
			break
		end
	end
	while last >= first do
		if text:sub(last, last):find("%s") then
			last = last - 1
		elseif last - 1 >= first and text:sub(last - 1, last) == NO_BREAK_SPACE then
			last = last - 2
		elseif last - 2 >= first and text:sub(last - 2, last) == BYTE_ORDER_MARK then
			last = last - 3
		else
			break
		end
	end
	return text:sub(first, last)
end
Codec.TrimPaste = TrimPaste

--- Wraps any serializable value, without checking it against a schema (TS encodeValue).
---@param value any
---@return table ActionResult with the string as data
function CodecMixin:EncodeValue(value)
	local ok, serialized = pcall(self.LibSerialize.SerializeEx, self.LibSerialize, { stable = true }, value)
	if not ok then
		return Result.error("UNSERIALIZABLE", "The value can't be serialized: " .. tostring(serialized))
	end
	local compressed = self.LibDeflate:CompressDeflate(serialized, { level = 9 })
	return Result.success(Codec.PREFIX .. self.LibDeflate:EncodeForPrint(compressed))
end

--- Checks a payload against its schema, then wraps it (TS encodeBridge).
---@param payload table
---@return table ActionResult with the string as data
function CodecMixin:Encode(payload)
	local checked = Schema.Validate(payload)
	if not checked.success then
		return checked
	end
	return self:EncodeValue(payload)
end

--- Unwraps a pasted string to its raw value, without checking a schema (TS decodeValue).
---@param input string
---@param limits table|nil
---@return table ActionResult with the value as data
function CodecMixin:DecodeValue(input, limits)
	limits = limits or Codec.DEFAULT_LIMITS
	if type(input) ~= "string" then
		return Schema.Error("NOT_A_BRIDGE_STRING", "Nothing was pasted")
	end
	local text = TrimPaste(input)
	if #text > limits.maxEncodedLength then
		return Schema.Error("TOO_LARGE", string.format("The string is longer than %d chars", limits.maxEncodedLength))
	end
	local envelope, body = text:match("^!VIN:(%d+)!(.*)$")
	if not envelope then
		return Schema.Error("NOT_A_BRIDGE_STRING", "The string does not start with !VIN:")
	end
	envelope = tonumber(envelope)
	if envelope ~= Codec.ENVELOPE_VERSION then
		return Schema.Error(
			"UNSUPPORTED_ENCODING",
			string.format(
				"Envelope version %d is not supported (this build reads %d)",
				envelope,
				Codec.ENVELOPE_VERSION
			),
			{ version = envelope, supported = Codec.ENVELOPE_VERSION }
		)
	end

	local compressed = self.LibDeflate:DecodeForPrint(body)
	if not compressed then
		return Schema.Error("CORRUPT", "The string has characters outside its alphabet")
	end
	local ok, serialized = pcall(self.LibDeflate.DecompressDeflate, self.LibDeflate, compressed)
	if not ok or type(serialized) ~= "string" then
		return Schema.Error("CORRUPT", "The string could not be decompressed")
	end
	if #serialized > limits.maxSerializedBytes then
		return Schema.Error("TOO_LARGE", string.format("The payload inflates past %d bytes", limits.maxSerializedBytes))
	end

	-- Deserialize already returns pcall's results: success, then the values or the error.
	local returned, results = Pack(pcall(self.LibSerialize.Deserialize, self.LibSerialize, serialized))
	local called, success = results[1], results[2]
	if not called or not success then
		local reason = called and results[3] or success
		return Schema.Error("CORRUPT", "The payload could not be read: " .. tostring(reason))
	end
	-- Exactly one value, as the TS deserializer requires (trailing bytes are refused there).
	if returned - 2 ~= 1 then
		return Schema.Error("CORRUPT", "The payload could not be read: expected exactly one serialized value")
	end
	local value = results[3]
	local problem = CheckShape(value, limits)
	if problem then
		return Schema.Error("CORRUPT", "The payload could not be read: " .. problem)
	end
	return Result.success(value)
end

--- Decodes any bridge string and checks its payload (TS decodeBridge). Never throws.
---@param input string
---@param limits table|nil
---@return table ActionResult with the payload as data
function CodecMixin:Decode(input, limits)
	local raw = self:DecodeValue(input, limits)
	if not raw.success then
		return raw
	end
	return Schema.Validate(raw.data)
end

--- Decodes a string that must be of one kind (TS decodeRaidImport / decodeRaidExport).
---@param input string
---@param kind string "raid-import" | "raid-export"
---@param limits table|nil
---@return table ActionResult with the payload as data
function CodecMixin:DecodeKind(input, kind, limits)
	local decoded = self:Decode(input, limits)
	if not decoded.success then
		return decoded
	end
	if decoded.data.kind ~= kind then
		return Schema.Error(
			"WRONG_KIND",
			string.format("Expected a %s string, got %s", kind, tostring(decoded.data.kind)),
			{ expected = kind, actual = decoded.data.kind }
		)
	end
	return decoded
end

return Codec
