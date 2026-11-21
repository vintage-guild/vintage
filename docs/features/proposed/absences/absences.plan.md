# Absences: marking yourself absent before the raid is posted

**Status:** proposed (2026-11-20). Nothing built. TJ's product calls and Bloodfen's technical
calls are settled (PR #302 review, 2026-11-20). **Owner modules:** raids (absences),
coordinator (reminders, digest, card), apps/api (Discord), web (profile, home, quarters).
Research: [oxm.md](../../../research/oxm.md) idea 2.

Today a raider can only answer a raid once it's posted: Accept, Late, Tentative, Standby or
Decline. Someone who knows a month ahead that they're on a work trip, or who can never make
Wednesdays, has no way to say so. The bot keeps pinging them at T-72h, DMs them at T-24h, and
the officer digest lists them as "Not answered" every week. Officers can't see who's out until
the night is already close.

An absence is a member saying "I'm out from Dec 3 to Dec 7", "I can't raid on Wednesdays" or
"I'm always late on Thursdays", once, ahead of time. Every raid in that range shows them as
**Absent** by default, and they can override it for any raid by answering it. A single night
out needs no absence: the signup post's **Absent** button (today's Decline) covers it (TJ,
2026-11-20).

Internally the covered state is `away` so it doesn't collide with the signup status; everything
members and officers read says "Absent".

## Today

| Piece | Where | State |
|---|---|---|
| Per-raid answers (accepted, late, tentative, bench, declined) | raids `signup-set` | ✅ one signup per member per raid |
| Non-responders | coordinator `nonResponders` (`domain/plan.ts`) | ✅ expected ranks with no signup; pinged, DMed, and listed in the digest |
| DM opt-out | identity `prefs.dmOptOut`, site profile "Raid settings" | ✅ stops DMs for every raid, not some |
| The guild clock | apps/api `guildClock` (`discord-events.ts`) | ✅ the zone the site's calendar and the event form use |
| Date picker for the next 25 days | apps/api `discord-event-form.ts` | ✅ reusable for an absence form |
| Advance absences, weekly rules | — | ❌ none |

## How OXM does it

OXM has an Absence Calendar (sidebar calendar on the site, `/absence` in Discord, and an
Absence button on every signup post). Members drag-select days and pick Full, Late or Early with
a time and a reason. A **Weekly Availability** rule ("never Tuesdays") repeats until cleared,
and signing up on a rule day overrides it for that raid. Officers see a two-week timeline of
everyone's absences, can add or remove single dates for someone, and get a DM when a full
absence pulls a rostered player. Its auto-split skips absent players.

Its FAQ also shows the rough edges. A Full absence **deletes the member's signups** for those
days and **blocks signing up** until it's removed ("You have a full absence for this raid.
Remove it first to sign up."). Calendar absences and absences from a raid post behave
differently (one deletes signups, the other keeps them marked Absent). Three FAQ answers exist
only to explain that.

**What we take:** absences ahead of time, weekly rules, signup beats the rule, an officer view
of who's out. **What we leave:** absences that change or block signups, and two kinds of
absence that behave differently.

## Design

### 1. The model (raids)

A new `absences` table in the raids component. Two shapes:

```ts
interface Absence {
  id: string;
  guildId: string;
  memberId: string;
  kind: 'dates' | 'weekly';
  /** dates: guild-clock calendar days, inclusive, 'YYYY-MM-DD'. null for weekly. */
  from: string | null;
  to: string | null;
  /** weekly: one entry per weekday the rule covers. null for dates. */
  nights: WeeklyNight[] | null;
  /** The guild clock when it was added; coverage reads the raid's start in this zone. */
  timeZone: string;
  /** At most ABSENCE_REASON_MAX (200) characters; null for none. */
  reason: string | null;
  /** Who added it: the member, or a leader adding it for them. */
  createdBy: string;
  createdAt: number;
  /** When it was removed or replaced; null while active. Absences are never hard-deleted. */
  endedAt: number | null;
}

interface WeeklyNight {
  day: Weekday;
  type: 'away' | 'late';
  /** late: how late, as on the Late answer (signup-improvements §2). null for away. */
  lateMinutes: 5 | 15 | 30 | null;
}
```

