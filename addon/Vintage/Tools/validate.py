"""Run the Vintage addon's local and CI checks (Weekly's gate, adapted for the monorepo).

Requires Python 3.10+ and Git. The Lua stages need Lua 5.1, busted, and luacheck at the
versions in Tools/toolchain.json (install them with Tools/install_lua_tools.py). On a machine
without Lua, --static runs only the Python stages and says the Lua stages were skipped; CI's
addon lane always runs everything.

No packages are installed and no release files are written.
"""

import argparse
import fnmatch
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

import retail_toc

ROOT = Path(__file__).resolve().parent.parent
TOC = "Vintage.toc"
REPO_THEME = Path("../../libs/design-tokens/generated/lua/VintageTokens.lua")
ADDON_THEME = Path("Theme/VintageTokens.lua")
DEV_FOLDERS = {"Tests", "Tools", "Dev", ".github"}
FIRST_PARTY_SKIP = {"Libs", "Tests", "Tools", "Locales"}
LONG_BRACKET = re.compile(r"\[(=*)\[")
IDENTIFIER = re.compile(r"[A-Za-z_][A-Za-z_0-9]*")

# Embedded libraries ship exactly as synced. A version line that changes means the library
# changed: re-check it (and the Ace3 rule in Libs/libs.json), then update the pin.
PINNED_LIBRARIES = {
    "Libs/LibStub/LibStub.lua": '"LibStub", 2',
    "Libs/CallbackHandler-1.0/CallbackHandler-1.0.lua": '"CallbackHandler-1.0", 8',
    "Libs/AceAddon-3.0/AceAddon-3.0.lua": '"AceAddon-3.0", 13',
    "Libs/AceConsole-3.0/AceConsole-3.0.lua": '"AceConsole-3.0", 7',
    "Libs/AceDB-3.0/AceDB-3.0.lua": '"AceDB-3.0", 33',
    "Libs/AceDBOptions-3.0/AceDBOptions-3.0.lua": '"AceDBOptions-3.0", 15',
    "Libs/AceEvent-3.0/AceEvent-3.0.lua": '"AceEvent-3.0", 4',
    "Libs/AceGUI-3.0/AceGUI-3.0.lua": '"AceGUI-3.0", 41',
    "Libs/AceConfig-3.0/AceConfig-3.0.lua": '"AceConfig-3.0", 3',
    "Libs/AceConfig-3.0/AceConfigDialog-3.0/AceConfigDialog-3.0.lua": '"AceConfigDialog-3.0", 92',
    "Libs/AceConfig-3.0/AceConfigRegistry-3.0/AceConfigRegistry-3.0.lua": '"AceConfigRegistry-3.0", 22',
    "Libs/AceConfig-3.0/AceConfigCmd-3.0/AceConfigCmd-3.0.lua": '"AceConfigCmd-3.0", 14',
    "Libs/AceLocale-3.0/AceLocale-3.0.lua": '"AceLocale-3.0", 6',
    "Libs/LibDataBroker-1.1/LibDataBroker-1.1.lua": '"LibDataBroker-1.1", 4',
    "Libs/LibDBIcon-1.0/LibDBIcon-1.0.lua": "DBICON10_MINOR = 55",
    "Libs/LibDeflate/LibDeflate.lua": "local _MINOR = 3",
    "Libs/LibSerialize/LibSerialize.lua": '"LibSerialize", 7',
    "Libs/FenCore/Core/FenCore.lua": '"FenCore", 1',
    "Libs/FenUI/Core/FenUI.lua": 'FenUI.VERSION = "3.0.0"',
}


def sibling(root, relative):
    """A path beside the addon in the monorepo, with .. resolved as text: a missing folder on the
    way must not change the answer (Windows normalizes lexically, Linux walks real folders)."""
    return Path(os.path.normpath(root / relative))


def read(root, name):
    return (root / name).read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------------------
# Localization: every literal L["..."] key is defined in Locales/enUS.lua
# ---------------------------------------------------------------------------


