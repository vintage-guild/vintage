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
- [ ] `schedule-create` (Wed/Thu 20:00 America/New_York), then a tick.
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
- [ ] At T-24h, non-responders get a DM unless they turned DMs off (`member-prefs-set`).
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
- [ ] At T-2h the raid locks, the post's buttons grey out, `#raid-signups` gets the final roster,
  and `#vintage-ops` gets an import string that decodes to the roster and groups.
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
- [ ] **Roster** shows the full list privately (everyone, by role, with places in line).
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
  schedule's, else the first schedule's, else New York).
- [ ] With `serverEvents` on, the new raid also shows in the server's Events list (J24).
- [ ] `kind: battleground` with `healers: 3` makes a 10-player battleground looking for 0 tanks,
  3 healers and 7 DPS; its server event is named "Battleground · …". A 10-player dungeon is
  refused with the sizes a dungeon takes.
- [ ] `/random event pick-night` with two times opens a raid-night vote in the signup channel (J18).
- [ ] A raider gets a private "needs the Raid Leader rank"; an unreadable or impossible time says
  how to write one.
- [ ] A stale `/random raid` (before the commands are re-registered) gets the private "can't do
  that yet" reply, not a timeout.

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
