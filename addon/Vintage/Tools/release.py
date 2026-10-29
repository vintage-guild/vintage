"""Release helpers for .github/workflows/release-addon.yml (BigWigsMods/packager).

The packager needs its top-level folder to hold a `.git` folder, and the addon is a folder in the
monorepo, so `stage` copies the addon's tracked files (as checked out, so the TOC keeps its CRLF
line endings) into a one-commit repository tagged with the TOC version. Untracked and ignored
files, such as a local Vintage_Mainline.toc, are left behind.

    python Tools/release.py check-tag addon-v0.1.0   # a tag release: tag, TOC version, project id
    python Tools/release.py files                    # what the package ships, from this checkout
    python Tools/release.py stage <empty folder>     # the packager's checkout
"""

import argparse
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys

import validate

ROOT = validate.ROOT
TAG_PREFIX = "addon-v"
# X.Y.Z with an optional pre-release; it becomes a git tag, so it may not start with a dash.
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?")


def toc_field(root, name):
    match = re.search(r"^## " + re.escape(name) + r":[ \t]*(.*?)[ \t]*$", validate.read(root, validate.TOC),
                      re.MULTILINE)
    return match.group(1) if match and match.group(1) else None


def toc_version(root):
    version = toc_field(root, "Version")
    if not version:
        raise ValueError(f"{validate.TOC}: no ## Version line")
    if not VERSION.fullmatch(version):
        raise ValueError(f"{validate.TOC}: ## Version {version} is not X.Y.Z")
    return version


def check_tag(root, tag):
    """A tag release uploads to CurseForge: the tag names the TOC version and the TOC names the
    project. Without the project id the packager skips the upload and still succeeds."""
    try:
        version = toc_version(root)
    except ValueError as error:
        return [str(error)]
    errors = []
    if tag != TAG_PREFIX + version:
        errors.append(f"Tag {tag} does not match {validate.TOC} ## Version: {version} "
                      f"(expected {TAG_PREFIX}{version})")
    if not re.fullmatch(r"[0-9]+", toc_field(root, "X-Curse-Project-ID") or ""):
        errors.append(f"{validate.TOC}: no numeric ## X-Curse-Project-ID, so nothing would upload")
    return errors


def shipped(name, ignores):
    """The packager prunes every dot-path and the .pkgmeta ignores."""
    return not any(part.startswith(".") for part in PurePosixPath(name).parts) and not validate.is_ignored(name, ignores)


def package_files(root, files):
    ignores = validate.package_ignores(validate.read(root, ".pkgmeta"))
    return sorted(name for name in files if shipped(name, ignores))


def tracked_files(root):
    """Tracked files, refusing symlinks: copying one would ship whatever it points at."""
    result = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True)
    names = [name for name in result.stdout.decode("utf-8").split("\0") if name]
    links = [name for name in names if (root / name).is_symlink()]
    if links:
        raise ValueError("Tracked symlinks can't be packaged: " + ", ".join(links))
    return [name for name in names if (root / name).is_file()]


def stage(root, target):
    version = toc_version(root)
    target.mkdir(parents=True, exist_ok=True)
    if any(target.iterdir()):
        raise ValueError(f"{target} is not empty")
    for name in tracked_files(root):
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, destination)
    git = ["git", "-c", "user.name=Vintage release", "-c", "user.email=release@vintageguild.gg",
           "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main"]
    for args in (["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", f"Vintage {version}"],
                 ["tag", version]):
        subprocess.run(git + args, cwd=target, check=True)
    return version


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check-tag").add_argument("tag")
    commands.add_parser("files")
    commands.add_parser("stage").add_argument("target", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "check-tag":
            errors = check_tag(ROOT, args.tag)
            for error in errors:
                print(error, file=sys.stderr)
            if errors:
                return 1
            print(f"{args.tag} releases version {toc_version(ROOT)}.")
        elif args.command == "files":
            files = package_files(ROOT, validate.repository_files(ROOT))
            print("\n".join(files))
            folder = validate.package_settings(validate.read(ROOT, ".pkgmeta")).get("package-as")
            print(f"\n{len(files)} files ship in {folder}/.", file=sys.stderr)
        else:
            version = stage(ROOT, args.target.resolve())
            print(f"Staged Vintage {version} in {args.target} (tag {version}).")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
