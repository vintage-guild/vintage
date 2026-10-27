# FenCore Documentation

Welcome to the FenCore documentation. FenCore is a foundation library for WoW addon development, providing pure logic domains that are testable without the WoW client.

## Documentation Index

| Document | Description |
|----------|-------------|
| [API Reference](./API-REFERENCE.md) | Complete reference for all domains and functions |
| [Architecture](./ARCHITECTURE.md) | Technical deep-dive into FenCore's design |
| [Integration Guide](./INTEGRATION.md) | How to integrate FenCore into your addon |
| [Design Principles](./DESIGN_PRINCIPLES.md) | Conventions for FenCore contributors |

## Quick Links

### By Task

| I want to... | Go to... |
|--------------|----------|
| Look up a function | [API Reference](./API-REFERENCE.md) |
| Integrate FenCore | [Integration Guide](./INTEGRATION.md) |
| Understand the architecture | [Architecture](./ARCHITECTURE.md) |
| Contribute to FenCore | [Design Principles](./DESIGN_PRINCIPLES.md) |

### By Domain

| Domain | Purpose | API Reference |
|--------|---------|---------------|
| ActionResult | Structured result pattern | [ActionResult](./API-REFERENCE.md#actionresult) |
| Math | Pure math utilities | [Math](./API-REFERENCE.md#math) |
| Tables | Table manipulation | [Tables](./API-REFERENCE.md#tables) |
| Secrets | WoW 12.0+ secret handling | [Secrets](./API-REFERENCE.md#secrets) |
| Environment | Client detection | [Environment](./API-REFERENCE.md#environment) |
| Progress | Bar/fill calculations | [Progress](./API-REFERENCE.md#progress) |
| Charges | Ability charge logic | [Charges](./API-REFERENCE.md#charges) |
| Cooldowns | Cooldown progress | [Cooldowns](./API-REFERENCE.md#cooldowns) |
| Color | Color utilities | [Color](./API-REFERENCE.md#color) |
| Time | Time formatting | [Time](./API-REFERENCE.md#time) |
| Text | Text formatting | [Text](./API-REFERENCE.md#text) |

## Getting Started

### 1. Embed FenCore

```
YourAddon/
└── Libs/
    └── FenCore/
```

### 2. Add to TOC

```toc
Libs\FenCore\Core\FenCore.xml
```

### 3. Use It

```lua
local FenCore = _G.FenCore

-- Pure math
local clamped = FenCore.Math.Clamp(150, 0, 100)  -- 100

-- Structured results
local result = FenCore.Progress.CalculateFill(75, 100)
if FenCore.ActionResult.isSuccess(result) then
    local data = FenCore.ActionResult.unwrap(result)
    print("Fill:", data.fillPct)  -- 0.75
end
```

## MCP Discovery

Use Mechanic's CLI to explore the API:

```bash
# Full catalog
mech call fencore-catalog

# Search functions
mech call fencore-search -i '{"query": "format"}'

# Function details
mech call fencore-info -i '{"domain": "Math", "function": "Clamp"}'
```

## Testing

```bash
mech call sandbox.test -i '{"addon": "FenCore"}'
```
