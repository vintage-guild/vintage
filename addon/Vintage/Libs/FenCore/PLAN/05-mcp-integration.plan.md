# Phase 5: MCP Integration

Add MCP commands for FenCore catalog discovery and search.

## New Commands

| Command | Description |
|---------|-------------|
| `fencore.catalog` | Get full catalog of all domains and functions |
| `fencore.search` | Search functions by name or description |
| `fencore.info` | Get detailed info about a specific function |

## File: `desktop/src/mechanic/commands/fencore.py`

```python
"""
FenCore Catalog Commands for Mechanic Desktop.

Provides MCP-discoverable catalog of FenCore logic domains:
- fencore.catalog: Get full domain/function catalog
- fencore.search: Search functions by name/description
- fencore.info: Get detailed function info
"""

from typing import Any, Dict, List, Optional

from afd import CommandResult, success, error
from afd.core.metadata import create_source
from pydantic import BaseModel, Field

from ..sv_parser import parse_sv_file
from ..config import get_config


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class CatalogInput(BaseModel):
    """No input needed for catalog."""
    pass


class FunctionSchema(BaseModel):
    description: str
    params: List[Dict[str, Any]] = []
    returns: Dict[str, Any] = {}
    example: Optional[str] = None


class DomainSchema(BaseModel):
    functions: Dict[str, FunctionSchema]


class CatalogOutput(BaseModel):
    version: str
    domains: Dict[str, DomainSchema]
    total_functions: int


class SearchInput(BaseModel):
    query: str = Field(..., description="Search query (partial match on name or description)")
    limit: int = Field(20, description="Maximum results to return")


class SearchResult(BaseModel):
    domain: str
    name: str
    full_name: str
    description: str


class SearchOutput(BaseModel):
    query: str
    results: List[SearchResult]
    total: int


class InfoInput(BaseModel):
    domain: str = Field(..., description="Domain name (e.g., 'Math')")
    function: str = Field(..., description="Function name (e.g., 'Clamp')")


class InfoOutput(BaseModel):
    domain: str
    name: str
    full_name: str
    description: str
    params: List[Dict[str, Any]]
    returns: Dict[str, Any]
    example: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_fencore_catalog() -> Optional[Dict]:
    """
    Get FenCore catalog from MechanicDB.
    
    FenCore registers its catalog with MechanicLib, which syncs to MechanicDB.
    """
    config = get_config()
    if not config.wtf_path:
        return None
    
    # Find MechanicDB SavedVariables
    sv_path = config.wtf_path / "SavedVariables" / "!Mechanic.lua"
    if not sv_path.exists():
        return None
    
    try:
        sv_data = parse_sv_file(sv_path)
        mechanic_db = sv_data.get("MechanicDB", {})
        registered = mechanic_db.get("registered", {})
        fencore = registered.get("FenCore", {})
        
        # FenCore stores catalog via MechanicLib:Register()
        if "catalog" in fencore:
            return fencore["catalog"]
        
        return None
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════════════════════

def register_commands(server):
    """Register FenCore commands with the server."""
    
    @server.command(
        name="fencore.catalog",
        description="Get full catalog of FenCore logic domains and functions",
        input_schema=CatalogInput,
        output_schema=CatalogOutput,
    )
    async def fencore_catalog(input: CatalogInput, context: Any = None) -> CommandResult[CatalogOutput]:
        catalog = get_fencore_catalog()
        
        if not catalog:
            return error(
                code="CATALOG_NOT_FOUND",
                message="FenCore catalog not found in MechanicDB",
                suggestion="Ensure FenCore is loaded in WoW and run /reload"
            )
        
        # Count total functions
        total = 0
        for domain in catalog.get("domains", {}).values():
            total += len(domain.get("functions", {}))
        
        src = create_source(
            type="game",
            id="fencore",
            title="FenCore Library",
        )
        
        return success(
            data=CatalogOutput(
                version=catalog.get("version", "unknown"),
                domains=catalog.get("domains", {}),
                total_functions=total,
            ),
            reasoning=f"Found {len(catalog.get('domains', {}))} domains with {total} functions",
            sources=[src],
            confidence=1.0
        )
    
    @server.command(
        name="fencore.search",
        description="Search FenCore functions by name or description",
        input_schema=SearchInput,
        output_schema=SearchOutput,
    )
    async def fencore_search(input: SearchInput, context: Any = None) -> CommandResult[SearchOutput]:
        catalog = get_fencore_catalog()
        
        if not catalog:
            return error(
                code="CATALOG_NOT_FOUND",
                message="FenCore catalog not found",
                suggestion="Ensure FenCore is loaded and run /reload"
            )
        
        query_lower = input.query.lower()
        results = []
        
        for domain_name, domain in catalog.get("domains", {}).items():
            for func_name, func_info in domain.get("functions", {}).items():
                full_name = f"{domain_name}.{func_name}"
                description = func_info.get("description", "")
                
                # Match on name or description
                if query_lower in full_name.lower() or query_lower in description.lower():
                    results.append(SearchResult(
                        domain=domain_name,
                        name=func_name,
                        full_name=full_name,
                        description=description,
                    ))
        
        # Sort by relevance (name match first)
        results.sort(key=lambda r: (
            0 if query_lower in r.name.lower() else 1,
            r.full_name.lower()
        ))
        
        # Apply limit
        limited = results[:input.limit]
        
        return success(
            data=SearchOutput(
                query=input.query,
                results=limited,
                total=len(results),
            ),
            reasoning=f"Found {len(results)} functions matching '{input.query}'"
        )
    
    @server.command(
        name="fencore.info",
        description="Get detailed info about a specific FenCore function",
        input_schema=InfoInput,
        output_schema=InfoOutput,
    )
    async def fencore_info(input: InfoInput, context: Any = None) -> CommandResult[InfoOutput]:
        catalog = get_fencore_catalog()
        
        if not catalog:
            return error(
                code="CATALOG_NOT_FOUND",
                message="FenCore catalog not found",
                suggestion="Ensure FenCore is loaded and run /reload"
            )
        
        domains = catalog.get("domains", {})
        domain = domains.get(input.domain)
        
        if not domain:
            available = ", ".join(domains.keys())
            return error(
                code="DOMAIN_NOT_FOUND",
                message=f"Domain '{input.domain}' not found",
                suggestion=f"Available domains: {available}"
            )
        
        func_info = domain.get("functions", {}).get(input.function)
        
        if not func_info:
            available = ", ".join(domain.get("functions", {}).keys())
            return error(
                code="FUNCTION_NOT_FOUND",
                message=f"Function '{input.function}' not found in {input.domain}",
                suggestion=f"Available functions: {available}"
            )
        
        return success(
            data=InfoOutput(
                domain=input.domain,
                name=input.function,
                full_name=f"{input.domain}.{input.function}",
                description=func_info.get("description", ""),
                params=func_info.get("params", []),
                returns=func_info.get("returns", {}),
                example=func_info.get("example"),
            ),
            reasoning=f"Retrieved info for FenCore.{input.domain}.{input.function}"
        )
```

