"""botcore plugin entry point (registered under the `botcore.plugins` entry-point group)."""

from __future__ import annotations

from botcore.plugin import PluginRegistry
from pydantic import BaseModel

from botcore_vintage.commands import COMMANDS

_DOCS = """\
Vintage repo tooling.

- vintage_module_new(name, maturity="labs"): scaffold modules/<name> that passes the gates.
- vintage_repo_check(full=False): run pnpm validate:final (or validate:full).

Repo invariants live in AGENTS.md; architecture in PLAN.md.
"""


class VintageConfig(BaseModel):
    """`[plugins.vintage]` in botcore.toml."""

    modules_dir: str = "modules"


class VintagePlugin:
    def __init__(self, config: VintageConfig | None = None) -> None:
        self._config = config or VintageConfig()

    def configure(self, config: VintageConfig) -> None:
        self._config = config

    def register(self, registry: PluginRegistry) -> None:
        registry.set_cli_name("vintagebot")
        registry.set_mcp_name("vintage")
        registry.add_docs("vintage", _DOCS)
        registry.add_commands(list(COMMANDS))

    def config_schema(self) -> type[BaseModel]:
        return VintageConfig
