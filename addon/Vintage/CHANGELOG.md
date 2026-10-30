# Changelog

All notable changes to the Vintage addon. The version is the `## Version` line in
`Vintage.toc`; releases are tagged `addon-vX.Y.Z`.

## [0.1.0] - Unreleased

### Added

- The addon scaffold for WoW: Forever (1.60.1, interface 16001).
- `/vintage` opens the raid window with Roster, Groups, Loot, and Export tabs.
- **Import**, on every tab: paste the guild's string to see the roster by role, the planned
  groups, who is in your group, and the loot plan. Importing over a raid asks first.
- **Invite missing** on the Roster tab invites the roster, tanks and healers first, and makes a
  raid as soon as two are in; **Arrange groups** on the Groups tab moves everyone into their
  planned group. Each row shows whether someone is in, invited, declined, offline, or in another group,
  and offers **Invite** and **Whisper** on hover.
- A **Standby** section on the Roster tab: the import's bench, each with why they're on it
  (standby, queued, benched), and **Invite** on hover. Once the raid's start time has passed,
  the header says what's short ("Short 1 healer") and the bench of those roles comes first.
- **Take a snapshot** and **Make export string** on the Export tab: record who is in the group
  and copy the string into the website's Check an export.
- The night records itself in a raid: a snapshot at the first pull (or when Arrange groups
  finishes), one at each boss kill (named after the boss), and one at the end when you make the
  export string.
- Drops are recorded from loot messages: who got which item, from which boss, at or above the
  loot threshold. The Loot tab lists them in their quality color, and the export carries the
  drops with the items' names, quality, and item level.
- A loot popup for the master looter, beside the loot window: who the guild's priority list
  says gets each item and why, and **Give**, which always asks to confirm first. Items without
  a list show from epic (or the import's threshold); both are in the settings.
- **Set loot method** on the Loot tab sets master loot (you) and the import's threshold, after
  a confirm.
- `/vintage status`, `/vintage clear`, `/vintage settings`, `/vintage debug`, and `/vintage help`.
- A minimap button, an addon compartment entry, and a settings page with profiles.
- The raid session is saved per character and survives `/reload`.
- Mechanic integration: in-game tests, a tools panel, and debug logging, when Mechanic is
  installed.
- Reads and writes the website's `!VIN:1!` strings (import and export, schema version 1), with
  the website's error codes and limits. The one difference: the addon checks the inflated-size
  cap after inflating, where the website stops at it.
