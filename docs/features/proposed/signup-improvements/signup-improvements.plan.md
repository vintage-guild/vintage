# Signup improvements: the card, standby, late minutes, change alerts, other roles

**Status:** proposed (2026-11-20). Nothing built. **Owner modules:** coordinator (card, final
roster, alerts), raids (signups, seats), identity (characters), apps/api (Discord), web.
Research: [oxm.md](../../../research/oxm.md), [raid-helper.md](../../../research/raid-helper.md).

TJ (guild master) reviewed today's signup card next to OXM's and decided the direction below on
2026-11-20. Bloodfen (technical SME) reviews the technical calls, marked in the decisions table.

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
7. **Likely bug:** with nobody benched, the final roster's "Benched" field is an empty string.
   Discord refuses an empty field value, so that post would fail and retry every tick. The card
   tests check only the description there.

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
  otherwise just "Melee 7" (§1b). A count past its
  target just reads "12/10", with no warning.
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
  the signup post, party view, final roster, Roster reply and leads alerts. The site uses the
  same sprout, labelled "Recruit" for screen readers and on hover.
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
  standby come" (decided, TJ, 2026-11-20). It shows on the signup post even when every seat is
  filled, and never on the party post or the final roster (TJ, 2026-11-20).
- A **Raid page** link button joins Roster on the second row.
- **Limits:** a role column stops at 20 names and the Tentative line at 10, each with "+N more…"
  and the Roster button. A 40-person worst case, every tentative person with a reason, is tested against
  Discord's 6000 characters and 25 fields.

### 1a. Parties at T-24h, approved by leads

Decided: the bot drafts the parties, raid leaders and officers adjust and approve them, and
only then does the party view go to the signup channel (TJ, 2026-11-20).

- **The draft:** at the digest (T-24h, §1c), the leads channel gets the seated roster laid
  out as Group 1 to 8, with **Approve and post**, **Edit in the quarters** (a link to the raid's
  roster desk) and **Redraft**. Empty seats show as open in their group.
- **How it drafts: to be solved later** (TJ, 2026-11-20). WoW Forever changed buffs: some are
  raid-wide now and some are still party-only, so the group rules need their own look (see
  Later). Until then the draft only places one tank and one healer per group where there are
  enough, fills the rest by role, and leaves the arranging to leaders. Groups a leader already
  set with `roster-move` are kept.
- **Adjusting:** leaders move people in the quarters or with `roster-move`, then press Approve.
  Any raid leader or officer can approve; one approval is enough.
- **After approval:** the party view posts to the signup channel as its own message, laid out
  like OXM's (Group 1 to 8, spec icons, the late clock), with Standby under it. The signup post
  above it keeps its four role columns and answer buttons until lock. Later moves or dropouts
  edit the party post in place, showing an open seat where someone dropped.
- **At lock:** the final roster uses the approved parties. If nobody approved by lock, the final
  roster shows the four role columns and the leads channel is told once that groups weren't
  approved.

### 1b. Role targets: tank, healer, melee, ranged

Decided: melee and ranged get their own targets, and targets are suggestions a raid can go over
(TJ, 2026-11-20).

- **`roleTargets`** becomes `{ tank, healer, melee, ranged }` on raids and schedules, set in the
  event form, `/random event create`, and the quarters.
- **Default targets per size: to be solved later** (TJ, 2026-11-20; see Later). Until then the
  kind's defaults keep today's tank, healer and DPS numbers, and a raid with no melee or ranged
  target shows plain counts ("Melee 7", "Ranged 13") with the DPS target behind Missing. A raid
  whose leader sets melee and ranged targets shows them ("Melee 7/10").
- **Suggestions, not caps:** headers show "12/10" past a target; Missing lists only roles under
  their target; nobody is refused for being over. While the raid has room, nobody goes to
  Standby for being over a target either. Only when more answer than the raid holds does the
  draft use the targets to choose who sits (§3), and leaders can change that.
- **Older raids** with a single `dps` target show a combined "DPS n/target" until they're edited
  (Bloodfen to settle the migration).

### 1c. Reminder timing

Decided: the last reminder moves from T-24h to T-30h, so answers are in before raid leaders
decide at T-24h (TJ, 2026-11-20).

