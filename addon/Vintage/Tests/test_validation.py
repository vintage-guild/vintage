"""Tests for Tools/validate.py's checks. Run by validate.py's "Validation tooling tests" stage."""

from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "Tools"))

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
            write(root, ".pkgmeta", "package-as: Vintage\nignore:\n  - Tools\n")
            files = {validate.TOC, "Core.lua", ".pkgmeta", "Tests/a_spec.lua", "Tools/validate.py"}
            self.assertEqual(validate.check_package(root, files),
                             [".pkgmeta: development file would ship: Tests/a_spec.lua"])


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