def lua_tokens(source):
    """Tokenize enough Lua to find literal locale keys without reading comments."""
    index = 0
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        comment = source.startswith("--", index)
        start = index + 2 if comment else index
        bracket = LONG_BRACKET.match(source, start)
        if bracket:
            closing = "]" + bracket.group(1) + "]"
            end = source.find(closing, bracket.end())
            if end < 0:
                raise ValueError("Unterminated Lua long string/comment")
            if not comment:
                yield "string", source[bracket.end():end].removeprefix("\n")
            index = end + len(closing)
            continue
        if comment:
            end = source.find("\n", start)
            index = len(source) if end < 0 else end + 1
            continue
        if char in "\"'":
            quote, value = char, []
            index += 1
            while index < len(source) and source[index] != quote:
                char = source[index]
                if char == "\\":
                    index += 1
                    if index >= len(source):
                        raise ValueError("Unterminated Lua string")
                    escape = source[index]
                    if escape.isdigit():
                        digits = re.match(r"[0-9]{1,3}", source[index:]).group()
                        value.append(chr(int(digits)))
                        index += len(digits)
                        continue
                    value.append({"n": "\n", "r": "\r", "t": "\t"}.get(escape, escape))
                else:
                    value.append(char)
                index += 1
            if index >= len(source):
                raise ValueError("Unterminated Lua string")
            yield "string", "".join(value)
            index += 1
            continue
        name = IDENTIFIER.match(source, index)
        if name:
            yield "name", name.group()
            index = name.end()
        else:
            yield "symbol", char
            index += 1


def locale_keys(source, definitions=False):
    tokens = list(lua_tokens(source))
    for index in range(len(tokens) - 3):
        if (tokens[index] == ("name", "L")
                and tokens[index + 1] == ("symbol", "[")
                and tokens[index + 2][0] == "string"
                and tokens[index + 3] == ("symbol", "]")):
            if not definitions or (index + 4 < len(tokens) and tokens[index + 4] == ("symbol", "=")):
                yield tokens[index + 2][1]


def repository_files(root):
    """Tracked and untracked (not ignored) files, relative to root."""
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=root, capture_output=True, check=True,
    )
    names = result.stdout.decode("utf-8").split("\0")
    return {name for name in names if name and (root / name).is_file()}


def check_localization(root, files):
    defined = set(locale_keys(read(root, "Locales/enUS.lua"), definitions=True))
    errors = []
    for name in sorted(files):
        if not name.endswith(".lua") or name.split("/")[0] in FIRST_PARTY_SKIP:
            continue
        used = set(locale_keys(read(root, name)))
        errors.extend(f"{name}: undefined locale key {key!r}" for key in sorted(used - defined))
    return errors


# ---------------------------------------------------------------------------
# Manifest and package: every TOC/XML reference exists, in the checkout and in the release
# ---------------------------------------------------------------------------


def package_ignores(source):
    """Read the block-list `ignore:` rules of .pkgmeta."""
    patterns, in_ignore = [], False
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not line[0].isspace():
            in_ignore = stripped == "ignore:"
            if stripped.startswith("ignore:") and not in_ignore:
                raise ValueError(".pkgmeta: use a block list for ignore rules")
            continue
        if in_ignore:
            if not stripped.startswith("- "):
                raise ValueError(".pkgmeta: unsupported ignore rule: " + stripped)
            value = stripped[2:].split(" #", 1)[0].strip().strip("'\"")
            if not value or any(char in value for char in "{}[]"):
                raise ValueError(".pkgmeta: unsupported ignore rule: " + value)
            patterns.append(value.replace("\\", "/").rstrip("/"))
    return patterns


def is_ignored(name, patterns):
    """Matching a directory also excludes everything under it."""
    parts = PurePosixPath(name).parts
    prefixes = ("/".join(parts[:index]) for index in range(1, len(parts) + 1))
    return any(fnmatch.fnmatchcase(prefix, pattern) for prefix in prefixes for pattern in patterns)


def toc_references(source, release):
    debug, references = False, []
    for line in source.splitlines():
        line = line.strip()
        if line == "#@debug@":
            if debug:
                raise ValueError("Nested TOC debug block")
            debug = True
        elif line == "#@end-debug@":
            if not debug:
                raise ValueError("Unmatched TOC debug block end")
            debug = False
        elif line and not line.startswith("#") and not (release and debug):
            references.append(line)
    if debug:
        raise ValueError("Unclosed TOC debug block")
    return references


