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


def render(text: str) -> str:
    """The retail TOC for this Vintage.toc text. validate.py compares a local copy with it, so a
    copy written before the TOC changed is caught."""
    retail, count = re.subn(
        r"^## Interface: .*$", f"## Interface: {RETAIL_INTERFACES}", text, count=1, flags=re.MULTILINE
    )
    if count != 1:
        raise ValueError(f"{SOURCE.name}: no ## Interface line")
    return retail.rstrip("\n") + "\n\n# Local retail copy of Vintage.toc from Tools/retail_toc.py; never shipped.\n"


def main() -> int:
    try:
        retail = render(SOURCE.read_text(encoding="utf-8"))
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    TARGET.write_text(retail, encoding="utf-8", newline="\r\n")
    print(f"Wrote {TARGET.name} (## Interface: {RETAIL_INTERFACES}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
