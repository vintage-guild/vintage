-- English (base locale). Every UI string in the View, settings, and slash commands is
-- L["..."] with a literal key defined here; Tools/validate.py checks that.
-- Core action messages (ActionResult reasoning and errors) stay English, like the
-- website's command errors.
local L = LibStub("AceLocale-3.0"):NewLocale("Vintage", "enUS", true)
if not L then
	return
end

-- Slash commands
L["Commands:"] = true
L["Open or close the raid window"] = true
L["Show the current raid session"] = true
L["Start an empty raid session (asks to confirm)"] = true
L["Open settings"] = true
L["Turn debug logging on or off"] = true
L["Debug logging on"] = true
L["Debug logging off"] = true
L["Unknown command %q. Type /vintage help."] = true
L["Error"] = true

-- Dev tools (source checkouts only)
L["Make or read bridge strings by hand (source checkouts only)"] = true
L["Encode the group as a raid export to copy"] = true
L["Paste a bridge string and see what it holds"] = true
L["Export of %d people (%d hidden by the game). Copy it with Ctrl+C."] = true
L["Import for %s: %d in the roster, %d groups, loot %s."] = true
L["Export by %s: %d snapshots, %d people, %d drops."] = true
L["A %s string."] = true
L["Paste a bridge string (it starts with !VIN:)"] = true
L["Bridge string"] = true
L["Read"] = true
L["Vintage raid export"] = true
L["Read a bridge string"] = true
L["Vintage is built for WoW: Forever. Some features may not work on this client."] = true

-- Raid window
L["Roster"] = true
L["Groups"] = true
L["Loot"] = true
L["Export"] = true
L["No raid imported"] = true
L["The roster from the guild's import string appears here."] = true
L["No groups planned"] = true
L["Planned and current raid groups appear here after an import."] = true
L["No loot recorded"] = true
L["Drops are recorded here during the raid."] = true
L["Nothing to export"] = true
L["The string for the website appears here after the raid."] = true
L["FenUI did not load. Reinstall Vintage."] = true

-- Minimap button and compartment
L["Left-click: open the raid window"] = true
L["Right-click: settings"] = true

-- Settings
L["General"] = true
L["Minimap button"] = true
L["Show the Vintage button on the minimap."] = true
L["Debug logging"] = true
L["Send debug lines to Mechanic's console, when Mechanic is installed."] = true
L["Settings can't open during combat."] = true
