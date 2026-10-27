--------------------------------------------------------------------------------
-- Vintage Bridge: the bridge string codec over the embedded libraries
-- Core/BridgeFormat holds the codec; this hands it the LibSerialize and LibDeflate
-- copies that embeds.xml loaded.
--------------------------------------------------------------------------------

local _, ns = ...

ns.BridgeCodec = ns.Core.BridgeFormat.Codec.New(LibStub("LibSerialize"), LibStub("LibDeflate"))

return ns.BridgeCodec
