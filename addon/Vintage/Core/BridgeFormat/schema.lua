--------------------------------------------------------------------------------
-- Vintage Core: bridge payload schemas (version 1)
-- The Lua twin of libs/bridge-format/src/schemas.ts. A payload is checked version
-- first, then kind, then the kind's fields, with the same error codes as the TS
-- side. Issue paths use 0-based indexes, like Zod's ("roster.0.characterId").
--
-- Rules both sides rely on: times are unix seconds; only strings, integers,
-- booleans, arrays, and string-keyed tables; unknown fields are ignored (Zod
-- strips them); string lengths count UTF-16 code units, as JavaScript does.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core
local Result = Core.Result

Core.BridgeFormat = Core.BridgeFormat or {}
local Schema = {}
Core.BridgeFormat.Schema = Schema

--- Bump when a payload changes incompatibly; both sides refuse newer versions.
Schema.VERSION = 1
Schema.MAX_REPORTED_ISSUES = 20

-- Suggestions match libs/bridge-format/src/errors.ts.
Schema.SUGGESTIONS = {
	NOT_A_BRIDGE_STRING = "Copy the whole string from the Vintage addon or website, starting with !VIN:",
	UNSUPPORTED_ENCODING = "Update the Vintage addon and refresh the website, then copy the string again",
	TOO_LARGE = "Export a smaller range (one raid at a time) and try again",
	CORRUPT = "The string was damaged while copying; copy it again in full",
	UNSUPPORTED_VERSION = "Update the Vintage addon and refresh the website so both use the same format",
	UNKNOWN_KIND = "Update the Vintage addon and refresh the website so both use the same format",
	WRONG_KIND = "Paste an import string into the addon and an export string into the website",
	INVALID_PAYLOAD = "The string is from an incompatible build; update the addon and copy it again",
}

--- A bridge error shaped like the TS BridgeError: code, message, suggestion, details.
---@param code string
---@param message string
---@param details table|nil
---@return table ActionResult
function Schema.Error(code, message, details)
	local result = Result.error(code, message, Schema.SUGGESTIONS[code])
	result.error.details = details
	return result
end

--------------------------------------------------------------------------------
-- Value checks
--------------------------------------------------------------------------------

-- Byte ranges for the second byte after each multi-byte lead, per RFC 3629: no overlong forms,
-- no surrogates (U+D800-DFFF), nothing past U+10FFFF. This is what the website's TextDecoder
-- with fatal = true accepts.
local SECOND_BYTE = {}
for lead = 0xC2, 0xDF do
	SECOND_BYTE[lead] = { 2, 0x80, 0xBF }
end
SECOND_BYTE[0xE0] = { 3, 0xA0, 0xBF }
for lead = 0xE1, 0xEF do
	SECOND_BYTE[lead] = { 3, 0x80, 0xBF }
end
SECOND_BYTE[0xED] = { 3, 0x80, 0x9F }
SECOND_BYTE[0xF0] = { 4, 0x90, 0xBF }
for lead = 0xF1, 0xF3 do
	SECOND_BYTE[lead] = { 4, 0x80, 0xBF }
end
SECOND_BYTE[0xF4] = { 4, 0x80, 0x8F }

--- Whether a string is valid UTF-8, and its length in UTF-16 code units (JavaScript's
--- string length). ASCII is checked with one pattern search.
---@param text string
---@return boolean valid, number|nil units
function Schema.Utf8(text)
	if not text:find("[\128-\255]") then
		return true, #text
	end
	local units, i, length = 0, 1, #text
	while i <= length do
		local byte = text:byte(i)
		if byte < 0x80 then
			units, i = units + 1, i + 1
		else
			local rule = SECOND_BYTE[byte]
			if not rule or i + rule[1] - 1 > length then
				return false
			end
			for k = 1, rule[1] - 1 do
				local follow = text:byte(i + k)
				local low, high = 0x80, 0xBF
				if k == 1 then
					low, high = rule[2], rule[3]
				end
				if follow < low or follow > high then
					return false
				end
			end
			-- Four-byte characters are surrogate pairs in UTF-16.
			units, i = units + (rule[1] == 4 and 2 or 1), i + rule[1]
		end
	end
	return true, units
end

