# Changelog

All notable changes to the Vintage addon. The version is the `## Version` line in
`Vintage.toc`; releases are tagged `addon-vX.Y.Z`.

## [0.1.0] - Unreleased

### Added

- The addon scaffold for WoW: Forever (1.60.1, interface 16001).
- `/vintage` opens the raid window with Roster, Groups, Loot, and Export tabs.
- **Import** on the Roster tab: paste the guild's string to see the roster, each planned group,
  and who is in your group. Importing over a raid asks first.
- **Take a snapshot** and **Make export string** on the Export tab: record who is in the group
  and copy the string into the website's Check an export.
- `/vintage status`, `/vintage clear`, `/vintage settings`, `/vintage debug`, and `/vintage help`.
- A minimap button, an addon compartment entry, and a settings page with profiles.
- The raid session is saved per character and survives `/reload`.
- Mechanic integration: in-game tests, a tools panel, and debug logging, when Mechanic is
  installed.
- Reads and writes the website's `!VIN:1!` strings (import and export, schema version 1), with
  the website's error codes and limits. The one difference: the addon checks the inflated-size
  cap after inflating, where the website stops at it.
