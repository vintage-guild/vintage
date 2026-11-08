--------------------------------------------------------------------------------
-- Vintage Core: the raid sync (docs/features/active/addon-for-members, Raid sync and Trust)
-- Pure Lua. Who sent a message and when come in as arguments, and what to send goes out
-- through deps.send, so busted runs a guild of clients over an in-memory bus. The Bridge
-- carries the text over AceComm and answers deps.isAuthority from the guild roster: the
-- only part that depends on how Forever names characters.
--
-- A client keeps a share only when it asked for it and the bytes' SHA-256 matches a
-- fingerprint an officer announced. A modified client can still send anything; it can
-- only fool itself.
--------------------------------------------------------------------------------

local _, ns = ...

local Core = ns.Core

local Sync = {}
Core.Sync = Sync

Sync.PROTOCOL = "1"
Sync.ANNOUNCE_INTERVAL = 30 -- seconds between a client's HAVEs
Sync.WANT_TIMEOUT = 30 -- ask another source after this long without the SHARE
Sync.ANSWER_INTERVAL = 60 -- one SHARE per asker per raid version in this long
Sync.SENDER_BUDGET = 20 -- messages handled per sender per window
Sync.BUDGET_WINDOW = 60
Sync.MAX_ANNOUNCED = 5 -- raids in one HAVE, newest start first
Sync.MAX_SHARE_LENGTH = 49152 -- characters; hashing costs about 11 µs a byte
Sync.KEEP_AFTER_START = 86400 -- a share is dropped a day after its raid starts
Sync.MAX_OUTBOX = 50 -- messages held while paused
Sync.MAX_DEFERRED = 200 -- HAVEs waiting for the guild roster
Sync.DEFERRED_FOR = 300 -- seconds a HAVE waits for the roster
Sync.MAX_GENERATED_AT = 999999999999 -- 12 digits, the most the wire reads

--------------------------------------------------------------------------------
-- Wire format: "1|HAVE|e:g:h;e:g:h", "1|WANT|e:g:h", "1|SHARE|e:g:h|!VIN:1!..."
-- e is the raid's eventId, g its import's generatedAt, h the share's SHA-256.
--------------------------------------------------------------------------------

local Wire = {}
Sync.Wire = Wire

