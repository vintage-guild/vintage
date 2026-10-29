"""Tests for Tools/validate.py's checks. Run by validate.py's "Validation tooling tests" stage."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "Tools"))

import release  # noqa: E402
import validate  # noqa: E402


def write(root, name, text):
    path = Path(root) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")  # exact bytes, on Windows too


class LocaleKeys(unittest.TestCase):
    def test_finds_used_and_defined_keys_but_not_comments(self):
        source = 'print(L["Used"]) -- L["Comment"]\nL["Defined"] = true\n--[[ L["Block"] ]]\n'
        self.assertEqual(set(validate.locale_keys(source)), {"Used", "Defined"})
        self.assertEqual(set(validate.locale_keys(source, definitions=True)), {"Defined"})

    def test_reports_undefined_keys(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, "Locales/enUS.lua", 'L["Known"] = true\n')
            write(root, "View/Window.lua", 'local a = L["Known"]\nlocal b = L["Missing"]\n')
            write(root, "Libs/Lib/Lib.lua", 'local c = L["Ignored in libraries"]\n')
            files = {"Locales/enUS.lua", "View/Window.lua", "Libs/Lib/Lib.lua"}
            self.assertEqual(validate.check_localization(root, files),
                             ["View/Window.lua: undefined locale key 'Missing'"])


class Package(unittest.TestCase):
    def test_reads_block_ignore_rules(self):
        source = "package-as: Vintage\nignore:\n  - Tests\n  - 'Tools'\n  - Libs/FenUI/Docs # docs\n"
        self.assertEqual(validate.package_ignores(source), ["Tests", "Tools", "Libs/FenUI/Docs"])

    def test_rejects_inline_ignore_lists(self):
        with self.assertRaises(ValueError):
            validate.package_ignores("ignore: [Tests]\n")

    def test_ignoring_a_folder_ignores_its_files(self):
        self.assertTrue(validate.is_ignored("Tests/core/session_spec.lua", ["Tests"]))
        self.assertFalse(validate.is_ignored("Core/Session.lua", ["Tests"]))

    def test_debug_blocks_are_left_out_of_releases(self):
        toc = "## Title: Vintage\nCore.lua\n#@debug@\nDev/Tool.lua\n#@end-debug@\n"
        self.assertEqual(validate.toc_references(toc, release=False), ["Core.lua", "Dev/Tool.lua"])
        self.assertEqual(validate.toc_references(toc, release=True), ["Core.lua"])
        with self.assertRaises(ValueError):
            validate.toc_references("#@debug@\nDev.lua\n", release=False)

    def test_manifest_follows_xml_and_reports_missing_files(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, validate.TOC, "embeds.xml\nCore.lua\n")
            write(root, "embeds.xml", '<Ui><Include file="Libs\\A\\a.xml"/></Ui>')
            write(root, "Libs/A/a.xml", '<Ui><Script file="a.lua"/><Script file="..\\B\\b.lua"/></Ui>')
            write(root, "Libs/A/a.lua", "")
            files = {validate.TOC, "embeds.xml", "Libs/A/a.xml", "Libs/A/a.lua", "Core.lua"}
            self.assertEqual(validate.check_manifest(root, files),
                             ["Libs/A/a.xml: missing dependency Libs/B/b.lua"])

    def test_development_files_must_not_ship(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, validate.TOC, "Core.lua\n")
            write(root, "Core.lua", "")
            write(root, ".pkgmeta", "package-as: Vintage\nmanual-changelog: CHANGELOG.md\nignore:\n  - Tools\n")
            files = {validate.TOC, "Core.lua", ".pkgmeta", "CHANGELOG.md", "Tests/a_spec.lua", "Tools/validate.py"}
            self.assertEqual(validate.check_package(root, files),
                             [".pkgmeta: development file would ship: Tests/a_spec.lua"])

    def test_reads_settings_and_the_nested_changelog_name(self):
        source = ("package-as: Vintage # folder\nmanual-changelog:\n  filename: CHANGELOG.md\n"
                  "  markup-type: markdown\nignore:\n  - Tests\n")
        self.assertEqual(validate.package_settings(source),
                         {"package-as": "Vintage", "manual-changelog": "CHANGELOG.md", "ignore": ""})

    def test_package_name_externals_and_release_notes(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, validate.TOC, "Core.lua\n")
            write(root, "Core.lua", "")
            files = {validate.TOC, "Core.lua", ".pkgmeta", "CHANGELOG.md"}
            write(root, ".pkgmeta", "package-as: Vintage\nmanual-changelog: CHANGELOG.md\n")
            self.assertEqual(validate.check_package(root, files), [])
            write(root, ".pkgmeta", "package-as: VintageAddon\nmanual-changelog: CHANGELOG.md\n"
                                    "externals:\n  Libs/LibStub: https://repos.wowace.com/wow/libstub/trunk\n")
            self.assertEqual(validate.check_package(root, files), [
                ".pkgmeta: package-as must be Vintage, the TOC's folder name",
                ".pkgmeta: no externals; libraries ship as committed in Libs/",
            ])
            write(root, ".pkgmeta", "package-as: Vintage\n")
            self.assertEqual(validate.check_package(root, files),
                             [".pkgmeta: manual-changelog must name CHANGELOG.md for the release notes"])
            write(root, ".pkgmeta", "package-as: Vintage\nmanual-changelog: CHANGELOG.md\nignore:\n  - CHANGELOG.md\n")
            self.assertEqual(validate.check_package(root, files),
                             [".pkgmeta: manual-changelog CHANGELOG.md must exist and ship"])


class Release(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def test_a_tag_must_name_the_toc_version_and_the_toc_the_project(self):
        write(self.root, validate.TOC, "## Version: 0.1.0\n## X-Curse-Project-ID: 123456\n")
        self.assertEqual(release.check_tag(self.root, "addon-v0.1.0"), [])
        self.assertEqual(release.check_tag(self.root, "addon-v0.1.1"),
                         ["Tag addon-v0.1.1 does not match Vintage.toc ## Version: 0.1.0 (expected addon-v0.1.0)"])
        write(self.root, validate.TOC, "## Version: 0.1.0\n## X-Curse-Project-ID:\n")
        self.assertEqual(release.check_tag(self.root, "addon-v0.1.0"),
                         ["Vintage.toc: no numeric ## X-Curse-Project-ID, so nothing would upload"])
        write(self.root, validate.TOC, "## Title: Vintage\n")
        self.assertEqual(release.check_tag(self.root, "addon-v0.1.0"), ["Vintage.toc: no ## Version line"])

    def test_the_version_must_be_x_y_z_since_it_becomes_a_git_tag(self):
        write(self.root, validate.TOC, "## Version: 1.2.0-beta.1\n")
        self.assertEqual(release.toc_version(self.root), "1.2.0-beta.1")
        for bad in ("-l", "0.1", "v0.1.0"):
            write(self.root, validate.TOC, f"## Version: {bad}\n")
            with self.assertRaises(ValueError):
                release.toc_version(self.root)
        self.assertEqual(release.check_tag(self.root, "addon-vv0.1.0"),
                         ["Vintage.toc: ## Version v0.1.0 is not X.Y.Z"])

    def test_dot_paths_and_ignored_files_do_not_ship(self):
        write(self.root, ".pkgmeta", "package-as: Vintage\nignore:\n  - Tests\n  - Libs/A/Docs\n")
        files = {validate.TOC, ".pkgmeta", ".luacheckrc", "Core.lua", "Tests/a_spec.lua", "Libs/A/a.lua",
                 "Libs/A/Docs/a.md", "Libs/A/.github/ci.yml", "CHANGELOG.md"}
        self.assertEqual(release.package_files(self.root, files),
                         ["CHANGELOG.md", "Core.lua", "Libs/A/a.lua", validate.TOC])

    def test_stage_copies_tracked_files_into_a_tagged_repository(self):
        addon = self.root / "addon"
        write(addon, validate.TOC, "## Version: 0.2.0\r\nCore.lua\r\n")
        write(addon, "Core.lua", "return 1\n")
        write(addon, "Vintage_Mainline.toc", "untracked\n")
        subprocess.run(["git", "init", "-q"], cwd=addon, check=True)
        subprocess.run(["git", "-c", "core.autocrlf=false", "add", validate.TOC, "Core.lua"], cwd=addon, check=True)
        target = self.root / "stage"
        self.assertEqual(release.stage(addon, target), "0.2.0")
        self.assertEqual(sorted(path.name for path in target.iterdir()), [".git", "Core.lua", validate.TOC])
        self.assertEqual((target / validate.TOC).read_bytes(), b"## Version: 0.2.0\r\nCore.lua\r\n")
        tag = subprocess.run(["git", "tag", "--points-at", "HEAD"], cwd=target, capture_output=True,
                             text=True, check=True)
        self.assertEqual(tag.stdout.strip(), "0.2.0")
        with self.assertRaises(ValueError):
            release.stage(addon, target)

    def test_stage_refuses_a_tracked_symlink(self):
        addon = self.root / "addon"
        write(addon, validate.TOC, "## Version: 0.2.0\n")
        write(self.root, "outside.txt", "not the addon's\n")
        try:
            os.symlink(self.root / "outside.txt", addon / "Leak.lua")
        except OSError:
            self.skipTest("this machine can't create symlinks")
        subprocess.run(["git", "init", "-q"], cwd=addon, check=True)
        subprocess.run(["git", "-c", "core.symlinks=true", "add", "-A"], cwd=addon, check=True)
        with self.assertRaisesRegex(ValueError, "Leak.lua"):
            release.stage(addon, self.root / "stage")


class Libraries(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name)
        write(self.root, "Libs/libs.json", '{"libraries": {"LibStub": "latest", "FenUI": "latest"}}')
        write(self.root, "Libs/LibStub/LibStub.lua", 'local LIBSTUB_MAJOR, LIBSTUB_MINOR = "LibStub", 2\n')
        write(self.root, "Libs/FenUI/FenUI.lua", "")

    def tearDown(self):
        self.dir.cleanup()

    def test_passes_when_listing_and_pins_match(self):
        pins = {"Libs/LibStub/LibStub.lua": '"LibStub", 2'}
        self.assertEqual(validate.check_libraries(self.root, pins), [])

    def test_reports_unlisted_folders_missing_folders_and_changed_versions(self):
        write(self.root, "Libs/Extra/Extra.lua", "")
        (self.root / "Libs/FenUI/FenUI.lua").unlink()
        (self.root / "Libs/FenUI").rmdir()
        pins = {"Libs/LibStub/LibStub.lua": '"LibStub", 3'}
        errors = validate.check_libraries(self.root, pins)
        self.assertIn("Libs/Extra: folder is not listed in Libs/libs.json", errors)
        self.assertIn("Libs/libs.json: FenUI is listed but Libs/FenUI is missing", errors)
        self.assertTrue(any("the library changed" in error for error in errors))


class BridgeFixtures(unittest.TestCase):
    def test_renders_lua_literals(self):
        self.assertEqual(validate.lua_string('say "hi"\\\n\x01Élowen'), '"say \\"hi\\"\\\\\\n\\001Élowen"')
        self.assertEqual(validate.lua_value([], 0), "{}")
        self.assertEqual(validate.lua_value({"b": True, "a": 1, "end": "x", "kebab-key": 2}, 0),
                         '{\n\ta = 1,\n\tb = true,\n\t["end"] = "x",\n\t["kebab-key"] = 2,\n}')
        with self.assertRaises(ValueError):
            validate.lua_value(None, 0)

    def test_the_lua_file_must_match_the_json_fixtures(self):
        with tempfile.TemporaryDirectory() as repo:
            addon = Path(repo) / "addon" / "Vintage"
            fixtures = "libs/bridge-format/fixtures/"
            write(repo, fixtures + "raid-export.v1.json", '{"payload": {"v": 1}, "encoded": "!VIN:1!a"}')
            write(repo, fixtures + "lua-made.json", '{"$comment": "x", "strings": {"raid-export.v1": "!VIN:1!b"}}')
            self.assertEqual(validate.check_bridge_fixtures(addon),
                             ["Tests/fixtures/bridge_fixtures.lua is stale; run python Tools/validate.py --write-fixtures"])
            validate.write_bridge_fixtures(addon)
            self.assertEqual(validate.check_bridge_fixtures(addon), [])
            text = (addon / "Tests/fixtures/bridge_fixtures.lua").read_text(encoding="utf-8")
            self.assertIn('["raid-export.v1"] = "!VIN:1!b"', text)
            write(repo, fixtures + "lua-made.json", '{"$comment": "x", "strings": {"raid-export.v1": "!VIN:1!c"}}')
            self.assertEqual(len(validate.check_bridge_fixtures(addon)), 1)

    def test_fixture_check_is_skipped_outside_the_monorepo(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(validate.check_bridge_fixtures(Path(root)), [])


class ThemeAndVersion(unittest.TestCase):
    def test_theme_must_match_the_generated_file(self):
        with tempfile.TemporaryDirectory() as repo:
            addon = Path(repo) / "addon" / "Vintage"
            write(repo, "libs/design-tokens/generated/lua/VintageTokens.lua", "return {}\n")
            write(addon, "Theme/VintageTokens.lua", "return {}\r\n")
            self.assertEqual(validate.check_theme(addon), [])
            write(addon, "Theme/VintageTokens.lua", "return { old = true }\n")
            self.assertEqual(validate.check_theme(addon),
                             ["Theme/VintageTokens.lua is stale; run pnpm tokens:build"])

    def test_theme_check_is_skipped_outside_the_monorepo(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(validate.check_theme(Path(root)), [])

    def test_toc_version_needs_a_changelog_entry(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, validate.TOC, "## Version: 0.2.0\n")
            write(root, "CHANGELOG.md", "# Changelog\n\n## [0.1.0] - 2026-10-27\n")
            self.assertEqual(validate.check_version(root),
                             ["CHANGELOG.md: no '## [0.2.0]' entry for the TOC version"])
            write(root, "CHANGELOG.md", "## [0.2.0] - 2026-11-04\n")
            self.assertEqual(validate.check_version(root), [])


class RetailToc(unittest.TestCase):
    def test_no_local_retail_copy_is_fine(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            write(root, validate.TOC, "## Interface: 16001\nCore\\A.lua\n")
            self.assertEqual(validate.check_retail_toc(root), [])

    def test_a_copy_written_before_the_toc_changed_is_reported(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            target = validate.retail_toc.TARGET.name
            write(root, validate.TOC, "## Interface: 16001\nCore\\A.lua\n")
            # As retail_toc.py writes it: CRLF line endings.
            write(root, target, validate.retail_toc.render("## Interface: 16001\nCore\\A.lua\n").replace("\n", "\r\n"))
            self.assertEqual(validate.check_retail_toc(root), [])
            write(root, validate.TOC, "## Interface: 16001\nCore\\A.lua\nCore\\B.lua\n")
            self.assertEqual(validate.check_retail_toc(root),
                             [f"{target} is out of date with {validate.TOC}; run python Tools/retail_toc.py"])


if __name__ == "__main__":
    unittest.main()