## Register Commands

Update `desktop/src/mechanic/server.py` to register FenCore commands:

```python
# In register_all_commands()
from .commands import fencore
fencore.register_commands(server)
```

## In-Game Catalog Sync

FenCore already registers with MechanicLib in `Core/FenCore.lua`. Mechanic syncs registered addon data to MechanicDB on `/reload`.

Ensure MechanicLib stores the catalog:

```lua
-- In Mechanic's OnAddonRegistered
function Mechanic:OnAddonRegistered(addonName, capabilities)
    self.db.registered[addonName] = {
        version = capabilities.version,
        -- If addon provides a catalog function, call it and store result
        catalog = capabilities.catalog and capabilities.catalog() or nil,
    }
end
```

## Usage Examples

### CLI

```bash
# Get full catalog
mech call fencore.catalog

# Search for functions
mech call fencore.search -i '{"query": "clamp"}'

# Get specific function info
mech call fencore.info -i '{"domain": "Math", "function": "Clamp"}'
```

### MCP (Claude/Agent)

```json
{
  "tool": "fencore.catalog",
  "arguments": {}
}
```

Response:
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "domains": {
      "Math": {
        "functions": {
          "Clamp": {
            "description": "Clamp a number between min and max",
            "params": [...],
            "example": "Math.Clamp(150, 0, 100) → 100"
          }
        }
      }
    },
    "total_functions": 42
  }
}
```

## Verification

1. Load WoW with FenCore
2. `/reload` to sync catalog to MechanicDB
3. `mech call fencore.catalog` returns domains
4. `mech call fencore.search -i '{"query": "format"}'` finds Time functions
5. MCP tools show fencore.* commands

## Next Phase

Proceed to [06-ecosystem.plan.md](06-ecosystem.plan.md).
