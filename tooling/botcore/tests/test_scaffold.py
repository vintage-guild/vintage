import json
from pathlib import Path

import pytest

from botcore_vintage.plugin import VintagePlugin
from botcore_vintage.scaffold import ScaffoldError, scaffold_module


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n")
    (tmp_path / "PLAN.md").write_text("# plan\n")
    (tmp_path / ".github").mkdir()
    (tmp_path / ".github" / "area-ownership.json").write_text(json.dumps({"areas": {}}))
    return tmp_path


def test_scaffolds_a_complete_module(repo: Path) -> None:
    result = scaffold_module(repo, "loot-council")
    module = repo / "modules" / "loot-council"
    for relative in [
        "package.json",
        "module.json",
        "tsconfig.json",
        "AGENTS.md",
        "src/contract.ts",
        "src/store.ts",
        "src/commands/index.ts",
        "src/testing.ts",
        "tests/loot-council.test.ts",
        "convex/convex.config.ts",
        "convex/schema.ts",
    ]:
        assert (module / relative).exists(), relative

    package = json.loads((module / "package.json").read_text())
    assert package["name"] == "@vintage/loot-council"
    assert set(package["exports"]) <= {
        "./contract",
        "./commands",
        "./testing",
        "./convex.config",
        "./_generated/component.js",
        "./package.json",
    }
    assert json.loads((module / "module.json").read_text())["maturity"] == "labs"

    commands = (module / "src/commands/index.ts").read_text()
    assert "name: 'loot-council-status'" in commands
    assert "export const lootCouncilCommands" in commands
    assert "defineComponent('lootCouncil')" in (module / "convex/convex.config.ts").read_text()

    ownership = json.loads((repo / ".github" / "area-ownership.json").read_text())
    assert ownership["areas"]["loot-council"]["paths"] == ["modules/loot-council/"]
    assert any("apps/api/src/registry.ts" in step for step in result.next_steps)


@pytest.mark.parametrize("bad", ["Raids", "raids_v2", "-raids", "raids-", "2fast", ""])
def test_rejects_non_kebab_names(repo: Path, bad: str) -> None:
    with pytest.raises(ScaffoldError, match="kebab-case"):
        scaffold_module(repo, bad)


def test_refuses_to_overwrite(repo: Path) -> None:
    scaffold_module(repo, "raids")
    with pytest.raises(ScaffoldError, match="already exists"):
        scaffold_module(repo, "raids")


def test_refuses_outside_the_repo(tmp_path: Path) -> None:
    with pytest.raises(ScaffoldError, match="not the Vintage repo root"):
        scaffold_module(tmp_path, "raids")


def test_plugin_registers_commands() -> None:
    class FakeRegistry:
        def __init__(self) -> None:
            self.commands: list = []
            self.cli = self.mcp = None
            self.docs: dict = {}

        def set_cli_name(self, name: str) -> None:
            self.cli = name

        def set_mcp_name(self, name: str) -> None:
            self.mcp = name

        def add_docs(self, topic: str, content: str) -> None:
            self.docs[topic] = content

        def add_commands(self, fns: list) -> None:
            self.commands.extend(fns)

    reg = FakeRegistry()
    VintagePlugin().register(reg)  # type: ignore[arg-type]
    assert reg.cli == "vintagebot"
    assert [fn.__name__ for fn in reg.commands] == ["vintage_module_new", "vintage_repo_check"]
