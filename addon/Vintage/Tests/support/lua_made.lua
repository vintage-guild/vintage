-- Writes libs/bridge-format/fixtures/lua-made.json: the golden payloads as this Lua encodes
-- them, which the TS tests decode. The order after a fixture change, from addon/Vintage:
--   pnpm fixtures:bridge                         (repo root: the JSON fixtures)
--   python Tools/validate.py --write-fixtures    (the Lua table the specs read)
--   VINTAGE_WRITE_FIXTURES=1 busted Tests/core/bridge_codec_spec.lua   (Lua 5.1)
--   python Tools/validate.py --write-fixtures    (again, for the new Lua-made strings)
-- Otherwise the codec spec fails while a committed string differs from what this Lua makes.
local LuaMade = {}

LuaMade.PATH = "../../libs/bridge-format/fixtures/lua-made.json"
LuaMade.COMMENT = "Encoded by the addon's busted suite under Lua 5.1 with the libraries it ships: "
	.. "LibSerialize:SerializeEx({ stable = true }, payload), LibDeflate 1.0.2 CompressDeflate "
	.. "(level 9), EncodeForPrint. The TS tests decode each one to the matching fixture; "
	.. "the addon's suite fails when a string differs from what it encodes. Regenerate with "
	.. "VINTAGE_WRITE_FIXTURES=1 busted Tests/core/bridge_codec_spec.lua in addon/Vintage."

local function json(text)
	return '"' .. text:gsub('[%c"\\]', function(char)
		return char == '"' and '\\"' or char == "\\" and "\\\\" or string.format("\\u%04x", char:byte())
	end) .. '"'
end

--- The file's text for name -> encoded string.
---@param strings table
---@return string
function LuaMade.Render(strings)
	local names = {}
	for name in pairs(strings) do
		names[#names + 1] = name
	end
	table.sort(names)
	local lines = {}
	for i, name in ipairs(names) do
		lines[i] = "    " .. json(name) .. ": " .. json(strings[name]) .. (i < #names and "," or "")
	end
	return "{\n  " .. json("$comment") .. ": " .. json(LuaMade.COMMENT) .. ',\n  "strings": {\n'
		.. table.concat(lines, "\n") .. "\n  }\n}\n"
end

---@param strings table name -> encoded string
function LuaMade.Write(strings)
	local file = assert(io.open(LuaMade.PATH, "w"))
	file:write(LuaMade.Render(strings))
	file:close()
end

return LuaMade
