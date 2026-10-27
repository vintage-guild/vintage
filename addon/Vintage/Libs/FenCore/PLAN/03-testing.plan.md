# Phase 3: Sandbox Testing

Set up comprehensive sandbox tests for all FenCore domains.

## Test Structure

```
FenCore/
└── Tests/
    ├── ActionResult_spec.lua
    ├── Math_spec.lua
    ├── Secrets_spec.lua
    ├── Progress_spec.lua
    ├── Charges_spec.lua
    ├── Cooldowns_spec.lua
    ├── Color_spec.lua
    ├── Time_spec.lua
    └── Text_spec.lua
```

## Running Tests

```bash
# Run all FenCore tests
mech call sandbox.test -i '{"addon": "FenCore"}'

# Run with filter
mech call sandbox.test -i '{"addon": "FenCore", "filter": "Math"}'
```

## File: `Tests/ActionResult_spec.lua`

```lua
-- ActionResult_spec.lua
-- Tests for the AFD result pattern

describe("ActionResult", function()
    local Result
    
    before_each(function()
        -- FenCore namespace is set up by sandbox
        Result = FenCore.ActionResult
    end)
    
    describe("success", function()
        it("should create a successful result", function()
            local result = Result.success({ value = 42 })
            
            assert.is_true(result.success)
            assert.same({ value = 42 }, result.data)
            assert.is_nil(result.error)
        end)
        
        it("should include reasoning when provided", function()
            local result = Result.success({ x = 1 }, "Calculated from input")
            
            assert.equals("Calculated from input", result.reasoning)
        end)
    end)
    
    describe("error", function()
        it("should create an error result", function()
            local result = Result.error("INVALID_INPUT", "Value must be positive")
            
            assert.is_false(result.success)
            assert.is_nil(result.data)
            assert.equals("INVALID_INPUT", result.error.code)
            assert.equals("Value must be positive", result.error.message)
        end)
        
        it("should include suggestion when provided", function()
            local result = Result.error("NOT_FOUND", "Item not found", "Check the ID")
            
            assert.equals("Check the ID", result.error.suggestion)
        end)
    end)
    
    describe("isSuccess", function()
        it("should return true for success results", function()
            local result = Result.success({})
            assert.is_true(Result.isSuccess(result))
        end)
        
        it("should return false for error results", function()
            local result = Result.error("ERR", "msg")
            assert.is_false(Result.isSuccess(result))
        end)
        
        it("should return false for nil", function()
            assert.is_false(Result.isSuccess(nil))
        end)
    end)
    
    describe("unwrap", function()
        it("should return data from success result", function()
            local result = Result.success({ answer = 42 })
            local data = Result.unwrap(result)
            
            assert.equals(42, data.answer)
        end)
        
        it("should return nil from error result", function()
            local result = Result.error("ERR", "msg")
            assert.is_nil(Result.unwrap(result))
        end)
    end)
    
    describe("map", function()
        it("should transform successful data", function()
            local result = Result.success({ value = 10 })
            local mapped = Result.map(result, function(data)
                return { doubled = data.value * 2 }
            end)
            
            assert.is_true(mapped.success)
            assert.equals(20, mapped.data.doubled)
        end)
        
        it("should pass through error results", function()
            local result = Result.error("ERR", "original")
            local mapped = Result.map(result, function(data)
                return { transformed = true }
            end)
            
            assert.is_false(mapped.success)
            assert.equals("original", mapped.error.message)
        end)
    end)
end)
```

## File: `Tests/Math_spec.lua`

