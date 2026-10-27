# Recruiting and the public site

The open roles on the website, from an officer changing them to the public recruiting band
(`docs/features/active/role-aware-views`, the Recruiting tab), and applying to the guild, from
the recruiting post to the onboarding DM. Automated in
`apps/api/tests/jtbd/recruiting.jtbd.test.ts`.

**Cast:** Ana (Officer), Rook (Raid Leader), and a visitor who isn't signed in.

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`), or the website's
   dev fixtures (`pnpm --filter @vintage/web dev`) with `?as=officer`, `?as=leader`, and
   `?as=visitor`. Fixtures reset on a full page load, so move between pages with the site's own
   links after saving.
2. Without sign-in, run commands as the system caller
   (`npx convex run commands:runAsSystem '{…}'` in `apps/api`).

## Jobs

### J21 · Edit the open roles without a deploy
**When** our needs change, **I (officer) want** to edit the open roles on the site, **so** the
public recruiting band and the hero's figures change without a deploy.
- [ ] Before anyone saves, `recruiting-get` as a visitor answers the starter band with
  `updatedAt: null`. The home page's band eyebrow reads just "Recruiting".
- [ ] In the quarters' Recruiting tab, Ana changes the headline, sets Hunter to Medium, and saves.
  The tab says it saved and when; the class rows re-sort high, medium, closed.
- [ ] The home page shows the new headline and "Recruiting · updated" with today's date. For a
  visitor, the class table has the new rows with their icons and the hero's "roles we need most"
  figure counts the high rows. For members, the one-line ask names the high classes.
- [ ] Ana sets Warrior to Closed and saves. The tab and the home band list Warrior with the
  closed classes at the bottom: whatever order the needs are saved in, `recruiting-get` answers
  high, medium, closed.
- [ ] Rook sees the tab read-only ("Officers edit the recruiting band"); `recruiting-set` as Rook
  answers `COMMAND_NOT_FOUND`.
- [ ] `recruiting-set` with a class listed twice answers `DUPLICATE_CLASS` and changes nothing.

### J23 · Set the guild's public words without a deploy
**When** our raid nights, style, or invite change, **I (officer) want** to edit the home page's
facts and intro, the About page, the Discord invite, and the contact email on the site, **so**
visitors read what is true now.
- [ ] Before anyone saves, `guild-profile-get` as a visitor answers the starter profile; "Join
  the Discord" points at the recruiting band; Privacy and Terms say to ask an officer in Discord.
- [ ] In the quarters' Guild tab, Ana changes the intro, sets the invite, adds an About section
  with two paragraphs, and saves. The tab says when it saved.
- [ ] The home page's intro and "Join the Discord" link follow; a visitor sees the facts under the
  title; About shows the new section as two paragraphs.
- [ ] With a contact email set, Privacy and Terms list it under Contact.
- [ ] An invite that isn't a discord.gg or discord.com/invite link answers `VALIDATION_ERROR`.
- [ ] Rook sees the Guild tab read-only; `guild-profile-set` as Rook answers `COMMAND_NOT_FOUND`.
- [ ] For members, the calendar's line under "Coming up" names the raid nights and signup
  timings from `schedule-list` in their time zone; change a schedule and it follows.

### J28 · Apply from Discord and hear back

When I want to raid with Vintage, I want to apply in the guild's Discord and hear back there, so
I don't have to find a website or an officer first.

Live checklist:

- [ ] `/random apply character:… class:… spec:… role:raider` opens a form for the long answers;
      submitting it says the officers have it.
- [ ] The recruitment channel (`application-config-set channelId`, officers only) shows the
      application with its labels and Accept, Ask more, and Decline.
- [ ] Ask more sends me the officer's text in a DM, and the post shows it.
- [ ] Accept marks it accepted on the post; the onboarding DM waits for the role (J34).
- [ ] Applying again while one is open says it is still with the officers, and a raider is
      told they already raid with Vintage, both before the form opens.
- [ ] On the site, signed in with Discord, `/apply` shows the same form, then my application's
      status and the officers' reply; officers see it in the quarters' Applications tab, where
      Decline asks for a second click.

### J34 · Apply as a raider, get accepted, get onboarded

When I want to raid with Vintage, I want to apply from the recruiting post, be accepted, and be
told where to start once I have my rank, so I go from applicant to recruit without chasing anyone.
Automated in `recruiting.jtbd.test.ts` (J34).

Live checklist:

- [ ] `/random recruiting` by a raid leader posts the open needs (`recruiting-get`) with **Apply
      as a raider** and **Apply as a flex raider**. A button opens one form: character, spec and
      class ("Restoration Shaman"), about, experience, availability. A spec with no class asks
      again.
- [ ] The officers' review post has Accept, Ask more, and Decline. In the quarters' Applications
      tab the same application shows with its detail; a reply there is the same `application-review`.
- [ ] Accept answers the officer privately: "Give them @Recruit in Discord" (the role mapped to
      recruit; no ping). No DM goes out yet. With no role mapped, it says to map one.
- [ ] The officer gives the role. Within one role sync (15 minutes, or
      `npx convex run roleSync:syncAllMembers`) the member is a recruit and Random DMs the
      onboarding note with the site's address, once; a later rank change sends nothing.
- [ ] Given the role before Accept, Accept sends the onboarding DM at once.
- [ ] A member who turned DMs off (`member-prefs-set dmOptOut:true`) gets no onboarding DM, then
      or later.
- [ ] Decline still asks for a Confirm click.

### J29 · Get a weekly roster check with one-click recruiting changes

When the coming raids are short on tanks or healers, I want a Monday note in the officers'
channel that says so and offers to raise those classes on the site, so recruiting keeps up with
the roster without anyone remembering to look.

Live checklist:

- [ ] With `coordinator-config-set weeklyAssessment:true`, the first tick after Monday 16:00 UTC
      posts **Weekly roster check** to the ops channel, once.
- [ ] A healer gap offers "Raise <class> to high" buttons; an officer's click changes the band
      on the site; a raid leader's click is refused.
- [ ] With `agent-pause`, the note is the plain facts, not reworded.
