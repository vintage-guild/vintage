# Raid night

The GM's MVP (PLAN §6): raid nights get posted, people get reminded, and signups lock without an
officer touching anything. Automated in `apps/api/tests/jtbd/raid-night.jtbd.test.ts`.

**Cast** (live runs use matching roles in the Discord test server): Ana (Officer), Rook (Raid
Leader), Aeryn (Raider), Bram (Flex Raider), Cade (Raider, DMs off), Dara (Recruit), Pip (Member).

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`) with
   `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` set for the test server.
2. The test server has the seven rank roles mapped (`guild-roles-get`), `#raid-signups` and
   `#vintage-ops`, and the coordinator points at them (`coordinator-status`).
3. Run commands as the system caller (`npx convex run commands:runAsSystem '{…}'` in `apps/api`)
   until Discord sign-in (#7) lets real members run them. Use `npx convex run coordinator:tick` to
   tick instead of waiting for the cron.
4. Check Discord with computer use (Claude in Chrome on discord.com), with a screenshot per check.

## Jobs

### J01 · Set up raid nights once
**When** the guild agrees on raid nights, **I (officer) want** to set them up once, **so I can**
stop posting signups by hand.
- [ ] `schedule-create` (Mon/Wed 20:00 America/Chicago), then a tick.
- [ ] `#raid-signups` shows one post per raid in the next 7 days, each with the start time in my
  local time and Accept / Tentative / Bench / Decline buttons.
- [ ] A second tick posts nothing new.

### J02 · Answer a raid and see myself on the post
**When** I can make a raid, **I (raider) want** to answer quickly, **so I can** trust I'm counted.
- [ ] `signup-set` (accepted), then a tick: the post is edited in place, shows me under my role,
  and the going count and the "Tanks · Healers · DPS" counter line go up. (The buttons do this
  once the gateway is live, #10.)

### J03 · Only the people who haven't answered get pinged
**When** a raid is three days out, **I (raider who answered) want** not to be pinged, **so I can**
keep notifications for things that need me.
- [ ] At T-72h, one reminder in `#raid-signups` mentions only expected ranks with no answer (not
  recruits or members). A second tick sends nothing.

### J04 · A last nudge by DM, and a digest for officers
**When** a raid is a day out, **I (raider who forgot) want** a DM, **so I can** answer in time;
**I (officer) want** a digest, **so I can** fix gaps before the night.
- [ ] At T-24h, non-responders get a DM unless they turned DMs off (`member-prefs-set`). The DM
  links straight to the signup post, so one click opens the buttons.
- [ ] `#vintage-ops` gets "N/40 confirmed · gaps · Not answered: …".

### J05 · Change my answer without losing my place
**When** my plans change, **I (raider) want** to update my answer, **so I can** keep my spot.
- [ ] Answer tentative, later accepted: same signup, same place in `signup-list`.
- [ ] **Change spec** in the private reply (Holy → Shadow): same signup, same place, and the
  role on it is now ranged DPS.

### J06 · Arrange groups and see what the comp is missing
**When** signups come in, **I (raid leader) want** to place people and see gaps, **so I can**
recruit for the night.
- [ ] `roster-move` into groups works for a raid leader and is refused for a raider.
- [ ] `comp-suggest` names missing roles and buffs.

### J07 · Lock, post the final roster, hand officers the addon string
**When** the raid is two hours out, **I (raid leader) want** signups frozen and a roster I can
import, **so I can** form the raid quickly.
- [ ] At T-2h, if no raid leader or officer has approved the roster, the raid stays open, nothing
  final is posted, and the leads channel is asked to approve (raid-scheduling decision 17).
- [ ] Once a leader clicks **Approve and post**, the next check locks the raid, the post's buttons
  grey out, `#raid-signups` gets the final roster, and `#vintage-ops` gets an import string that
  decodes to the roster and groups.
- [ ] After lock a raider's `signup-set` is refused; a raid leader's works.

### J08 · Cancel one night and have it stay cancelled
**When** a night can't happen, **I (officer) want** to cancel it, **so I can** stop the bot
chasing people for it.
- [ ] `raid-cancel` (preview, then confirm). Materializing again doesn't bring it back, and no
  reminders go out for it.

### J09 · See why the bot pinged me
**When** the bot pings me, **I (member) want** to see why, **so I can** trust it.
- [ ] `coordinator-log` for the raid lists each reminder and DM with its rule and target.

### J10 · Discord roles decide who can sign up
**When** someone's rank changes in Discord, **I (officer) want** their permissions to follow,
**so I can** manage the guild in one place.
- [ ] A Member can't sign up; give them the Raider role, run role sync, and they can. A Friend
  can't even list raids.

### J11 · Pause the coordinator
**When** something is off (a holiday, a bad config), **I (raid leader) want** to pause the bot,
**so I can** fix it without spamming people.
- [ ] `coordinator-pause`: ticks do nothing and `coordinator-run` is refused.
  `coordinator-resume`: whatever came due goes out on the next tick.

### J12 · Say I'll be late, and why
**When** I'll be late, **I (raider) want** to say so with a reason, **so I can** keep my spot
and let the leader plan around me.
- [ ] `signup-set` with `late` and a note: the post shows me under my role as "· late: <note>",
  I still count as going, and the officer digest lists "Late (1): <name> (<note>)".

### J13 · A full raid queues the rest, and tells the first in line when a spot opens
**When** a raid fills up, **I (raider) want** to wait in line, **so I can** get in if someone
drops out without watching the channel.
- [ ] In a full raid, my answer comes back queued and the post shows "N queued" and a Queue list.
- [ ] Someone ahead declines: I'm in, and the bot mentions me once in the signup channel.

### J14 · Stepping down gives up my place
**When** I switch to tentative or bench, **I (raider) expect** to lose my spot in line, **so
that** people who committed first stay ahead of me.
- [ ] Accepted → tentative → accepted puts me behind people who accepted after my first answer.
  Changing character, or switching between accepted and late, keeps my place.

### J19 · On raid day, the site's first screen says whether I'm in and when signups lock
**When** it's raid day, **I (raider) want** the first screen of the site to say whether I'm in,
when we pull, and when signups lock, **so I can** get ready without hunting through Discord.
- [ ] Signed in, the home page's **Your next raid** card shows the raid's time in my zone,
  "signups lock Wed 6:00 PM EDT" (the schedule's lock hours before the start; two hours for a
  one-off), and my answer pressed. After the lock it says "locked · roster posted".
- [ ] In a full raid, the card says where I am in line: "You're next in line", or "in line with
  N ahead of you", and that Random tells me when a spot opens (J13).
- [ ] What to bring: Rook writes the raid's notes on the quarters' Calendar tab (Edit on the
  agenda, or a schedule's default notes that each new raid copies). The card shows them under the
  instance, a paragraph per blank line, and the Discord signup post is edited to quote them. A
  raider can read them but `raid-update` answers `COMMAND_NOT_FOUND`.

### J20 · Lock tonight's roster and copy the addon import from the site
**When** tonight's roster is set, **I (raid leader) want** to lock it from the site and copy the
addon import string, **so I can** form the raid in game without opening Discord or the CLI.
- [ ] Signed in as Rook on `/officers` (Tonight tab), place people in groups (`roster-move`) or on
  the bench (`roster-bench`) and press **Lock roster** (`roster-lock`): the raid status changes to
  locked and raiders can no longer change their answers (`RAID_CLOSED`).
- [ ] Press **Copy the addon import** (`addon-import-get`): the site fetches and copies the import
  string, which decodes (`decodeRaidImport`) to the locked raid, its groups, and its bench.
- [ ] Unlocking (`roster-unlock`) reopens signups. A raider calling `roster-lock` or
  `addon-import-get` gets `COMMAND_NOT_FOUND`.
- (`packages/ui-kit/src/elements/tonight.test.ts` covers the Tonight tab's buttons and clipboard
  flow; `raid-night.jtbd.test.ts` covers the command and decoded import end to end.)

### J24 · Keep the calendar right from the quarters
**When** plans change, **I (raid leader) want** to add, move, pause, and close out raids on the
site, **so I can** keep the calendar true without commands (the quarters' Calendar tab).
- [ ] Rook adds a one-off raid; a raider answers it; Rook moves it an hour later and the answer
  comes along.
- [ ] Rook pauses the schedule: creating raids now makes none. Resumed, its next nights appear.
- [ ] Once a raid has started, Rook marks it done; it moves under Earlier.
- [ ] Cancel previews first ("N people have signed up"), then cancels (J08).
- [ ] With `serverEvents` on (test server first; the bot needs Create Events, SETUP.md), each
  posted raid also shows in the server's **Events** list, at the instance, linking to its signup
  card. Moving the raid moves the event; cancelling it cancels the event. "Interested" there is
  not a signup.
- [ ] A raider reads the calendar but `raid-create` answers `COMMAND_NOT_FOUND`.
- [ ] Viewed from Europe in late October, a raid shows the guild's clock beside the viewer's and
  notes it is an hour off from usual.

### J15 · Answer straight from the Discord post, privately
**When** I see a raid post, **I (raider) want** to answer with one click, **so I can** sign up
without leaving Discord.
- [ ] With one character: Accept answers right away with a private reply that names the
  character, spec, role, and why ("**Accepted** for Raid night as **Aeryn** (Protection Warrior,
  tank): your main."), and the post shows me within seconds.
- [ ] The reply has a **Switch character** menu (main first, ending with **New character…**), a
  **Change spec** menu (the class's specs, each with its role, and "tanks needed" style marks for
  what the raid is short of), and a **Role** menu. A decline has no menus.
- [ ] Late or Tentative opens a short reason form; the reason shows on the post, and the reply
  still says why that character was used.
- [ ] With several characters and no main to guess: a private picker asks which one, marking the
  roles the raid needs; next time my signed-up character is used without asking ("your signup
  for this raid").
- [ ] **Roster** shows the full list privately (everyone, by role, with places in line). The
  button appears only when the card leaves someone out: a role column past 8 names, more than
  10 in the queue, standby, or tentative, or anyone who declined.
- [ ] A Member (below Recruit), someone the bot doesn't know, or a click from another server gets
  a private refusal that says what to do.

### J39 · Bring a different character tonight
**When** I'm bringing an alt, or the same character in another spec, **I (raider) want** to
switch in one click for this raid only, **so I can** sign up as what I'll actually play without
changing my saved characters.
- [ ] Aeryn (warrior main, druid alt Aerbark) presses Accept on Wednesday: the reply says "as
  **Aeryn** … your main". **Switch character** → Aerbark: the reply now says "as **Aerbark**
  (Feral Druid, tank)", and her place in line is kept.
- [ ] On Thursday (the same schedule) Accept still uses her main, "your main": the main beats
  history (Bloodfen, 2026-10-27). She switches to Aerbark again.
- [ ] History decides only with no main: Cade removes his main and keeps two alts. Wednesday the
  picker asks and he picks Cadebark; Thursday Accept uses Cadebark: "your last Molten Core
  night". After a few weeks it reads "your last 3 Molten Core nights" or "3 of your last 5 …"
  (the last 5 signups for the schedule; a one-off uses the same instance).
- [ ] **Change spec** lists Feral twice, as a tank and as DPS. Picking the DPS one makes the
  signup melee DPS; `character-list` still shows Aerbark as Feral Tank.
- [ ] Late keeps the chosen spec. Switching back to Aeryn clears it: Protection, tank.
- [ ] On the site (`/`), the next raid's card says "as Aerbark · Feral Druid · …" with "Guessed
  from …" under it, and has the same two menus; once answered, either menu saves right away.
  (The scenario test covers Discord; `signup-card.test.ts` and `home-signup.test.ts` cover the
  site.)

### J40 · Manage my characters from Discord, and sign up with a new alt
**When** I make an alt or change my main, **I (raider) want** to do it from Discord, **so I can**
keep my characters right and sign up with a new one without going to the site.
- [ ] `/random character add`: `class` is a list, and `spec` suggests the chosen class's specs
  as I type (Hunter: Beast Mastery, Marksmanship, Survival). The private reply names the
  character, spec and role. A spec typed past the suggestions is still checked ("\"holy\" is not
  a hunter spec").
- [ ] `/random character list` shows my characters privately, main marked. `main` and `remove`
  suggest my own characters' names; `main` makes one my main.
- [ ] `/random character remove` asks first, privately, with a **Remove** button; pressing it
  removes the character. Anyone else pressing the same button removes nothing.
- [ ] On a raid's card, **Switch character → New character…** opens a form: name, then class,
  spec and role from lists. Sending it saves the character and signs me up with it in one step
  ("your new character"), keeping my place in line. A spec of the wrong class is refused and
  nothing is saved.
- [ ] With no characters at all, the signup button opens the same form straight away; for Late or
  Tentative it asks for the note too.
- [ ] On the site, `/characters` has **Edit** for each character (name, class, spec, role, main).
  (`character-form.test.ts` and `member-pages.test.ts` cover it.)
- [ ] A Discord-only Friend gets "needs the Member rank"; someone the bot doesn't know is told to
  wait for the role sync.

### J41 · A Fury warrior signs up to tank a dungeon
**When** I'm tanking in a DPS spec (a Fury warrior with a shield), **I (raider) want** to sign up
as a tank, **so I can** fill the slot the group needs without pretending to be Protection.
- [ ] Rook makes a 5-player dungeon (1 tank). Aeryn switches to her Fury warrior Aerfury; the
  **Role** menu reads "Guess from the spec (Melee DPS)". She picks **Tank**: the reply says
  "as **Aerfury** (Fury Warrior, tank)".
- [ ] **Change spec** to Arms keeps Tank (it was picked); the saved Aerfury is still melee DPS.
  Picking "Guess from the spec" goes back to following the spec.
- [ ] The card counts her as the tank (Tanks 1/1), and "tanks needed" no longer shows.
- [ ] Thorg saves his Fury warrior as a tank once (`/random character add … role:tank`, or Role
  on the Characters page); his signups start as a tank.
- [ ] On the site, the signup card has the same Role control. (`signup-card.test.ts` covers it.)

### J28 · Make a raid from Discord
**When** a run comes together in chat, **I (raid leader) want** to make the raid with a slash
command, **so I can** open signups without going to the site.
- [ ] Rook runs `/random event create` with a start like `2026-11-03 8pm`; the private reply shows
  the time as a Discord timestamp, says what was made ("40-player raid", "looking for 4 tanks · 10
  healers · 26 DPS"), and the signup card goes up within seconds (no wait for the tick).
- [ ] The time is read in the guild's clock (the zone the site's calendar uses: the first active
  schedule's, else the first schedule's, else Chicago).
- [ ] With `serverEvents` on, the new raid also shows in the server's Events list (J24).
- [ ] `kind: battleground` with `healers: 3` makes a 10-player battleground looking for 0 tanks,
  3 healers and 7 DPS; its server event is named "Battleground · …". A 10-player dungeon is
  refused with the sizes a dungeon takes.
- [ ] `/random event pick-night` with two times opens a raid-night vote in the signup channel (J18).
- [ ] A raider gets a private "needs the Raid Leader rank"; an unreadable or impossible time says
  how to write one.
- [ ] A stale `/random raid` (before the commands are re-registered) gets the private "can't do
  that yet" reply, not a timeout.

### J45 · Make a dungeon from the Discord form, adjust the comp, and post it
**When** a run comes together in chat, **I (raid leader) want** to fill in a form instead of
remembering a slash command's options, **so I can** check the event before anyone sees it.
- [ ] Rook runs `/random event create` with nothing typed. The **New event** form asks for Name
  (its note says "Submit to set up the event."), Kind (four radio buttons: Raid, Dungeon,
  Battleground, Event), Where, Date, and Time named for the guild's zone, like "Time (Chicago)".
- [ ] Date lists the next 25 days in the guild's clock: "Today", "Tomorrow", then "Wed, Oct 28"
  and on, with nothing picked yet. Its note says to type `start:` for a date further ahead. Time
  goes in half hours from 12:00 PM to 11:30 PM and starts on the guild's usual raid time (8:00 PM
  here; a schedule starting off the half hour, like 7:45, adds that time).
- [ ] He picks Dungeon, Scarlet Monastery, Wed, Oct 28 and 7:00 PM. The private reply previews
  it: the time as a Discord timestamp and "in N days", 5-player dungeon, "1 tank · 1 healer · 3
  DPS (the usual comp)", 3 hours, with **Set up event**, **Edit details**, and **Cancel**.
  Picking Today with a time already gone shows "already passed" under "Fix before posting".
- [ ] **Set up event** opens **Dungeon details (5 players)**: no size to pick, Tanks 1, Healers
  1 and DPS 3 filled in, and Length in hours 3 ("Submit to preview, then Post event."). A raid
  offers 10/20/40 as radio buttons, a battleground 10/15/40 with no Tanks box, and an Event a
  size box where empty means open.
- [ ] He sets Healers 2, DPS 2 and 2 hours. The preview shows "1 tank · 2 healers · 2 DPS", 2
  hours, and **Post event**, **Edit details**, **Edit size and comp**, and **Cancel**. Counts
  that add up to more than the size, or a past time, show under "Fix before posting", and **Post
  event** stays greyed out until they're fixed. **Edit details** reopens the form with Wed, Oct
  28 and 7:00 PM still picked.
- [ ] `/random event create start:2026-12-24 8pm` (no name) opens the form with Thu, Dec 24 as
  the first date, picked, and 8:00 PM. A preview from before this form changed answers **Set up
  event**, **Edit details**, **Edit size and comp**, or **Post event** with "That draft is from
  an older version; run `/random event create` again." (**Cancel** still cancels.)
- [ ] **Post event** turns the preview into "Made **Cathedral run** (Scarlet Monastery, 5-player
  dungeon) …" with no buttons, and the card goes up with Healers 0/2. Pressing it again (or a
  second click) makes no second dungeon.
- [ ] **Cancel** on another draft says "Cancelled, nothing was made." A raider who runs the bare
  command gets "needs the Raid Leader rank" and no form.
- [ ] `/random event create` with a name and a start still makes the event at once (J28).

### J44 · Check the addon's export after the raid
**When** a raid is over, **I (raid leader) want** to paste the Vintage addon's export string and
see who was there and what dropped, matched to the raid's signups, **so I can** catch problems
before attendance and loot are recorded. The check records nothing.
- [ ] Rook pastes the export in the officers' quarters (Tonight → **Check an export**). Its
  **Raid** picker starts on the raid that started last (Wednesday's, not Thursday's that Tonight
  now shows), lists the rest of the last week and the next day, and offers **The raid the export
  names** for an export the addon made from an import.
- [ ] It lists each snapshot (start 3 · Lucifron 3, 1 offline · end 2), who was seen and in how
  many snapshots, **Not signed up** (a pick-up such as `Doran-Stonemaul`), **Signed up but not
  seen** (Cadence), and the loot with item names when the export carries them. Benched and
  queued signups aren't missed; someone who declined and came anyway is listed as such.
- [ ] Nothing warns, since the export was taken that night. Checked against another night it
  warns how far apart they are, and checked against a raid other than the one the addon made it
  for, it says so. A `Name-Realm` is matched to a signup only when no one else could be meant,
  and is listed as **Matched by name only**.
- [ ] `/random event check-export` with the same string gives the same lines privately, the
  warnings and who to follow up with first. Typing in `event:` suggests the raids that started
  in the last week, the latest first, to raid leaders and officers only; a raider, a
  Discord-only friend, or a stranger gets no suggestions. A raid name typed instead of picked
  says to pick it from the suggestions.
- [ ] Over `/mcp`, `raid-export-check` is listed for a raid leader and not for a raider, and
  returns the same result as the site.
- [ ] A raider gets "needs the Raid Leader rank" in Discord. An import string pasted by mistake
  says to paste it into the addon instead (`WRONG_KIND`).
- [ ] Afterwards the raid's signups are unchanged.
- The automated scenario uses the Lua-made `raid-export-night.v1` string from
  `libs/bridge-format/fixtures/lua-made.json`, written by the addon's own codec. For a live run,
  any string from that file works, or one from the addon once its Export tab lands.

### J46 · Record the addon's export after the raid
**When** a raid is over and the export checks out, **I (officer) want** to record it, **so I can**
keep who attended, who stood by, and what dropped, under the raid's loot method, and close the raid.
- [ ] Rook (Raid Leader) can't record: `raid-export-record` isn't listed for him over `/mcp`, and
  running it says it doesn't exist. Ana (Officer) sees it.
- [ ] Ana runs `raid-export-record` with the export (including Daralis confirmed on `standby` after
  signing up on Standby) and Wednesday's raid. The preview says "Records Raid night: 4 attended,
  2 drops; completes Raid night" and carries the same check as J44 (Cadence signed up but not seen,
  `Doran-Stonemaul` not signed up). Nothing is stored yet: `attendance-list` has no record.
- [ ] Confirming says "Recorded Raid night: 4 attended, 2 drops; completes Raid night".
  `attendance-list` (a raider) shows Aeryn and Bramble in 3 snapshots, Daralis with `stoodBy: true`
  (0 snapshots, matched to her signup for full attendance credit), and `Doran-Stonemaul` in 2 with no
  signup; `loot-list` (any member) shows Arcanist Boots → Bramble and Lava Core ×2 →
  Doran-Stonemaul; `raid-get` says completed.
- [ ] On the next tick, the summary post in `#raid-signups` lists **Stood by · 1** (Daralis) apart
  from **Came · 3** (Aeryn, Bramble, Doran-Stonemaul).
- [ ] Recording the same string again changes nothing and says it's already recorded. A different
  export for the raid replaces the first after its own preview.
- On the website, officers see **Record export** beside **Check export** in the quarters' Tonight
  tab (preview, then confirm), and `/raids/<id>` shows the recorded attendance, standby credit,
  and loot once completed. Boss kills on the progress ledger are J47.

### J47 · The night's first kills land on the ledger, and Random posts the raid summary
**When** an officer records an export that carries boss attempts (#221), **I (raider) want** the
night's first kills on the guild's progress ledger and a summary in the signup channel, **so I
can** see how the night went without anyone typing it up.
- [ ] Barrow Deeps on Dec 10: the export has a Chillhowl wipe then kill, Elder Tangleclaw down,
  two Khalith wipes, and a kill of a boss the ledger doesn't know (Gloomfang).
- [ ] Ana's preview lists Chillhowl and Elder Tangleclaw for the ledger and Gloomfang as matched to
  no boss. Confirming says "2 first kills on the ledger; 1 kill matched no boss (Gloomfang)".
- [ ] `progress-get` (any member) has Barrow Deeps at 2/8 with Chillhowl's first kill at the time
  it died, and Khalith as the next boss.
- [ ] The next tick posts **Raid summary · …** to the signup channel: "Bosses: 2/8, 3 wipes,
  1h 24m", then who came and what dropped. Ticking again posts nothing more.
- [ ] Pasting the same string again changes nothing. A later export of the same night adds no
  kills (they're already recorded) and the summary is edited in place, not posted again.
- Matching is by name until the Forever spike (Nov 4–6) reads the encounter ids into
  `LAUNCH_RAIDS`.

### J31 · Run a dungeon with the same signups
**When** a few of us want a dungeon, **I (raid leader) want** the same signup card with a
dungeon's comp, **so I can** fill five spots without a raid's rules getting in the way.
- [ ] Rook runs `/random event create` with `kind: dungeon`, `size: 5`, `tanks: 1`, `healers: 1`,
  `dps: 3`; the reply says "5-player dungeon" and "looking for 1 tank · 1 healer · 3 DPS".
- [ ] The card is titled "Dungeon · … · Scarlet Monastery", says "5-person dungeon", and shows
  Tanks 1/1, Healers 0/1, DPS 0/3 once the tank answers.
- [ ] **Missing** lists only roles (1 healer · 3 dps): no Mark of the Wild, Fortitude, or
  Intellect line, since buffs only count for raids.
- [ ] The sixth person to answer is queued, and the card shows **5** going and **1** queued.

### J32 · Open a levelling group anyone can join
**When** people want to level together, **I (raid leader) want** a signup with no size and no
instance, **so I can** take everyone who turns up without a cap or a queue.
- [ ] Rook runs `/random event create` with just a name, a start, and `kind: other`; the reply
  says "(open event)" and "looking for any roles".
- [ ] The card is titled "Event · Westfall levelling" (no instance) and lists everyone in one
  "Going N" column with no "/size", no role columns, and **Comp** no gaps.
- [ ] Six people answer and none is queued.
- [ ] A raid made without a size or an instance is refused with what it needs.

### J50 · Mark myself absent before the raids are up
**When** I know ahead of time I'm out for a stretch of days, **I (raider) want** to set a date
absence once, **so I can** show as Absent on those raids without getting pinged or DMed.
- [x] Cade adds Dec 3 to Dec 7 with reason `"work trip"`.
- [x] Wednesday and Thursday guild raids count him in Absent (card count + Roster Absent names
  only), skip him in T-72h reminders and T-30h DMs, and list `Absent (1): Cade (work trip)` in the
  `#leads` digest.

### J51 · A night I can never make
**When** a weekly raid night doesn't fit my schedule, **I (raider) want** to set it once as a
weekly absent night, **so I can** stop getting reminded for that weekday.
- [x] Dara sets Wednesday as absent via `/random absence weekly` (or `absence-weekly-set`).
- [x] Every Wednesday guild raid marks her absent and leaves her alone; Thursdays still remind her.
- [x] Clearing her weekly rule restores Wednesday reminders.

### J52 · I can make it after all
**When** an absence covers a night I can actually attend, **I (raider) want** to press Accept on
that raid without touching my absence, **so I can** override just that night.
- [x] Dara (absent Wednesdays) presses Accept on this Wednesday's raid: she shows under her role,
  drops out of `away` and the digest's Absent line, and next Wednesday stays absent.

### J53 · Absent after I've signed up
**When** I add an absence over raids I already signed up for, **I (raider) want** the bot to tell
me and offer to mark them absent without silently deleting my signups.
- [x] Aeryn accepts Wednesday and Thursday, then adds Dec 3 to Dec 7. The reply lists both raids
  and offers **Mark all 2 absent**; until clicked, both signups stay intact.

### J54 · An officer marks someone absent
**When** a raider tells an officer in DM they're out, **I (leader) want** to add the absence for
them, **so I can** keep the roster accurate.
- [x] Ana adds an absence with `memberId: bram`; `createdBy` is Ana. A raider attempting `member:`
  gets "needs the Raid Leader rank".

### J55 · Leaders see who's out, reasons stay private
**When** planning the raid, **I (leader) want** to see absence reasons while members only see
names.
- [x] `absence-list` with `eventId` returns reasons to leaders and omits reasons for raiders.

### J56 · Always late on Thursdays
**When** I'm always 15 minutes late on Thursdays, **I (raider) want** Accept to record Late (15m)
with an **On time this week** override.
- [x] Bram sets Thursday 15m late. Thursday still reminds him; pressing Accept signs him up as
  Late (15m) with **On time this week** to flip to Accepted.

### J57 · One night out from the post
**When** I'm missing just tonight, **I (raider) want** the Absent button to decline only that raid
and offer **Absent more days**.
- [x] Pip presses **Absent** on Friday's post; no absence row is created and the reply includes the
  **Absent more days** button.

### J58 · See the whole raid on the card
**When** 40 people with long names sign up, **I (raider) want** four role columns (Tanks, Healers,
Melee, Ranged) with spec icons inside Discord's limits.
- [x] 40-person card renders 2x2 role columns, spec icons, and stays within Discord's 1,024/field
  and 6,000/embed limits without slicing mid-emoji.

### J59 · Say how late
**When** I'll be late, **I (raider) want** 5 / 15 / 30 min buttons instead of a form, while
Tentative still asks for a reason shown inline.
- [x] Pressing Late shows 5/15/30 min buttons; the card shows the late minutes and the digest shows
  `Name 15m`. Tentative shows its reason inline after the name.

### J60 · Flex raiders wait on Standby
**When** I'm a Flex Raider answering a guild raid, **I (flex raider) want** to land on Standby with
a private explanation until a leader seats me.
- [x] Bram presses Accept on a guild raid with open seats: stored as Standby, private reply
  explains why, and leaders can seat him.

### J61 · A tank drops the night before
**When** a seated tank drops out after the T-24h digest, **I (leader) want** a `#leads` dropout
alert with Standby-only `[Seat X]` buttons and seated flex players listed as text.
- [x] Aeryn declines at T-20h. `#leads` gets the dropout post with `[Seat Ironhide]` and
  `[Seat Moonglade]` (can also tank) and `Thorgrim` as plain text. Pressing `[Seat Moonglade]`
  places her in Aeryn's group as `tank` and mentions her once.

### J62 · Lock with open seats
**When** a raid locks with open seats, **I (leader) want** the approved party post to become the
final roster in place without auto-seating tentative players.
- [x] Approved party post edits in place into Final Roster at lock, mentioning Standby once and
  showing open seats.

### J63 · A druid who can also heal
**When** I save other roles I can play, **I (raider) want** leaders to see them in the digest and
dropout alerts without volunteering me on the public card.
- [x] Moonglade's `alsoRoles` shows in digest gap hints (`Can also heal: Moonglade.`) and dropout
  suggestions, never on the public card.

### J64 · Approve the parties the night before
**When** the T-24h party draft posts in `#leads`, **I (leader) want** manual group moves to update
the draft live without spamming the change feed, and **Approve and post** to publish the parties.
- [x] Group-only moves update the `#leads` draft in place with no change-feed alert; approving
  posts the party post in the signup channel and promotes it in place at lock.

### J65 · Targets are suggestions
**When** more melee sign up than the melee target while seats remain, **I (raider) want** everyone
seated and the header to read `Melee 12/10`.
- [x] Going over a role target never benches anyone while raid seats remain.

### J66 · The comp decides, not who answered first
**When** a raid fills, **I (leader) want** comp balance and rank priority (`Raider > Recruit > Flex
Raider > Member > Friend`) to decide seats, not signup timestamp.
- [x] A tank answering last is seated ahead of an extra DPS who answered first.

### J67 · Flex raiders on Standby in a guild raid
**When** a Flex Raider presses Late 15m on a guild raid, **I (leader) want** them on Standby with
their 15 minutes preserved, while Members are refused and Friends don't see guild raids.
- [x] Bram's Late 15m lands on Standby keeping `lateMinutes: 15`; Member is refused (`Recruit`
  required); Friend sees only open raids.

### J68 · An open raid for pugs
**When** a leader creates an open raid (`access: 'open'`), **I (leader) want** it posted in the
open-raid channel where Members, Flex Raiders, and Friends sign up in full with no reminders or DMs.
- [x] Open raid posts to `openSignupChannelId`, allows Friends/Members/Flex Raiders to be seated in
  full, and sends no reminders, DMs, or absences.

### J69 · Leads see seat and Standby changes after T-24h
**When** signups or seats change after the T-24h digest, **I (leader) want** batched alerts in
`#leads` within seconds, and nothing before the digest.
- [x] Before digest: silent. After digest: new signups, late/tentative updates, switches, and
  leader seats batch into one `#leads` post per tick.

### J70 · A new Friend on raid night
**When** someone receives the Friend role minutes before an open raid, **I (friend) want** pressing
Accept to sync me on the spot and sign me up.
- [x] Clicking Accept on an open raid syncs an unknown Discord member from `interaction.member.roles`
  and signs them up immediately.

### J78 · Add a healer to a raid that's already up
**When** tonight's raid needs a different comp than the schedule defaulted to, **I (leader) want**
to change this raid's role targets without changing the schedule.
- [x] `raid-update` updates `roleTargets` on the raid while leaving the schedule untouched; the
  signup post updates its role header within a tick; a raider calling `raid-update` gets
  `COMMAND_NOT_FOUND`.

### J72 · Grow or shrink a raid before and after approval
**When** a raid's size changes before or after roster approval, **I (leader) want** the draft to
re-seat before approval and never unseat anyone after approval.
- [x] Before approval: growing seats overflow Standby; shrinking clears out-of-range manual groups.
- [x] After approval: shrinking below seated count saves without unseating anyone, `#leads` warns
  how many to move to Standby, the `#leads` draft and quarters show overflow and out-of-range
  groups while public party-post/final-roster updates stay held until `seated <= size` (#345);
  growing opens seats and posts Standby-only `[Seat X]` buttons to `#leads`.

### J73 · Two raid nights from Discord
**When** the guild runs recurring raids on separate nights, **I (leader) want** to create, list,
edit, pause, and resume schedules right from Discord.
- [x] `/vintage schedule create` creates each schedule via the 2-stage modal + preview form and
  posts this week's raids right away; `/vintage schedule list` shows both with their next raid;
  pausing one stops new raids for it while leaving the other active.

### J74 · Sign up on the site from the Discord post
**When** I see a raid in Discord and prefer answering on the site, **I (raider) want** a short link
right on the signup post that opens that raid's signup card.
- [x] The signup post's subtext line ends with `[vintageguild.gg/r/<code>](https://vintageguild.gg/r/<code>)`,
  the **Raid page** button and Discord server event use the same short link, party posts and final
  rosters include it too, and reminder DMs keep the Discord message link.
- [x] Opening `/r/<code>` resolves through `raid-get({ shortCode })` (case-insensitive), answers on
  the signup card refresh the Discord post within a tick, and a Friend probing a guild raid's code
  gets `RAID_NOT_FOUND`.

### J75 · Move or cancel from the signup card
**When** an event was posted on the wrong day or won't happen, **I (leader) want** to fix it from
its Discord signup card, without the website.
- [x] **Manage** on the card gives a leader a private Move / Cancel menu; anyone below Raid Leader
  gets a private "ask a raid leader". Move picks a day and a time in the guild's clock and keeps
  signups; Cancel asks first. The card follows on the next tick: the new time, or a Cancelled
  card with no buttons.

### J82 · Tentative signups confirm by DM
**When** the leads get the party draft and some signups are still Tentative, **I (raider) want** a
DM asking if I can make it, so I can answer with one button instead of finding the signup post.
- [x] With `tentativeCheck` on (the quarters' Bot tab), each member who was Tentative when the
  draft went out gets one DM before lock (not members who turned DMs off). **I can make it**
  answers Going, **I can't make it** answers Absent, **Still don't know** changes nothing; the
  DM loses its buttons once answered.
- [x] The Bot tab's log has each of those DMs and each answer (`tentative-answer`), with what
  the member chose: "Can make it, now Going", "Can’t make it, now Absent", or "Still doesn’t
  know, stays Tentative".

### J80 · Rank a character's wishlist and feed loot council candidates
**When** I want loot council to know which raid drops matter most to my character, **I (raider)
want** to rank items on my character's wishlist so officers see my priority when an item drops.
- [x] `wishlist-set` saves a ranked list per character (own characters for recruits/raiders, any
  character for officers), `wishlist-get` / `wishlist-list` read it back in rank order, and `/wishlist`
  on the site lets members add, reorder, and remove items.
- [x] `loot-candidates` under the `council` loot method reads wishlist interest through
  `@vintage/wishlist/contract` and ranks higher-priority wishlisted mainspec attendees ahead of
  lower-ranked or non-wishlisted ones with the wishlist rank and note in each candidate's reason.