**Coverage is computed, never stored.** `absenceCovers(absence, startsAt)` (pure, in
`domain/absence.ts`, exported through the contract) takes the raid's start, turns it into a
date and weekday in the absence's `timeZone`, and returns `away`, `{ late, lateMinutes }`, or
null. Date absences are always `away`. Late is 5, 15 or 30 minutes; anything later is away (TJ,
2026-11-20, [signup improvements](../signup-improvements/signup-improvements.plan.md) §2). A
raid that moves
(`raid-reschedule`) is re-checked on the next read. A raid starting at 12:30 AM belongs to the
date it starts on. Storing the zone on the absence keeps the answer fixed if the guild's
schedules change zone later.

**Only active absences cover raids** (`endedAt === null`). Removing an absence, or replacing a
weekly rule, sets `endedAt` instead of deleting the row, so the history stays for excused
attendance (row 12) and those checks stay pure (Bloodfen, 2026-11-20).

**When several cover one raid, away wins** (Bloodfen, 2026-11-20): a date absence or a weekly
absent night beats a weekly late night on the same raid.

A member has any number of date absences (at most `ABSENCE_OPEN_MAX`, 10, active and ending
today or later) and at most **one active weekly rule**, which can mix away and late nights.
Setting the weekly rule ends the old one and starts a new one; no nights ends it. Late is weekly only: a one-off late night is the Late
button on that raid's post, which is up a week ahead.

### 2. Commands (raids)

| Command | Tier | Does |
|---|---|---|
| `absence-add` | recruit | `{ from, to?, reason?, memberId? }`. `to` defaults to `from`. Returns the absence and `stillSignedUp`: covered raids where they have a signup that isn't declined |
| `absence-weekly-set` | recruit | `{ nights, reason?, memberId? }`. Replaces their weekly rule; `[]` clears it. Returns `stillSignedUp` as `absence-add` does, plus late nights they answered as accepted |
| `absence-remove` | recruit | `{ absenceId }`. Their own; a leader can remove anyone's |
| `absence-list` | recruit | `{ memberId?, eventId? }`. No filter: their own. `eventId`: everyone away or late by rule for that raid, names for all, reasons for leaders only. `memberId` for someone else: leaders only |

- `memberId` for someone else needs tier `leader`, the same rule as signing up someone else's
  character. `createdBy` records who did it.
- Refusals: `ABSENCE_IN_PAST` (`from` before today in the guild clock), `ABSENCE_TOO_LONG` (more
  than 60 days in one absence), `ABSENCE_TOO_FAR` (`from` more than 180 days out),
  `TOO_MANY_ABSENCES`, `ABSENCE_NOT_FOUND` (also for someone else's absence when the caller
  isn't a leader, so members can't probe), `INVALID_DATE`, `LATE_MINUTES_REQUIRED` (a late
  night with no `lateMinutes`), `DUPLICATE_NIGHT` (the same weekday twice).
- **Reasons are for officers.** Every read that carries another member's absence leaves
  `reason` out unless the caller is a leader. Members always see their own.
- None are destructive. Removing an absence ends it (`endedAt`); adding it again undoes that,
  and nothing else changes when one ends.
- Events: `absence-changed` on add, weekly-set and remove. Nothing subscribes yet; the
  coordinator reads absences on each tick, as it reads signups.
- The guild clock moves from apps/api into raids (`domain/clock.ts`: the first active
  schedule's zone, else the first schedule's, else New York) as a shared pure resolver that
  apps/api and apps/web both call (Bloodfen, 2026-11-20). Commands need it to read "today" and
  stamp `timeZone`.

### 3. Absent by default, overridden by answering

An absence never writes a signup. A raid it covers shows the member as **Absent** until they
answer it, and any answer overrides the absence for that raid (TJ, 2026-11-20).

- **Answering overrides it for that raid.** Absent every Wednesday and pressing Accept on this
  Wednesday works with no prompt, and that raid treats them as answered. The absence stays for
  every other night it covers.
- **Adding an absence over raids you're already signed up for changes nothing.** The reply
  lists those raids and offers **Mark absent** (runs `signup-set declined` for each, no note,
  so no reason shows on the post). It's their choice, as decided earlier (TJ, 2026-11-20).
- **Removing an absence changes nothing either.** They're just a non-responder again for raids
  they hadn't answered.

