# Roster self-service: availability, notes, and last updated

**Status:** proposed (2026-11-22). Nothing built. **Owner modules:** raids (availability is the
weekly absence rule), identity (notes, last updated), web (profile, roster, quarters), apps/api
(the one-time import).

TJ (guild master) asked on 2026-11-22 what raiders can manage for themselves on the site
compared with the Roster tab of the guild's Google Sheet ("<Vintage> Roster"). Most of the tab
already has a home on the site. This plan covers the rest so the tab can be retired.

## The sheet's Roster tab against the site

| Sheet column | On the site today |
|---|---|
| Discord Handle | ✅ From Discord sign-in; the `/roster` Discord column (recruits and up) |
| Character Name | ✅ `/characters`; `/roster` lists the whole in-game guild from the armory |
| Rank | ✅ From Discord roles (role sync) and the in-game rank. Not member-editable, as in the sheet |
| Preferred Class | ✅ Per character on `/characters`; the main is set on `/profile` |
| Preferred Role, Alt Role | ✅ Main role and Also plays, on `/characters` and inline on `/roster` for your own character |
| Sunday to Saturday | 🚧 Weekly nights on `/profile` (On time, Late or Absent per weekday, from [absences](../../active/absences/absences.plan.md)). Officers can't see it on the roster |
| Raid Night Preference (nights per week) | ❌ Replaced by availability (TJ, 2026-11-22) |
| Notes | ❌ None |
| Last Updated | ❌ None |

## Design

### 1. Availability

Decided: the sheet's nights-per-week number is dropped; raiders say which nights they can raid
instead (TJ, 2026-11-22).

- **Same data as Weekly nights.** The profile's Weekly nights section becomes **Availability**.
  Each weekday is **Available**, **Late** (5, 15 or 30 minutes) or **Unavailable**. It saves
  through `absence-weekly-set` as today. No new table and no new command.
- **Unavailable still means Absent on raids.** An Unavailable night marks the raider Absent on
  that night's raids until they answer, and any answer overrides it, as absences work today.
  Raid posts, the digest and the quarters keep saying "Absent".
- **Not set.** A raider who has never saved it shows "Not set" to officers. Saving every night
  as Available has to be remembered too, which today ends the rule. How to store that is
  Bloodfen's call (row 7).
- **Discord:** the `/vintage absence weekly` form's title becomes Availability, with the same
  three choices. The command name stays.
- **A nudge:** raiders and recruits with nothing set see one line on the home page, "Set your
  availability on your profile.", until they save it (row 4).

### 2. Roster note

- **The note:** one plain-text note per member, up to 500 characters. Links stay text (raiders
  put Warcraft Logs links there today). Empty is fine.
- **Where it's edited:** `/profile` under Raid settings ("Roster note"), and on your own row on
  `/roster`, as roles are. Officers can edit or clear anyone's, as they can in the sheet (row 5).
- **Who sees it:** recruits and up, the same people who see the Discord column (row 3).
  Visitors and members don't.
- **The command:** a new `member-note-set` (`{ note, memberId? }`, tier member; `memberId` for
  someone else needs officer), or `note` added to `member-prefs-set`. Bloodfen's call (row 8).

### 3. Last updated

- **What counts:** the member's own changes to their characters (add, edit, remove, main),
  availability or note. An officer editing for them doesn't count, so the date shows who hasn't
  looked at their entry (row 6).
- **Where it lives:** `rosterUpdatedAt` on the member in identity. Characters and notes are in
  identity; availability is in raids, whose `absence-changed` event already exists. How identity
  hears about it is Bloodfen's call (row 9).

### 4. On `/roster`

Availability, note and last updated are the member's, not a character's. They show on the row
of the member's main, or their only linked character. Alts and unlinked characters leave them
blank.

- **Availability column:** the week as seven day letters. Available nights in full, late nights
  marked, unavailable nights dimmed, and "Not set" when there's nothing. The tooltip spells out
  late nights ("15m late Thursdays").