def check_manifest(root, files, release=False, ignores=()):
    available = {name for name in files if not release or not is_ignored(name, ignores)}
    errors, visited = [], set()

    def visit(parent, reference):
        reference = reference.replace("\\", "/")
        name = str(PurePosixPath(parent).parent / reference)
        name = PurePosixPath(*_normalize(PurePosixPath(name).parts)).as_posix()
        if name.startswith("../"):
            errors.append(f"{parent}: dependency escapes the addon: {reference}")
            return
        if name not in available:
            errors.append(f"{parent}: missing {'release ' if release else ''}dependency {name}")
            return
        if name in visited:
            return
        visited.add(name)
        if name.endswith(".xml"):
            try:
                document = ET.parse(root / name)
            except ET.ParseError as error:
                errors.append(f"{name}: invalid XML: {error}")
                return
            for element in document.iter():
                if element.tag.rsplit("}", 1)[-1] in {"Include", "Script"} and "file" in element.attrib:
                    visit(name, element.attrib["file"])

    if TOC not in available:
        return [f"{TOC} missing from " + ("release" if release else "checkout")]
    for reference in toc_references(read(root, TOC), release):
        visit(TOC, reference)
    return errors


def _normalize(parts):
    out = []
    for part in parts:
        if part == "..":
            if out and out[-1] != "..":
                out.pop()
            else:
                out.append(part)
        elif part not in (".", ""):
            out.append(part)
    return out or ["."]


def check_package(root, files):
    ignores = package_ignores(read(root, ".pkgmeta"))
    errors = check_manifest(root, files, release=True, ignores=ignores)
    for name in sorted(files):
        if name.split("/")[0] in DEV_FOLDERS and not is_ignored(name, ignores):
            errors.append(f".pkgmeta: development file would ship: {name}")
    return errors


# ---------------------------------------------------------------------------
# Libraries, theme, and version
# ---------------------------------------------------------------------------


def check_libraries(root, pinned=None):
    """libs.json lists exactly the folders in Libs/, and each pinned version line is present."""
    pinned = PINNED_LIBRARIES if pinned is None else pinned
    errors = []
    listed = set(json.loads(read(root, "Libs/libs.json"))["libraries"])
    present = {path.name for path in (root / "Libs").iterdir() if path.is_dir()}
    errors.extend(f"Libs/{name}: folder is not listed in Libs/libs.json" for name in sorted(present - listed))
    errors.extend(f"Libs/libs.json: {name} is listed but Libs/{name} is missing" for name in sorted(listed - present))
    for path, expected in sorted(pinned.items()):
        file = root / path
        if not file.is_file():
            errors.append(f"{path}: pinned library file is missing")
        elif expected not in file.read_text(encoding="utf-8-sig", errors="replace"):
            errors.append(f"{path}: expected {expected!r}; the library changed (see PINNED_LIBRARIES)")
    return errors


def check_theme(root):
    """The shipped theme matches libs/design-tokens' generated file (pnpm tokens:build)."""
    source = sibling(root, REPO_THEME)
    if not source.is_file():
        return []  # a standalone copy of the addon, outside the monorepo
    if not (root / ADDON_THEME).is_file():
        return [f"{ADDON_THEME.as_posix()} is missing; run pnpm tokens:build"]
    generated = source.read_text(encoding="utf-8").replace("\r\n", "\n")
    shipped = (root / ADDON_THEME).read_text(encoding="utf-8").replace("\r\n", "\n")
    if generated != shipped:
        return [f"{ADDON_THEME.as_posix()} is stale; run pnpm tokens:build"]
    return []


# ---------------------------------------------------------------------------
# Bridge fixtures: libs/bridge-format/fixtures/*.json as a Lua table for busted
# ---------------------------------------------------------------------------

REPO_FIXTURES = Path("../../libs/bridge-format/fixtures")
ADDON_FIXTURES = Path("Tests/fixtures/bridge_fixtures.lua")
LUA_MADE = "lua-made.json"
WOW_DATA = "wow-data.json"
LUA_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z_0-9]*$")
LUA_KEYWORDS = set("and break do else elseif end false for function if in local nil not or repeat return then true until while".split())


