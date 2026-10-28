-- Vintage Luacheck configuration (Lua 5.1, WoW: Forever)
-- List only the globals the addon really uses; an unknown global is a real finding.

std = "lua51"
max_line_length = false
codes = true
quiet = 1

exclude_files = {
	"Libs/**", -- synced libraries, shipped unmodified
	"Tests/**", -- busted specs and the fake client
	"Tools/**",
	".release/**",
}

-- Globals Vintage may write
globals = {
	"VintageDB",
}

-- Read-only globals: the WoW API and the libraries Vintage calls
read_globals = {
	-- WoW API
	"C_AddOns",
	"CreateFrame",
	"GetBuildInfo",
	"GetTime",
	"InCombatLockdown",
	"Settings",
	"debugprofilestop",
	"geterrorhandler",
	"time",
	"wipe",

	-- UI objects
	"GameTooltip",
	"UIParent",
	"UISpecialFrames",

	-- Libraries
	"LibStub",
}

-- Group reads: Bridge/Context only (Core stays pure, the View reads through the Executor)
files["Bridge/**/*.lua"] = {
	read_globals = {
		"GetNumGroupMembers",
		"GetNumSubgroupMembers",
		"GetRaidRosterInfo",
		"IsInRaid",
		"UnitClass",
		"UnitIsConnected",
		"UnitName",
	},
}

ignore = {
	"211/_.*", -- unused variables starting with _
	"212/self", -- unused self
	"212/_.*", -- unused arguments starting with _
	"212/%.%.%.", -- unused varargs
	"213/_.*", -- unused loop variables starting with _
	"542", -- empty if branch
	"631", -- line too long
}
