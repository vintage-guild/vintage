-- Addon messages on the fake client: AceComm and ChatThrottleLib as embedded, the guild roster,
-- name forms, and /vintage names (docs/features/active/addon-for-members, PR 1).
local Host = dofile("Tests/support/wow.lua")
local Load = dofile("Tests/support/load.lua")

local GUILD = {
	name = "Vintage",
	members = {
		{ name = "Aeryn Stone", rankName = "Raider", rankIndex = 3 },
		{ name = "Bloodfen Il", rankName = "Officer", rankIndex = 1 },
		{ name = "Doran Vale", rankName = "Member", rankIndex = 4, online = false },
	},
}

local function start(hostOptions)
	local host = Host.New(hostOptions)
	_G.VintageDB = nil
	local ns = Load.toc()
	host:Login()
	host:TakePrinted()
	return host, ns
end

--- Lets ChatThrottleLib send what it queued: time passes and its frame updates.
local function flush(host)
	for _ = 1, 50 do
		host.uptime = host.uptime + 1
		for _, region in ipairs(host.regions) do
			local onUpdate = region.scripts and region.scripts.OnUpdate
			if onUpdate then
				onUpdate(region, 1)
			end
		end
	end
end

describe("Addon messages", function()
	local host, comm, received

	before_each(function()
		host = start({ guild = GUILD })
		comm = {}
		LibStub("AceComm-3.0"):Embed(comm)
		received = {}
		comm:RegisterComm("VINTAGE", function(prefix, text, channel, sender)
			received[#received + 1] = { prefix = prefix, text = text, channel = channel, sender = sender }
		end)
	end)

	it("sends through ChatThrottleLib to the guild", function()
		comm:SendCommMessage("VINTAGE", "HAVE e1 1793050000", "GUILD")
		flush(host)
		local sent = host:TakeSentAddon()
		assert.are.equal(1, #sent)
		assert.are.same({ prefix = "VINTAGE", text = "HAVE e1 1793050000", channel = "GUILD", target = nil }, sent[1])
	end)

	it("hands a message from another player to the handler, with the sender the game gave", function()
		host:ReceiveAddon("VINTAGE", "WANT e1", "WHISPER", "Bloodfen Il")
		assert.are.same(
			{ prefix = "VINTAGE", text = "WANT e1", channel = "WHISPER", sender = "Bloodfen Il" },
			received[1]
		)
	end)

	it("splits a long message and puts it back together on the other side", function()
		local long = string.rep("0123456789", 120)
		comm:SendCommMessage("VINTAGE", long, "WHISPER", "Aeryn Stone")
		flush(host)
		local parts = host:TakeSentAddon()
		assert.truthy(#parts > 1, "more than one part")
		for _, part in ipairs(parts) do
			assert.truthy(#part.text <= 255)
			host:ReceiveAddon(part.prefix, part.text, part.channel, "Bloodfen Il")
		end
		assert.are.equal(1, #received)
		assert.are.equal(long, received[1].text)
	end)

	it("ignores other addons' prefixes", function()
		host:ReceiveAddon("OTHER", "x", "GUILD", "Doran Vale")
		assert.are.equal(0, #received)
	end)
end)

describe("The guild and names on the fake client", function()
	it("lists the guild with ranks, the player first", function()
		start({ guild = GUILD })
		assert.is_true(IsInGuild())
		assert.are.equal(3, (GetNumGuildMembers()))
		local name, rankName, rankIndex = GetGuildRosterInfo(2)
		assert.are.same({ "Bloodfen Il", "Officer", 1 }, { name, rankName, rankIndex })
		assert.are.same({ "Vintage", "Raider", 3 }, { GetGuildInfo("player") })
	end)

	it("drops the player's own realm, or every realm when short", function()
		start()
		assert.are.equal("Bloodfen Il", Ambiguate("Bloodfen Il-Stonemaul", "none"))
		assert.are.equal("Bloodfen Il-USPvE", Ambiguate("Bloodfen Il-USPvE", "none"))
		assert.are.equal("Bloodfen Il", Ambiguate("Bloodfen Il-USPvE", "short"))
		assert.are.equal("Doran", Ambiguate("Doran", "none"))
	end)

	it("is not in a guild unless given one", function()
		start()
		assert.is_false(IsInGuild())
		assert.are.equal(0, (GetNumGuildMembers()))
	end)
end)

describe("/vintage names", function()
	it("prints each API's name form, then the sender of a guild message", function()
		local host = start({ guild = GUILD, player = "Aeryn" })
		host:Slash("/vintage names")
		local printed = host:TakePrinted()
		assert.matches('UnitName%("player"%) = "Aeryn"', printed)
		assert.matches('GetRealmName%(%) = "Stonemaul"', printed)
		assert.matches('GetGuildInfo%("player"%) = "Vintage", "Raider", 3', printed)
		assert.matches('GetGuildRosterInfo%(1%) = "Aeryn Stone", "Raider", 3', printed)

		local sent = host:TakeSentAddon()
		assert.are.same({ prefix = "VINTAGE", text = "names-ping", channel = "GUILD", target = nil }, sent[1])
		host:ReceiveAddon("VINTAGE", "names-ping", "GUILD", "Aeryn Stone")
		assert.matches('came back from "Aeryn Stone"', host:TakePrinted())
	end)

	it("says it sent nothing outside a guild", function()
		local host = start()
		host:Slash("/vintage names")
		assert.matches("Not in a guild", host:TakePrinted())
		assert.are.equal(0, #host:TakeSentAddon())
	end)

	it("is not listed in help", function()
		local host = start()
		host:Slash("/vintage help")
		assert.is_nil(host:TakePrinted():find("names", 1, true))
	end)
end)
