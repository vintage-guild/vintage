"""Module scaffolding: generates a module package that passes the repo gates (PLAN §4.2)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

MODULE_NAME = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
MATURITIES = ("labs", "official", "core")


@dataclass
class ScaffoldResult:
    module_dir: Path
    files: list[Path] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)


class ScaffoldError(ValueError):
    """Raised when a module can't be scaffolded (bad name, already exists, not a repo root)."""


def _pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("-"))


def _camel(name: str) -> str:
    pascal = _pascal(name)
    return pascal[0].lower() + pascal[1:]


def _files(name: str, maturity: str, owner: str) -> dict[str, str]:
    pascal, camel = _pascal(name), _camel(name)
    package = {
        "name": f"@vintage/{name}",
        "version": "0.0.0",
        "private": True,
        "type": "module",
        "description": f"The {name} module.",
        "exports": {
            "./contract": "./src/contract.ts",
            "./commands": "./src/commands/index.ts",
            "./testing": "./src/testing.ts",
            "./convex.config": "./convex/convex.config.ts",
            "./_generated/component.js": "./convex/_generated/component.ts",
            "./package.json": "./package.json",
        },
        "scripts": {"type-check": "tsc6 -p tsconfig.json"},
        "dependencies": {
            "@vintage/guild-kit": "workspace:*",
            "convex": "catalog:",
            "zod": "catalog:",
        },
        "devDependencies": {
            "@vintage/config": "workspace:*",
            "@vintage/testing": "workspace:*",
            "typescript": "catalog:",
        },
    }
    module_json = {
        "name": name,
        "maturity": maturity,
        "owners": [owner],
        "dependsOn": [],
        "description": f"TODO: what the {name} module owns.",
    }
    return {
        "package.json": json.dumps(package, indent=2) + "\n",
        "module.json": json.dumps(module_json, indent=2) + "\n",
        "tsconfig.json": json.dumps(
            {
                "extends": "@vintage/config/tsconfig.library.json",
                "compilerOptions": {"lib": ["ES2022", "DOM"]},
                "include": ["src", "tests"],
            },
            indent=2,
        )
        + "\n",
        "AGENTS.md": f"""# {name} module

TODO: one paragraph on what this module owns. Maturity: **{maturity}**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | Public types, command names, events. The only import other modules may use |
| `src/store.ts` | `{pascal}Store` port, `{pascal}Deps`, and `command = commandsFor<{pascal}Deps>()` |
| `src/commands/` | Commands, exported as `{camel}Commands` |
| `src/testing.ts` | Memory store with the same behavior contract as the component |
| `convex/` | The `{name}` Convex component |

## Rules

- TODO: the invariants a contributor must keep.
""",
        "src/contract.ts": f"""// Public surface of the {name} module. Other modules import only this file.

export const {name.upper().replace('-', '_')}_COMMANDS = ['{name}-status'] as const;

/** Events {name} emits on the core event bus (PLAN §4.3). */
export interface {pascal}Events {{}}
""",
        "src/store.ts": f"""import {{ commandsFor }} from '@vintage/guild-kit';

/** The {name} module's data port. Production adapts it to the Convex component in apps/api. */
export interface {pascal}Store {{
  count(guildId: string): Promise<number>;
}}

export interface {pascal}Deps {{
  {camel}: {pascal}Store;
}}

export const command = commandsFor<{pascal}Deps>();
""",
        "src/commands/index.ts": f"""import {{ success }} from '@vintage/guild-kit';
import {{ z }} from 'zod';
import {{ command }} from '../store';

export type {{ {pascal}Deps, {pascal}Store }} from '../store';

export const {camel}Status = command({{
  name: '{name}-status',
  description: 'Health check for the {name} module.',
  tier: 'member',
  input: z.object({{}}),
  handler: async (_input, {{ guildId, deps }}) =>
    success({{ module: '{name}', records: await deps.{camel}.count(guildId) }}),
}});

/** Every {name} command, registered by apps/api through guild-kit. */
export const {camel}Commands = [{camel}Status] as const;
""",
        "src/testing.ts": f"""import type {{ {pascal}Deps, {pascal}Store }} from './store';

/** In-memory {pascal}Store for tests. Same behavior contract as the Convex component. */
export function createMemory{pascal}Store(): {pascal}Store {{
  return {{ count: async () => 0 }};
}}

export function createMemory{pascal}Deps(): {pascal}Deps {{
  return {{ {camel}: createMemory{pascal}Store() }};
}}
""",
        f"tests/{name}.test.ts": f"""import {{ makeCaller, testRegistry }} from '@vintage/testing';
import {{ describe, expect, it }} from 'vitest';
import {{ {camel}Commands }} from '../src/commands';
import type {{ {pascal}Deps }} from '../src/store';
import {{ createMemory{pascal}Deps }} from '../src/testing';

describe('{name} commands', () => {{
  const registry = testRegistry<{pascal}Deps>([...{camel}Commands]);

  it('{name}-status answers members', async () => {{
    const result = await registry.execute(
      {{ name: '{name}-status', input: {{}}, caller: makeCaller('member') }},
      createMemory{pascal}Deps(),
    );
    expect(result).toMatchObject({{ success: true, data: {{ module: '{name}', records: 0 }} }});
  }});

  it('{name}-status is hidden from public callers', async () => {{
    const result = await registry.execute(
      {{ name: '{name}-status', input: {{}}, caller: makeCaller('public') }},
      createMemory{pascal}Deps(),
    );
    expect(result).toMatchObject({{ success: false, error: {{ code: 'COMMAND_NOT_FOUND' }} }});
  }});
}});
""",
        "convex/convex.config.ts": f"""import {{ defineComponent }} from 'convex/server';

/** The {name} module's Convex component: owns this module's tables (PLAN §4.3). */
export default defineComponent('{camel}');
""",
        "convex/schema.ts": """import { defineSchema } from 'convex/server';

// This module's tables. Every table carries guildId and a by_guild index.
export default defineSchema({});
""",
    }