| When | What | Where |
|---|---|---|
| T-72h | Reminder, pinging guild raid non-responders | Signup channel |
| T-30h | Last reminder, and the DM to non-responders who allow DMs | Signup channel, DM |
| T-24h | Digest and party draft (§1a); from here every signup change goes to leads straight away (§4) | Leads channel |
| T-2h | Lock and final roster | Signup and leads channels |

- **The digest stops following the last reminder.** Today it goes out at the smallest
  `reminderHours`; it gets its own `digestHours` (24) so the reminder can move without dragging
  it along (row 29).
- `DEFAULT_TIMINGS.reminderHours` becomes `[72, 30]`. Schedules saved with `[72, 24]` move to
  `[72, 30]`; any other custom offsets stay as they are.

### 2. How late

Decided: Late means 5, 15 or 30 minutes late; more than 30 is absent (TJ, 2026-11-20).

- **Late asks only how late, no reason** (TJ, 2026-11-20). Pressing Late gets a private reply
  with three buttons, **5 min**, **15 min** and **30 min**, and the line "Later than 30
  minutes? Press Absent instead." One click signs them up. Today's late reason form goes away;
  Tentative keeps its reason form.
- The signup stores `lateMinutes: 5 | 15 | 30 | null` (`signup-set late` requires it; older
  late signups read as null and show the plain clock).
- New emoji `late_5`, `late_15`, `late_30`: the existing clock with the number, built by
  `scripts/build-emoji-art.mjs` and uploaded with `scripts/discord-emojis.mjs` (a human step
  with the app token).
- The digest reads "Late (2): Lightwarden 15m, Stormfist 5m".
- Absences' weekly late nights use the same 5/15/30 instead of an arrival time
  ([absences plan](../absences/absences.plan.md), updated).

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
  in line. It stays open until a leader fills it.
- **Seating tentative and standby people at lock.** `finalRoster` stops using the comp's
  selection to fill seats. Only people seated are on the final roster.

How it works:

- **Who's seated before any leader acts:** raiders, recruits and above who answer going (in an
  open raid, everyone who answers going, §3a). When
  more answer than the raid holds, the bot's draft seats the ideal comp among them
  (`comp-solver`: role targets, buffs, then rank), never answer order, and the rest go to
  Standby. Until leaders approve at T-24h (§1a), the draft can change as answers come in; after
  that, only leaders change seats, and new answers go to Standby. Recruits are seated like
  raiders and carry the recruit mark (§1) (TJ, 2026-11-20).
- **Standby** is everyone else who could play: raiders and recruits the comp left out, people
  who press Standby, and everyone with a Standby-only rank. It's ordered by rank: Raiders,
  Recruits, Flex Raiders, Members, then Friends (TJ, 2026-11-20). Within a rank, people the comp
  needs most come first. Leaders seat whoever fits the comp.
- **Who can answer depends on the kind of raid** (§3a). In a guild raid, Flex Raiders only go on
  Standby, and Members and Friends can't sign up, as today. In an open raid, everyone with a
  character signs up in full (TJ, 2026-11-20).
- **Standby-only in guild raids:** on Discord everyone sees the same buttons, so a Flex Raider
  pressing Accept, Late or Tentative goes on Standby, and the private reply says so: "You're on
  standby for Raid night · Molten Core. A raid leader will seat you if a spot opens." Absent
  still takes them off. On the site, the signup card shows them Standby only, and Leave standby
  once they're on it.
- **Friends** can now add characters (on the site and with `/random character add`) so they can
  sign up for open raids (TJ, 2026-11-20). Friends are the `public` tier today, and raids gates
  on tier, never rank, so Bloodfen decides how this is expressed (row 23).
- **Seating:** leaders seat anyone from Standby with one click from the alert (§4), the
  quarters, or `roster-move`. They can also swap a seated person into Standby. The bot mentions
  the person once in the signup channel: "You're in for Raid night · Molten Core."
- **At lock:** the final roster lists who's seated, then Standby, then open seats. The leads
  channel gets the same suggestions as a dropout alert for each open seat. Everyone in Standby
  is mentioned once: "You're on standby tonight. Stay close in case a seat opens."