**Late nights work at the moment they answer**, and only then:

- Pressing **Accept** on a raid their rule makes late signs them up as `late` with the rule's
  `lateMinutes`. It's their answer, given with what they told the bot. The private reply
  says so and has an **On time this week** button, which switches the signup to accepted.
- Pressing **Late** shows the usual 5, 15 and 30 minute buttons, with the rule's minutes marked
  "usual".
- Answering Tentative, Standby or Absent ignores the rule.
- The post shows the late clock with the minutes, like any late answer. Late nights need no
  reason (signup improvements, row 31); the rule's reason field is for its absent nights and
  stays officer-only.
- Adding a late night over raids they already accepted changes nothing. The reply offers
  **Mark late** for those raids, as it offers Mark absent for absent days.
- Late nights don't stop reminders. They still haven't answered.
- On the site, the home card's Accept does the same and shows the same On time this week
  control.

### 4. What the bot does with it (coordinator)

The tick source (`apps/api/src/tick-source.ts`) reads the guild's absences once per tick and
gives each `TickEvent` its `away` list (members with no signup for that raid and an absence
that covers it as away, each with the reason) and its `usuallyLate` list (members with no
signup whose weekly rule makes that raid a late night).

| Where | Change |
|---|---|
| `nonResponders` | Leaves out anyone in `away`. No channel ping and no DM for that raid |
| Digest | A line after "Not answered": `Absent (2): Cade (work trip), Dara`. Non-responders with a late night get "(usually 15m late)" after their name. The digest goes to the leads channel (officers and raid leaders, [signup improvements](../signup-improvements/signup-improvements.plan.md) §4), so reasons show |
| Card | The status line's "out" count becomes "absent" and counts both the Absent answers and the members an absence covers. No new line and no names, so the card's height and limits don't change |
| Roster reply | One **Absent** section (today's Declined) with both, names only. Anyone absent makes the Roster button show, as a decline does today (J15's rule) |
| Weekly assessment | No change. It reads role gaps from signups |

A member away for a raid who signs up drops out of `away` on the next tick, so the card and
digest follow the signup.

Absences cover guild raids only. Open raids (pugs welcome, [signup
improvements](../signup-improvements/signup-improvements.plan.md) §3a) expect nobody and send no
reminders, so nobody shows as absent there (TJ, 2026-11-20).

### 5. Discord

A new `/random absence` group, forwarded like `character` and `event`. Every reply is private.
One night out is the signup post's **Absent** button; this group is for date ranges and weekly
nights.

