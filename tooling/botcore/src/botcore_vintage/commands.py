"""Vintage repo commands. Registered with botcore (MCP `run` meta-tool, DirectClient) and the
`vintagebot` CLI. They return botcore-style result dicts: {status, data | error, reasoning}."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from botcore_vintage.scaffold import ScaffoldError, scaffold_module


def _ok(data: Any, reasoning: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {"status": "success", "data": data}
    if reasoning:
        result["reasoning"] = reasoning
    return result


def _err(message: str, code: str = "error", suggestion: str = "") -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if suggestion:
        error["suggestion"] = suggestion
    return {"status": "error", "error": error}


def find_repo_root(start: Path | None = None) -> Path | None:
    """Walk up from `start` to the folder with pnpm-workspace.yaml."""
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "pnpm-workspace.yaml").exists() and (candidate / "PLAN.md").exists():
            return candidate
    return None


async def vintage_module_new(name: str, maturity: str = "labs", owner: str = "@Falkicon") -> dict[str, Any]:
    """Scaffold a new Vintage module under modules/<name> (PLAN §4.2).

    Creates a package with a contract, store port, one working command, memory store, test,
    Convex component, and AGENTS.md, and registers it in .github/area-ownership.json, CODEOWNERS,
    the commitlint scope-enum, and the issue-form Area dropdowns (or lists any it can't edit
    in next_steps).

    Args:
        name: Kebab-case module name, e.g. "raids" or "loot-council".
        maturity: "labs" (default, feature-flagged off in prod), "official", or "core".
        owner: GitHub handle recorded as the module owner.
    """
    root = find_repo_root()
    if root is None:
        return _err("Run this inside the Vintage repo", code="not_a_repo")
    try:
        result = scaffold_module(root, name, maturity, owner)
    except ScaffoldError as exc:
        return _err(str(exc), code="invalid_input")
    files = [p.relative_to(root).as_posix() for p in result.files]
    return _ok(
        {"module": f"modules/{name}", "files": files, "next_steps": result.next_steps},
        reasoning=f"Scaffolded modules/{name} ({maturity}); wire it into apps/api next",
    )


async def vintage_repo_check(full: bool = False) -> dict[str, Any]:
    """Run the Vintage quality gate: `pnpm validate:final`, or `pnpm validate:full` with full=True.

    Args:
        full: Also run the gate self-tests and botcore plugin tests.
    """
    root = find_repo_root()
    if root is None:
        return _err("Run this inside the Vintage repo", code="not_a_repo")
    script = "validate:full" if full else "validate:final"
    proc = subprocess.run(
        f"pnpm {script}", cwd=root, shell=True, capture_output=True, text=True, check=False
    )
    tail = (proc.stdout + proc.stderr).strip().splitlines()[-25:]
    if proc.returncode != 0:
        return _err(
            f"pnpm {script} failed",
            code="gate_failed",
            suggestion="Read the output tail, fix the first failing step, and rerun",
        ) | {"data": {"output_tail": tail}}
    return _ok({"output_tail": tail}, reasoning=f"pnpm {script} passed")


COMMANDS = [vintage_module_new, vintage_repo_check]
