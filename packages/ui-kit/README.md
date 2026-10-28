# @vintage/ui-kit

Vintage's web composites on FAST-AF (`@lushly-dev/fast-element`) and `@lushly-dev/violet-elements`,
both vendored in [`vendor/`](../../vendor/VENDORED.md). Primitives come from Violet; this package
holds the guild-specific pieces (PLAN §3.9).

| Element | What it is |
|---|---|
| `vintage-logo-header` | Sticky site header: the logo (slot), nav, a section context block with its action, the signed-in member (slot), actions, and a scroll-progress line |
| `vintage-tonight` | The officers' Tonight tab: the raid, counts, comp gaps, non-responders, and signups by role, with lock and unlock, group, bench, remove (preview, then confirm), and copy the addon import, each an `@command` |
| `vintage-raid-roster` | One raid for members, read-only: the counts by answer (`raid-get`), the comp and its gaps (`comp-suggest`), who is coming by role with their answer and note and, once locked, their group or the bench (`signup-list`), the queue in its own list, and who can't make it; the signed-in member's row marked (`me`). `signups-note` and `comp-note` say why in place of what the member's rank can't read |
| `vintage-officer-strip` | Leaders' and officers' glance at the next raid: who hasn't answered (`coordinator-status` → `waiting`), comp gaps (`comp-suggest`), the coordinator's state, and a link to the quarters once it exists |
| `vintage-character-list` | The member's characters, main first (a picked role marked "picked"), with Edit (emits `character-edit` for the page's form), Make main (`character-update`) and Remove (`character-remove`, the server's preview, then confirm) |
| `vintage-member-prefs` | The member's main character, time zone, and reminder DMs (`character-update`, `member-prefs-set`); emits `prefs-changed` |
| `vintage-member-menu` | The signed-in member: round avatar (Discord's, or the initial), name, rank, and a menu with Profile and Characters, plus anything slotted (the app adds Sign out) |
| `vintage-roster-wall` | Every member grouped by rank, each as their main's name in its class color with spec and role; the signed-in member's row marked. Fed from `member-list` |
| `vintage-roster-desk` | The officers' Roster tab: recruits longest on trial first (from `rankSince`, "before tracking began" without one), who has no character yet, everyone by rank with the date they got it, when Discord last synced (flagged once it's an hour old), and the Discord role → rank map. `vintage.guild-roles-review` (`can-configure`) asks the server for the preview; the confirm box then saves with its token |
| `vintage-poll-card` | A poll: pick one votes on a click; pick any and ranked collect a draft, then vote. Shares only when the server shows the tally (`results-hidden`), the winner once closed. `vintage.vote-cast` / `vintage.vote-retract` → server `vote-cast` / `vote-retract` |
| `vintage-recruiting-desk` | The officers’ Recruiting tab: the band’s headline, pitch, and a need and specs for each class. `vintage.recruiting-save` runs `recruiting-set`; read-only without `can-edit` |
| `vintage-coordinator-desk` | The officers' Random tab: whether the coordinator is running, paused, or not set up; per upcoming raid what it did, what is due, and who it is chasing; Random's log with the reason for each entry; and its settings. `vintage.coordinator-pause`, `vintage.coordinator-resume`, `vintage.coordinator-run`, `vintage.coordinator-repost` (`can-act`), `vintage.coordinator-config-save` (`can-configure`) |
| `vintage-progress-desk` | The officers' Progress tab: the boss ledger with a form beside it to record a kill (raid, boss defaulting to the next target, date and time in the viewer's zone, up to 12 drops with quality, a note), a summary of what will be recorded and whether it becomes the ledger entry, and the form closed until the raids unlock. `vintage.kill-record` (`can-record`) |
| `vintage-calendar-desk` | The officers' Calendar tab: raids as an agenda by day (or the month), the last month under Earlier, and the schedules. Times in the viewer's zone with the guild's clock beside them, overlap and clock-change notes. `vintage.raid-create`, `vintage.raid-reschedule`, `vintage.raid-complete`, `vintage.raid-cancel` (preview, then confirm), `vintage.schedule-materialize`, `vintage.schedule-active`; read-only without `can-edit` |
| `vintage-raid-month` | A month of raids as a plain table, placed by the viewer's zone; raids are buttons that raise `raid-selected`, dots under 32rem |
| `vintage-schedule-form`, `vintage-raid-form` | The calendar's forms: a schedule (only what changed on edit) and a one-off or moved raid, read in a chosen zone; raise `form-submit` with the command and input |
| `vintage-polls-desk` | The officers’ Polls tab: open polls with the live tally, closed ones with the result. `vintage.poll-open`, `vintage.poll-close` and `vintage.poll-cancel` (preview, then confirm), `vintage.poll-sweep` |
| `vintage-hero` | The home page opener: full-bleed art under a dark fade, with slots for eyebrow pills, the heading, a standfirst, actions, and figures; `compact` makes it a band for signed-in members (heading and figures only), `art-phone-src` a portrait for phones |
| `vintage-figure` | One big tabular number with a unit and caption; rows of them sit in the hero |
| `vintage-class-badge` / `vintage-role-badge` | Class (and spec) or raid role with its color token, from `@vintage/wow-data` |
| `vintage-character-form` | Name, class, spec, role ("Guess from spec (Tank)" or a pick), main; submits through the `vintage.character-add` command, or with `character` set edits it through `vintage.character-update` (only the changed fields; `role: null` guesses again) |
| `vintage-boss-ledger` | The progression ledger: one row per raid, one slot per boss. Killed slots are gold with a check and the first-kill date, the next target is dashed verdigris, closed rows say "unlocks Dec 9"; boss names show on hover/focus with a datamined note; a "first kill" card above names the latest kill with its loot in `--color-quality-*`. Fed from `progress-get` |
| `vintage-signup-card` | One raid: its counts (statuses from `raid-list`, roles from `signup-list`) and the member's own answer. Going / Late / Tentative / Can't run the `vintage.signup-set` command → server `signup-set` with the member's character. Switch character, Change spec and Role (`play-role`: a role for this raid only, or guess from the spec) change it for this raid. `lock-label` goes after the time ("signups lock Sat 6:00 PM EST"); `queue-position` (`signup-list`'s `queuePosition`) says where the member is in line when the raid is full |
| `vintage-sign-in-card` | What member pages show when signed out; with `available`, its button raises `sign-in-requested` and the app starts Discord sign-in (ui-kit never sees the auth client) |
| `vintage-theme-switch` | Dark / parchment switch (`data-theme` on `<html>`), also the `vintage.theme-toggle` command. Shown in the `/ui` gallery; the site header no longer carries it |

