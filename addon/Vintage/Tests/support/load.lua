-- Loads addon files into one private namespace the way the client does: each file gets the
-- addon name and the shared ns table as its varargs. Paths are relative to the addon root
-- (busted runs from there).
local Load = {}

Load.ADDON_NAME = "Vintage"

-- Core in TOC order: pure Lua, needs nothing else.
Load.CORE = {
	"Core/init.lua",
	"Core/Session.lua",
	"Core/Migrations.lua",
	"Core/Actions/session.lua",
}

-- Bridge in TOC order, after Core.
Load.BRIDGE = {
	"Bridge/Secrets.lua",
	"Bridge/Context.lua",
	"Bridge/Events.lua",
	"Bridge/Executor.lua",
}

--- Loads the given files, in order, into ns.
---@param paths string[]
---@param ns table|nil
---@return table ns
function Load.files(paths, ns)
	ns = ns or {}
	for _, path in ipairs(paths) do
		assert(loadfile(path))(Load.ADDON_NAME, ns)
	end
	return ns
end

local function readFile(path)
	local file = assert(io.open(path, "r"), "cannot open " .. path)
	local source = file:read("*a")
	file:close()
	return source
end

--- Every file Vintage.toc lists, in order, expanding XML <Script> and <Include> (ActionHud's
--- loader). Debug-only TOC blocks load too, as they do from a source checkout.
---@param ns table|nil
---@return table ns, string[] loaded
function Load.toc(ns)
	ns = ns or {}
	local order, seen = {}, {}

	local function loadPath(path)
		path = path:gsub("\\", "/")
		if path:match("%.xml$") then
			local source = readFile(path):gsub("<!%-%-.-%-%->", "")
			local directory = path:match("^(.*/)") or ""
			for kind, reference in source:gmatch('<(%a+)%s+file="([^"]+)"') do
				if kind == "Include" or kind == "Script" then
					loadPath(directory .. reference)
				end
			end
			return
		end
		assert(not seen[path], "loaded twice: " .. path)
		seen[path] = true
		order[#order + 1] = path
		assert(loadfile(path))(Load.ADDON_NAME, ns)
	end

	for line in readFile(Load.ADDON_NAME .. ".toc"):gmatch("[^\r\n]+") do
		line = line:match("^%s*(.-)%s*$")
		if line ~= "" and line:sub(1, 1) ~= "#" then
			loadPath(line)
		end
	end
	return ns, order
end

return Load
