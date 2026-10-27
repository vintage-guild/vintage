"""Install the pinned busted and luacheck into the caller's LuaRocks tree (CI runs it with sudo)."""

import json
from pathlib import Path
import subprocess


def main():
    versions = json.loads(Path(__file__).with_name("toolchain.json").read_text())
    for tool in ("busted", "luacheck"):
        subprocess.run(
            ["luarocks", f"--lua-version={versions['lua']}", "install", tool, versions[tool]],
            check=True,
        )


if __name__ == "__main__":
    main()
