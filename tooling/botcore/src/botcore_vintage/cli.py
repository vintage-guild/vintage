"""`vintagebot` CLI: the same commands botcore exposes over MCP, for terminals and CI."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from botcore_vintage.commands import vintage_module_new, vintage_repo_check


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vintagebot", description="Vintage repo tooling")
    parser.add_argument("--json", action="store_true", help="print the raw result")
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("module-new", help="scaffold modules/<name>")
    new.add_argument("name")
    new.add_argument("--maturity", default="labs", choices=["labs", "official", "core"])
    new.add_argument("--owner", default="@Falkicon")

    check = sub.add_parser("repo-check", help="run pnpm validate:final")
    check.add_argument("--full", action="store_true", help="run pnpm validate:full")

    args = parser.parse_args(argv)
    if args.command == "module-new":
        result = asyncio.run(vintage_module_new(args.name, args.maturity, args.owner))
    else:
        result = asyncio.run(vintage_repo_check(args.full))

    if args.json:
        print(json.dumps(result, indent=2))
    elif result["status"] == "success":
        print(f"✔ {result.get('reasoning', 'done')}")
        data = result["data"]
        for step in data.get("next_steps", []):
            print(f"  next: {step}")
        for line in data.get("output_tail", []):
            print(f"  {line}")
    else:
        err = result["error"]
        print(f"✖ {err['message']}", file=sys.stderr)
        if err.get("suggestion"):
            print(f"  {err['suggestion']}", file=sys.stderr)
        for line in result.get("data", {}).get("output_tail", []):
            print(f"  {line}", file=sys.stderr)
    return 0 if result["status"] == "success" else 1


if __name__ == "__main__":
    sys.exit(main())
