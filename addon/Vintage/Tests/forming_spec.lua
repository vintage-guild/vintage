-- Forming the raid on the fake client: invites, the raid conversion, and arranging groups,
-- against a fake group that accepts invites a tick later and updates the roster like the game.
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")

local ROLES = { "tank", "healer", "healer", "melee", "ranged" }
local CLASSES = { "warrior", "priest", "druid", "rogue", "mage" }

--- An import of `size` people, the player first, five to a planned group.
local function bigImport(ns, size)
	local roster, groups = {}, {}
	for index = 1, size do
		local name = index == 1 and "Aeryn" or ("Raider" .. string.char(64 + index))
		local id = "c" .. index
		roster[index] =
			{ characterId = id, name = name, class = CLASSES[(index - 1) % 5 + 1], role = ROLES[(index - 1) % 5 + 1] }
		local group = math.floor((index - 1) / 5) + 1
		groups[group] = groups[group] or { group = group, characterIds = {} }
		table.insert(groups[group].characterIds, id)
	end
	local encoded = ns.BridgeCodec:Encode({
		v = 1,
		kind = "raid-import",
		guildId = "g_vintage",
		generatedAt = 1,
		raid = { eventId = "evt_big", title = "Big night", startsAt = 2 },
		roster = roster,
		groups = groups,
		loot = { methodId = "unset", methodVersion = 1, configVersion = 0, mode = "group" },
		candidates = {},
	})
	assert(encoded.success, encoded.error and encoded.error.message)
	return encoded.data
end

--- A fake group the player leads: invites are accepted (or declined) a tick later.
local function fakeGroup(host, options)
	options = options or {}
	local g = {
		members = { { name = "Aeryn", class = "WARRIOR", group = 1, online = true } },
		raid = false,
		updates = 0,
		invited = {},
		decline = options.decline or {},
	}
	local function update()
		g.updates = g.updates + 1
		host:Fire("GROUP_ROSTER_UPDATE")
	end
	local function firstFree()
		local counts = {}
		for _, m in ipairs(g.members) do
			counts[m.group] = (counts[m.group] or 0) + 1
		end
		for group = 1, 8 do
			if (counts[group] or 0) < 5 then
				return group
			end
		end
	end
	local function join(name)
		if not g.raid and #g.members >= 5 then
			return
		end
		table.insert(g.members, { name = name, class = "MAGE", group = g.raid and firstFree() or 1, online = true })
		update()
	end
	_G.IsInRaid = function()
		return g.raid
	end
	_G.IsInGroup = function()
		return #g.members > 1
	end
	_G.GetNumGroupMembers = function()
		return #g.members
	end
	_G.GetNumSubgroupMembers = function()
		return #g.members - 1
	end
	_G.GetRaidRosterInfo = function(index)
		local m = g.members[index]
		return m.name, 0, m.group, 60, m.class, m.class, "", m.online
	end
	local function unitOf(unit)
		if unit == "player" then
			return g.members[1]
		end
		return g.members[tonumber(unit:match("^party(%d+)$")) + 1]
	end
	_G.UnitName = function(unit)
		return unitOf(unit).name
	end
	_G.UnitClass = function(unit)
		return unitOf(unit).class, unitOf(unit).class
	end
	_G.UnitIsConnected = function()
		return true
	end
	_G.UnitIsGroupLeader = function()
		return options.leader ~= false
	end
	_G.UnitIsGroupAssistant = function()
		return false
	end
	_G.ERR_DECLINE_GROUP_S = "%s declines your group invitation."
	_G.ERR_ALREADY_IN_GROUP_S = "%s is already in a group."
	_G.ERR_BAD_PLAYER_NAME_S = "No player named '%s' is currently playing."
	g.join = join
	g.update = update
	_G.C_PartyInfo = {
		CanInvite = function()
			return true
		end,
		InviteUnit = function(name)
			table.insert(g.invited, name)
			if options.hold then
				-- Nobody answers until the spec says so.
				return
			end
			C_Timer.After(0, function()
				if g.decline[name] then
					host:Fire("CHAT_MSG_SYSTEM", string.format(_G.ERR_DECLINE_GROUP_S, name))
				else
					join(name)
				end
			end)
		end,
		ConvertToRaid = function()
			C_Timer.After(0, function()
				g.raid = true
				update()
			end)
		end,
	}
	_G.SetRaidSubgroup = function(index, group)
		g.moves = (g.moves or 0) + 1
		if options.ignoreMoves then
			-- The game drops the call without a word, as it does for a full group.
			return
		end
		C_Timer.After(0, function()
			g.members[index].group = group
			update()
		end)
	end
	_G.SwapRaidSubgroup = function(a, b)
		g.moves = (g.moves or 0) + 1
		if options.ignoreMoves then
			return
		end
		C_Timer.After(0, function()
			g.members[a].group, g.members[b].group = g.members[b].group, g.members[a].group
			update()
		end)
	end
	return g
