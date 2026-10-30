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
L["Each boss kill takes a snapshot, and so does making the string."] = true
L["Drops"] = true
L["1 drop"] = true
L["%d drops"] = true
L["Item %d"] = true
L["Stood by"] = true
L["Came in"] = true
L["Didn't stand by"] = true
L["%d stood by"] = true
L["1 tank"] = true
L["%d tanks"] = true
L["1 healer"] = true
L["%d healers"] = true
L["1 melee"] = true
L["%d melee"] = true
L["1 ranged"] = true
L["%d ranged"] = true
L["Standby"] = true
L["Queued"] = true
L["Benched"] = true
L["Short %s"] = true
L["Loot priority"] = true
L["Loot priority (preview)"] = true
L["Preview: Give and Confirm work as usual, but nothing is given."] = true
L["Preview: would give %s to %s"] = true
L["Preview: give %s to %s? Press Confirm."] = true
L["Give"] = true
L["Not here"] = true
L["No priority list. Use the game's loot menu."] = true
L["Set loot method"] = true
L["Loot popup"] = true
L["When you are the master looter, show who gets each item beside the loot window."] = true
L["Loot popup quality"] = true
L["Reset loot popup position"] = true
L["Open the loot popup beside the loot window again, after dragging it."] = true
L["Items without a priority list show from this quality, unless the import sets one."] = true
L["Confirm"] = true
L["FenUI did not load. Reinstall Vintage."] = true

-- Import, from any tab
L["Import"] = true
L["Import again"] = true
L["Cancel"] = true
L["Replace the raid"] = true
L["Paste the guild's import string (it starts with !VIN:), then press Import."] = true

-- The header
L["Raid without an import"] = true
L["1 character"] = true
L["%d characters"] = true
L["%d in your group"] = true
L["1 snapshot"] = true
L["%d snapshots"] = true

-- Roster and Groups lists
L["Tanks"] = true
L["Healers"] = true
L["Melee"] = true
L["Ranged"] = true
L["Tank"] = true
L["Healer"] = true
L["Group %d"] = true
L["Not in a group"] = true
L["%d / %d in group"] = true
L["In group"] = true
L["Not in group"] = true
L["Invited"] = true
L["Declined"] = true
L["In another group"] = true
L["Offline"] = true
L["In group %d"] = true

-- Forming the raid
L["Invite"] = true
L["Whisper"] = true
L["Invite missing"] = true
L["Invite missing (%d)"] = true
L["Stop inviting"] = true
L["Arrange groups"] = true
L["Arrange groups (%d)"] = true
L["Stop arranging"] = true

-- Loot plan
L["Loot plan"] = true
L["Loot method"] = true
L["Master loot"] = true
L["Group loot"] = true
L["Threshold"] = true
L["%s or better"] = true
L["Not set"] = true
L["Priority lists"] = true
L["1 item"] = true
L["%d items"] = true
L["Poor"] = true
L["Common"] = true
L["Uncommon"] = true
L["Rare"] = true
L["Epic"] = true
L["Legendary"] = true

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
