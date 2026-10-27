# FenCore Design Principles

Strict conventions for FenCore contributors. Following these principles ensures a consistent, framework-agnostic, and stable API.

> **Core Philosophy**: Push complexity to the edges. Provide small, composable primitives rather than monolithic solutions.

**Related Documentation:**
- [API Reference](./API-REFERENCE.md) - Complete function reference
- [Architecture](./ARCHITECTURE.md) - Technical deep-dive
- [Integration Guide](./INTEGRATION.md) - How to use FenCore

---

## 1. Naming Conventions

### Domain Names

Use **PascalCase**, **noun-based** names describing the concept:

| Good | Bad |
|------|-----|
| `Math` | `MathUtils`, `MathHelpers` |
| `Color` | `ColorUtils`, `Colors` |
| `Time` | `TimeFormatter`, `TimeUtils` |
| `Progress` | `ProgressBar`, `FillCalculator` |

Domains are **concepts**, not implementation details.

### Function Names

Use **PascalCase** with prefixes that **signal cost and intent**:

| Prefix | Cost Signal | Usage | Examples |
|--------|-------------|-------|----------|
| `Calculate*` | Medium (CPU work) | Compute derived values | `CalculateFill`, `CalculateProgress` |
| `Format*` | Low-Medium | Convert to display string | `FormatDuration`, `FormatNumber` |
| `Parse*` | Medium (validation) | Convert from string | `ParseDuration`, `ParseColor` |
| `Is*` | **Cheap (O(1))** | Boolean predicate | `IsSecret`, `IsEmpty` |
| `Get*` | **Cheap (O(1))** | Retrieve existing value | `GetClientType`, `GetVersion` |
| `To*` | Low | Type/unit conversion | `ToFraction`, `ToPercentage` |
| `Safe*` | Low + handling | Protected operation | `SafeCompare`, `SafeToString` |
| *(no prefix)* | **Cheap (O(1))** | Pure math/transform | `Clamp`, `Lerp`, `Round` |

> **Cost Signaling** (from Rust std): The prefix tells users if an operation is cheap or expensive. Never name an expensive operation like a cheap getter.

### Parameter Names

Use **camelCase** with explicit, descriptive names:

| Good | Bad | Reason |
|------|-----|--------|
| `currentValue` | `val`, `v` | Explicit intent |
| `maxValue` | `max` | Avoids collision with `math.max` |
| `fillPercent` | `pct`, `p` | Clear meaning |
| `deltaTime` | `dt` | Spelled out |

**Exception**: Single letters for established math conventions:
- `n` for a number to transform
- `t` for interpolation factor (0-1)
- `a`, `b` for lerp start/end values

### Return Field Names

Use **camelCase** with consistent suffixes:

| Suffix | Usage | Examples |
|--------|-------|----------|
| `*Pct` | Percentage as 0-1 | `fillPct`, `progressPct` |
| `*Percent` | Percentage as 0-100 | `fillPercent` |
| `is*` | Boolean state | `isAtMax`, `isRecharging` |
| `should*` | Boolean recommendation | `shouldShow`, `shouldAnimate` |

---

## 2. Framework-Agnostic Design

### The Generalization Checklist

Before adding any function, answer:

```
[ ] Does this solve a GENERAL problem, not just my addon's specific case?
[ ] Would this be useful in 3+ different addon types?
[ ] Is every parameter named for the CONCEPT, not the addon?
[ ] Does the return value contain ONLY computed data?
[ ] Could a developer unfamiliar with WoW understand what this does?
[ ] Is this testable without any WoW APIs?
```

If any answer is "no", the function belongs in your **addon's Bridge layer**, not FenCore.

### The Rule of Three

> **Do not create an abstraction until you have three distinct use cases.**

When proposing a new function, describe three different addons that could use it:

```
Function: Progress.CalculateFillWithSessionMax(current, configured, session)

1. Flightsim: Speed bar with dynamic max based on fastest speed seen
2. DPS Meter: Damage bar with session-high tracking
3. Resource Tracker: Mana bar with temporary max buff handling
```

If you can't name three use cases, the function belongs in your addon's Bridge layer.

---

## 3. API Stability

> **The goal is not to prevent change, but to manage the cost of change.**

### The Rule of Optional Extension

Once a function is released:

1. **New parameters MUST be optional** with sensible defaults
2. **New return fields MUST be additive** (never remove or rename)
3. **New domains can be added freely**
4. **Existing function signatures are FROZEN**

### The Options Table Pattern

> **Never design a function that takes 5 positional arguments.**

**Bad:**
```lua
function CreateTimer(duration, interval, callback, autoStart, showMilliseconds)
```

**Good:**
```lua
function CreateTimer(duration, options)
    -- options = { interval?, callback?, autoStart?, showMilliseconds? }
end
```

Use this pattern for any function with more than 2-3 parameters.

### Versioning