end

local function start(options)
	local host = Host.New()
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	local g = fakeGroup(host, options)
	host:TakePrinted()
	return host, ns, g
end

describe("Inviting the roster", function()
	it("forms a 25-person raid from the import in at most 26 roster updates", function()
		local host, ns, g = start()
		assert.is_true(ns.Executor:Execute("raid-import", { text = bigImport(ns, 25) }).success)
		local done
		ns.Executor:Subscribe(function(name, result)
			if name == "forming-done" then
				done = result
			end
		end)

		local started = ns.Executor:Execute("raid-invite")
		assert.is_true(started.success, started.error and started.error.message)
		host:RunTimers()

		assert.is_true(g.raid)
		assert.are.equal(25, #g.members)
		assert.is_true(g.updates <= 26, "roster updates: " .. g.updates)
		assert.are.equal("Everyone on the roster has been invited", done.reasoning)
		-- The other tanks went first, then the healers, then everyone else in roster order.
		assert.are.same(
			{ "RaiderF", "RaiderK", "RaiderP", "RaiderU", "RaiderB", "RaiderC" },
			{ g.invited[1], g.invited[2], g.invited[3], g.invited[4], g.invited[5], g.invited[6] }
		)
		assert.are.equal(24, #g.invited)
		assert.are.same({}, host.errors)
	end)

	it("then arranges everyone into their planned groups", function()
		local host, ns, g = start()
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 25) })
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		-- Inviting doesn't say the raid has formed: no start snapshot yet.
		assert.are.same({}, ns.db.char.session.attendance)
		-- Shuffle: the game put people in join order; scramble groups 1 and 2 further.
		g.members[2].group, g.members[7].group = 2, 1

		local arrange = ns.Executor:Execute("raid-arrange")
		assert.is_true(arrange.success, arrange.error and arrange.error.message)
		host:RunTimers()

		local planned = ns.Core.Roster.PlannedGroups(ns.db.char.session.import, (ns.Context:BuildGroupSnapshot()))
		for _, m in ipairs(ns.Context:BuildGroupSnapshot()) do
			assert.are.equal(planned[m.index], m.group, m.name)
		end
		assert.are.equal("NOTHING_TO_DO", ns.Executor:Execute("raid-arrange").error.code)
		-- A finished Arrange takes the raid's start snapshot, of everyone now in it.
		local attendance = ns.db.char.session.attendance
		assert.are.same({ "start", 25 }, { attendance[1].label, #attendance[1].members })
		assert.are.equal(1, #attendance)
	end)

	it("lets a row's single invite leave the start snapshot alone", function()
		local host, ns = start()
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5) })
		ns.Executor:Execute("raid-invite", { name = "RaiderB" })
		host:RunTimers()
		ns.Executor:Execute("raid-invite", { name = "RaiderC" })
		host:RunTimers()
		assert.are.same({}, ns.db.char.session.attendance)
	end)

	it("marks a decline, doesn't invite them again, and shows it on their row", function()
		local host, ns = start({ decline = { RaiderC = true } })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5) })
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		assert.are.equal("declined", ns.Invites:States().raiderc)
		local status = ns.Executor:Execute("raid-status").data
		local states = {}
		for _, row in ipairs(status.rows) do
			states[row.name] = row.state
		end
		assert.are.equal("declined", states.RaiderC)
		assert.are.equal("in", states.RaiderB)
		assert.are.equal(0, status.toInvite)
	end)

	it("invites one person from their row, even after a decline", function()
		local host, ns, g = start({ decline = { RaiderC = true } })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5) })
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		g.decline.RaiderC = nil
		local result = ns.Executor:Execute("raid-invite", { name = "RaiderC" })
		assert.are.equal("Inviting RaiderC", result.reasoning)
		host:RunTimers()
		assert.are.equal(5, #g.members)
	end)

	it("refuses when the player can't invite, and arranging needs a raid and no combat", function()
		local host, ns = start({ leader = false })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5) })
		-- Alone, the player will lead; in a group without the lead, not.
		_G.IsInGroup = function()
			return true
		end
		assert.are.equal("NOT_LEADER", ns.Executor:Execute("raid-invite").error.code)
		assert.are.equal("NOT_IN_RAID", ns.Executor:Execute("raid-arrange").error.code)
		_G.IsInRaid = function()
			return true
		end
		host.combat = true
		assert.are.equal("IN_COMBAT", ns.Executor:Execute("raid-arrange").error.code)
	end)

	it("stops a run, and a new import stops it too", function()
		local host, ns, g = start()
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		ns.Executor:Execute("raid-invite")
		assert.is_true(ns.Forming:IsRunning())
		assert.are.equal("invite", ns.Executor:Execute("raid-stop").data.stopped)
		host:RunTimers()
		assert.is_false(ns.Forming:IsRunning())
		assert.is_true(#g.invited <= 1)

		-- A new import stops a run too.
		ns.Executor:Execute("raid-invite")
		assert.is_true(ns.Forming:IsRunning())
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5), confirm = true })
		assert.is_false(ns.Forming:IsRunning())
	end)

	it("ignores a roster update that arrives after a stop", function()
		local host, ns, g = start()
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		-- Two in a party: the first step converts to a raid and waits for the roster update.
		table.insert(g.members, { name = "RaiderB", class = "PRIEST", group = 1, online = true })
		ns.Executor:Execute("raid-invite")
		ns.Executor:Execute("raid-stop")
		host:RunTimers()
		assert.is_true(g.raid)
		assert.are.same({}, g.invited)
	end)
