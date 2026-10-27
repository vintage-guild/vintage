--------------------------------------------------------------------------------
-- Vintage Bridge: secret values
-- Midnight's secret-value rules apply on Forever during boss encounters. Every field
-- a game API returns passes through Public() before Core sees it, so Core never
-- compares, formats, or counts an opaque value (plan D7).
--
-- Only the client's own issecretvalue decides. Without it, nothing is secret:
-- FenCore's fallback guesses by comparing against a number, which marks every
-- string secret.
--------------------------------------------------------------------------------

local _, ns = ...

local Secrets = {}
ns.Secrets = Secrets

--- True when a value is one of the game's opaque secret values.
---@param value any
---@return boolean
function Secrets.IsSecret(value)
	local issecret = rawget(_G, "issecretvalue")
	return issecret ~= nil and issecret(value) == true
end

--- The value, or nil when it is secret.
---@param value any
---@return any
function Secrets.Public(value)
	if Secrets.IsSecret(value) then
		return nil
	end
	return value
end

return Secrets
