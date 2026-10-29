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
L["Vintage is built for WoW: Forever. Some features may not work on this client."] = true

-- Raid window
L["Roster"] = true
L["Groups"] = true
L["Loot"] = true
L["Export"] = true
L["No raid imported"] = true
L["Import the guild's string to see the roster and who is in your group."] = true
L["No groups planned"] = true
L["Import the guild's string to see the groups it plans."] = true
L["This raid's import plans no groups."] = true
L["No loot recorded"] = true
L["Drops are recorded here during the raid."] = true
L["Nothing to export"] = true
L["Take a snapshot of the group, then make the string for the website."] = true
L["FenUI did not load. Reinstall Vintage."] = true

-- Import, from any tab
L["Import"] = true
L["Import again"] = true
L["Cancel"] = true
L["Replace the raid"] = true
L["Paste the guild's import string (it starts with !VIN:), then press Import."] = true

-- Roster and Groups lists
L["Tanks"] = true
L["Healers"] = true
L["Melee"] = true
L["Ranged"] = true
L["Group %d"] = true
L["Not in a group"] = true
L["%s  ·  %d of %d in your group"] = true
L["group %d"] = true
L["in your group"] = true
L["not in your group"] = true

-- Loot plan
L["Master loot"] = true
L["Group loot"] = true
L["%s or better"] = true
L["1 item with a priority list"] = true
L["%d items with a priority list"] = true
L["poor"] = true
L["common"] = true
L["uncommon"] = true
L["rare"] = true
L["epic"] = true
L["legendary"] = true

-- Export tab
L["Take a snapshot"] = true
L["Make export string"] = true
L["Snapshots: %d  ·  Drops: %d"] = true
L["Copy this into the website's Check an export (Ctrl+C)"] = true

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