| Subcommand | Runs | Notes |
|---|---|---|
| `absence add [from] [to] [reason] [member]` | `absence-add` | With no `from`, opens the **Absence** form: From and To pick from the next 25 days in the guild clock (the event form's date list), and a Reason field. `member` is for leaders only |
| `absence weekly` | `absence-weekly-set` | Opens a form with **Absent nights** and **Late nights** (weekday selects, current days picked), **How late** (5, 15 or 30 minutes), and Reason. One How late covers every late night from Discord; the site sets one per night. A day in both selects is refused. Nothing picked clears the rule |
| `absence list` | `absence-list` | Their own, upcoming first |
| `absence remove [absence]` | `absence-remove` | Autocomplete from their own upcoming absences |

The reply to the post's **Absent** button gets an **Absent more days** button that opens the
same form, for the raider who'll be gone for a while.

Copy (UI copy mode; one plain sentence each):

- Added: "You're absent Wed, Dec 3 to Sun, Dec 7. Answer any of those raids to change it."
- Added over existing signups: "You're still signed up for Raid night · Molten Core on Wed, Dec
  3." with **Mark absent** (or **Mark all 2 absent**).
- Weekly set: "You're absent Wednesdays and 15 minutes late Thursdays. Answer any of those raids
  to change it."
- Weekly cleared: "No weekly nights set."
- Accept on a late night: "Late for Raid night · Molten Core as **Bram**, 15 minutes, like most
  Thursdays." with **On time this week**.
- Added late nights over accepted raids: "You're on time for Raid night · Molten Core on Thu,
  Dec 4." with **Mark late**.
- List row: "Dec 3 to Dec 7 · work trip". Weekly rows: "Absent Wednesdays", "15m late
  Thursdays".
- `DUPLICATE_NIGHT`: "Pick Wednesday as absent or late, not both."
- Removed: "Removed Dec 3 to Dec 7."
- `ABSENCE_IN_PAST`: "That date has passed."
- `ABSENCE_TOO_LONG`: "Keep it to 60 days. Add another for the rest."
- `ABSENCE_TOO_FAR`: "Pick a date in the next 6 months."
- `TOO_MANY_ABSENCES`: "You have 10 already. Remove one first."

### 6. The site

- **Profile, Raid settings:** an **Absences** calendar. Pick a start and end date on it, add a
  reason, and save. One click on a single day makes a one-day absence, for a single night out
  before that raid is posted (TJ, 2026-11-20). Days already marked are shaded, with each absence listed under the calendar
  with Remove. Then **Weekly nights**: a row per weekday with On time, Late (5, 15 or 30
  minutes) or Absent, and a Save button. No intro text.
- **Home, Your next raid:** when an absence covers it and they haven't answered, the card shows
  **Absent** pressed, with the reason under it. Pressing another answer overrides it for that
  raid.
- **Quarters, Calendar tab (leaders):** each raid night shows "N absent · N usually late",
  expanding to names, minutes late and reasons. An **Absent** list under the agenda shows
  everyone's absences for the next 14 days, and leaders can add one for a member there.

### 7. The agent

`/random ask "I'm out Dec 3 to 10"` and "I can't do Wednesdays anymore" route to
`absence-add` and `absence-weekly-set` once they're in the agent's tools.

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands.

- **J50 · Mark myself absent before the raids are up.** Cade picks Dec 3 to Dec 7 on the
  Absences calendar with "work trip". The Wednesday and Thursday raids get posted later: he
  shows as absent on both (the card's absent count and Roster's Absent section), no T-72h ping,
  no T-30h DM, and the digest has "Absent (1): Cade (work trip)".
- **J51 · A night I can never make.** Dara sets Wednesday as absent with `/random absence
  weekly`. Every Wednesday raid shows her absent and leaves her alone; Thursdays still remind
  her. She clears it and the next Wednesday reminds her again.
- **J52 · I can make it after all.** Dara (absent Wednesdays) presses Accept on this
  Wednesday's post. It works with no prompt, she shows under her role, and the digest doesn't
  list her as absent. Next Wednesday still shows her absent.
- **J53 · Absent after I've signed up.** Aeryn accepted Wednesday and Thursday, then adds Dec 3
  to Dec 7. The reply says she's still signed up for both and offers **Mark all 2 absent**.
  Without pressing it, both signups stay as they were. Pressing it marks both absent with no
  note.
- **J54 · An officer marks someone absent.** Bram tells Ana in a DM he's out next week. Ana runs
  `/random absence add member:Bram`. Bram's absence shows on his profile, `createdBy` is Ana,
  and a raider trying the same `member` option gets "needs the Raid Leader rank".
- **J55 · Leaders see who's out.** On the quarters' Calendar tab Rook sees "2 absent" on
  Wednesday with names and reasons. A raider calling `absence-list` with that `eventId` gets the
  names without reasons.
- **J56 · Always late on Thursdays.** Bram sets Thursday as 15 minutes late, no reason asked.
  The Thursday raid still reminds him. He presses Accept: the reply says Late, 15 minutes, and
  the post shows the 15-minute clock after his name. **On time this week** makes him accepted.
  The How late choices stop at 30 minutes; later than that, he sets Thursday as absent.
- **J57 · One night out from the post.** Pip presses **Absent** on Friday's signup post. He
  shows as absent on that raid only; no absence is saved. The reply's **Absent more days** opens
  the Absences form.

## Decisions

TJ (guild master) decides how the feature behaves; Bloodfen (technical SME) reviews the
technical calls. Rows marked "TJ, 2026-11-20" are decided; the rest are proposed.

| # | Decision | Why | Owner |
|---|---|---|---|
| 1 | Absences live in raids, not identity prefs | They're about raid nights and read alongside signups and schedules. Prefs stay for settings that apply to every raid | Bloodfen, 2026-11-20 |
| 2 | Absences never create, change or block signups. A covered raid shows the member as Absent until they answer, and answering overrides it for that raid | One source of truth per raid (the signup). OXM's deleting and blocking needed three FAQ answers to explain | TJ, 2026-11-20 |
| 3 | Coverage is computed from the raid's start, never stored per raid | Moved and newly posted raids are right without a sync step | Bloodfen, 2026-11-20 |
| 4 | Store the time zone on each absence, and move the guild clock into raids as a shared resolver for apps/api and apps/web | Dates and weekdays mean the guild's days; if the guild's schedules change zone, old absences keep meaning the days they were set for | Bloodfen, 2026-11-20 |
| 5 | One weekly rule per member, replaced as a whole | A set of weekdays is one setting. Several rules would need ordering and merging | TJ |
| 6 | No skip-one-week action for weekly rules | Signing up already does that, and it says more than a skip would | TJ |
| 7 | Covered members count in the card's absent number, names only in Roster's Absent section | Keeps the card's size and Discord limits as they are | TJ |
| 8 | Absence reasons are visible to officers and leaders only | Reasons like "hospital" are personal. Tentative reasons stay public on the post; late answers carry no reason (signup improvements, row 31) | TJ, 2026-11-20 |
| 9 | Late nights ship in the first version | Being late every Thursday is as common as missing Wednesdays | TJ, 2026-11-20 |
| 10 | A late night shapes the answer when they press Accept or Late; it never answers for them | Keeps decision 2 true. On time this week is one click | TJ |
| 11 | Late is weekly only, and leaving early isn't covered | A one-off late night is the Late button on a post that's up a week ahead. No one has asked for leaving early | TJ |
| 12 | An absent night counts as excused for attendance when the absence was added before signups locked | Members who told the guild ahead of time shouldn't lose attendance. Applies when attendance percentages are built (raid-helper.md idea 7); absences are kept after they end for this | TJ, 2026-11-20 |
| 13 | Recruits can add absences, the same tier as signing up | They aren't pinged today (`expectedRanks`), but officers still want to know when they're out | TJ, 2026-11-20 |
| 14 | Date ranges are picked on a calendar on the site; one night out is the post's Absent button (today's Decline), not an absence | Matches how raiders think about it: a stretch of days, or just tonight | TJ, 2026-11-20 |
| 15 | Members read "Absent" everywhere: the post's button and count, Roster, digest, `/random absence` | One word for being out, whether it's one night or a week | TJ, 2026-11-20 |
| 16 | Absences are soft-closed with `endedAt`, never deleted; only active ones cover raids | Keeps the proof that excused attendance (row 12) needs | Bloodfen, 2026-11-20 |
| 17 | When absences overlap on one raid, away beats a weekly late night | One clear answer per raid | Bloodfen, 2026-11-20 |
| 18 | The site calendar takes a one-click single day | A single night weeks ahead, before its raid is posted | TJ, 2026-11-20 |