```lua
-- Math_spec.lua
-- Tests for Math domain

describe("Math", function()
    local Math
    
    before_each(function()
        Math = FenCore.Math
    end)
    
    describe("Clamp", function()
        it("should return value when within range", function()
            assert.equals(50, Math.Clamp(50, 0, 100))
        end)
        
        it("should return min when below range", function()
            assert.equals(0, Math.Clamp(-10, 0, 100))
        end)
        
        it("should return max when above range", function()
            assert.equals(100, Math.Clamp(150, 0, 100))
        end)
        
        it("should handle edge cases", function()
            assert.equals(0, Math.Clamp(0, 0, 100))
            assert.equals(100, Math.Clamp(100, 0, 100))
        end)
    end)
    
    describe("Lerp", function()
        it("should return start at t=0", function()
            assert.equals(0, Math.Lerp(0, 100, 0))
        end)
        
        it("should return end at t=1", function()
            assert.equals(100, Math.Lerp(0, 100, 1))
        end)
        
        it("should return midpoint at t=0.5", function()
            assert.equals(50, Math.Lerp(0, 100, 0.5))
        end)
        
        it("should clamp t to 0-1", function()
            assert.equals(0, Math.Lerp(0, 100, -0.5))
            assert.equals(100, Math.Lerp(0, 100, 1.5))
        end)
    end)
    
    describe("ToFraction", function()
        it("should calculate fraction correctly", function()
            assert.is_near(0.75, Math.ToFraction(75, 100), 0.001)
        end)
        
        it("should clamp to 0-1", function()
            assert.equals(0, Math.ToFraction(-10, 100))
            assert.equals(1, Math.ToFraction(150, 100))
        end)
        
        it("should handle zero max", function()
            assert.equals(0, Math.ToFraction(50, 0))
        end)
    end)
    
    describe("ToPercentage", function()
        it("should calculate percentage correctly", function()
            assert.equals(75, Math.ToPercentage(75, 100))
        end)
        
        it("should handle zero max", function()
            assert.equals(0, Math.ToPercentage(50, 0))
        end)
    end)
    
    describe("Round", function()
        it("should round to nearest integer by default", function()
            assert.equals(3, Math.Round(3.4))
            assert.equals(4, Math.Round(3.5))
        end)
        
        it("should round to specified decimals", function()
            assert.is_near(3.14, Math.Round(3.14159, 2), 0.001)
        end)
    end)
    
    describe("MapRange", function()
        it("should map value between ranges", function()
            assert.equals(0.5, Math.MapRange(50, 0, 100, 0, 1))
        end)
        
        it("should handle inverse mapping", function()
            assert.equals(75, Math.MapRange(0.25, 0, 1, 100, 0))
        end)
    end)
end)
```

## File: `Tests/Progress_spec.lua`

```lua
-- Progress_spec.lua
-- Tests for Progress domain

describe("Progress", function()
    local Progress, Result
    
    before_each(function()
        Progress = FenCore.Progress
        Result = FenCore.ActionResult
    end)
    
    describe("CalculateFill", function()
        it("should calculate fill percentage", function()
            local result = Progress.CalculateFill(75, 100)
            
            assert.is_true(Result.isSuccess(result))
            local data = Result.unwrap(result)
            assert.is_near(0.75, data.fillPct, 0.001)
            assert.is_false(data.isAtMax)
        end)
        
        it("should detect when at max", function()
            local result = Progress.CalculateFill(100, 100)
            local data = Result.unwrap(result)
            
            assert.is_true(data.isAtMax)
        end)
        
        it("should clamp to 0-1", function()
            local result = Progress.CalculateFill(150, 100)
            local data = Result.unwrap(result)
            
            assert.equals(1, data.fillPct)
        end)
        
        it("should error on nil current", function()
            local result = Progress.CalculateFill(nil, 100)
            
            assert.is_false(Result.isSuccess(result))
            assert.equals("INVALID_INPUT", result.error.code)
        end)
    end)
    
    describe("CalculateFillWithSessionMax", function()
        it("should use configured max when no session max", function()
            local result = Progress.CalculateFillWithSessionMax(50, 100, nil)
            local data = Result.unwrap(result)
            
            assert.equals(100, data.effectiveMax)
            assert.is_false(data.usedSession)
        end)
        
        it("should use session max when higher", function()
            local result = Progress.CalculateFillWithSessionMax(50, 100, 150)
            local data = Result.unwrap(result)
            
            assert.equals(150, data.effectiveMax)
            assert.is_true(data.usedSession)
        end)
        
        it("should ignore session max when lower", function()
            local result = Progress.CalculateFillWithSessionMax(50, 100, 80)
            local data = Result.unwrap(result)
            
            assert.equals(100, data.effectiveMax)
            assert.is_false(data.usedSession)
        end)
    end)
    
    describe("CalculateMarker", function()
        it("should calculate marker position", function()
            local result = Progress.CalculateMarker(75, 100)
            local data = Result.unwrap(result)
            
            assert.is_near(0.75, data.markerPct, 0.001)
            assert.is_true(data.shouldShow)
        end)
        
        it("should not show marker when value is 0", function()
            local result = Progress.CalculateMarker(0, 100)
            local data = Result.unwrap(result)
            
            assert.is_false(data.shouldShow)
        end)
    end)
end)
```