- **Available on:** a weekday filter next to the role filters. It filters the tables and the
  Raid composition drawer, so leaders can see who could make a second raid night (the raid
  scheduling plan's parallel schedules, #319).
- **Note:** a note icon on the row opens it. On phones it's a line on the card.
- **Updated column:** "3d ago", sortable. Blank for unlinked rows.
- All three are hidden from visitors and members, like the Discord column.

**Quarters, Roster tab (officers):** a short list of raiders and recruits with availability Not
set, then the ones not updated in 30 days, oldest first.

### 5. Moving off the sheet

- **Import the notes once** (row 10). Officers run a one-time import of the Roster tab's Notes,
  matched by Discord handle. Unmatched rows are listed so officers can fix them by hand.
- **Don't import the days.** An unticked day would mark someone Absent on that night's raids,
  from an answer some gave in October. Raiders set availability themselves; the home page nudge
  and the quarters' Not set list cover who hasn't.
- **Retire the tab** once the site has the notes and most raiders have set availability. The
  Form Responses tab is already replaced by `/apply`.

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands.

- **J75 · Set availability once.** Aeryn opens her profile, sets Monday to Thursday Available,
  Thursday Late 15 minutes, and the weekend Unavailable, and saves. On `/roster` her main shows
  the week with Thursday marked late. A Saturday open raid doesn't list her as Absent; a guild
  raid on Saturday does until she answers it.
- **J76 · Plan a second night.** Rook filters `/roster` to Available on Wednesday. The tables
  and the Raid composition drawer show only raiders free that night.
- **J77 · Leave a note.** Bram adds "Healing on my priest alt this phase" on his profile. Rook
  sees the note icon on Bram's row; a visitor sees no note and no icon.
- **J78 · Find stale entries.** The quarters' Roster tab lists two raiders with availability
  Not set and one not updated since October. A member calling `member-note-set` with someone
  else's `memberId` is refused.

## Decisions

TJ decides how it behaves; Bloodfen makes the technical calls. Dated rows are decided;
"(proposed)" rows wait on their owner.

| # | Decision | Why | Owner |
|---|---|---|---|
| 1 | Availability replaces the sheet's nights-per-week number | Which nights matters more than how many | TJ, 2026-11-22 |
| 2 | Availability is the weekly absence rule, renamed: Available, Late or Unavailable per weekday | One place to say it; Unavailable already marks raids Absent | TJ (proposed) |
| 3 | Notes and availability are visible to recruits and up | The sheet is open to the guild today; matches the Discord column | TJ (proposed) |
| 4 | Raiders and recruits with no availability get a one-line nudge on the home page | Officers shouldn't have to chase it | TJ (proposed) |
| 5 | Officers can edit or clear anyone's note | They can in the sheet | TJ (proposed) |
| 6 | Last updated counts only the member's own changes | Shows who hasn't looked at their entry | TJ (proposed) |
| 7 | How "every night Available" is remembered: an active weekly rule with no nights, or `availabilitySetAt` on the member | Today saving no nights ends the rule, which reads as Not set | Bloodfen (proposed) |
| 8 | A new `member-note-set`, or `note` on `member-prefs-set` | Officers editing someone else's note needs a different tier than prefs | Bloodfen (proposed) |
| 9 | How `rosterUpdatedAt` hears about availability changes in raids (the `absence-changed` event, or apps/api stamping it) | Modules only meet through contracts | Bloodfen (proposed) |
| 10 | Import the sheet's notes once by Discord handle; don't import the days | Old ticked days would mark raiders Absent | TJ (proposed) |

## Open questions

For TJ: rows 2 to 6 and 10.

For Bloodfen: rows 7 to 9.

## Tasks

- [ ] **Availability** (raids, web, ui-kit, apps/api): rename Weekly nights to Availability with
  Available, Late and Unavailable; remember an all-Available save (row 7); the Discord form
  title; the home page nudge. Job J75.
- [ ] **Roster note** (identity, web): the note field and command (row 8), the profile field,
  inline editing on `/roster`, officer edits, the manifest. Job J77.
- [ ] **Last updated** (identity, raids, apps/api): `rosterUpdatedAt` stamped on the member's own
  changes (row 9). Job J78.
- [ ] **Roster page** (web): Availability, note and Updated on the main's row, the Available on
  filter, the quarters' Not set and stale lists. Jobs J76 and J78.
- [ ] **Import** (apps/api): the one-time notes import with the unmatched list (row 10).
