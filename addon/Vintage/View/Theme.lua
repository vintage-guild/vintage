--------------------------------------------------------------------------------
-- Vintage View: FenUI themes from the design tokens (plan D9)
-- Theme/VintageTokens.lua is generated from libs/design-tokens. Its colors become
-- FenUI primitives and its themes map FenUI's semantic tokens onto them.
--
-- FenUI applies token colors only through SetGlobalTheme, which restyles every
-- FenUI addon on the client and prints to chat, so Vintage never calls it. Windows
-- name the Vintage theme for their border; Vintage colors on Vintage windows alone
-- need a per-frame token hook in FenUI (PLAN Q13).
--
-- FenUI is a plain global, and every addon's embedded copy resets FenUI.Themes and
-- FenUI.Tokens when it loads. Vintage registers at login (after every addon has
-- loaded) and again before building a window if a late copy wiped the themes.
--------------------------------------------------------------------------------

local _, ns = ...

local Theme = {}
ns.Theme = Theme

Theme.DEFAULT = "VintageDark"

--- Registers VintageDark and VintageParchment with FenUI. Safe to call again.
---@return boolean registered
function Theme:Register()
	local FenUI = rawget(_G, "FenUI")
	local tokens = ns.VintageTokens
	if not (FenUI and FenUI.Tokens and FenUI.Tokens.colors and FenUI.RegisterTheme and tokens) then
		return false
	end

	local colors = FenUI.Tokens.colors
	for name, rgba in pairs(tokens.colors) do
		if colors[name] == nil then
			colors[name] = rgba
		end
	end
	for _, theme in pairs(tokens.themes) do
		FenUI:RegisterTheme(theme.name, theme)
	end
	return true
end

--- Registers again when a FenUI copy that loaded later reset the themes.
function Theme:Ensure()
	if not self:Exists(self.DEFAULT) then
		self:Register()
	end
end

local QUALITY_KEYS = { [0] = "poor", "common", "uncommon", "rare", "epic", "legendary" }

--- An item quality's color from the design tokens, as hex for a color escape ("a335ee").
---@param quality number|nil
---@return string|nil
function Theme:QualityHex(quality)
	local tokens = ns.VintageTokens and ns.VintageTokens.wow and ns.VintageTokens.wow["vintage-dark"]
	local rgba = tokens and tokens.quality[QUALITY_KEYS[quality]]
	if not rgba then
		return nil
	end
	return string.format("%02x%02x%02x", rgba[1] * 255 + 0.5, rgba[2] * 255 + 0.5, rgba[3] * 255 + 0.5)
end

--- An error's message and what to do about it as one line: "Not now. Try later", or
--- "Give it to Doran? Press Confirm" when the message already ends in punctuation.
---@param message any
---@param suggestion string|nil
---@return string
function Theme.JoinMessage(message, suggestion)
	local text = tostring(message)
	if not suggestion then
		return text
	end
	return text .. (text:match("[%.%?!]$") and " " or ". ") .. suggestion
end

--- Whether a theme is registered with FenUI.
---@param name string
---@return boolean
function Theme:Exists(name)
	local FenUI = rawget(_G, "FenUI")
	return FenUI ~= nil and FenUI.ThemeManager ~= nil and FenUI.ThemeManager:Exists(name) == true
end

return Theme
