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
  and the going count goes up. (The buttons do this once the gateway is live, #10.)

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
