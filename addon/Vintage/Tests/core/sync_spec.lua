-- Core.Sync: a guild of clients on an in-memory bus. Each test is a rule from the plan's
-- Trust and Raid sync sections (docs/features/active/addon-for-members). Senders are plain
-- strings here; how Forever names characters is the Bridge's business (Q6).
local Load = dofile("Tests/support/load.lua")
local F = dofile("Tests/fixtures/bridge_fixtures.lua")

local codec, Core, Sync, Wire

before_each(function()
	local ns
	codec, ns = Load.codec()
	Core = ns.Core
	Sync = Core.Sync
	Wire = Sync.Wire
end)

local function copy(value)
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for key, child in pairs(value) do
		out[key] = copy(child)
	end
	return out
end

--- A share of the bench fixture, generated at generatedAt, and its encoded string.
local function shareAt(generatedAt)
	local import = copy(F.fixtures["raid-import-bench.v1"].payload)
	import.generatedAt = generatedAt or import.generatedAt
	local share = Core.Share.FromImport(import)
	return share, codec:Encode(share).data
end

--- The guild: clients by name, a clock, and a queue of messages in flight.
local function Guild()
	local guild = { clients = {}, queue = {}, clock = 1793050000, hashes = 0, delivered = 0 }

	function guild:Add(name, options)
		options = options or {}
		local client = {
			name = name,
			authority = options.authority == true,
			online = options.online ~= false,
			store = options.store or {},
			logs = {},
			saved = {},
		}
		client.sync = Sync.New({
			now = function()
				return guild.clock
			end,
			send = function(channel, target, text)
				guild.queue[#guild.queue + 1] = { from = name, channel = channel, target = target, text = text }
			end,
			isAuthority = function(sender)
				if client.unknown and client.unknown[sender] then
					return nil
				end
				local other = guild.clients[sender]
				return other ~= nil and other.authority
			end,
			amAuthority = function()
				return client.authority
			end,
			isSelf = function(sender)
				return sender == name
			end,
			hash = function(text)
				guild.hashes = guild.hashes + 1
				return Core.Hash.Sha256(text)
			end,
			decodeShare = function(text)
				return codec:DecodeKind(text, "raid-share")
			end,
			store = client.store,
			onShare = function(share)
				client.saved[#client.saved + 1] = share
			end,
			log = function(message)
				client.logs[#client.logs + 1] = message
			end,
		})
		self.clients[name] = client
		return client
	end

	--- Delivers until nothing is in flight: GUILD to every other online client, WHISPER to
	--- its target if online. filter(message) may drop a message.
	function guild:Run(filter)
		local guard = 0
		while #self.queue > 0 do
			guard = guard + 1
			assert(guard < 500, "messages keep flowing")
			local message = table.remove(self.queue, 1)
			if not (filter and filter(message) == false) then
				for name, client in pairs(self.clients) do
					local addressed = message.channel ~= "WHISPER" or message.target == name
					if client.online and name ~= message.from and addressed then
						self.delivered = self.delivered + 1
						client.sync:OnMessage(message.from, message.channel, message.text)
					end
				end
			end
		end
	end

	function guild:Advance(seconds)
		self.clock = self.clock + seconds
		for _, client in pairs(self.clients) do
			if client.online then
				client.sync:Tick()
			end
		end
	end

	return guild
end

local function held(client, eventId)
	return client.store[eventId or "evt_mc_0001"]
end

describe("Sync.Wire", function()
	local version = { eventId = "evt_mc_0001", generatedAt = 1793000000, hash = string.rep("ab", 32) }

	it("reads back what it writes", function()
		assert.are.same(
			{ kind = "HAVE", versions = { version, version } },
			Wire.Decode(Wire.Have({ version, version }))
		)
		assert.are.same({ kind = "HAVE", versions = {} }, Wire.Decode(Wire.Have({})))
		assert.are.same({ kind = "WANT", version = version }, Wire.Decode(Wire.Want(version)))
		assert.are.same(
			{ kind = "SHARE", version = version, data = "!VIN:1!abc" },
			Wire.Decode(Wire.Share(version, "!VIN:1!abc"))
		)
	end)

	it("refuses anything malformed before reading it", function()
		local bad = {
			"2|HAVE|",
			"1|DANCE|",
			"1|WANT|evt|x:1:" .. version.hash,
			"1|WANT|evt_mc_0001:1:abc",
			"1|WANT|evt_mc_0001:x:" .. version.hash,
			"1|SHARE|" .. "evt_mc_0001:1:" .. version.hash .. "|not a bridge string",
			"1|HAVE|" .. string.rep("evt:1:" .. version.hash .. ";", 5) .. "evt:1:" .. version.hash,
			"1|SHARE|evt:1:" .. version.hash .. "|!VIN:1!" .. string.rep("a", Sync.MAX_SHARE_LENGTH + 200),
		}
		for _, text in ipairs(bad) do
			assert.is_nil((Wire.Decode(text)), text:sub(1, 40))
		end
		assert.is_nil((Wire.Decode(nil)))
	end)

	it("only carries event ids of letters, digits, _ and -", function()
		assert.is_true(Wire.IsEventId("evt_mc-0001"))
		for _, id in ipairs({ "", "a|b", "a:b", "a;b", "a b", string.rep("a", 65) }) do
			assert.is_false(Wire.IsEventId(id), id)
		end
	end)
end)

describe("Core.Sync", function()
	local guild, officer, members

	before_each(function()
		guild = Guild()
		officer = guild:Add("Bloodfen Il", { authority = true })
		members = { guild:Add("Aeryn Stone"), guild:Add("Cyra Vale"), guild:Add("Doran Pike") }
	end)

	it("brings every member the officer's share, and they agree byte for byte", function()
		local share, data = shareAt()
		assert.is_true(officer.sync:Publish(share, data).success)
		guild:Run()
		for _, member in ipairs(members) do
			assert.are.equal(data, held(member).data, member.name)
			assert.are.equal(held(officer).hash, held(member).hash)
			assert.are.equal(1, #member.saved)
		end
	end)

	it("lets a member who logs in later catch up while an officer is online", function()
		local late = guild:Add("Elowen Ash", { online = false })
		officer.sync:Publish(shareAt())
		guild:Run()
		late.online = true
		late.sync:Announce() -- an empty HAVE: officers see they are behind
		guild:Run()
		-- The officer announced moments ago, so it answers when its interval ends.
		assert.is_nil(held(late))
		guild:Advance(Sync.ANNOUNCE_INTERVAL)
		guild:Run()
		assert.are.equal(held(officer).data, held(late).data)
	end)

	it("never takes a raid on a member's word alone", function()
		local forger = members[1]
		local share, data = shareAt(1793999999)
		share.raid.title = "Free loot for Aeryn"
		data = codec:Encode(share).data
		forger.sync:Publish(share, data)
		guild:Run()
		assert.is_nil(held(members[2]))
		assert.is_nil(held(members[3]))
		assert.is_nil(held(officer))
	end)

	it("drops a relayed copy that doesn't match the officer's fingerprint", function()
		local share, data = shareAt()
		local relay, asker = members[1], members[2]
		-- The relay holds the real fingerprint but serves different bytes.
		officer.sync:Publish(share, data)
		guild:Run(function(message)
			return message.from == officer.name and message.channel == "GUILD"
		end)
		local tampered = copy(share)
		tampered.raid.title = "Tampered"
		guild.queue = {}
		asker.sync:OnMessage(
			relay.name,
			"WHISPER",
			Wire.Share(asker.sync.wanted[next(asker.sync.wanted)].version, codec:Encode(tampered).data)
		)
		assert.is_nil(held(asker))
		assert.matches("doesn't match", asker.logs[1])
	end)

	it("ignores a SHARE nobody asked for, without hashing it", function()
		local share, data = shareAt()
		local version = { eventId = share.raid.eventId, generatedAt = share.generatedAt, hash = Core.Hash.Sha256(data) }
		local before = guild.hashes
		members[1].sync:OnMessage(officer.name, "WHISPER", Wire.Share(version, data))
		assert.is_nil(held(members[1]))
		assert.are.equal(before, guild.hashes)

		-- Even with the officer's real fingerprint known: a SHARE it didn't ask for is not hashed.
		officer.sync:Publish(share, data)
		guild:Run()
		assert.is_not_nil(held(members[1]))
		before = guild.hashes
		for _ = 1, 3 do
			members[1].sync:OnMessage(members[2].name, "WHISPER", Wire.Share(version, data))
		end
		assert.are.equal(before, guild.hashes)
	end)

	it("waits for the guild roster before judging a sender, then reads the HAVE again", function()
		local member = members[1]
		member.unknown = { [officer.name] = true }
		officer.sync:Publish(shareAt())
		guild:Run()
		assert.is_nil(held(member))
		member.unknown = nil
		member.sync:RosterReady()
		guild:Run()
		assert.is_not_nil(held(member))
	end)

	it("asks another member when the officer goes quiet, if it learned the fingerprint", function()
		local first, second = members[1], members[2]
		officer.sync:Publish(shareAt())
		-- The officer answers the first member, then logs off before answering the second.
		guild:Run(function(message)
			if message.from == officer.name and message.target == second.name then
				return false
			end
		end)
		officer.online = false
		assert.is_not_nil(held(first))
		assert.is_nil(held(second))
		guild:Advance(Sync.WANT_TIMEOUT)
		guild:Run()
		assert.are.equal(held(first).data, held(second).data)
	end)

	it("can't help a member who never heard an officer", function()
		local late = guild:Add("Elowen Ash", { online = false })
		officer.sync:Publish(shareAt())
		guild:Run()
		officer.online = false
		late.online = true
		late.sync:Announce()
		guild:Run()
		guild:Advance(Sync.ANNOUNCE_INTERVAL)
		guild:Run()
		assert.is_nil(held(late))
	end)

	it("moves everyone to a newer import, and ignores an older one", function()
		officer.sync:Publish(shareAt(1793000000))
		guild:Run()
		guild:Advance(Sync.ANNOUNCE_INTERVAL)
		officer.sync:Publish(shareAt(1793000100))
		guild:Run()
		assert.are.equal(1793000100, held(members[1]).generatedAt)
		assert.are.equal("OLDER", officer.sync:Publish(shareAt(1793000000)).error.code)
	end)

	it("keeps the first fingerprint when two officers disagree about one version", function()
		local second = guild:Add("Fenna Brook", { authority = true })
		local share, data = shareAt()
		officer.sync:Publish(share, data)
		local version = { eventId = share.raid.eventId, generatedAt = share.generatedAt, hash = string.rep("0", 64) }
		guild:Run()
		members[1].sync:OnMessage(second.name, "GUILD", Wire.Have({ version }))
		assert.are.equal(Core.Hash.Sha256(data), held(members[1]).hash)
		assert.matches("Two fingerprints", members[1].logs[1])
	end)

	it("announces at most once per interval, and sends the held-back one later", function()
		local member = members[1]
		assert.is_true(member.sync:Announce())
		assert.is_false(member.sync:Announce())
		assert.are.equal(1, #guild.queue)
		guild:Advance(Sync.ANNOUNCE_INTERVAL - 1)
		assert.are.equal(1, #guild.queue)
		guild:Advance(1)
		assert.are.equal(2, #guild.queue)
	end)

	it("answers one asker once per raid version per interval", function()
		local share, data = shareAt()
		officer.sync:Publish(share, data)
		guild.queue = {}
		local want = Wire.Want(officer.sync:Holdings()[1])
		officer.sync:OnMessage("Aeryn Stone", "WHISPER", want)
		officer.sync:OnMessage("Aeryn Stone", "WHISPER", want)
		assert.are.equal(1, #guild.queue)
		guild:Advance(Sync.ANSWER_INTERVAL)
		officer.sync:OnMessage("Aeryn Stone", "WHISPER", want)
		assert.are.equal(2, #guild.queue)
	end)

	it("handles only so many messages from one sender in a window", function()
		local seen = 0
		local sync = members[1].sync
		sync.OnHave = function()
			seen = seen + 1
		end
		for _ = 1, Sync.SENDER_BUDGET + 5 do
			sync:OnMessage("Spammy Loud", "GUILD", Wire.Have({}))
		end
		assert.are.equal(Sync.SENDER_BUDGET, seen)
		guild:Advance(Sync.BUDGET_WINDOW)
		sync:OnMessage("Spammy Loud", "GUILD", Wire.Have({}))
		assert.are.equal(Sync.SENDER_BUDGET + 1, seen)
	end)

	it("holds sends during an encounter and sends them in order after", function()
		local sync = officer.sync
		sync:SetPaused(true)
		sync:Publish(shareAt())
		assert.are.equal(0, #guild.queue)
		sync:SetPaused(false)
		assert.are.equal(1, #guild.queue)
		assert.matches("^1|HAVE|evt_mc_0001", guild.queue[1].text)
	end)

	it("drops a raid a day after it starts", function()
		local share = shareAt()
		officer.sync:Publish(share, codec:Encode(share).data)
		guild:Run()
		guild.clock = share.raid.startsAt + Sync.KEEP_AFTER_START
		guild:Advance(1)
		assert.is_nil(held(officer))
		assert.is_nil(held(members[1]))
	end)

	it("keeps what it holds across a reload, as trusted", function()
		officer.sync:Publish(shareAt())
		guild:Run()
		local reloaded = Sync.New({
			now = function()
				return guild.clock
			end,
			send = function() end,
			isAuthority = function()
				return false
			end,
			amAuthority = function()
				return false
			end,
			isSelf = function()
				return false
			end,
			hash = Core.Hash.Sha256,
			decodeShare = function() end,
			store = members[1].store,
		})
		assert.are.equal(1, #reloaded:Holdings())
		assert.are.equal(held(officer).hash, reloaded:Holdings()[1].hash)
	end)
end)
