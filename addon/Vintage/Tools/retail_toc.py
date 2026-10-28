"""Writes Vintage_Mainline.toc: Vintage.toc for the retail client, for trying the addon there.

Vintage ships for WoW: Forever only. Retail loads a `_Mainline` TOC in preference to the plain
one, so this local copy (gitignored, never packaged) lets a source checkout load on retail
without touching the shipped TOC. Run it from addon/Vintage after Vintage.toc changes:

    python Tools/retail_toc.py
"""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "Vintage.toc"
TARGET = ROOT / "Vintage_Mainline.toc"
# Live retail 12.1.5 and the 12.1.7 PTR.
RETAIL_INTERFACES = "120105, 120107"


def main() -> int:
    text = SOURCE.read_text(encoding="utf-8")
    retail, count = re.subn(
        r"^## Interface: .*$", f"## Interface: {RETAIL_INTERFACES}", text, count=1, flags=re.MULTILINE
    )
    if count != 1:
        print(f"{SOURCE.name}: no ## Interface line", file=sys.stderr)
        return 1
    retail = retail.rstrip("\n") + "\n\n# Local retail copy of Vintage.toc from Tools/retail_toc.py; never shipped.\n"
    TARGET.write_text(retail, encoding="utf-8", newline="\r\n")
    print(f"Wrote {TARGET.name} (## Interface: {RETAIL_INTERFACES}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