- **Words:** "Benched" on posts, replies, the digest and the site becomes "Standby" (TJ,
  2026-11-20). The Standby button is one way in; being left out of the comp and having a
  Standby-only rank are the others. Internals (`roster: 'benched'`, `status: 'bench'`,
  `benchReason`) keep their names unless Bloodfen prefers a rename in the same change.

### 3a. Guild raids and open raids

Decided: a raid is either a **guild raid** (usually recurring, the guild's own nights) or an
**open raid** (off-nights, pugs welcome), and they post in different channels (TJ, 2026-11-20).

| | Guild raid | Open raid |
|---|---|---|
| Who signs up in full | Raiders, Recruits and above | Everyone with a character: Raiders, Recruits, Flex Raiders, Members, Friends |
| Flex Raiders | Standby only | Full signup |
| Members, Friends | Can't sign up ("needs the Recruit rank") | Full signup |
| Signup channel | The guild signup channel | A separate open-raid channel |
| Reminders and DMs | T-72h ping and T-30h DM to non-responders | None. Nobody is expected; leaders can ping a role themselves |
| Absences | Cover it (absences plan) | Don't apply |
| Seating, Standby order, parties, leads alerts | Same rules for both: comp draft, Standby ordered Raiders, Recruits, Flex Raiders, Members, Friends, T-24h party draft for leads | Same |

- **`access: 'guild' | 'open'`** on schedules and raids, `guild` by default. The New event form
  and `/random event create` get an **Open to pugs** choice; the quarters' Calendar tab shows
  and edits it. A schedule's raids copy it, so a recurring open night is possible too.
- **The open channel** is a human step: create it, give the bot View Channel and Send Messages,
  then `coordinator-config-set openSignupChannelId`. Without it, open raids post in the guild
  signup channel.

### 4. Change alerts and the leads channel

Decided: a new channel for officers and raid leaders, and it gets everything a raid lead needs
(TJ, 2026-11-20). Once the T-24h digest is out, every change to the raid's signups goes there
straight away, new signups included (TJ, 2026-11-20).

- **The channel** is a human step: create it in the Vintage server (officers and raid leaders
  only), give the bot View Channel and Send Messages, then `coordinator-config-set
  leadsChannelId`. The digest, the party draft (§1a), change alerts, seat suggestions and the
  addon import string at lock go there. `#vintage-ops` keeps errors and admin notices. Without
  a leads channel, these fall back to the ops channel.
- **What counts as a change**, from the digest until the raid starts, in guild and open raids:
  - a new signup, whatever the answer, and whether it lands seated or on Standby
  - an answer changing (Accept, Late, Tentative, Standby, Absent), and a new How late
  - a switch of character, spec or role, and a new tentative reason
  - an absence added or removed that covers the raid (absences plan)
  - a leader's change: seating, moving to Standby, moving groups, with who did it
- **Straight away:** every signup change already runs a tick from the Discord button (that's
  how the post refreshes in seconds). The site's answers and the absence commands do the same,
  so an alert lands within seconds, not at the next 5-minute tick.
- **One post per tick:** changes from the same tick go in one message, one line each, so a
  burst of answers doesn't flood the channel. A drop that opens a seat gets its own post with
  Seat buttons (below).
- **How it's found:** the digest records each signup's state. Each tick after it compares the
  signups against the last state it announced and posts the difference, claimed per signup and
  `updatedAt` before sending like every other rule. No event bus subscriber is needed (#261;
  row 9).
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
  > [Seat Ironhide] [Seat Moonglade]

  Up to four Seat buttons, from the comp's view of who fills the gap best. A button runs the
  seat as the leader who clicks it; anyone below raid leader gets "needs the Raid Leader rank".
  A second click after the seat is taken says who took it, and that seat shows in the feed as
  "**Rook** seated Ironhide".

### 5. Other roles I can play

Decided: saved on the character, changeable for one raid (TJ, 2026-11-20).

- **Characters** get `alsoRoles: Role[]`, limited to the roles the class can play (a mage has
  none to add; a druid can add all three others). Set on the Characters page and with `/random
  character add … also:`.
- **Signups** copy it at signup time. The private reply gets a **Can also play** menu (multi-
  select, only for classes with another role), the same pattern as the Role menu (#149). The
  site's signup card gets the same control.
- **Where it's used:** dropout alerts and lock-time seat suggestions ("Moonglade (can also
  tank)"), and the digest's gaps line ("Short 2 healers. Can also heal: Moonglade,
  Voidwhisper."). It stays off the public card so nobody feels volunteered.
- Seating someone in another role is the leader's call: `signup-set` with `role` and `spec` as a
  leader, as today.

## Jobs

Added to [raid-night.md](../../../jtbd/raid-night.md) when the work lands. (J50–J57 are the
absences plan's.)

- **J58 · See the whole raid on the card.** A 40-person night shows every name in four role
  columns (Tanks, Healers, Melee, Ranged), with spec icons, inside Discord's limits.
- **J59 · Say how late.** Lightwarden presses Late and picks **15 min** in the private reply:
  one click, no form. The card shows the 15-minute clock; the digest says "Lightwarden 15m".
  There's no option past 30. Pip presses Tentative and still gets the reason form; "depends on
  work" shows after his name on the Tentative line.
- **J60 · Flex raiders wait in Standby.** Bram (flex raider) presses Accept with seats open: he's
  on Standby, after the raiders and recruits there, and the private reply says so. Rook seats
  him from the quarters; the bot mentions him once.
- **J61 · A tank drops the night before.** Aeryn declines at T-20h. The leads channel gets the
  dropout post with Seat buttons for Ironhide and Moonglade. Rook seats Ironhide; a raider
  pressing the button is refused. No seat goes to anyone automatically.
- **J62 · Lock with open seats.** 37 seated at lock: the final roster lists them, Standby, and "3
  open seats". Standby people are mentioned once. Nobody tentative is seated without a leader.
- **J63 · A druid who can also heal.** Moonglade saves "can also heal" on her character. A healer
  gap's digest and dropout post name her; the public card doesn't.
- **J64 · Approve the parties the night before.** At T-24h the leads channel gets Molten Core's
  draft in 8 groups. Rook moves Stormfist into the rogues' group in the quarters and presses
  Approve and post. The party view appears in the signup channel. Aeryn drops later: the party
  post shows an open seat in her group. A raider can't press Approve.
- **J65 · Targets are suggestions.** A 40-person raid with seats left, set to 10 melee, has 12
  melee going. The header reads
  "Melee 12/10", nobody is moved to Standby for it, and Missing doesn't mention melee.
- **J66 · The comp decides, not who answered first.** A 10-person raid has 2 tanks, 3 healers and
  5 DPS going. Thorgrim (raider, tank) answers last: the draft seats him over the fifth DPS,
  who goes to Standby, because the comp wants 2 tanks. Answering earlier changes nothing.
- **J67 · Flex raiders on Standby in a guild raid.** Bram (Flex Raider) presses Accept on
  Wednesday's guild raid and is on Standby with the private reply. Pip (Member) presses Accept on
  the same post and gets "needs the Recruit rank".
- **J68 · An open raid for pugs.** Rook makes Saturday's Zul'Gurub with Open to pugs. It posts in
  the open-raid channel. Pip (Member), Bram (Flex Raider) and Kestrel (Friend, Discord only,
  who adds a character first) all press Accept and count as going; the comp draft seats them.
  No T-72h ping and no DMs go out. Standby, if any, reads Raiders, Recruits, Flex Raiders,
  Members, Friends.
- **J69 · Leads see every change after T-24h.** The digest is out for Wednesday's Molten Core.
  Within seconds of each, the leads channel shows "Kestrel signed up (Friend): Holy Priest, on
  Standby.", "Gorrak is now Late, 15 minutes." and, when Rook seats Ironhide,
  "Rook seated Ironhide." Two answers in the same tick arrive as one post with two lines. Before
  the digest, none of these post.

## Decisions

| # | Decision | Why | Owner |
|---|---|---|---|
| 1 | While signups are open, four role columns (tank, healer, melee, ranged) with spec icons and everyone shown | Today's card hides most of a 40-person raid. Replaces the DPS-by-class layout from the first mock | TJ, 2026-11-20 |
| 2 | Missing counts people going; a subtext line covers tentative and standby | Matches the headers | TJ, 2026-11-20 |
| 3 | Late is 5, 15 or 30 minutes; later than 30 is absent | Leaders plan pulls around it | TJ, 2026-11-20 |
| 4 | "Benched" becomes "Standby" everywhere members read it, the same word as the button | Softer, and one word for everyone waiting to fill a seat (first "Backup", changed to match the button) | TJ, 2026-11-20 |
| 5 | Seats that open, and empty seats at lock, are filled by leaders, not automatically | It depends on the comp and the gap. Reverses J13's auto-promotion and the lock-time fill | TJ, 2026-11-20 |
| 6 | A leads channel for officers and raid leaders gets the digest, import string, change alerts and seat suggestions | Raid leaders form the raid; #vintage-ops stays for errors | TJ, 2026-11-20 |
| 7 | Other roles live on the character and can change per raid | Same pattern as Role (#149) | TJ, 2026-11-20 |
| 8 | Other roles show to leads only, never on the public card | Nobody feels volunteered | TJ |
| 9 | Changes after the digest are found by comparing each tick's signups with the last state announced, claimed per signup and `updatedAt`, batched into one post per tick; every signup change (Discord, site, absences) runs a tick at once | Fits the claim-before-send tick; no event bus subscriber needed | Bloodfen |
| 10 | Seating replaces the queue's auto-promotion: who's seated, Standby order, and the `queued` and `promotedAt` fields need a new model | Biggest technical change here; the queue rules in raids `AGENTS.md` change with it | Bloodfen |
| 11 | No Blizzard icons or screenshots of them are committed; the mock lives outside the repo | Same rule as `scripts/discord-emojis.json` | Bloodfen |
| 12 | Flex raiders who answer going start in Standby, even when seats are open | They're the guild's fill players; leaders seat them where the comp needs them. First "listed first", changed by row 22 | TJ, 2026-11-20 |
| 13 | At T-24h the bot drafts parties for the leads channel; a raid leader or officer approves before the party view goes to the signup channel | Leaders know the comp; the bot does the first pass | TJ, 2026-11-20 |
| 14 | The bot drafts parties and leaders' moves are kept. The class and buff rules for the draft are solved later, after a look at Forever's buffs | Some Forever buffs are raid-wide now, some party-only | TJ, 2026-11-20 |
| 15 | Melee and ranged get separate targets, and every target is a suggestion a raid can go over. The default numbers per raid size are solved later | Leaders want the split, and flexibility on the night | TJ, 2026-11-20 |
| 16 | Parties not approved by lock: the final roster shows role columns and leads are told once | The bot never posts groups nobody approved | TJ |
| 17 | `roleTargets` splits `dps` into `melee` and `ranged`; older single-`dps` rows need a migration path | Contract change; `breaking-contract` label if the manifest changes | Bloodfen |
| 18 | Recruits who answer going are seated like raiders, with a small `recruit` mark after their name | Recruits need raid time to be judged; leaders still see who's on trial | TJ, 2026-11-20 |
| 19 | Signups are never first-come: the raid fills by the ideal comp, and place in line goes away | Composition wins raids, not who clicked first. Reverses J05, J13 and J14 | TJ, 2026-11-20 |
| 20 | In guild raids, Flex Raiders only go on Standby (their Accept, Late and Tentative put them there), and Members and Friends can't sign up | Discord can't hide buttons per person, so the click decides | TJ, 2026-11-20 |
| 21 | Friends can add characters, to sign up for open raids | Fills off-night seats with people outside the guild | TJ, 2026-11-20 |
| 22 | Standby is ordered Raiders, Recruits, Flex Raiders, Members, Friends | Rank first; leaders still seat whoever fits | TJ, 2026-11-20 |
| 23 | How Friends (tier `public`) get `character-add` and open-raid signups, and Flex Raiders get Standby-only in guild raids, without gating on rank | raids `AGENTS.md`: "gate on tier, rank only orders". A new tier, or a rank check inside `signup-set` keyed by `access`, is the choice | Bloodfen |
| 24 | Raids are guild raids or open raids (`access`), posted in separate channels | Guild nights and pug nights have different people and rules | TJ, 2026-11-20 |
| 25 | In open raids, Flex Raiders, Members and Friends sign up in full | Open raids exist to fill seats with them | TJ, 2026-11-20 |
| 26 | Open raids send no reminders or DMs, and absences don't apply to them | Nobody is expected at an open raid | TJ, 2026-11-20 |
| 27 | `access` on schedules and raids, `openSignupChannelId` in coordinator config, and the tick routing posts by `access` | Contract change to raids and coordinator config | Bloodfen |
| 28 | The last reminder and DM go out at T-30h instead of T-24h; the digest and party draft stay at T-24h | Raid leaders decide after T-24h, so answers need to be in first | TJ, 2026-11-20 |
| 29 | `digestHours` (24) on schedule timings, separate from `reminderHours`; `DEFAULT_TIMINGS` and schedules saved with `[72, 24]` move to `[72, 30]` | Today the digest rides on the smallest reminder offset | Bloodfen |
| 30 | After the T-24h digest, every signup change goes to the leads channel straight away: new signups, answer changes, switches, absences and leaders' moves | Leaders are deciding from T-24h and need to see each change as it happens | TJ, 2026-11-20 |
| 31 | Only Tentative asks for a reason, shown after the name on the Tentative line; no Notes field. Late asks only how late, with three buttons instead of a form | Leaders don't need to know why someone's late, only by how much | TJ, 2026-11-20 |
| 32 | Missing shows on the signup post, full or not, and never on the party post or final roster | Gaps matter while signups are open; once parties are set, leads work from the change feed | TJ, 2026-11-20 |

## Open questions

For TJ: none open. Group composition and default role targets are under Later.

For Bloodfen:

1. Rows 9 to 11, 17, 23, 27 and 29, especially rows 10 and 23.
2. **Rename the bot to Vintage?** TJ would like the bot called Vintage, with `/vintage` as its
   slash command, instead of Random (`/random`). Your call, along with what happens to the raven
   and the home page's "From Random Raven". Worth knowing: the addon already uses `/vintage` in
   game, and a rename touches the Discord app name, the slash command, about 31 source files,
   18 tests and 20 docs. The plans say `/random` until you decide.

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

- [ ] **Fix first** (discord-kit, coordinator): no empty field values; final roster test with
  nobody benched.
- [ ] **The card and final roster** (coordinator, scripts): §1 four-column layout, the outline
  Melee and Ranged icons, the `recruit` mark (emoji art and the site badge), tentative reasons on the Tentative line (no Notes field or footer), Missing count and subtext, Raid page button, limits tests.
- [ ] **Parties** (comp-solver, coordinator, apps/api, web): `groupDraft` with the placeholder
  rule (a tank and a healer per group, the rest by role; real rules are Later), the T-24h draft with Approve and post, Redraft and the quarters link, the party post and its
  edits, the final roster from approved parties.
- [ ] **Role targets** (raids, comp-solver, apps/api, web): `roleTargets` with melee and ranged,
  the event form and quarters fields, targets as suggestions, the migration.
- [ ] **How late** (raids, apps/api, coordinator, web, scripts): `lateMinutes`, the 5, 15 and
  30 minute buttons in place of the late reason form, the three emoji, digest wording.
- [ ] **Standby and seats** (raids, coordinator, apps/api, web): the seating model (row 10) with
  comp-based seating and no place in line, Standby order by rank, Standby wording, seat
  mentions, lock-time Standby mentions, quarters Seat control. J05, J13 and J14 in
  `raid-night.md` change with it.
- [ ] **Guild and open raids** (raids, coordinator, identity, apps/api, web): `access` on
  schedules and raids, Open to pugs in the event form and quarters, the open-raid channel and
  routing, no reminders for open raids, who can sign up by `access` (Flex Raiders Standby-only
  in guild raids, Members and Friends in open raids only), Friends adding characters (row 23).
  Human step: create the open-raid channel.
- [ ] **Reminder timing** (raids, coordinator): `digestHours`, the last reminder and DM at T-30h,
  `DEFAULT_TIMINGS` and the saved-schedule update, J03 and J04 in `raid-night.md`.
- [ ] **Leads channel and change alerts** (coordinator, apps/api, web, raids): `leadsChannelId`,
  routing, the change feed from T-24h (one post per tick), the dropout post with Seat buttons,
  and an immediate tick from site answers and absence commands as from Discord buttons. Human
  step: create the channel.
- [ ] **Other roles** (identity, raids, apps/api, web): `alsoRoles` on characters and signups,
  Can also play menu and site control, the leads' suggestions.
- [ ] **Jobs** J58–J69 in `raid-night.md` and the scenario test.