Times: `src/zoned.ts` (also `@vintage/ui-kit/zoned`, which registers no elements) has the DST-safe
wall-clock helpers (`zonedInstant`, `dayKey`, `offsetMinutes`, `instantFromInputs`); the website's
schedule wording uses them too.

## Rules

- **Tokens only.** Styles read `var(--…)` from `@vintage/design-tokens`; no literal colors, fonts,
  or spacing. Load `src/violet-bridge.css` after the token CSS so Violet's primitives follow the
  theme.
- **Data changes are `@command`s.** A component action that changes data is a FAST-AF `@command`
  (`vintage.<server-command>`) that calls the server command through `getCommandClient()` and
  returns its result. Reactive availability is a `<method>CanExecute` getter.
- **The client is a port.** `CommandClient` (`read` → `commands.read`, `run` → `commands.run`) is
  stubbed with `createStubClient()` (every call answers `NOT_CONNECTED`) until the Convex adapter
  lands; tests swap it with `setCommandClient`.
- **Every element is in the Custom Elements Manifest.** Give the class a `@tagname` JSDoc tag.
  `pnpm --filter @vintage/ui-kit build` writes `dist/custom-elements.json` (with each element's
  `commands`) and `scripts/check-cem.mjs` fails on a missing element or command. CI runs it.
- **Violet primitives are imported in one place** (`src/primitives.ts`): violet-elements has no
  per-component exports, so these are deep imports a FAST-AF re-sync may need to touch.
- **Branching getters are `@volatile`.** FAST records what a getter reads on its first run. A
  getter that returns early or short-circuits (`if (!this.raid) return`, `a && this.b`) must be
  `@volatile`, or a property it reads only on a later branch never updates the view. The Tonight
  count stuck at "0 / 40" when the signups arrived after the raid. Test the late-arrival order.

## Tests

Vitest with happy-dom. happy-dom has no `ElementInternals`, so `src/test-setup.ts` stubs the parts
Violet's form fields call. `src/test-helpers.ts` mounts an element and waits for FAST's updates.