--- An event id the wire can carry: letters, digits, _ and -, up to 64 (the bridge's id limit).
function Wire.IsEventId(value)
	return type(value) == "string" and #value <= 64 and value:match("^[%w_%-]+$") ~= nil
end

local function versionText(version)
	-- %.0f, not %d: Lua 5.1 formats %d through a C long, which wraps at 2^31.
	return string.format("%s:%.0f:%s", version.eventId, version.generatedAt, version.hash)
end

local function parseVersion(text)
	local eventId, generatedAt, hash = text:match("^([^:]+):(%d+):(%x+)$")
	if not eventId or not Wire.IsEventId(eventId) or #hash ~= 64 or #generatedAt > 12 then
		return nil
	end
	return { eventId = eventId, generatedAt = tonumber(generatedAt), hash = hash:lower() }
end

function Wire.Have(versions)
	local parts = {}
	for index, version in ipairs(versions) do
		parts[index] = versionText(version)
	end
	return Sync.PROTOCOL .. "|HAVE|" .. table.concat(parts, ";")
end

function Wire.Want(version)
	return Sync.PROTOCOL .. "|WANT|" .. versionText(version)
end

function Wire.Share(version, data)
	return Sync.PROTOCOL .. "|SHARE|" .. versionText(version) .. "|" .. data
end

--- The message in a text, or nil and why. Bounds the work before reading anything.
---@param text any
---@return table|nil message { kind, versions | version, data }
---@return string|nil reason
function Wire.Decode(text)
	if type(text) ~= "string" then
		return nil, "not text"
	end
	if #text > Sync.MAX_SHARE_LENGTH + 128 then
		return nil, "too long"
	end
	local protocol, kind, rest = text:match("^(%d+)|(%u+)|(.*)$")
	if protocol ~= Sync.PROTOCOL then
		return nil, "unknown protocol"
	end
	if kind == "HAVE" then
		local versions = {}
		if rest ~= "" then
			for part in (rest .. ";"):gmatch("([^;]*);") do
				if #versions >= Sync.MAX_ANNOUNCED then
					return nil, "too many raids"
				end
				local version = parseVersion(part)
				if not version then
					return nil, "bad version"
				end
				versions[#versions + 1] = version
			end
		end
		return { kind = "HAVE", versions = versions }
	elseif kind == "WANT" then
		local version = parseVersion(rest)
		if not version then
			return nil, "bad version"
		end
		return { kind = "WANT", version = version }
	elseif kind == "SHARE" then
		local head, data = rest:match("^([^|]+)|(.+)$")
		local version = head and parseVersion(head)
		if not version or data:sub(1, 5) ~= "!VIN:" then
			return nil, "bad share"
		end
		return { kind = "SHARE", version = version, data = data }
	end
	return nil, "unknown kind"
end

--------------------------------------------------------------------------------
-- A client's sync
--------------------------------------------------------------------------------

local SyncMixin = {}

local function key(eventId, generatedAt)
	return eventId .. ":" .. generatedAt
end

--- deps:
---   now()                     seconds
---   send(channel, target, text)
---   isAuthority(sender)       true for an officer, false for anyone else, nil while the
---                             guild roster hasn't loaded the sender (the HAVE waits)
---   amAuthority()             whether this client counts as an officer
---   isSelf(sender)
---   hash(text)                SHA-256 as 64 hex digits
---   decodeShare(text)         ActionResult with the raid-share payload
---   store                     saved shares: [eventId] = { generatedAt, hash, data, startsAt }
---   onShare(share, entry)     optional: a new share was saved
---   log(message)              optional
---@param deps table
---@return table sync
function Sync.New(deps)
	local sync = setmetatable({
		deps = deps,
		store = deps.store or {},
		trusted = {}, -- [eventId:generatedAt] = the fingerprint an officer announced
		wanted = {}, -- [eventId:generatedAt] = { version, at, asked = { [sender] }, sources = { [sender] } }
		answered = {}, -- [asker|eventId:generatedAt] = when we last sent them that SHARE
		budget = {}, -- [sender] = { start, count }
		deferred = {}, -- [sender] = { versions, at }: a HAVE waiting for the guild roster
		deferredCount = 0,
		expired = {}, -- [eventId] = generatedAt dropped a day after its start: no version up to it again
		outbox = {},
		paused = false,
	}, { __index = SyncMixin })
	-- What we hold matched an officer's fingerprint when it was saved (or we published it).
	for eventId, entry in pairs(sync.store) do
		sync.trusted[key(eventId, entry.generatedAt)] = entry.hash
	end
	return sync
end

function SyncMixin:Log(message)
	if self.deps.log then
		self.deps.log(message)
	end
end

--- Sends now, or holds it while paused (an encounter). A SHARE is never held: whoever asked
--- asks again, and a flood of asks can't fill the outbox. Only the latest HAVE is held.
---@return boolean sent or held
function SyncMixin:Send(kind, channel, target, text)
	if not self.paused then
		self.deps.send(channel, target, text)
		return true
	end
	if kind == "SHARE" then
		return false
	end
	if kind == "HAVE" then
		for index = #self.outbox, 1, -1 do
			if self.outbox[index].kind == "HAVE" then
				table.remove(self.outbox, index)
			end
		end
	elseif #self.outbox >= Sync.MAX_OUTBOX then
		return false
	end
	self.outbox[#self.outbox + 1] = { kind = kind, channel = channel, target = target, text = text }
	return true
end

--- Holds sends while paused (an encounter), and sends them in order when resumed.
function SyncMixin:SetPaused(paused)
	self.paused = paused == true
	if self.paused then
		return
	end
	local outbox = self.outbox
	self.outbox = {}
	for _, message in ipairs(outbox) do
		self.deps.send(message.channel, message.target, message.text)
	end
end

--- The raids this client holds, newest start first, as HAVE lists them.
function SyncMixin:Holdings()
	local list = {}
	for eventId, entry in pairs(self.store) do
		list[#list + 1] = {
			eventId = eventId,
			generatedAt = entry.generatedAt,
			hash = entry.hash,
			startsAt = entry.startsAt or 0,
		}
	end
	table.sort(list, function(a, b)
		if a.startsAt ~= b.startsAt then
			return a.startsAt > b.startsAt
		end
		return a.eventId < b.eventId
	end)
	for index = #list, Sync.MAX_ANNOUNCED + 1, -1 do
		list[index] = nil
	end
	return list
end

--- Sends a HAVE, even an empty one (it tells officers this client is behind). At most once
--- per ANNOUNCE_INTERVAL; a call inside it is sent by Tick when the interval ends.
---@param channel string|nil "GUILD" (default) or "RAID"
---@return boolean sent
function SyncMixin:Announce(channel)
	local now = self.deps.now()
	if self.lastAnnounce and now - self.lastAnnounce < Sync.ANNOUNCE_INTERVAL then
		self.announcePending = channel or self.announcePending or "GUILD"
		return false
	end
	self.lastAnnounce = now
	self.announcePending = nil
	self:Send("HAVE", channel or "GUILD", nil, Wire.Have(self:Holdings()))
	return true
end

--- Shares a raid this client cut from its own import (Core.Share.FromImport), encoded, and
--- announces it at once.
---@param share table the raid-share payload
---@param data string its encoded bridge string
---@return table ActionResult
function SyncMixin:Publish(share, data)
	local eventId, generatedAt = share.raid and share.raid.eventId, share.generatedAt
	if not Wire.IsEventId(eventId) then
		return Core.Result.error("UNSHAREABLE", "The raid's event id can't be shared: " .. tostring(eventId))
	end
	if #data > Sync.MAX_SHARE_LENGTH then
		return Core.Result.error("TOO_LARGE", "The raid is too large to share")
	end
	if
		type(generatedAt) ~= "number"
		or generatedAt < 0
		or generatedAt > Sync.MAX_GENERATED_AT
		or generatedAt ~= math.floor(generatedAt)
	then
		return Core.Result.error("UNSHAREABLE", "The import's generatedAt can't be shared: " .. tostring(generatedAt))
	end
	local held = self.store[eventId]
	if held and held.generatedAt > generatedAt then
		return Core.Result.error("OLDER", "A newer import of this raid is already shared")
	end
	local hash = self.deps.hash(data)
	self.store[eventId] = { generatedAt = generatedAt, hash = hash, data = data, startsAt = share.raid.startsAt }
	self.trusted[key(eventId, generatedAt)] = hash
	self.lastAnnounce = nil
	self:Announce("GUILD")
	return Core.Result.success({ eventId = eventId, hash = hash }, "Shared with the guild")
end

function SyncMixin:IsNewer(version)
	local expired = self.expired[version.eventId]
	if expired and version.generatedAt <= expired then
		return false
	end
	local held = self.store[version.eventId]
	return not held or version.generatedAt > held.generatedAt
end

--- Counts a message against its sender's budget; false once the budget is spent.
function SyncMixin:Spend(sender)
	local now = self.deps.now()
	local entry = self.budget[sender]
	if not entry or now - entry.start >= Sync.BUDGET_WINDOW then
		entry = { start = now, count = 0 }
		self.budget[sender] = entry
	end
	entry.count = entry.count + 1
	return entry.count <= Sync.SENDER_BUDGET
end

--- An addon message on the sync's prefix, from another player.
---@param sender string as the game reports it
---@param channel string
---@param text string
function SyncMixin:OnMessage(sender, channel, text)
	if self.deps.isSelf(sender) or not self:Spend(sender) then
		return
	end
	local message = Wire.Decode(text)
	if not message then
		return
	end
	-- HAVE is announced to the guild or raid; WANT and SHARE are whispered.
	local announced = channel == "GUILD" or channel == "RAID"
	if (message.kind == "HAVE") ~= announced then
		return
	end
	if message.kind == "HAVE" then
		self:OnHave(sender, message.versions)
	elseif message.kind == "WANT" then
		self:OnWant(sender, message.version)
	elseif message.kind == "SHARE" then
		self:OnShare(sender, message.version, message.data)
	end
end

function SyncMixin:OnHave(sender, versions)
	local authority = self.deps.isAuthority(sender)
	if authority == nil then
		if not self.deferred[sender] then
			if self.deferredCount >= Sync.MAX_DEFERRED then
				return
			end
			self.deferredCount = self.deferredCount + 1
		end
		self.deferred[sender] = { versions = versions, at = self.deps.now() }
		return
	end
	if self.deferred[sender] then
		self.deferred[sender] = nil
		self.deferredCount = self.deferredCount - 1
	end
	local listed = {}
	for _, version in ipairs(versions) do
		listed[version.eventId] = version
		local k = key(version.eventId, version.generatedAt)
		if authority then
			local known = self.trusted[k]
			if not known then
				self.trusted[k] = version.hash
			elseif known ~= version.hash then
				self:Log(string.format("Two fingerprints for %s; kept the first, ignored %s's", k, sender))
			end
		end
		if self.trusted[k] == version.hash and self:IsNewer(version) then
			self:Want(version, sender)
		end
	end
	-- An officer who sees someone behind announces again, so they learn its fingerprints.
	if self.deps.amAuthority() then
		for eventId, entry in pairs(self.store) do
			local theirs = listed[eventId]
			if not theirs or theirs.generatedAt < entry.generatedAt then
				self:Announce("GUILD")
				break
			end
		end
	end
end

function SyncMixin:Want(version, source)
	local k = key(version.eventId, version.generatedAt)
	local now = self.deps.now()
	local pending = self.wanted[k]
	if pending then
		pending.sources[source] = true
		if now - pending.at < Sync.WANT_TIMEOUT or pending.asked[source] then
			return
		end
	else
		pending = { version = version, asked = {}, sources = { [source] = true } }
		self.wanted[k] = pending
	end
	pending.at = now
	pending.asked[source] = true
	self:Send("WANT", "WHISPER", source, Wire.Want(version))
end

function SyncMixin:OnWant(sender, version)
	local held = self.store[version.eventId]
	if not held or held.generatedAt ~= version.generatedAt or held.hash ~= version.hash then
		return
	end
	local now = self.deps.now()
	local k = sender .. "|" .. key(version.eventId, version.generatedAt)
	local last = self.answered[k]
	if last and now - last < Sync.ANSWER_INTERVAL then
		return
	end
	-- Counted only when it went out: a SHARE held back by an encounter isn't an answer.
	if self:Send("SHARE", "WHISPER", sender, Wire.Share(version, held.data)) then
		self.answered[k] = now
	end
end

function SyncMixin:OnShare(sender, version, data)
	local k = key(version.eventId, version.generatedAt)
	local pending = self.wanted[k]
	local expected = self.trusted[k]
	-- Not asked for, not from someone asked, from someone whose bytes already failed, or not
	-- the fingerprint an officer announced: dropped before any hashing.
	if pending and expected == version.hash and pending.asked[sender] == nil then
		-- Logged: if the game names a sender differently by channel, this is where it shows.
		self:Log(string.format("Ignored %s from %s: not asked", k, sender))
	end
	if
		not pending
		or pending.asked[sender] ~= true
		or not expected
		or expected ~= version.hash
		or #data > Sync.MAX_SHARE_LENGTH
	then
		return
	end
	if self.deps.hash(data) ~= expected then
		pending.asked[sender] = "failed"
		self:Log(string.format("Dropped %s from %s: it doesn't match the officers' fingerprint", k, sender))
		return
	end
	local decoded = self.deps.decodeShare(data)
	local share = decoded.success and decoded.data or nil
	if not share or share.raid.eventId ~= version.eventId or share.generatedAt ~= version.generatedAt then
		self:Log(string.format("Dropped %s from %s: it isn't the raid it claims", k, sender))
		return
	end
	self.wanted[k] = nil
	if not self:IsNewer(version) then
		return
	end
	local entry = { generatedAt = version.generatedAt, hash = expected, data = data, startsAt = share.raid.startsAt }
	self.store[version.eventId] = entry
	if self.deps.onShare then
		self.deps.onShare(share, entry)
	end
	self:Announce("GUILD")
end

--- The guild roster loaded: HAVEs that waited for it are read again.
function SyncMixin:RosterReady()
	local deferred = self.deferred
	self.deferred = {}
	self.deferredCount = 0
	for sender, waiting in pairs(deferred) do
		self:OnHave(sender, waiting.versions)
	end
	-- Say what we hold, in case an officer's HAVE was turned away while the roster loaded.
	self:Announce("GUILD")
end

--- Drops a raid and every fingerprint and request for it. It is never fetched again in that
--- version or an older one; a later import (a new generatedAt an officer announces) still is.
function SyncMixin:Expire(eventId)
	local entry = self.store[eventId]
	self.store[eventId] = nil
	self.expired[eventId] = math.max(self.expired[eventId] or 0, entry and entry.generatedAt or 0)
	local prefix = eventId .. ":"
	for k in pairs(self.trusted) do
		if k:sub(1, #prefix) == prefix then
			self.trusted[k] = nil
		end
	end
	for k in pairs(self.wanted) do
		if k:sub(1, #prefix) == prefix then
			self.wanted[k] = nil
		end
	end
end

--- Runs what waits on time: a held-back HAVE, asking another source after a timeout, and
--- dropping raids a day past their start. The Bridge calls it every few seconds.
function SyncMixin:Tick()
	local now = self.deps.now()
	if self.announcePending and now - (self.lastAnnounce or 0) >= Sync.ANNOUNCE_INTERVAL then
		self:Announce(self.announcePending)
	end
	for k, pending in pairs(self.wanted) do
		if now - pending.at >= Sync.WANT_TIMEOUT then
			-- Another source that has it, an officer first.
			local candidate
			for source in pairs(pending.sources) do
				if not pending.asked[source] then
					if self.deps.isAuthority(source) then
						candidate = source
						break
					end
					candidate = candidate or source
				end
			end
			if candidate then
				self:Want(pending.version, candidate)
			elseif now - pending.at >= Sync.WANT_TIMEOUT * 4 then
				-- Nobody left to ask: say we're behind, and an officer announces again.
				self.wanted[k] = nil
				self.announcePending = self.announcePending or "GUILD"
			end
		end
	end
	for eventId, entry in pairs(self.store) do
		if entry.startsAt and entry.startsAt + Sync.KEEP_AFTER_START < now then
			self:Expire(eventId)
		end
	end
	for sender, waiting in pairs(self.deferred) do
		if now - waiting.at >= Sync.DEFERRED_FOR then
			self.deferred[sender] = nil
			self.deferredCount = self.deferredCount - 1
		end
	end
	for k, at in pairs(self.answered) do
		if now - at >= Sync.ANSWER_INTERVAL then
			self.answered[k] = nil
		end
	end
	for sender, entry in pairs(self.budget) do
		if now - entry.start >= Sync.BUDGET_WINDOW then
			self.budget[sender] = nil
		end
	end
end

return Sync