--- Length in UTF-16 code units of a valid UTF-8 string (nil when it isn't valid).
---@param text string
---@return number|nil
function Schema.Utf16Length(text)
	local valid, units = Schema.Utf8(text)
	return valid and units or nil
end

-- Zod 4's .int() stops at Number.MAX_SAFE_INTEGER.
local MAX_SAFE_INTEGER = 2 ^ 53 - 1

local function IsInteger(value)
	return type(value) == "number" and value == math.floor(value)
		and value <= MAX_SAFE_INTEGER and value >= -MAX_SAFE_INTEGER
end

--- True for a table whose keys are exactly 1..n (LibSerialize writes {} the same way).
local function IsSequence(value)
	if type(value) ~= "table" then
		return false
	end
	local count, length = 0, #value
	for key in pairs(value) do
		if type(key) ~= "number" or key < 1 or key > length or key ~= math.floor(key) then
			return false
		end
		count = count + 1
	end
	return count == length
end

local function Join(path, key)
	local copy = {}
	for i = 1, #path do
		copy[i] = path[i]
	end
	copy[#copy + 1] = key
	return copy
end

local function Issue(issues, path, message)
	local parts = {}
	for i = 1, #path do
		parts[i] = tostring(path[i])
	end
	issues[#issues + 1] = { path = table.concat(parts, "."), message = message }
end

-- Each checker is function(value, path, issues).

local function String(min, max)
	return function(value, path, issues)
		if type(value) ~= "string" then
			return Issue(issues, path, "Expected a string")
		end
		-- A UTF-16 unit takes at most 3 UTF-8 bytes, so a string over 3 * max bytes is too
		-- long without reading it: a huge repeated string costs nothing per reference.
		if max and #value > 3 * max then
			return Issue(issues, path, "Too long")
		end
		local valid, length = Schema.Utf8(value)
		if not valid then
			return Issue(issues, path, "Not valid UTF-8")
		end
		if min and length < min then
			Issue(issues, path, "Too short")
		elseif max and length > max then
			Issue(issues, path, "Too long")
		end
	end
end

local function Integer(min, max)
	return function(value, path, issues)
		if not IsInteger(value) then
			return Issue(issues, path, "Expected an integer")
		end
		if min and value < min then
			Issue(issues, path, "Too small")
		elseif max and value > max then
			Issue(issues, path, "Too big")
		end
	end
end

local function Boolean(value, path, issues)
	if type(value) ~= "boolean" then
		Issue(issues, path, "Expected a boolean")
	end
end

local function OneOf(...)
	local allowed = {}
	for i = 1, select("#", ...) do
		allowed[select(i, ...)] = true
	end
	return function(value, path, issues)
		if type(value) ~= "string" or not allowed[value] then
			Issue(issues, path, "Not an allowed value")
		end
	end
end

local function Literal(expected)
	return function(value, path, issues)
		if value ~= expected then
			Issue(issues, path, "Expected " .. tostring(expected))
		end
	end
end

local function Array(item, max)
	return function(value, path, issues)
		if not IsSequence(value) then
			return Issue(issues, path, "Expected an array")
		end
		if #value > max then
			return Issue(issues, path, "Too many items")
		end
		for i = 1, #value do
			item(value[i], Join(path, i - 1), issues)
		end
	end
end

--- fields: ordered { name, checker, optional }, checked in declaration order (as Zod does).
local function Object(fields)
	return function(value, path, issues)
		if type(value) ~= "table" or (IsSequence(value) and #value > 0) then
			return Issue(issues, path, "Expected an object")
		end
		for _, field in ipairs(fields) do
			local name, check, optional = field[1], field[2], field[3]
			local fieldValue = value[name]
			if fieldValue == nil then
				if not optional then
					Issue(issues, Join(path, name), "Required")
				end
			else
				check(fieldValue, Join(path, name), issues)
			end
		end
	end
end

local OPTIONAL = true

--------------------------------------------------------------------------------
-- Version 1 payloads (libs/bridge-format/src/schemas.ts)
--------------------------------------------------------------------------------

local unixSeconds = Integer(0)
local id = String(1, 64)
local itemId = Integer(1)
local unitName = String(2, 48)
local raidGroup = Integer(1, 8)

-- libs/wow-data: CLASSES and ROLES
Schema.CLASSES = { "warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid" }
Schema.ROLES = { "tank", "healer", "melee", "ranged" }
local class = OneOf(unpack(Schema.CLASSES))
local role = OneOf(unpack(Schema.ROLES))

-- Why a bench character isn't rostered (schemas.ts BENCH_REASONS).
Schema.BENCH_REASONS = { "standby", "queued", "benched" }

local raidImport = Object({
	{ "v", Literal(1) },
	{ "kind", Literal("raid-import") },
	{ "guildId", id },
	{ "generatedAt", unixSeconds },
	{ "raid", Object({ { "eventId", id }, { "title", String(1, 100) }, { "startsAt", unixSeconds } }) },
	{
		"roster",
		Array(
			Object({
				{ "characterId", id },
				{ "name", unitName },
				{ "class", class },
				{ "spec", String(1, 32), OPTIONAL },
				{ "role", role },
			}),
			80
		),
	},
	-- Optional, so imports from before the bench still decode.
	{
		"bench",
		Array(
			Object({
				{ "characterId", id },
				{ "name", unitName },
				{ "class", class },
				{ "spec", String(1, 32), OPTIONAL },
				{ "role", role },
				{ "reason", OneOf(unpack(Schema.BENCH_REASONS)) },
			}),
			80
		),
		OPTIONAL,
	},
	{ "groups", Array(Object({ { "group", raidGroup }, { "characterIds", Array(id, 5) } }), 8) },
	{
		"loot",
		Object({
			{ "methodId", String(1, 32) },
			{ "methodVersion", Integer(1) },
			{ "configVersion", Integer(0) },
			{ "mode", OneOf("master", "group") },
			{ "threshold", Integer(0, 7), OPTIONAL },
		}),
	},
	{
		"candidates",
		Array(
			Object({
				{ "itemId", itemId },
				{ "ranked", Array(Object({ { "characterId", id }, { "reason", String(0, 200) } }), 80) },
			}),
			1000
		),
	},
})

local raidExport = Object({
	{ "v", Literal(1) },
	{ "kind", Literal("raid-export") },
	{ "exportedAt", unixSeconds },
	{ "addonVersion", String(1, 32) },
	{ "exporter", unitName },
	{ "guildId", id, OPTIONAL },
	{ "eventId", id, OPTIONAL },
	{
		"attendance",
		Array(
			Object({
				{ "at", unixSeconds },
				{ "label", String(1, 64), OPTIONAL },
				{
					"members",
					Array(
						Object({
							{ "name", unitName },
							{ "class", String(1, 32), OPTIONAL },
							{ "group", raidGroup },
							{ "online", Boolean },
						}),
						40
					),
				},
			}),
			100
		),
	},
	{
		"loot",
		Array(
			Object({
				{ "itemId", itemId },
				{ "looter", unitName },
				{ "at", unixSeconds },
				{ "count", Integer(1), OPTIONAL },
				{ "source", String(1, 100), OPTIONAL },
			}),
			1000
		),
	},
	{
		"items",
		Array(
			Object({
				{ "itemId", itemId },
				{ "name", String(1, 100) },
				{ "quality", Integer(0, 8) },
				{ "itemLevel", Integer(0), OPTIONAL },
				{ "equipLoc", String(0, 40), OPTIONAL },
				{ "classId", Integer(0), OPTIONAL },
				{ "subclassId", Integer(0), OPTIONAL },
				{ "icon", Integer(0), OPTIONAL },
			}),
			5000
		),
	},
})

--- Reports every value already seen earlier in the list.
local function CheckUnique(values, pathOf, issues)
	local seen = {}
	for i, value in ipairs(values) do
		if seen[value] then
			Issue(issues, pathOf(i), "duplicate")
		end
		seen[value] = true
	end
end

--- Ids, groups, and items are unique; groups and candidates only name rostered characters;
--- no one sits in two groups; no one is both rostered and on the bench
--- (schemas.ts checkImportReferences).
local function CheckImportReferences(value, issues)
	local rostered, rosterIds = {}, {}
	for i, entry in ipairs(value.roster) do
		rostered[entry.characterId] = true
		rosterIds[i] = entry.characterId
	end
	CheckUnique(rosterIds, function(i)
		return { "roster", i - 1, "characterId" }
	end, issues)

	local bench, benchIds = value.bench or {}, {}
	for i, entry in ipairs(bench) do
		benchIds[i] = entry.characterId
	end
	CheckUnique(benchIds, function(i)
		return { "bench", i - 1, "characterId" }
	end, issues)
	for i, characterId in ipairs(benchIds) do
		if rostered[characterId] then
			Issue(issues, { "bench", i - 1, "characterId" }, "also on the roster")
		end
	end

	local groupNumbers = {}
	for i, group in ipairs(value.groups) do
		groupNumbers[i] = group.group
	end
	CheckUnique(groupNumbers, function(i)
		return { "groups", i - 1, "group" }
	end, issues)

	local placed = {}
	for gi, group in ipairs(value.groups) do
		for ci, characterId in ipairs(group.characterIds) do
			placed[#placed + 1] = { id = characterId, path = { "groups", gi - 1, "characterIds", ci - 1 } }
		end
	end
	for _, entry in ipairs(placed) do
		if not rostered[entry.id] then
			Issue(issues, entry.path, "not on the roster")
		end
	end
	local placedIds = {}
	for i, entry in ipairs(placed) do
		placedIds[i] = entry.id
	end
	CheckUnique(placedIds, function(i)
		return placed[i].path
	end, issues)

	local itemIds = {}
	for i, item in ipairs(value.candidates) do
		itemIds[i] = item.itemId
	end
	CheckUnique(itemIds, function(i)
		return { "candidates", i - 1, "itemId" }
	end, issues)
	for ii, item in ipairs(value.candidates) do
		local ranked = {}
		for ci, candidate in ipairs(item.ranked) do
			ranked[ci] = candidate.characterId
			if not rostered[candidate.characterId] then
				Issue(issues, { "candidates", ii - 1, "ranked", ci - 1, "characterId" }, "not on the roster")
			end
		end
		CheckUnique(ranked, function(ci)
			return { "candidates", ii - 1, "ranked", ci - 1, "characterId" }
		end, issues)
	end
end

Schema.KINDS = {
	["raid-import"] = { check = raidImport, references = CheckImportReferences },
	["raid-export"] = { check = raidExport },
}

--- Checks a decoded payload: version first, then kind, then the kind's schema.
---@param value any
---@return table ActionResult with the payload as data
function Schema.Validate(value)
	if type(value) ~= "table" or (IsSequence(value) and next(value) ~= nil) then
		return Schema.Error("INVALID_PAYLOAD", "The payload is not a table with fields")
	end
	local version, kind = value.v, value.kind
	-- Number.isInteger in bridge.ts: no 2^53 bound here, so a huge v reads as a newer version.
	local wholeNumber = type(version) == "number" and version == math.floor(version) and version ~= math.huge
	if not wholeNumber or version < 1 then
		return Schema.Error("INVALID_PAYLOAD", "The payload has no schema version (v)")
	end
	if version ~= Schema.VERSION then
		local newer = version > Schema.VERSION
		return Schema.Error(
			"UNSUPPORTED_VERSION",
			string.format(
				"Schema version %d is %s supported (this build reads %d)",
				version,
				newer and "newer than" or "not",
				Schema.VERSION
			),
			{ version = version, supported = Schema.VERSION }
		)
	end
	local spec = type(kind) == "string" and Schema.KINDS[kind] or nil
	if not spec then
		local shown = type(kind) == "string" and kind:sub(1, 40) or type(kind)
		return Schema.Error("UNKNOWN_KIND", string.format('Unknown payload kind "%s"', shown), { kind = shown })
	end

	local issues = {}
	spec.check(value, {}, issues)
	if #issues == 0 and spec.references then
		spec.references(value, issues)
	end
	if #issues > 0 then
		local reported = {}
		for i = 1, math.min(#issues, Schema.MAX_REPORTED_ISSUES) do
			reported[i] = issues[i]
		end
		return Schema.Error(
			"INVALID_PAYLOAD",
			string.format("The %s payload doesn't match its schema", kind),
			{ issues = reported, issueCount = #issues }
		)
	end
	return Result.success(value, kind .. " payload, version " .. version)
end

return Schema