end)

--- Runs the queued timers that would fire within a few seconds; returns the long ones (a full
--- party's wait) unrun, since the fake client otherwise runs every timer at once.
local function runShort(host)
	local long = {}
	local guard = 0
	while #host.timers > 0 do
		guard = guard + 1
		assert(guard < 1000, "timers keep re-queuing")
		local timer = table.remove(host.timers, 1)
		if (timer.delay or 0) >= 5 then
			long[#long + 1] = timer
		elseif not timer.cancelled then
			timer.callback(timer)
		end
	end
	return long
end

describe("Invites that go unanswered", function()
	it("waits while a party is full, and a decline frees the seat at once", function()
		local host, ns, g = start({ hold = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		ns.Executor:Execute("raid-invite")
		local waits = runShort(host)
		assert.are.equal(4, #g.invited)
		assert.are.equal(1, #waits)
		assert.are.equal("invite", ns.Executor:Execute("raid-status").data.running)

		host:Fire("CHAT_MSG_SYSTEM", string.format(_G.ERR_DECLINE_GROUP_S, g.invited[1]))
		runShort(host)
		assert.are.equal(5, #g.invited)
	end)

	it("treats an invite nobody answered as not sent after a while, and invites again", function()
		local host, ns, g = start({ hold = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		ns.Executor:Execute("raid-invite")
		local waits = runShort(host)
		assert.are.equal(4, #g.invited)
		host.uptime = host.uptime + ns.Forming.INVITE_EXPIRES + 1
		waits[1].callback(waits[1])
		runShort(host)
		-- The four who never answered are invited again (still a party of one, so four seats).
		assert.are.equal(8, #g.invited)
		assert.are.same({ g.invited[1], g.invited[2] }, { g.invited[5], g.invited[6] })
	end)

	it("forgets an answer once the person joins, so leaving again makes them missing", function()
		local host, ns, g = start()
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 5) })
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		for index, m in ipairs(g.members) do
			if m.name == "RaiderC" then
				table.remove(g.members, index)
				break
			end
		end
		local status = ns.Executor:Execute("raid-status").data
		local state
		for _, row in ipairs(status.rows) do
			if row.name == "RaiderC" then
				state = row.state
			end
		end
		assert.are.equal("missing", state)
		assert.are.equal(1, status.toInvite)
	end)

	it("reads an offline answer and counts them as still to invite", function()
		local host, ns = start({ hold = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 3) })
		host:Fire("CHAT_MSG_SYSTEM", "No player named 'RaiderB' is currently playing.")
		local status = ns.Executor:Execute("raid-status").data
		assert.are.equal("offline", status.rows[2].state)
		assert.are.equal(2, status.toInvite)
	end)
end)

describe("Runs that can't finish", function()
	it("stops when the game ignores a move, instead of sending it over and over", function()
		local host, ns, g = start({ ignoreMoves = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		local done
		ns.Executor:Subscribe(function(name, result)
			if name == "forming-done" then
				done = result
			end
		end)
		ns.Executor:Execute("raid-arrange")
		host:RunTimers()
		assert.are.equal("NO_PROGRESS", done.error.code)
		assert.is_true(g.moves <= 2, "moves sent: " .. g.moves)
	end)

	it("won't start a row invite or an arrange while a run is going", function()
		local _, ns = start({ hold = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		ns.Executor:Execute("raid-invite")
		assert.are.equal("BUSY", ns.Executor:Execute("raid-invite", { name = "Stranger" }).error.code)
		assert.are.equal("BUSY", ns.Executor:Execute("raid-arrange").error.code)
		assert.is_true(ns.Forming:IsRunning())
	end)

	it("says how many it will invite when its first step makes the raid", function()
		local _, ns, g = start({ hold = true })
		ns.Executor:Execute("raid-import", { text = bigImport(ns, 10) })
		table.insert(g.members, { name = "RaiderB", class = "PRIEST", group = 1, online = true })
		assert.are.equal("Inviting 8 people", ns.Executor:Execute("raid-invite").reasoning)
	end)
end)

describe("Forming from the window", function()
	it("offers Invite missing in gold, runs it, and says when it's done", function()
		local host, ns, g = start()
		local window = ns.RaidWindow
		window:Show()
		window:SubmitImport(bigImport(ns, 10))
		local roster = window.pages.roster
		assert.is_true(roster.toolbar:IsShown())
		assert.are.equal("Invite missing (9)", roster.actionButton:GetText())
		assert.are.equal("primary", roster.actionButton.config.variant)

		roster.actionButton.hooks.onClick()
		assert.are.equal("Stop inviting", roster.actionButton:GetText())
		host:RunTimers()
		assert.are.equal(10, #g.members)
		assert.are.equal("Everyone on the roster has been invited", window:GetStatusText())
		assert.are.equal("Invite missing", roster.actionButton:GetText())
		assert.is_false(roster.actionButton.vintageEnabled)
	end)

	it("shows who sits outside their planned group, and Arrange fixes it", function()
		local host, ns, g = start()
		local window = ns.RaidWindow
		window:Show()
		window:SubmitImport(bigImport(ns, 10))
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		-- RaiderB is planned for group 1 and RaiderG for group 2: put them the other way round.
		for _, m in ipairs(g.members) do
			if m.name == "RaiderB" then
				m.group = 2
			elseif m.name == "RaiderG" then
				m.group = 1
			end
		end
		window:Refresh()

		local groups = window.pages.groups
		-- People land in groups in the order they accept, so more than these two are out of place.
		assert.matches("^Arrange groups %(%d+%)$", groups.actionButton:GetText())
		local statuses = {}
		for _, item in ipairs(window.groupItems) do
			if not item.isHeader then
				statuses[item.name] = item.status
			end
		end
		assert.are.equal("In group 2", statuses.RaiderB)
		assert.are.equal("In group", statuses.RaiderC)

		groups.actionButton.hooks.onClick()
		host:RunTimers()
		assert.are.equal("Groups match the plan", window:GetStatusText())
		assert.is_false(groups.actionButton.vintageEnabled)
	end)

	it("invites and whispers from a row", function()
		local host, ns, g = start({ decline = { RaiderC = true } })
		local window = ns.RaidWindow
		window:Show()
		window:SubmitImport(bigImport(ns, 5))
		ns.Executor:Execute("raid-invite")
		host:RunTimers()
		local declined
		for _, item in ipairs(window.rosterItems) do
			if item.name == "RaiderC" then
				declined = item
			end
		end
		assert.are.equal("Declined", declined.status)

		g.decline.RaiderC = nil
		window:InviteName("RaiderC")
		assert.are.equal("Inviting RaiderC", window:GetStatusText())
		host:RunTimers()
		assert.are.equal(5, #g.members)

		_G.ChatFrame_SendTell = nil
		_G.ChatFrameUtil = nil
		window:WhisperName("RaiderB")
		assert.are.equal("This client can't open a whisper. Do it by hand for now", window:GetStatusText())
	end)
end)

describe("Whispering from a row", function()
	it("opens a whisper through the chat box", function()
		local _, ns = start()
		local told
		_G.ChatFrame_SendTell = function(name)
			told = name
		end
		assert.is_true(ns.Executor:Execute("member-whisper", { name = "RaiderB" }).success)
		assert.are.equal("RaiderB", told)
		assert.are.equal("INVALID_PARAMS", ns.Executor:Execute("member-whisper", {}).error.code)
	end)
end)

describe("Invites:Read", function()
	it("reads a decline and a busy answer from the game's system messages", function()
		local _, ns = start()
		assert.are.same(
			{ "Bramble-Stonemaul", "declined" },
			{ ns.Invites:Read("Bramble-Stonemaul declines your group invitation.") }
		)
		assert.are.same({ "Cyra", "busy" }, { ns.Invites:Read("Cyra is already in a group.") })
		assert.is_nil(ns.Invites:Read("You have been awarded 12 honor."))
	end)
end)