def lua_string(text):
    """A double-quoted Lua 5.1 string literal; UTF-8 bytes pass through unchanged."""
    out = []
    for char in text:
        if char == "\\":
            out.append("\\\\")
        elif char == '"':
            out.append('\\"')
        elif char == "\n":
            out.append("\\n")
        elif ord(char) < 32 or ord(char) == 127:
            out.append("\\%03d" % ord(char))
        else:
            out.append(char)
    return '"' + "".join(out) + '"'


def lua_value(value, indent):
    """Lua source for a JSON value; object keys sorted so the output is stable."""
    pad = "\t" * (indent + 1)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        return lua_string(value)
    if isinstance(value, list):
        if not value:
            return "{}"
        items = [pad + lua_value(item, indent + 1) + "," for item in value]
        return "{\n" + "\n".join(items) + "\n" + "\t" * indent + "}"
    if isinstance(value, dict):
        if not value:
            return "{}"
        items = []
        for key in sorted(value):
            name = key if LUA_IDENTIFIER.match(key) and key not in LUA_KEYWORDS else "[" + lua_string(key) + "]"
            items.append(f"{pad}{name} = {lua_value(value[key], indent + 1)},")
        return "{\n" + "\n".join(items) + "\n" + "\t" * indent + "}"
    raise ValueError(f"bridge fixture holds a value Lua can't represent: {value!r}")


