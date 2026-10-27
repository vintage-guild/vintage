# Reusable charge and cooldown outputs

`Charges.CalculateChargeFillInto`, `Charges.CalculateAllInto`,
`Cooldowns.CalculateProgressInto`, and `Cooldowns.CalculateInto` write into a
caller-owned table and return that same table. They bypass the ActionResult
wrapper for validated hot-path inputs. The original methods still return an
independently owned ActionResult and remain compatible with existing callers.

```lua
local input = { currentCharges = 2, maxCharges = 6, chargeStart = 100,
    chargeDuration = 30, now = 115 }
local output = { charges = {} }
FenCore.Charges.CalculateAllInto(input, output)
-- Later: change input.now and reuse both input and output.
```

Pass ordinary numeric inputs; the adapter must detect secret timing/count values
before calling these methods. `Cooldowns.CalculateInto` additionally handles the
potentially secret enabled flag. Into methods require an output table and do not
return structured errors for malformed input.

The returned data is borrowed mutable storage. Copy values to retain a snapshot,
or allocate separate buffers for independent consumers. All schema fields are
overwritten each call. Charge arrays allocate missing entries on growth and remove
stale tail entries on shrink. Progress-only cooldown calls clear `isEnabled`.
Use one stable-capacity charge buffer per ability to avoid repeated shrink/grow
allocations. The normal path allocates nothing after its buffers are populated.

The matching embedded API and allocation/ownership tests are maintained in
Flightsim. From that repository, run `lua Tests/domain_buffer_regressions.lua`;
set `FENCORE_ROOT` to this source directory to verify a source sync.
