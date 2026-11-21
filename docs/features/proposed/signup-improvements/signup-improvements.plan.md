# Signup improvements: the card, standby, late minutes, change alerts, other roles

**Status:** proposed (2026-11-20). Nothing built. TJ's product calls and Bloodfen's technical
calls are settled (PR #302 review, 2026-11-20), except row 8 (proposed) and the bot's name.
**Owner modules:** coordinator (card, final roster, alerts), raids (signups, seats), identity
(characters), guild-kit (tiers), apps/api (Discord), web.
Research: [oxm.md](../../../research/oxm.md), [raid-helper.md](../../../research/raid-helper.md).

TJ (guild master) reviewed today's signup card next to OXM's and decided the direction below on
2026-11-20. Bloodfen (technical SME) made the technical calls in his review of PR #302.

## What today's card gets wrong

Rendered with a realistic 32-person Molten Core night (the real `renderSignupPost` and
`renderFinalRoster`, drawn as Discord shows embeds):

1. **Most of the raid is hidden.** Each role column stops at 8 names (`COLUMN_CAP`), so the DPS
   column shows 8 of 20 and "+12 more…". No mage, warlock or hunter appears. The final roster
   stops at 15 and hides 9 people, on the post people read to see if they're in.
2. **The Missing line disagrees with the headers.** Healers reads 8/10 while Missing reads "1
   healer". The headers count people going; the comp behind Missing also counts tentative and
   standby as coming. Nothing says so.
3. **The class and spec icons we uploaded aren't used.** Every line is a class-colored square
   plus the spec as italic text ("Frostwyn *frost*"), which wraps in Discord's narrow columns.
4. **Reasons sit in the footer** as one run-on line, away from the names.
5. **Place numbers on every name** (1 to 20) add width and only matter when the raid is full.
6. **Tentative and standby people are seated at lock without being told** (`finalRoster` takes
   the comp's selection when no leader has rostered anyone).
7. **Likely bug:** with nobody benched, the final roster's "Benched" field is an empty string
   (`modules/coordinator/src/domain/card.ts`). Discord refuses an empty field value, so that
   post would fail and retry every tick. The card tests check only the description there.

OXM's signup post shows everyone: tanks and healers by role, DPS by class under class
headers, a spec icon on every name. Its final roster is laid out by raid group.

## Design

### 0. Fix first

`embed()` in discord-kit replaces an empty field value with "—", with a test, and the final
roster stops sending an empty field. Small enough to land before anything below.

### 1. The card

Decided: while signups are open, four role columns with everyone shown (TJ, 2026-11-20).
Parties come later, at T-24h (§1a).

- **Four role columns:** Tanks and Healers on the first row, Melee and Ranged on the second.
  Discord fits three inline fields per row, so each row ends with an empty inline field to keep
  it to two. The mock used 9 fields and 3,236 characters for 32 people.
- **Headers** read "Melee 7/10": the count going and the role's target when the raid has one,
  otherwise just "Melee 7" (§1b). A count past its target just reads "12/10", with no warning.
- **Within a column**, people sort by class, then name, so classes cluster and the spec icons
  show the mix.
- **Header icons:** Melee and Ranged need outline icons (`head_melee`, `head_ranged`) to match
  `head_tank` and `head_healer`. The filled `role_melee` and `role_ranged` look out of place.
- **Every name** shows its spec icon (`spec_<class>_<spec>`, falling back to the class square
  when an icon is missing) and no spec text.
- **Late** shows how late (§2) after the name.
- **Recruits** get one small mark after the name: a new emoji named `recruit`, our own art (a
  small sprout in the verdigris token), the size of the status icons. Discord shows an emoji's
  name on hover and tap, so it explains itself with no legend. It appears wherever a name does:
  the signup post, party post, Roster reply and leads alerts. The site uses the same sprout,
  labelled "Recruit" for screen readers and on hover.
- **No place numbers** anywhere. Signups aren't first-come (§3), so there's no place in line to
  show.
- **Tentative** and **Standby** (§3) are one line each under the columns.
- **Absent** replaces Decline on the answer buttons and "out" in the status line, and counts
  members an absence covers too ([absences plan](../absences/absences.plan.md) §4; TJ,
  2026-11-20).
- **No Notes field, and no footer.** Only tentative people give a reason (TJ, 2026-11-20), and
  it sits after their name on the Tentative line: "Tentative · Pip (depends on work) ·
  Cadence". Late and Standby carry no reason.
- **Missing** counts only people going, matching the headers. When tentative or Standby would
  change it, a subtext line says by how much: "-# 1 healer and 2 ranged if tentative and
  standby come" (TJ, 2026-11-20). It shows on the signup post even when every seat is filled,
  and never on the party post or final roster (TJ, 2026-11-20). `comp-solver` gets a going-only
  mode for the main line, next to today's going + tentative + standby mode for the subtext.
- **Second row of buttons:** **Raid page** always shows; **Roster** joins it when the card
  leaves anyone out or anyone is absent.
- **Limits by characters, not just names** (Bloodfen). A line can run 60 to 125 characters
  (spec emoji about 45, late and recruit emoji about 30 each, Forever first and last names), so
  a column can reach Discord's 1,024 characters per field before 20 names. Each column and the
  Tentative and Standby lines add whole lines until the next would pass the budget, then end
  with "+N more…" and rely on the Roster button. Today's `value()` cuts at 1,024 characters and
  can split an emoji mid-token; that goes. The limits test uses a 40-person raid with long
  first and last names, late and recruit marks, and a tentative reason on everyone, against
  1,024 per field, 6,000 per embed and 25 fields.

The private reply to an answer is at Discord's limit of 5 action rows: Switch character, Change
spec, Role, Can also play (§5) and On time this week (absences plan §3). Anything new there has
to replace something (Bloodfen).

### 1a. Parties at T-24h, approved by leads

Decided: the bot drafts the parties, raid leaders and officers adjust and approve them, and
only then does the party post go to the signup channel (TJ, 2026-11-20). Raids only: dungeons,
battlegrounds and other events get no party draft or approval (TJ, 2026-11-20).

- **The draft:** at the digest (T-24h, §1c), the leads channel gets the seated roster laid
  out as Group 1 to 8, with **Approve and post**, **Edit in the quarters** (a link to the raid's
  roster desk) and **Redraft**. Empty seats show as open in their group.
- **How it drafts: to be solved later** (TJ, 2026-11-20). WoW Forever changed buffs: some are
  raid-wide now and some are still party-only, so the group rules need their own look (see
  Later). Until then the draft only places one tank and one healer per group where there are
  enough, fills the rest by role, and leaves the arranging to leaders. Groups a leader already
  set with `roster-move` are kept.
- **Live draft** (TJ, 2026-11-20): while it waits for approval, the leads draft is edited in
  place as leaders move people on the site or with `roster-move`, so it never looks stale.
- **Approving:** **Approve and post** on the leads draft or on the quarters' roster desk. Any
  raid leader or officer can approve; one approval is enough. `RaidEvent` records
  `rosterApprovedAt` and `rosterApprovedBy`, the line between the bot's draft and the leaders'
  roster (Bloodfen).
- **After approval:** the party post goes to the signup channel as its own message, laid out
  like OXM's (Group 1 to 8, spec icons, the late clock), with Standby under it. The signup post
  above it keeps its four role columns and answer buttons until lock. Later moves or dropouts
  edit the party post in place, showing an open seat where someone dropped.
- **At lock, one post** (TJ, 2026-11-20): the approved party post becomes the final roster,
  edited in place with the locked header and color and the Standby mentions, and keeps updating
  on leaders' changes until the raid starts. A separate final roster posts at lock only when
  nobody approved the parties; it shows the four role columns, and the leads channel is told
  once that groups weren't approved.

### 1b. Role targets: tank, healer, melee, ranged

Decided: melee and ranged get their own targets, and targets are suggestions a raid can go over
(TJ, 2026-11-20).

- **`roleTargets`** becomes `{ tank, healer, melee, ranged }` on raids and schedules, set in the
  event form, `/random event create`, and the quarters, with `tank + healer + melee + ranged`
  at most the size. It lives in three Convex tables (`raids` schedules and raid events,
  `coordinator` raid nights); each accepts the old and new shapes while they migrate
  (Bloodfen).
- **Default targets per size: to be solved later** (TJ, 2026-11-20; see Later). Until then the
  kind's defaults keep today's tank, healer and DPS numbers. A raid with only a DPS target
  (the defaults, and every raid saved before this change) shows plain counts ("Melee 7",
  "Ranged 13") and uses the DPS target for Missing. A raid whose leader sets melee and ranged
  targets shows them ("Melee 7/10").
- **Suggestions, not caps:** headers show "12/10" past a target; Missing lists only roles under
  their target; nobody is refused for being over. While the raid has room, nobody goes to
  Standby for being over a target either. Only when more answer than the raid holds does the
  draft use the targets to choose who sits (§3), and leaders can change that.

### 1c. Reminder timing

Decided: the last reminder moves from T-24h to T-30h, so answers are in before raid leaders
decide at T-24h (TJ, 2026-11-20).

| When | What | Where |
|---|---|---|
| T-72h | Reminder, pinging guild raid non-responders | Signup channel |
| T-30h | Last reminder, and the DM to non-responders who allow DMs | Signup channel, DM |
| T-24h | Digest and party draft (§1a); from here every seat and Standby change goes to leads straight away (§4) | Leads channel |
| T-2h | Lock; the approved party post becomes the final roster (§1a) | Signup and leads channels |

- **The digest stops following the last reminder.** Today it goes out at the smallest
  `reminderHours`; it gets its own `digestHours` so the reminder can move without dragging it
  along. `digestHours` is optional in Convex and reads as 24 when missing, and must be at least
  `lockHours` (Bloodfen).
- `DEFAULT_TIMINGS.reminderHours` becomes `[72, 30]`. Schedules saved with `[72, 24]` move to
  `[72, 30]` in a one-time migration, not in the mapper; any other custom offsets stay as they
  are (Bloodfen).

### 2. How late

Decided: Late means 5, 15 or 30 minutes late; more than 30 is absent (TJ, 2026-11-20).

- **Late asks only how late, no reason** (TJ, 2026-11-20). Pressing Late gets a private reply
  with three buttons, **5 min**, **15 min** and **30 min**, and the line "Later than 30
  minutes? Press Absent instead." One click signs them up. Today's late reason form goes away;
  Tentative keeps its reason form.
- The signup stores `lateMinutes: 5 | 15 | 30 | null` (`signup-set late` requires it; older
  late signups read as null and show the plain clock).
- A Flex Raider pressing Late on a guild raid picks the minutes as usual and lands on Standby
  with them, so leads see how late before seating them (TJ, 2026-11-20).
- New emoji `late_5`, `late_15`, `late_30`: the existing clock with the number, built by
  `scripts/build-emoji-art.mjs` and uploaded with `scripts/discord-emojis.mjs` (a human step
  with the app token).
- The digest reads "Late (2): Lightwarden 15m, Stormfist 5m".
- Absences' weekly late nights use the same 5/15/30 instead of an arrival time
  ([absences plan](../absences/absences.plan.md)).

### 3. Standby, and seats are the leaders' call

Decided: "Benched" becomes **Standby**, the same word as the button, so there's one name for
everyone waiting to fill a seat. Who takes an open seat, and whether empty seats get
filled at lock, is the raid leaders' and officers' decision, because it depends on the comp and
the gap (TJ, 2026-11-20).

Also decided: signups are never first-come. The raid is filled by the ideal composition (TJ,
2026-11-20).

This reverses three things built today:

- **First-come order and the place in line (J05, J14).** Answering early no longer earns a seat,
  so there's no place to keep or lose when someone changes their answer. `signedUpAt` stays as
  a record only.
- **The queue and its auto-promotion (J13).** A seat that opens no longer goes to the next person
  in line. It stays open until a leader fills it. Signups stop being marked `queued`.
- **Seating tentative and standby people at lock.** `finalRoster` stops using the comp's
  selection to fill seats. Only people seated are on the final roster.

How it works:

- **Who's seated before any leader acts:** raiders, recruits and above who answer going (in an
  open raid, everyone who answers going, §3a). When more answer than the raid holds, the bot's
  draft seats the ideal comp among them (`comp-solver`: role targets, buffs, then rank), never
  answer order, and the rest go to Standby. Until leaders approve at T-24h (§1a), the draft can
  change as answers come in; after that, only leaders change seats, and new answers go to
  Standby. Recruits are seated like raiders and carry the recruit mark (§1) (TJ, 2026-11-20).
- **Other event kinds** (dungeons, battlegrounds, other): the same comp-based seating; anyone
  past the size goes to Standby and the leader picks (TJ, 2026-11-20). A 5-player dungeon's
  sixth answer is on Standby.
- **Standby** is everyone else who could play: raiders and recruits the comp left out, people
  who press Standby, and everyone with a Standby-only rank. It's ordered by rank: Raiders,
  Recruits, Flex Raiders, Members, then Friends (TJ, 2026-11-20). Within a rank, people the comp
  needs most come first. Leaders seat whoever fits the comp.
- **Rank order:** `RANK_PRIORITY` puts Recruit above Flex Raider for seating and Standby only.
  The guild's rank list in identity (`GUILD_RANKS`) doesn't change (TJ, 2026-11-20).
- **Why am I on Standby?** (TJ, 2026-11-20): the private reply and the site's signup card tell
  the person why, using the reason `comp-solver` already writes on each bench decision
  ("melee slots full (10/10)", "raid full (40/40)", "Flex Raiders start on Standby for guild
  raids"). Only they see it.
- **Who can answer depends on the kind of raid** (§3a). In a guild raid, Flex Raiders only go on
  Standby, and Members and Friends can't sign up, as today. In an open raid, everyone with a
  character signs up in full (TJ, 2026-11-20).
- **Standby-only in guild raids:** on Discord everyone sees the same buttons, so a Flex Raider
  pressing Accept, Late or Tentative goes on Standby, and the private reply says so: "You're on
  standby for Raid night · Molten Core. A raid leader will seat you if a spot opens." Absent
  still takes them off. On the site, the signup card shows them Standby only, and Leave standby
  once they're on it. This is a seating rule in raids, not a permission: Flex Raiders stay at
  the `raider` tier (Bloodfen).
- **Friends** get their own tier, `friend`, between `public` and `member`:
  `['public', 'friend', 'member', 'recruit', 'raider', 'leader', 'officer']` (Bloodfen). They
  can add characters and sign up for open raids. `signup-set` opens at the `friend` tier and
  requires `recruit` when the raid's `access` is `guild`.
- **Who sees what** (TJ, 2026-11-20): Members see guild raids but can't sign up for them.
  Friends see only open raids: guild raids are left out of `raid-list`, `raid-get` and
  `signup-list` for them.
- **A new Friend on raid night** (TJ, 2026-11-20): someone who just got the Friend role and
  presses Accept before the 15-minute role sync runs is synced right then from the roles Discord
  sends with the click, instead of hearing "I don't know you yet", like the site's
  `member-refresh`.
- **Seating:** leaders seat anyone from Standby with one click from the alert (§4), the
  quarters, or `roster-move`. They can also swap a seated person onto Standby. The bot mentions
  the person once in the signup channel: "You're in for Raid night · Molten Core."
- **At lock:** the final roster (§1a) lists who's seated, then Standby, then open seats. The
  leads channel gets the same suggestions as a dropout alert for each open seat. Everyone on
  Standby is mentioned once: "You're on standby tonight. Stay close in case a seat opens."
- **Words:** "Benched" on posts, replies, the digest and the site becomes "Standby" (TJ,
  2026-11-20). The Standby button is one way in; being left out of the comp and having a
  Standby-only rank are the others. Internal names (`status: 'bench' | 'declined'`,
  `roster: 'benched'`, `benchReason`) stay as they are, to keep the v1 `bridge-format` and the
  addon compatible and avoid a data migration (Bloodfen).

### 3a. Guild raids and open raids

Decided: a raid is either a **guild raid** (usually recurring, the guild's own nights) or an
**open raid** (off-nights, pugs welcome), and they post in different channels (TJ, 2026-11-20).

| | Guild raid | Open raid |
|---|---|---|
| Who signs up in full | Raiders, Recruits and above | Everyone with a character: Raiders, Recruits, Flex Raiders, Members, Friends |
| Flex Raiders | Standby only | Full signup |
| Members | See it, can't sign up ("needs the Recruit rank") | Full signup |
| Friends | Don't see it | Full signup |
| Signup channel | The guild signup channel | A separate open-raid channel |
| Reminders and DMs | T-72h ping and T-30h DM to non-responders | None. Nobody is expected; leaders can ping a role themselves |
| Absences | Cover it (absences plan) | Don't apply |
| Seating, Standby order, parties, leads alerts | Same rules for both: comp draft, Standby ordered Raiders, Recruits, Flex Raiders, Members, Friends, T-24h party draft for leads | Same |

- **`access: 'guild' | 'open'`** on schedules, raids and raid-night polls (`RaidNight`),
  `guild` by default. The New event form and `/random event create` get an **Open to pugs**
  choice; the quarters' Calendar tab shows and edits it. A schedule's raids copy it, so a
  recurring open night is possible too.
- **Routing by `access`:** the signup post, party post, final roster, seat mentions and the raid
  summary all go to the raid's channel (Bloodfen).
- **The open channel** is a human step: create it, give the bot View Channel and Send Messages,
  then `coordinator-config-set openSignupChannelId`. Without it, open raids post in the guild
  signup channel.

### 4. Change alerts and the leads channel

Decided: a new channel for officers and raid leaders, and it gets everything a raid lead needs
(TJ, 2026-11-20). Once the T-24h digest is out, seat and Standby changes go there straight away,
new signups included (TJ, 2026-11-20). Raids only (TJ, 2026-11-20).

- **The channel** is a human step: create it in the Vintage server (officers and raid leaders
  only), give the bot View Channel and Send Messages, then `coordinator-config-set
  leadsChannelId`. The digest, the party draft (§1a), change alerts, seat suggestions and the
  addon import string at lock go there. `#vintage-ops` keeps errors and admin notices. Without
  a leads channel, these fall back to the ops channel.
- **What counts as a change**, from the digest until the raid starts:
  - a new signup, whatever the answer, and whether it lands seated or on Standby
  - an answer changing (Accept, Late, Tentative, Standby, Absent), and a new How late
  - a switch of character, spec or role, and a new tentative reason
  - an absence added or removed that covers the raid (absences plan)
  - a leader seating someone or moving them to Standby, with who did it
- **Not a change:** moving someone between party groups (TJ, 2026-11-20). Before approval the
  live draft shows group moves (§1a); after it, the party post does.
- **How it's found** (Bloodfen): a new `announcedState` table in coordinator, keyed by
  `(guildId, eventId, memberId)` and seeded when the digest runs, holds what the leads channel
  was last told about each person. Each tick compares the signups and absences with it and posts
  the difference, which also catches removed absences and `roster-remove`. Every post is claimed
  before sending, like every other rule.
- **Who did it:** `Signup` gets `updatedBy`, and `roster-move` and `roster-bench` bump
  `updatedAt` and `updatedBy` (neither bumps `updatedAt` today) (Bloodfen).
- **Straight away, batched:** every signup change runs a tick (the Discord buttons already do;
  site answers, absence commands and quarters moves will too). Ticks from `commands:run` are
  coalesced over about 10 to 15 seconds, so a leader moving ten people on the site sends one
  post, not ten (Bloodfen). Changes from the same tick go in one message, one line each.
- **The lines** (UI copy mode):

  > **Kestrel** signed up (Friend): Holy Priest, on Standby.
  > **Gorrak** is now Late, 15 minutes.
  > **Pip** is now Tentative: depends on work.
  > **Moonglade** switched to Grovewyn (Restoration Druid, healer).
  > **Cade** marked absent Dec 3 to Dec 7.
  > **Rook** seated Ironhide.

- **A seated person dropping** gets its own post with suggestions:

  > **Aeryn** dropped out of Raid night · Molten Core (Wed 8:00 PM). Tanks 3/4 now.
  > -# family thing (an absence's reason, when there is one; leads can see it)
  > Standby who could tank: Ironhide (flex raider), Moonglade (can also tank).
  > Already seated who can tank: Thorgrim.
  > [Seat Ironhide] [Seat Moonglade]

- **Seat buttons** (Bloodfen): up to four, for people on Standby only, from the comp's view of
  who fills the gap best. Seated people who could cover the role are listed as text, so a click
  never opens a hole somewhere else. A button seats the person in the group the dropout left,
  not a new one. Someone suggested through "can also play" (§5) is seated in that role: the
  click sets their signup's role and the mention says it ("You're in for Molten Core as
  **tank**"). A button runs as the leader who clicks it; anyone below raid leader gets "needs
  the Raid Leader rank". A second click after the seat is taken says who took it, and the seat
  shows in the feed as "**Rook** seated Ironhide".

### 5. Other roles I can play

Decided: saved on the character, changeable for one raid (TJ, 2026-11-20).

- **Characters** get `alsoRoles: Role[]`, limited to the roles the class can play (a mage has
  none to add; a druid can add all three others). Set on the Characters page and with `/random
  character add … also:`. PR #301 added `secondaryRole` on characters; it migrates into
  `alsoRoles` so there's one model (Bloodfen).
- **Signups** copy it at signup time. The private reply gets a **Can also play** menu (multi-
  select, only for classes with another role), the same pattern as the Role menu (#149). The
  site's signup card gets the same control.
- **Where it's used:** dropout alerts and lock-time seat suggestions ("Moonglade (can also
  tank)"), and the digest's gaps line ("Short 2 healers. Can also heal: Moonglade,
  Voidwhisper."). It stays off the public card so nobody feels volunteered.
- Seating someone in another role is the leader's call: a Seat button (§4), or `signup-set`
  with `role` and `spec` as a leader, as today.

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands. (J50–J57 are the
absences plan's.)

- **J58 · See the whole raid on the card.** A 40-person night with long first and last names
  shows every name in four role columns (Tanks, Healers, Melee, Ranged), with spec icons,
  inside Discord's limits. Raid page shows on the second row.
- **J59 · Say how late.** Lightwarden presses Late and picks **15 min** in the private reply:
  one click, no form. The card shows the 15-minute clock; the digest says "Lightwarden 15m".
  There's no option past 30. Pip presses Tentative and still gets the reason form; "depends on
  work" shows after his name on the Tentative line.
- **J60 · Flex raiders wait on Standby.** Bram (flex raider) presses Accept with seats open: he's
  on Standby, after the raiders and recruits there, and the private reply says so and why.
  Rook seats him from the quarters; the bot mentions him once.
- **J61 · A tank drops the night before.** Aeryn declines at T-20h. The leads channel gets the
  dropout post with Seat buttons for Ironhide and Moonglade and Thorgrim listed as text. Rook
  presses Seat Moonglade: she's in Aeryn's group as a tank, and her mention says "as **tank**".
  A raider pressing the button is refused. No seat goes to anyone automatically.
- **J62 · Lock with open seats.** 37 seated at lock: the approved party post becomes the final
  roster with Standby and "3 open seats". Standby people are mentioned once. Nobody tentative
  is seated without a leader.
- **J63 · A druid who can also heal.** Moonglade saves "can also heal" on her character. A healer
  gap's digest and dropout post name her; the public card doesn't.
- **J64 · Approve the parties the night before.** At T-24h the leads channel gets Molten Core's
  draft in 8 groups. Rook moves Stormfist into the rogues' group in the quarters; the leads
  draft updates in place, and the move doesn't post in the change feed. Rook presses Approve
  and post on the roster desk. The party post appears in the signup channel. Aeryn drops later:
  the party post shows an open seat in her group. At lock the same post becomes the final
  roster. A raider can't approve.
- **J65 · Targets are suggestions.** A 40-person raid with seats left, set to 10 melee, has 12
  melee going. The header reads "Melee 12/10", nobody is moved to Standby for it, and Missing
  doesn't mention melee.
- **J66 · The comp decides, not who answered first.** A 10-person raid has 2 tanks, 3 healers and
  5 DPS going. Thorgrim (raider, tank) answers last: the draft seats him over the fifth DPS,
  who goes to Standby with "raid full (10/10)" in their private reply. Answering earlier
  changes nothing.
- **J67 · Flex raiders on Standby in a guild raid.** Bram (Flex Raider) presses Late, 15 min, on
  Wednesday's guild raid and is on Standby with his 15 minutes. Pip (Member) sees the raid on
  the site but presses Accept and gets "needs the Recruit rank". Kestrel (Friend) doesn't see
  the raid at all.
- **J68 · An open raid for pugs.** Rook makes Saturday's Zul'Gurub with Open to pugs. It posts in
  the open-raid channel. Pip (Member), Bram (Flex Raider) and Kestrel (Friend, Discord only,
  who adds a character first) all press Accept and count as going; the comp draft seats them.
  No T-72h ping and no DMs go out. Standby, if any, reads Raiders, Recruits, Flex Raiders,
  Members, Friends.
- **J69 · Leads see seat and Standby changes after T-24h.** The digest is out for Wednesday's
  Molten Core. Within seconds of each, the leads channel shows "Kestrel signed up (Friend): Holy
  Priest, on Standby.", "Gorrak is now Late, 15 minutes." and, when Rook seats Ironhide,
  "Rook seated Ironhide." Rook seating ten people on the site arrives as one post. Before the
  digest, none of these post.
- **J70 · A new Friend on raid night.** Wren gets the Friend role at 7:50 PM and presses Accept
  on the 8:00 PM open raid: she's synced on the spot and signed up, not told to wait.

## Decisions

TJ (guild master) decides how the feature behaves; Bloodfen (technical SME) makes the technical
calls. Dated rows are decided; "(proposed)" rows wait on their owner.

| # | Decision | Why | Owner |
|---|---|---|---|
| 1 | While signups are open, four role columns (tank, healer, melee, ranged) with spec icons and everyone shown | Today's card hides most of a 40-person raid. Replaces the DPS-by-class layout from the first mock | TJ, 2026-11-20 |
| 2 | Missing counts people going; a subtext line covers tentative and standby | Matches the headers | TJ, 2026-11-20 |
| 3 | Late is 5, 15 or 30 minutes; later than 30 is absent | Leaders plan pulls around it | TJ, 2026-11-20 |
| 4 | "Benched" becomes "Standby" everywhere members read it, the same word as the button | Softer, and one word for everyone waiting to fill a seat (first "Backup", changed to match the button) | TJ, 2026-11-20 |
| 5 | Seats that open, and empty seats at lock, are filled by leaders, not automatically | It depends on the comp and the gap. Reverses J13's auto-promotion and the lock-time fill | TJ, 2026-11-20 |
| 6 | A leads channel for officers and raid leaders gets the digest, import string, change alerts and seat suggestions | Raid leaders form the raid; #vintage-ops stays for errors | TJ, 2026-11-20 |
| 7 | Other roles live on the character and can change per raid | Same pattern as Role (#149) | TJ, 2026-11-20 |
| 8 | Other roles show to leads only, never on the public card | Nobody feels volunteered | TJ (proposed) |
| 9 | Changes after the digest are found by diffing against an `announcedState` table, claimed per change, batched per tick, with immediate ticks coalesced over 10 to 15 seconds; `Signup.updatedBy`, and `roster-move` and `roster-bench` bump `updatedAt` | Fits the claim-before-send tick; no event bus subscriber needed; catches removals | Bloodfen, 2026-11-20 |
| 10 | Seating replaces the queue's auto-promotion: a going-only comp mode, `RANK_PRIORITY` with Recruit above Flex Raider, `rosterApprovedAt` and `rosterApprovedBy` on raids, no more `queued`, and `raid-export-check` and `bridge-format` updated where they read `queued` | Biggest technical change here; the queue rules in raids `AGENTS.md` change with it | Bloodfen, 2026-11-20 |
| 11 | No Blizzard icons or screenshots of them are committed; the mock lives outside the repo | Same rule as `scripts/discord-emojis.json` | Bloodfen, 2026-11-20 |
| 12 | Flex raiders who answer going start on Standby, even when seats are open | They're the guild's fill players; leaders seat them where the comp needs them. First "listed first", changed by row 22 | TJ, 2026-11-20 |
| 13 | At T-24h the bot drafts parties for the leads channel; a raid leader or officer approves before the party post goes to the signup channel | Leaders know the comp; the bot does the first pass | TJ, 2026-11-20 |
| 14 | The bot drafts parties and leaders' moves are kept. The class and buff rules for the draft are solved later, after a look at Forever's buffs | Some Forever buffs are raid-wide now, some party-only | TJ, 2026-11-20 |
| 15 | Melee and ranged get separate targets, and every target is a suggestion a raid can go over. The default numbers per raid size are solved later | Leaders want the split, and flexibility on the night | TJ, 2026-11-20 |
| 16 | Parties not approved by lock: a separate final roster shows role columns and leads are told once | The bot never posts groups nobody approved | TJ, 2026-11-20 |
| 17 | `roleTargets` splits `dps` into `melee` and `ranged` in all three tables, with a union schema during the migration and the four targets at most the size; raids with only a DPS target show plain Melee and Ranged counts | Contract change; `breaking-contract` label if the manifest changes | Bloodfen, 2026-11-20 |
| 18 | Recruits who answer going are seated like raiders, with a small `recruit` mark after their name | Recruits need raid time to be judged; leaders still see who's on trial | TJ, 2026-11-20 |
| 19 | Signups are never first-come: the raid fills by the ideal comp, and place in line goes away | Composition wins raids, not who clicked first. Reverses J05, J13 and J14 | TJ, 2026-11-20 |
| 20 | In guild raids, Flex Raiders only go on Standby (their Accept, Late and Tentative put them there), and Members and Friends can't sign up | Discord can't hide buttons per person, so the click decides | TJ, 2026-11-20 |
| 21 | Friends can add characters, to sign up for open raids | Fills off-night seats with people outside the guild | TJ, 2026-11-20 |
| 22 | Standby is ordered Raiders, Recruits, Flex Raiders, Members, Friends | Rank first; leaders still seat whoever fits | TJ, 2026-11-20 |
| 23 | A new `friend` tier between `public` and `member`; `signup-set` opens at `friend` and requires `recruit` for guild raids; Flex Raiders stay `raider`, and Standby-only is a seating rule | Keeps "gate on tier" and keeps Friends apart from signed-out users | Bloodfen, 2026-11-20 |
| 24 | Raids are guild raids or open raids (`access`), posted in separate channels | Guild nights and pug nights have different people and rules | TJ, 2026-11-20 |
| 25 | In open raids, Flex Raiders, Members and Friends sign up in full | Open raids exist to fill seats with them | TJ, 2026-11-20 |
| 26 | Open raids send no reminders or DMs, and absences don't apply to them | Nobody is expected at an open raid | TJ, 2026-11-20 |
| 27 | `access` on schedules, raids and raid-night polls, `openSignupChannelId` in coordinator config, and every raid post routed by `access` | Contract change to raids and coordinator config | Bloodfen, 2026-11-20 |
| 28 | The last reminder and DM go out at T-30h instead of T-24h; the digest and party draft stay at T-24h | Raid leaders decide after T-24h, so answers need to be in first | TJ, 2026-11-20 |
| 29 | `digestHours` (optional, 24 when missing, at least `lockHours`) separate from `reminderHours`; a one-time migration moves `[72, 24]` to `[72, 30]` | Today the digest rides on the smallest reminder offset | Bloodfen, 2026-11-20 |
| 30 | After the T-24h digest, seat and Standby changes go to the leads channel straight away: new signups, answer changes, switches, absences and leaders' seating | Leaders are deciding from T-24h and need to see each change as it happens | TJ, 2026-11-20 |
| 31 | Only Tentative asks for a reason, shown after the name on the Tentative line; no Notes field. Late asks only how late, with three buttons instead of a form | Leaders don't need to know why someone's late, only by how much | TJ, 2026-11-20 |
| 32 | Missing shows on the signup post, full or not, and never on the party post or final roster | Gaps matter while signups are open; once parties are set, leads work from the change feed | TJ, 2026-11-20 |
| 33 | Party drafts, approval and change alerts are for raids only; other kinds send overflow to Standby | Five-person groups don't need a party step | TJ, 2026-11-20 |
| 34 | Members see guild raids; Friends see only open raids | Members are in the guild; Friends aren't | TJ, 2026-11-20 |
| 35 | A Flex Raider's Late on a guild raid keeps the minutes on Standby | Leads see how late before seating them | TJ, 2026-11-20 |
| 36 | Moving someone between party groups isn't a change alert | Seats and Standby are what leads need to hear about | TJ, 2026-11-20 |
| 37 | Recruit above Flex Raider applies to seating and Standby only; `GUILD_RANKS` doesn't change | Rank order elsewhere stays as it is | TJ, 2026-11-20 |
| 38 | People on Standby see why, privately | Comp-based seating is new; the reason heads off "why was I benched?" | TJ, 2026-11-20 |
| 39 | The approved party post becomes the final roster at lock, edited in place | One post per raid instead of three | TJ, 2026-11-20 |
| 40 | The leads draft updates live, and the quarters' roster desk has Approve and post | Leaders can finish in one place | TJ, 2026-11-20 |
| 41 | A new Friend is synced on the spot when they press a signup button | Pugs aren't turned away minutes before the raid | TJ, 2026-11-20 |
| 42 | Columns are capped by a per-field character budget, never cut mid-emoji | Long names and emoji reach 1,024 characters before 20 names | Bloodfen, 2026-11-20 |
| 43 | Seat buttons are for Standby only, seat into the dropout's group, and set the role when seating through "can also play" | A click never opens a hole elsewhere | Bloodfen, 2026-11-20 |
| 44 | `secondaryRole` (#301) migrates into `alsoRoles`; internal status and roster names stay as they are | One model for other roles; addon and bridge-format compatibility | Bloodfen, 2026-11-20 |

## Open questions

For TJ:

1. **Row 8:** keep "can also play" off the public signup post, visible to leads only? Proposed
   so nobody feels volunteered.

Group composition and default role targets are under Later.

For Bloodfen:

1. **Rename the bot to Vintage?** TJ would like the bot called Vintage, with `/vintage` as its
   slash command, instead of Random (`/random`). Open while you two talk about it; Bloodfen notes
   the slash commands are guild-scoped, so the command name and the bot's nickname can be set per
   server. Worth knowing: the addon already uses `/vintage` in game, and a rename touches the
   Discord app name, the slash command, about 31 source files, 18 tests and 20 docs. The plans
   say `/random` until it's decided.

## Later

- **Group composition and Forever's buffs** (TJ, 2026-11-20). Some buffs are raid-wide in WoW
  Forever and some are still party-only, so which classes belong together in a party needs its
  own look before the party draft gets real rules (§1a). The same look covers the raid buffs the
  card's Missing line checks today (Mark of the Wild, Fortitude, Intellect, from comp-solver's
  catalog), which may be out of date for Forever too.
- **Default role targets per raid size** (TJ, 2026-11-20). How many tanks, healers, melee and
  ranged a 10-, 20- and 40-person raid should aim for by default. A first pass for the raid
  leaders to start from: 10-person 2, 3, 2, 3; 20-person 3, 5, 5, 7; 40-person 4, 10, 10, 16 (the
  tank and healer numbers are today's). Until then, see §1b.

## Tasks

- [x] **Fix first** (discord-kit, coordinator): no empty field values; final roster test with
  nobody benched.
- [ ] **The card** (coordinator, scripts): §1 four-column layout, the outline Melee and Ranged
  icons, the `recruit` mark (emoji art and the site badge), tentative reasons on the Tentative
  line (no Notes field or footer), Missing with the going-only comp mode and its subtext, Raid
  page always on the second row, columns capped by character budget, the 40-person limits test
  with long names.
- [ ] **Parties and the final roster** (comp-solver, coordinator, raids, apps/api, web):
  `groupDraft` with the placeholder rule (a tank and a healer per group, the rest by role; real
  rules are Later), the live T-24h leads draft with Approve and post, Redraft and the quarters
  link, Approve and post on the roster desk, `rosterApprovedAt` and `rosterApprovedBy`, the
  party post and its edits, the party post turning into the final roster at lock, raids only.
- [ ] **Role targets** (raids, coordinator, comp-solver, apps/api, web): `roleTargets` with melee
  and ranged in schedules, raid events and raid nights, a union schema while migrating, the sum
  check, the event form and quarters fields, targets as suggestions.
- [ ] **How late** (raids, apps/api, coordinator, web, scripts): `lateMinutes`, the 5, 15 and
  30 minute buttons in place of the late reason form, Flex Raiders keeping their minutes on
  Standby, the three emoji, digest wording.
- [ ] **Standby and seats** (raids, comp-solver, coordinator, apps/api, web, libs): the seating
  model (row 10) with comp-based seating and no place in line, `RANK_PRIORITY`, no more
  `queued` (including `raid-export-check`'s `expectedSignups` and `bridge-format`'s
  `benchReason`), the private "why" on Standby, Standby wording, seat mentions, lock-time
  Standby mentions, quarters Seat control, other kinds' overflow. J05, J13 and J14 in
  `raid-night.md` change with it.
- [ ] **Guild and open raids, and the friend tier** (guild-kit, identity, raids, coordinator,
  apps/api, web): the `friend` tier, `access` on schedules, raids and raid nights, Open to pugs
  in the event form and quarters, the open-raid channel and routing of every raid post, no
  reminders for open raids, who can sign up and who sees what by `access`, Friends adding
  characters, the on-the-spot sync for new Friends. Human step: create the open-raid channel.
- [x] **Reminder timing** (raids, coordinator): `digestHours` (optional, at least `lockHours`),
  the last reminder and DM at T-30h, `DEFAULT_TIMINGS` and the one-time schedule migration, J03
  and J04 in `raid-night.md`.
- [ ] **Leads channel and change alerts** (coordinator, raids, apps/api, web):
  `leadsChannelId`, routing, the `announcedState` table, `Signup.updatedBy` and the
  `roster-move` and `roster-bench` bumps, the change feed from T-24h with group moves left out,
  coalesced immediate ticks from site answers, absence commands and quarters moves, the dropout
  post with Seat buttons (§4). Human step: create the channel.
- [ ] **Other roles** (identity, raids, apps/api, web): `alsoRoles` on characters and signups,
  migrating #301's `secondaryRole`, the Can also play menu and site control, the leads'
  suggestions.
- [ ] **Jobs** J58–J70 in `raid-night.md` and the scenario test.