def render_bridge_fixtures(fixtures_dir):
    """The Lua fixture file's text from the JSON fixtures (None outside the monorepo)."""
    if not fixtures_dir.is_dir():
        return None
    fixtures, lua_made, wow_data = {}, {}, {}
    for path in sorted(fixtures_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if path.name == LUA_MADE:
            lua_made = data["strings"]
        elif path.name == WOW_DATA:
            wow_data = {"classes": data["classes"], "roles": data["roles"]}
        else:
            fixtures[path.stem] = data
    return ("-- Generated by Tools/validate.py --write-fixtures from libs/bridge-format/fixtures.\n"
            "-- Do not edit; see Tests/support/lua_made.lua for the regeneration order.\n"
            "return " + lua_value({"fixtures": fixtures, "luaMade": lua_made, "wowData": wow_data}, 0) + "\n")


def check_bridge_fixtures(root):
    expected = render_bridge_fixtures(sibling(root, REPO_FIXTURES))
    if expected is None:
        return []
    target = root / ADDON_FIXTURES
    current = target.read_text(encoding="utf-8").replace("\r\n", "\n") if target.is_file() else None
    if current != expected:
        return [f"{ADDON_FIXTURES.as_posix()} is stale; run python Tools/validate.py --write-fixtures"]
    return []


def write_bridge_fixtures(root):
    text = render_bridge_fixtures(sibling(root, REPO_FIXTURES))
    if text is None:
        raise RuntimeError("libs/bridge-format/fixtures not found; run this from the monorepo")
    target = root / ADDON_FIXTURES
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {ADDON_FIXTURES.as_posix()}.", flush=True)


def check_version(root):
    """The TOC version has a CHANGELOG entry."""
    match = re.search(r"^## Version:\s*(\S+)", read(root, TOC), re.MULTILINE)
    if not match:
        return [f"{TOC}: no ## Version line"]
    version = match.group(1)
    if not re.search(r"^## \[" + re.escape(version) + r"\]", read(root, "CHANGELOG.md"), re.MULTILINE):
        return [f"CHANGELOG.md: no '## [{version}]' entry for the TOC version"]
    return []


def check_retail_toc(root):
    """A local Vintage_Mainline.toc (gitignored, for trying the addon on retail) matches
    Vintage.toc: retail loads it instead, so a stale copy leaves new files unloaded."""
    name = retail_toc.TARGET.name
    if not (root / name).exists():
        return []
    try:
        expected = retail_toc.render(read(root, TOC))
    except ValueError as error:
        return [str(error)]
    if read(root, name) != expected:
        return [f"{name} is out of date with {TOC}; run python Tools/retail_toc.py"]
    return []


def static_errors(root):
    files = repository_files(root)
    return (check_localization(root, files) + check_manifest(root, files) + check_package(root, files)
            + check_libraries(root) + check_theme(root) + check_bridge_fixtures(root) + check_version(root)
            + check_retail_toc(root))


# ---------------------------------------------------------------------------
# Running stages
# ---------------------------------------------------------------------------


def command(executable, script, lua):
    return [lua, str(Path(script).resolve())] if script else [executable]


def run_command(label, args, root=ROOT, capture=False):
    print(f"\n{label}", flush=True)
    result = subprocess.run(args, cwd=root, text=True, capture_output=capture)
    output = (result.stdout + result.stderr) if capture else ""
    if capture:
        print(output.strip(), flush=True)
    if result.returncode:
        raise RuntimeError(f"{label} failed (exit {result.returncode})")
    return output


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lua", default=shutil.which("lua5.1") or shutil.which("lua") or "lua")
    parser.add_argument("--busted", default="busted")
    parser.add_argument("--busted-script", help="Run a busted Lua entrypoint directly, bypassing its launcher")
    parser.add_argument("--luacheck", default="luacheck")
    parser.add_argument("--luacheck-script", help="Run a luacheck Lua entrypoint directly")
    parser.add_argument("--static", action="store_true", help="Only the Python stages (no Lua on this machine)")
    parser.add_argument("--write-fixtures", action="store_true",
                        help="Regenerate Tests/fixtures/bridge_fixtures.lua from libs/bridge-format/fixtures, then exit")
    args = parser.parse_args(argv)
    if args.write_fixtures:
        write_bridge_fixtures(ROOT)
        return 0
    versions = json.loads(read(ROOT, "Tools/toolchain.json"))
    busted = command(args.busted, args.busted_script, args.lua)
    luacheck = command(args.luacheck, args.luacheck_script, args.lua)
    failures = []

    def stage(label, callback):
        try:
            callback()
        except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
            failures.append(f"{label}: {error}")
            print(f"FAIL: {failures[-1]}", flush=True)

    def versions_check():
        output = run_command("Lua version", [args.lua, "-e", "print(_VERSION)"], capture=True)
        if output.strip() != "Lua " + versions["lua"]:
            raise RuntimeError("Tests must run under Lua " + versions["lua"])
        for name, executable in (("busted", busted), ("luacheck", luacheck)):
            output = run_command(name + " version", executable + ["--version"], capture=True)
            expected = versions[name].rsplit("-", 1)[0]
            first_line = output.strip().splitlines()[0] if output.strip() else ""
            prefix = r"(?:busted\s*:?\s*)?" if name == "busted" else r"luacheck\s*:?\s*"
            if not re.match(prefix + re.escape(expected) + r"(?:-\d+)?(?:\s|$)", first_line, re.IGNORECASE):
                raise RuntimeError(f"Expected {name} {expected}; see Tools/toolchain.json")

    def static_checks():
        errors = static_errors(ROOT)
        if errors:
            raise RuntimeError("\n".join(errors))
        print("Localization, manifest, package, library, theme, version, and retail TOC checks passed.", flush=True)

    if not args.static:
        stage("Tool versions", versions_check)
        if failures:
            return 1
    stage("Validation tooling tests", lambda: run_command(
        "Validation tooling tests",
        [sys.executable, "-m", "unittest", "discover", "-s", "Tests", "-p", "test_validation.py"]))
    stage("Static checks", static_checks)
    if args.static:
        print("\nSkipped (--static): tool versions, Lua lint, busted specs, diff whitespace.", flush=True)
    else:
        stage("Lua lint", lambda: run_command("Lua lint", luacheck + ["."]))
        stage("Busted specs", lambda: run_command("Busted specs", busted + ["Tests"]))
        # Checks uncommitted edits only: on CI's clean checkout there is nothing to compare.
        stage("Diff whitespace (local edits)", lambda: run_command(
            "Diff whitespace (local edits)",
            ["git", "-c", "core.safecrlf=false", "diff", "--check", "HEAD", "--", "."]))
    if failures:
        print(f"\nValidation failed: {len(failures)} stage(s).", flush=True)
        return 1
    print("\nAll validation stages passed." if not args.static else "\nStatic stages passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
