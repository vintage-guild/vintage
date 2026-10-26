import difflib
import json
import shutil
from pathlib import Path

import pytest

from botcore_vintage.plugin import VintagePlugin
from botcore_vintage.scaffold import ScaffoldError, scaffold_module


REPO = Path(__file__).resolve().parents[3]
SHARED = [
    ".github/area-ownership.json",
    ".github/CODEOWNERS",
    "commitlint.config.mjs",
    ".github/ISSUE_TEMPLATE/agent-task.yml",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/feature-task.yml",
]


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A repo root holding copies of the real shared files, so format drift fails here."""
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: []\n")
    (tmp_path / "PLAN.md").write_text("# plan\n")
    for relative in SHARED:
        (tmp_path / relative).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / relative, tmp_path / relative)
    return tmp_path


def _changes(repo: Path, relative: str) -> tuple[list[str], list[str]]:
    """Lines removed from and added to a shared file by scaffolding."""
    before = (REPO / relative).read_text(encoding="utf-8").splitlines()
    after = (repo / relative).read_text(encoding="utf-8").splitlines()
    diff = list(difflib.unified_diff(before, after, lineterm="", n=0))[2:]
    removed = [ln[1:] for ln in diff if ln.startswith("-")]
    added = [ln[1:] for ln in diff if ln.startswith("+")]
    return removed, added


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


def test_registers_the_module_one_line_per_shared_file(repo: Path) -> None:
    result = scaffold_module(repo, "loot-council")
    owner = '"owners": ["@Falkicon"]'
    assert _changes(repo, ".github/area-ownership.json") == (
        [],
        [f'    "loot-council": {{ "paths": ["modules/loot-council/"], {owner} }},'],
    )
    ownership = (repo / ".github/area-ownership.json").read_text(encoding="utf-8")
    assert "\u00a7" in ownership and r"\u00a7" not in ownership
    assert _changes(repo, ".github/CODEOWNERS") == ([], ["modules/loot-council/ @Falkicon"])
    assert _changes(repo, "commitlint.config.mjs") == ([], ["        'loot-council',"])
    for template in SHARED[3:]:
        removed, added = _changes(repo, template)
        assert len(removed) == len(added) == 1, template
        assert added[0] == removed[0].replace(" guild-kit,", " loot-council, guild-kit,")
    assert {p.relative_to(repo).as_posix() for p in result.files} >= set(SHARED)
    assert not any(step.startswith((".github", "commitlint")) for step in result.next_steps)


def test_skips_files_that_already_list_the_module(repo: Path) -> None:
    result = scaffold_module(repo, "loot")  # already a commit scope and an issue Area
    for relative in ["commitlint.config.mjs", *SHARED[3:]]:
        assert _changes(repo, relative) == ([], []), relative
    assert _changes(repo, ".github/CODEOWNERS") == ([], ["modules/loot/ @Falkicon"])
    assert not any(step.startswith((".github", "commitlint")) for step in result.next_steps)


def test_lists_unrecognized_files_in_next_steps(repo: Path) -> None:
    (repo / ".github/CODEOWNERS").write_text("* @Falkicon\n")
    (repo / "commitlint.config.mjs").unlink()
    result = scaffold_module(repo, "loot-council")
    assert (repo / ".github/CODEOWNERS").read_text() == "* @Falkicon\n"
    assert ".github/CODEOWNERS: add modules/loot-council/ @Falkicon" in result.next_steps
    assert "commitlint.config.mjs: add 'loot-council' to scope-enum" in result.next_steps


def test_appends_after_the_last_ownership_entry(repo: Path) -> None:
    path = repo / ".github/area-ownership.json"
    path.write_text(
        '{\n  "areas": {\n    "raids": { "paths": ["modules/raids/"], "owners": ["@a"] }\n  }\n}\n'
    )
    scaffold_module(repo, "polls")
    assert list(json.loads(path.read_text())["areas"]) == ["raids", "polls"]


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