def scaffold_module(
    root: Path, name: str, maturity: str = "labs", owner: str = "@Falkicon"
) -> ScaffoldResult:
    """Create modules/<name> with a working command, test, memory store, and component."""
    if not MODULE_NAME.match(name):
        raise ScaffoldError(f'Module name "{name}" must be kebab-case (e.g. "raids", "loot-council")')
    if maturity not in MATURITIES:
        raise ScaffoldError(f'Maturity must be one of {", ".join(MATURITIES)}')
    if not (root / "pnpm-workspace.yaml").exists():
        raise ScaffoldError(f"{root} is not the Vintage repo root (no pnpm-workspace.yaml)")
    module_dir = root / "modules" / name
    if module_dir.exists():
        raise ScaffoldError(f"modules/{name} already exists")

    result = ScaffoldResult(module_dir=module_dir)
    for relative, content in _files(name, maturity, owner).items():
        path = module_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        result.files.append(path)

    ownership = root / ".github" / "area-ownership.json"
    if ownership.exists():
        data = json.loads(ownership.read_text(encoding="utf-8"))
        data.setdefault("areas", {})[name] = {"paths": [f"modules/{name}/"], "owners": [owner]}
        ownership.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")
        result.files.append(ownership)

    camel = _camel(name)
    result.next_steps = [
        "pnpm install",
        f"Add '{name}' to scope-enum in commitlint.config.mjs",
        f"apps/api/convex/convex.config.ts: app.use({camel}) from '@vintage/{name}/convex.config'",
        f"apps/api/src/registry.ts: add {camel}Commands and extend VintageDeps",
        "apps/api/convex/stores.ts + commands.ts: adapt the store to components."
        f"{camel} and add it to deps(ctx)",
        "pnpm --filter @vintage/api dev:local  (regenerates convex/_generated)",
        "pnpm manifest:write && pnpm validate:final",
    ]
    return result