## File: `Tests/Charges_spec.lua`

```lua
-- Charges_spec.lua
-- Tests for Charges domain

describe("Charges", function()
    local Charges, Result
    
    before_each(function()
        Charges = FenCore.Charges
        Result = FenCore.ActionResult
    end)
    
    describe("CalculateChargeFill", function()
        it("should return full for available charges", function()
            local result = Charges.CalculateChargeFill(1, 3, 0, 0, 100)
            local data = Result.unwrap(result)
            
            assert.equals(1, data.targetPct)
            assert.is_true(data.isFull)
            assert.is_false(data.isRecharging)
        end)
        
        it("should calculate recharging progress", function()
            -- 3 current charges, charge 4 is recharging
            -- Started at t=100, duration=10, now=105 (50% done)
            local result = Charges.CalculateChargeFill(4, 3, 100, 10, 105)
            local data = Result.unwrap(result)
            
            assert.is_near(0.5, data.targetPct, 0.001)
            assert.is_true(data.isRecharging)
            assert.is_false(data.isFull)
        end)
        
        it("should return empty for future charges", function()
            local result = Charges.CalculateChargeFill(5, 3, 100, 10, 105)
            local data = Result.unwrap(result)
            
            assert.equals(0, data.targetPct)
            assert.is_false(data.isRecharging)
        end)
    end)
    
    describe("CalculateAllCharges", function()
        it("should calculate all charge states", function()
            local result = Charges.CalculateAllCharges({
                currentCharges = 4,
                maxCharges = 6,
                chargeStart = 100,
                chargeDuration = 10,
                now = 105,
            })
            local data = Result.unwrap(result)
            
            assert.equals(6, #data.states)
            assert.is_true(data.states[1].isFull)
            assert.is_true(data.states[4].isFull)
            assert.is_true(data.states[5].isRecharging)
            assert.is_false(data.allFull)
            assert.equals(5, data.rechargingIndex)
        end)
        
        it("should detect all full", function()
            local result = Charges.CalculateAllCharges({
                currentCharges = 6,
                maxCharges = 6,
                chargeStart = 0,
                chargeDuration = 0,
                now = 100,
            })
            local data = Result.unwrap(result)
            
            assert.is_true(data.allFull)
            assert.is_nil(data.rechargingIndex)
        end)
    end)
    
    describe("AdvanceAnimation", function()
        it("should advance animation value", function()
            local result = Charges.AdvanceAnimation(0.5, 0.1, 3.0)
            local data = Result.unwrap(result)
            
            assert.is_near(0.8, data.value, 0.001)
            assert.is_false(data.isComplete)
        end)
        
        it("should complete at 1.0", function()
            local result = Charges.AdvanceAnimation(0.9, 0.5, 3.0)
            local data = Result.unwrap(result)
            
            assert.equals(1, data.value)
            assert.is_true(data.isComplete)
        end)
    end)
    
    describe("HandleSecretFallback", function()
        it("should return full states when usable", function()
            local result = Charges.HandleSecretFallback(true, 6)
            local data = Result.unwrap(result)
            
            assert.is_true(data.isSecret)
            assert.equals(6, #data.states)
            assert.equals(1, data.states[1].targetPct)
        end)
        
        it("should return empty states when not usable", function()
            local result = Charges.HandleSecretFallback(false, 6)
            local data = Result.unwrap(result)
            
            assert.equals(0, data.states[1].targetPct)
        end)
    end)
end)
```

## Additional Test Files

Create similar test files for:
- `Cooldowns_spec.lua` - Mirror Charges tests
- `Color_spec.lua` - Test gradients and lerping
- `Time_spec.lua` - Test duration formatting
- `Text_spec.lua` - Test string utilities

## Verification

```bash
# Run all tests
mech call sandbox.test -i '{"addon": "FenCore"}'

# Expected output:
# SANDBOX_TESTS:XX:0:XX (all passed, 0 failed)
```

## Next Phase

Proceed to [04-flightsim-migration.plan.md](04-flightsim-migration.plan.md).