| Version | Meaning |
|---------|---------|
| `0.x.x` | Learning phase - breaks allowed, document all changes |
| `1.x.x` | Stable API - additive changes only |
| `2.0.0` | Breaking changes require migration guide |

### Deprecation Pattern

```lua
--- @deprecated Use Math.ToFraction instead. Will be removed in v2.0.0.
function Math.ToPercent(current, max)
    FenCore:Log("Math.ToPercent is deprecated, use Math.ToFraction", "[Deprecation]")
    return FenCore.Math.ToFraction(current, max) * 100
end
```

Rules:
1. Add `@deprecated` annotation with replacement
2. Log warning when called (debug mode only)
3. Delegate to replacement function
4. Remove only in next major version

---

## 4. ActionResult Guidelines

### Decision Matrix

| Scenario | Return Type | Reason |
|----------|-------------|--------|
| Expected failure (parsing, validation) | `ActionResult` | Consumer must handle |
| Absence of value (not an error) | `nil` | No stack trace needed |
| Programmer error (bad arguments) | `error()` | Fail fast |
| Pure math that never fails | Direct value | Simpler API |
| Multiple computed fields | `ActionResult` | Structured output |

### Error Codes

Use SCREAMING_SNAKE_CASE:

| Code | Usage |
|------|-------|
| `INVALID_INPUT` | Required parameter missing or wrong type |
| `OUT_OF_RANGE` | Value outside acceptable bounds |
| `NOT_FOUND` | Requested item doesn't exist |
| `INVALID_STATE` | Operation not valid in current state |

Always include a `suggestion` when possible:

```lua
return Result.error(
    "INVALID_INPUT",
    "maxCharges must be positive",
    "Check that the ability has charges configured"
)
```

---

## 5. Documentation Requirements

### Function Documentation

Every function MUST have LuaDoc annotations:

```lua
--- Brief description in one line.
--- Extended description if complex (optional).
---@param paramName type Description
---@param optionalParam? type Description (default: value)
---@return returnType Description
function Domain.FunctionName(paramName, optionalParam)
```

### Catalog Registration

Every function MUST be registered:

```lua
Catalog:RegisterDomain("Math", {
    Clamp = {
        handler = Math.Clamp,
        description = "Clamp a number between min and max",
        params = {
            { name = "n", type = "number", required = true },
            { name = "minValue", type = "number", required = true },
            { name = "maxValue", type = "number", required = true },
        },
        returns = { type = "number" },
        example = "Math.Clamp(150, 0, 100) → 100",
    },
})
```

Required fields:
- `handler` - Function reference
- `description` - What it does (one sentence)
- `params` - All parameters with name, type, required, description
- `returns` - Return type and shape
- `example` - Concrete input → output

---

## 6. Testing Requirements

### Every Function Needs Tests

```lua
describe("Math.Clamp", function()
    it("returns value when within range", function()
        assert.equals(50, Math.Clamp(50, 0, 100))
    end)

    it("returns min when below range", function()
        assert.equals(0, Math.Clamp(-10, 0, 100))
    end)

    it("returns max when above range", function()
        assert.equals(100, Math.Clamp(150, 0, 100))
    end)
end)
```

### Test Without WoW

All FenCore functions MUST be testable in the sandbox:

```bash
mech call sandbox.test -i '{"addon": "FenCore"}'
```

If a function requires WoW APIs, it belongs in the **Bridge layer**, not FenCore.

---

## 7. The Seven Principles

1. **Name for the concept, not the caller**
   - "Progress" not "SpeedBar"
   - "Charges" not "SurgeForwardCharges"

2. **Signal cost in names**
   - `Get*` = cheap, `Calculate*` = work
   - Never name expensive operations like getters

3. **Use Options Tables for extensibility**
   - Never more than 3 positional parameters
   - `fn(required, options)` allows future growth

4. **Wait for three use cases**
   - Don't abstract until you've seen the pattern thrice
   - Copy-paste is fine for the first two consumers

5. **Parameters are contracts**
   - Once public, the signature is frozen
   - Add optional params only, with sensible defaults

6. **Extend, don't modify**
   - Add fields and params, never remove
   - Deprecate first, remove only in major versions

7. **Test without WoW**
   - If it needs WoW APIs, it's Bridge-level
   - Pure logic only in FenCore domains

---

## Appendix: Research Sources

These principles are derived from studying mature utility libraries:

- **Lodash** (JavaScript): Forgiving defaults, Options Objects pattern
- **React** (JavaScript): Prop getters, inversion of control
- **Apache Commons** (Java): Rule of Three, parallel package strategy
- **Rust Standard Library**: Cost-based naming (`as_`/`to_`/`into_`)

---

## Next Steps

- See [API Reference](./API-REFERENCE.md) for the full function catalog
- See [Architecture](./ARCHITECTURE.md) for technical implementation details
- See [Integration Guide](./INTEGRATION.md) for usage patterns