## Open questions

None open.

## Tasks

- [ ] **Model and commands** (raids): `absences` table with `endedAt` and `by_guild_member` and
  `by_guild` indexes, `domain/absence.ts` (`absenceCovers`, active only, away beating late),
  `domain/clock.ts` (the guild clock as a shared resolver, used by apps/api and apps/web), the
  four commands with soft-close on remove and replace, the memory store, `absence-changed`, and
  the manifest.
- [ ] **The bot stops chasing** (apps/api tick source, coordinator): `away` and `usuallyLate` on
  `TickEvent`, `nonResponders`, the digest lines, the card's absent count, the Roster reply's
  Absent section.
- [ ] **Late nights on answer** (apps/api `discord-signups.ts`, web signup card): Accept as late
  with the rule's minutes, On time this week, the usual minutes marked on the Late buttons,
  Mark late.
- [ ] **Discord** (gateway, apps/api): the `/random absence` group, the Absence and weekly forms,
  autocomplete for `remove`, Absent more days on the Absent reply, and the Mark absent button.
  The Decline button's label becomes Absent (status stays `declined`).
- [ ] **Site** (web, ui-kit): the Absences calendar and Weekly nights on the profile, Absent on
  the home card, the quarters' absent and late counts and list.
- [ ] **Jobs** J50–J57 in `raid-night.md` and the scenario test.
- [ ] **The agent** (§7): the absence commands in the agent's tools.
