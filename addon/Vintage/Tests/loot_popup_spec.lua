-- The loot popup on the fake client with the whole TOC: a master loot window opens with the
-- fixture import's ranked item, the popup lists who gets it, and Give asks before it calls
-- GiveMasterLoot once. Also the loot method button on the Loot tab.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")
local fixtures = dofile("Tests/fixtures/bridge_fixtures.lua").fixtures

local IMPORT = fixtures["raid-import.v1"].encoded
local BOOTS = "|cffa335ee|Hitem:16800::::::::60:::::|h[Arcanist Boots]|h|r"
local CORE = "|cff0070dd|Hitem:17076::::::::60:::::|h[Lava Core]|h|r"
local GREEN = "|cff1eff00|Hitem:5000::::::::60:::::|h[Green]|h|r"

--- A client leading a raid of Aeryn and Doran-Stonemaul, as master looter, with the fixture
--- imported. `loot` is the corpse's loot window: slots of { link, name, quality }.
local function start(options)
	options = options or {}
	local host = Host.New()
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	host:TakePrinted()

	local roster = {
		{ name = "Aeryn", group = 1, class = "WARRIOR", online = true },
		{ name = "Doran-Stonemaul", group = 1, class = "ROGUE", online = true },
	}
	_G.IsInRaid = function()
		return true
	end
	_G.IsInGroup = function()
		return true
	end
	_G.GetNumGroupMembers = function()
		return #roster
	end
	_G.GetRaidRosterInfo = function(index)
		local m = roster[index]
		return m.name, 0, m.group, 60, m.class, m.class, "Onyxia's Lair", m.online
	end
	_G.UnitIsGroupLeader = function()
		return options.leader ~= false
	end
	_G.UnitIsGroupAssistant = function()
		return false
	end

	local loot = {
		slots = options.slots or {
			{ link = BOOTS, name = "Arcanist Boots", quality = 4 },
			{ link = CORE, name = "Lava Core", quality = 4 },
			{ link = GREEN, name = "Green", quality = 2 },
		},
		given = {},
		masterLooter = options.masterLooter ~= false,
		-- The game's candidates for every slot, by index.
		candidates = { [2] = "Aeryn", [5] = "Doran-Stonemaul" },
		method = 3,
		threshold = 2,
		methodCalls = {},
	}
	_G.GetNumLootItems = function()
		return #loot.slots
	end
	_G.GetLootSlotInfo = function(slotIndex)
		local s = loot.slots[slotIndex]
		return 133000 + slotIndex, s.name, 1, nil, s.quality, false, false, nil, false, false
	end
	_G.GetLootSlotLink = function(slotIndex)
		return loot.slots[slotIndex] and loot.slots[slotIndex].link or nil
	end
	_G.GetMasterLootCandidate = function(_, index)
		return loot.candidates[index], "Rogue", "ROGUE"
	end
	_G.GiveMasterLoot = function(slotIndex, index)
		loot.given[#loot.given + 1] = { slotIndex, index }
	end
	_G.IsMasterLooter = function()
		return loot.masterLooter
	end
	_G.C_PartyInfo = {
		GetLootMethod = function()
			return loot.method
		end,
		SetLootMethod = function(method, master)
			loot.methodCalls[#loot.methodCalls + 1] = { method, master }
			loot.method = method
		end,
	}
	_G.GetLootThreshold = function()
		return loot.threshold
	end
	_G.SetLootThreshold = function(threshold)
		loot.methodCalls[#loot.methodCalls + 1] = { "threshold", threshold }
		loot.threshold = threshold
	end
	_G.LootFrame = CreateFrame("Frame", "LootFrame")

	ns.Executor:Execute("raid-import", { text = IMPORT })
	return host, ns, loot
end

--- The popup's rows as plain text.
local function lines(ns)
	local out = {}
	for index, item in ipairs(ns.LootPopup.items or {}) do
		out[index] = (item.text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
	end
	return out
end

local function rowFor(ns, name)
	for _, item in ipairs(ns.LootPopup.items) do
		if item.name == name and item.slot == 1 then
			return item
		end
	end
end

describe("The loot popup", function()
	it("opens beside the loot window with each ranked item and its candidates", function()
		local host, ns = start()
		host:Fire("LOOT_OPENED", false, false)
		assert.is_true(ns.LootPopup:IsShown())
		assert.are.same({
			"Arcanist Boots",
			"1. Doran-Stonemaul  —  Soft-reserved (1 of 2)",
			"2. Aeryn  —  Soft-reserved (2 of 2)",
			"Lava Core",
			"No priority list. Use the game's loot menu.",
		}, lines(ns))
	end)

	it("asks before giving, then calls GiveMasterLoot once for the right person", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		local doran = rowFor(ns, "Doran-Stonemaul")

		ns.LootPopup:Give(doran)
		assert.are.same({}, loot.given)
		assert.are.equal(
			"Give Arcanist Boots to Doran-Stonemaul? Press Confirm to give it",
			ns.LootPopup:GetMessageText()
		)
		assert.are.equal(doran.key, ns.LootPopup.armed)

		-- Straight away, Confirm is a double-click on Give: ignored.
		assert.is_nil(ns.LootPopup:Give(doran))
		assert.are.same({}, loot.given)

		host.uptime = host.uptime + 1
		ns.LootPopup:Give(doran)
		assert.are.same({ { 1, 5 } }, loot.given)
		assert.are.equal("Giving Arcanist Boots to Doran-Stonemaul", ns.LootPopup:GetMessageText())
		assert.is_nil(ns.LootPopup.armed)
	end)

	it("never gives to a same-named player from another realm at the same index", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		local doran = rowFor(ns, "Doran-Stonemaul")
		ns.LootPopup:Give(doran)
		loot.candidates[5] = "Doran-Ashbringer"
		host.uptime = host.uptime + 1
		assert.are.equal("CANDIDATE_CHANGED", ns.LootPopup:Give(doran).error.code)
		-- Read again, the row has nobody to give to, and pressing it does nothing.
		local again = rowFor(ns, "Doran-Stonemaul")
		assert.is_nil(again.candidateIndex)
		assert.is_nil(ns.LootPopup:Give(again))
		assert.are.same({}, loot.given)
	end)

	it("keeps a namesake from another realm off the row, before and after a roster change", function()
		-- Only Doran-Ashbringer is offered when the window opens.
		local host, ns, loot = start()
		loot.candidates[5], loot.candidates[7] = nil, "Doran-Ashbringer"
		host:Fire("LOOT_OPENED", false, false)
		assert.are.equal("Not here", rowFor(ns, "Doran-Stonemaul").status)

		-- Doran-Stonemaul leaves after Give and a namesake takes the index: Confirm gives nothing.
		local host2, ns2, loot2 = start()
		host2:Fire("LOOT_OPENED", false, false)
		ns2.LootPopup:Give(rowFor(ns2, "Doran-Stonemaul"))
		loot2.candidates[5] = "Doran-Ashbringer"
		host2:Fire("GROUP_ROSTER_UPDATE")
		host2.uptime = host2.uptime + 1
		assert.is_nil(ns2.LootPopup:Give(rowFor(ns2, "Doran-Stonemaul")))
		assert.are.same({}, loot2.given)
	end)

	it("asks again when the row's person changes form between Give and Confirm", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		-- The game now gives Doran without the realm (the player's realm, Stonemaul) at index 4.
		loot.candidates[5], loot.candidates[4] = nil, "Doran"
		host:Fire("GROUP_ROSTER_UPDATE")
		host.uptime = host.uptime + 1
		local result = ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		assert.are.equal("CONFIRM_REQUIRED", result.error.code)
		assert.are.same({}, loot.given)
		host.uptime = host.uptime + 1
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		assert.are.same({ { 1, 4 } }, loot.given)
	end)

	it("reads the window again after a refusal, so Give finds the person at their new index", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		local stale = rowFor(ns, "Doran-Stonemaul")
		-- Someone left: Doran's candidate index moved from 5 to 4, with no loot event.
		loot.candidates[5], loot.candidates[4] = nil, "Doran-Stonemaul"
		assert.are.equal("CANDIDATE_CHANGED", ns.LootPopup:Give(stale).error.code)
		local fresh = rowFor(ns, "Doran-Stonemaul")
		assert.are.equal(4, fresh.candidateIndex)
		ns.LootPopup:Give(fresh)
		host.uptime = host.uptime + 1
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		assert.are.same({ { 1, 4 } }, loot.given)
	end)

	it("reads the window again when the raid changes, keeping a pending Confirm", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		loot.candidates[5], loot.candidates[4] = nil, "Doran-Stonemaul"
		host:Fire("GROUP_ROSTER_UPDATE")
		assert.are.equal(4, rowFor(ns, "Doran-Stonemaul").candidateIndex)
		host.uptime = host.uptime + 1
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		assert.are.same({ { 1, 4 } }, loot.given)
	end)

	it("asks again when Give moves to someone else, without giving", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		ns.LootPopup:Give(rowFor(ns, "Doran-Stonemaul"))
		local aeryn = rowFor(ns, "Aeryn")
		ns.LootPopup:Give(aeryn)
		assert.are.same({}, loot.given)
		assert.are.equal(aeryn.key, ns.LootPopup.armed)
	end)

	it("refuses to give when the slot or the person changed after asking", function()
		local host, ns, loot = start()
		host:Fire("LOOT_OPENED", false, false)
		local doran = rowFor(ns, "Doran-Stonemaul")
		ns.LootPopup:Give(doran)
		loot.slots[1] = { link = CORE, name = "Lava Core", quality = 4 }
		host.uptime = host.uptime + 1
		assert.are.equal("SLOT_CHANGED", ns.LootPopup:Give(doran).error.code)

		local host2, ns2, loot2 = start()
		host2:Fire("LOOT_OPENED", false, false)
		local doran2 = rowFor(ns2, "Doran-Stonemaul")
		ns2.LootPopup:Give(doran2)
		loot2.candidates[5] = "Brann"
		host2.uptime = host2.uptime + 1
		assert.are.equal("CANDIDATE_CHANGED", ns2.LootPopup:Give(doran2).error.code)
		assert.are.same({}, loot.given)
		assert.are.same({}, loot2.given)
	end)

	it("marks someone ranked who can't receive it, with no Give", function()
		local host, ns = start()
		host:Fire("LOOT_OPENED", false, false)
		local function find(name)
			return rowFor(ns, name)
		end
		assert.is_not_nil(find("Aeryn").candidateIndex)
		-- Doran left range: the game no longer offers them.
		_G.GetMasterLootCandidate = function(_, index)
			return index == 2 and "Aeryn" or nil
		end
		host:Fire("LOOT_SLOT_CLEARED", 3)
		local doran = find("Doran-Stonemaul")
		assert.is_nil(doran.candidateIndex)
		assert.are.equal("Not here", doran.status)
		assert.is_nil(ns.LootPopup:Give(doran))
	end)

	it("stays hidden unless the player is master looter with the popup on, and closes with the loot window", function()
		local host, ns = start({ masterLooter = false })
		host:Fire("LOOT_OPENED", false, false)
		assert.is_false(ns.LootPopup:IsShown())

		local host2, ns2 = start()
		ns2.db.profile.lootPopup = false
		host2:Fire("LOOT_OPENED", false, false)
		assert.is_false(ns2.LootPopup:IsShown())

		local host3, ns3 = start({ slots = { { link = GREEN, name = "Green", quality = 2 } } })
		host3:Fire("LOOT_OPENED", false, false)
		assert.is_false(ns3.LootPopup:IsShown())

		local host4, ns4 = start()
		host4:Fire("LOOT_OPENED", false, false)
		assert.is_true(ns4.LootPopup:IsShown())
		host4:Fire("LOOT_CLOSED")
		assert.is_false(ns4.LootPopup:IsShown())
	end)

	it("without an import's threshold, shows items from the setting's quality", function()
		local host, ns = start({ slots = { { link = CORE, name = "Lava Core", quality = 3 } } })
		ns.Executor:Execute("session-clear", { confirm = true })
		host:Fire("LOOT_OPENED", false, false)
		assert.is_false(ns.LootPopup:IsShown())
		host:Fire("LOOT_CLOSED")
		ns.db.profile.lootPopupThreshold = 3
		host:Fire("LOOT_OPENED", false, false)
		assert.are.same({ "Lava Core", "No priority list. Use the game's loot menu." }, lines(ns))
	end)

	it("refuses a hand-out through the Executor unless the player is master looter", function()
		local host, ns, loot = start({ masterLooter = false })
		host:Fire("LOOT_OPENED", false, false)
		local result = ns.Executor:Execute("loot-give", {
			slot = 1,
			candidateIndex = 5,
			candidateName = "Doran-Stonemaul",
			name = "Doran-Stonemaul",
			link = BOOTS,
			confirm = true,
		})
		assert.are.equal("NOT_MASTER_LOOTER", result.error.code)
		assert.are.same({}, loot.given)
	end)
end)

describe("Previewing the loot popup", function()
	--- Fails the spec if anything asks the game, or the Executor, to give loot.
	local function forbidGiving(ns)
		_G.GiveMasterLoot = function()
			error("GiveMasterLoot called in preview")
		end
		local execute = ns.Executor.Execute
		ns.Executor.Execute = function(self, name, params)
			assert(name ~= "loot-give", "loot-give called in preview")
			return execute(self, name, params)
		end
	end

	it("shows the import's ranked items with the group as candidates, without a corpse", function()
		local _, ns = start({ masterLooter = false })
		ns.LootPopup:Preview()
		assert.is_true(ns.LootPopup:IsShown())
		assert.are.equal("Loot priority (preview)", ns.LootPopup.frame:GetTitle())
		assert.are.same({
			"Item 16800",
			"1. Doran-Stonemaul  —  Soft-reserved (1 of 2)",
			"2. Aeryn  —  Soft-reserved (2 of 2)",
		}, lines(ns))
		-- Both are in the group, so both can be "given" to.
		assert.are.same({ 2, 1 }, { rowFor(ns, "Doran-Stonemaul").candidateIndex, rowFor(ns, "Aeryn").candidateIndex })
	end)

	it("asks and confirms as usual but never gives", function()
		local host, ns = start({ masterLooter = false })
		forbidGiving(ns)
		ns.LootPopup:Preview()
		local doran = rowFor(ns, "Doran-Stonemaul")
		ns.LootPopup:Give(doran)
		assert.are.equal("Preview: give Item 16800 to Doran-Stonemaul? Press Confirm.", ns.LootPopup:GetMessageText())
		-- The double-click guard holds in preview too.
		assert.is_nil(ns.LootPopup:Give(doran))
		host.uptime = host.uptime + 1
		local confirmed = ns.LootPopup:Give(doran)
		assert.is_true(confirmed.preview)
		assert.are.equal("Preview: would give Item 16800 to Doran-Stonemaul", ns.LootPopup:GetMessageText())
	end)

	it("ranks the group on a sample item without an import", function()
		local _, ns = start({ masterLooter = false })
		ns.Executor:Execute("session-clear", { confirm = true })
		ns.LootPopup:Preview()
		assert.are.same({
			"Sample item",
			"1. Aeryn  —  Sample reason",
			"2. Doran-Stonemaul  —  Sample reason",
		}, lines(ns))
	end)

	it("gives way to a real loot window, and ends when closed", function()
		local host, ns, loot = start()
		ns.LootPopup:Preview()
		host:Fire("LOOT_OPENED", false, false)
		assert.is_false(ns.LootPopup.preview)
		assert.are.equal("Loot priority", ns.LootPopup.frame:GetTitle())
		assert.are.equal("Arcanist Boots", lines(ns)[1])
		host:Fire("LOOT_CLOSED")
		assert.is_false(ns.LootPopup:IsShown())

		ns.LootPopup:Preview()
		ns.LootPopup.frame:Hide()
		assert.is_false(ns.LootPopup.preview)
		loot.masterLooter = false
		host:Fire("GROUP_ROSTER_UPDATE")
		assert.is_false(ns.LootPopup:IsShown())
	end)
end)

describe("Set loot method on the Loot tab", function()
	it("asks, then sets master loot to the player and the import's threshold", function()
		local _, ns, loot = start()
		ns.RaidWindow:Show()
		local first = ns.RaidWindow:SetLootMode()
		assert.are.equal("CONFIRM_REQUIRED", first.error.code)
		assert.are.equal("Confirm", ns.RaidWindow.pages.loot.plan.modeButton:GetText())
		assert.are.same({}, loot.methodCalls)

		local second = ns.RaidWindow:SetLootMode()
		assert.is_true(second.success, second.error and second.error.message)
		assert.are.same({ { 2, "Aeryn" }, { "threshold", 4 } }, loot.methodCalls)
		assert.are.equal("Set loot method", ns.RaidWindow.pages.loot.plan.modeButton:GetText())
	end)

	it("asks again when the raid is imported again between the two presses", function()
		local _, ns, loot = start()
		ns.RaidWindow:Show()
		ns.RaidWindow:SetLootMode()
		ns.Executor:Execute("raid-import", { text = IMPORT, confirm = true })
		assert.are.equal("CONFIRM_REQUIRED", ns.RaidWindow:SetLootMode().error.code)
		assert.are.same({}, loot.methodCalls)
	end)

	it("says so when the game refuses the loot method", function()
		local _, ns, loot = start()
		_G.C_PartyInfo.SetLootMethod = function()
			return false
		end
		ns.RaidWindow:Show()
		ns.RaidWindow:SetLootMode()
		assert.are.equal("GAME_REFUSED", ns.RaidWindow:SetLootMode().error.code)
		assert.are.equal(3, loot.method)
	end)

	it("leaves the loot alone for an assistant", function()
		local _, ns, loot = start({ leader = false })
		ns.RaidWindow:Show()
		assert.are.equal("NOT_LEADER", ns.RaidWindow:SetLootMode().error.code)
		-- The game call guards on its own too, for any other caller.
		assert.are.equal("NOT_LEADER", ns.Game.SetLootMethod(2, "Aeryn", 4).error.code)
		assert.are.same({}, loot.methodCalls)
	end)
end)
