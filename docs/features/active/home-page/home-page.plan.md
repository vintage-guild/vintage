# Home page

> Status: active · Created 2026-10-25 · Owner: Bloodfen · Branch: `claude/wow-guild-homepage-37008f`
>
> The public front page of the Vintage website: what a prospective recruit, a guildie, and an
> officer each see first. Bold and modern with WoW hints, not a parchment-and-gold theme park.

**Done when:** `/` is a designed home page on real tokens and FAST-AF, every section is wired
to a typed data source (live command or a clearly marked fixture), the page passes both themes
and phone width, and the stubbed sections have a named command or module that will replace
their fixture.

## Why now

Phase 0 ships a shell with placeholder copy. WoW: Forever launches 2026-11-04 and raids unlock
2026-12-09. Recruiting happens *before* launch, so the front page is the guild's recruiting
tool for the next six weeks, and later its scoreboard. The pieces behind it (roster, raids,
signups, coordinator) already exist as commands; the page should show them off.

## Research

_Filled in from the 2026-10-25 research pass (see "Sources" at the end)._

### What great guild home pages lead with

Ranked by how often the best pages carry it and how much recruiting weight it pulls:

1. **An identity strip:** ruleset, raid size, raid nights with time zone, difficulty tier.
   Guildfindr pages lead with these as tags; Raidify says a Forever guild must publish ruleset,
   10/20/40 size, times with zone, and casual/semi/hardcore before recruiting at all.
2. **The raid schedule.** Warcraft Logs only lists a guild in recruitment search when its
   schedule tile is filled. "When do you raid" is one of Guild Order's four recruit questions.
3. **Open roles by class and spec, with priority.** "Recruiting all classes" is the top
   anti-pattern in two 2026 recruiting guides. The common pattern is High / Medium / Closed
   per class.
4. **Progression with context.** Raider.IO's guild profile (per-tier kills plus rank) is the
   best compact layout found. Buried progression reads as hiding something.
5. **One Apply CTA and one Discord link.** Method puts Apply at the top and the bottom of its
   recruitment page. Discord's server widget (`widget.json`: online count, invite) needs no auth
   once the server enables it.
6. **Dated news and kill posts,** newest first. Dates are the point: Warcraft Logs and Raidify
   both flag listings older than 30 days. A visible "last updated" is cheap insurance.
7. **A live roster,** never a screenshot. Officers get a quick-look block above the full list.
8. **The loot system and rules.** Decide loot before the first raid and say it during leveling.
   ThatsMyBIS already supports Forever and has linkable public loot tables.
9. **Streams and media.** Nice to have, not load-bearing.

### Anti-patterns to avoid

- **Dead sites.** Of seven bespoke guild sites in one agency's portfolio, six no longer
  resolve. Enjin went dark in 2023, Guilded in December 2025. The site has to be cheap to keep
  alive and honest about its age, or it becomes the anti-pattern.
- **Discord-only intake.** Forum posters skip guilds that make you join Discord to learn
  anything. The website is the always-on storefront; Discord is where you convert.
- **Stale anything:** old threads, inflated progression, "friendly active community" adjectives.
- **Clutter.** Method's home page carries a promo bar, two nags, and a guides grid before any
  guild content. A small guild wins with one focused page.

### Pre-launch specifics (Forever launches 2026-11-04)

- **Timeline worth showing:** name reservation 2026-10-27, launch 2026-11-04, raids 2026-12-09:
  Barrow Deeps (10, 8 bosses), Hyjal Summit (20, 13 bosses), Onyxia's Lair (40).
- **Ruleset is an officer decision, not a poll.** Cross-ruleset grouping is unsupported.
  A guild "is not ready to announce" until realm, ruleset, and first-raid date are set.
- **No logs exist yet,** so candour, response time, and consistent stated times are the trust
  signals. Prep guides worth linking: Onyxia needs the Drakefire Amulet chain (per character)
  and fire resistance; Barrow Deeps and Hyjal have no stated attunement.
- **Week one:** a visible per-member level progress board and leveling pairs are the cheapest
  retention. Expect a week-six lull.
- Forever has no Battle.net roster sync yet, so the roster is addon- or hand-fed for now.

### Modern fantasy-adjacent design (what to borrow)

Sites that pull off "clean and modern with a dark premium edge", read 2026-10-25:

- **Diablo IV** (diablo4.blizzard.com): pure black, serif headlines in *bone* rather than
  yellow, red only on one CTA and one hairline-bordered button. Gold desaturated to bone at
  large sizes; crimson as the single hot accent.
- **Expedition 33** (expedition33.com): dark hero, IM Fell italic headings in cream, a dotted
  eyebrow, the CTA as a thin gold-bordered bar with a diamond mark. Editorial fantasy, no texture.
- **League of Legends** (leagueoflegends.com): cool navy near-black; gold only on the wordmark
  and one outlined button. The strictest "gold as accent only" example.
- **D&D Beyond** (dndbeyond.com): charcoal, serif display + Roboto Flex body, loose-tracked
  serif eyebrow, one coral CTA. A modern product site with a fantasy voice.
- **Avowed** (avowed.obsidian.net): painted key art bleeding behind the grid, the emblem as
  the hero, small-caps nav.
- **Counter-example: Path of Exile 2** (pathofexile2.com): full gold-frame skinning. Exactly the
  look to avoid.

Three palette directions that keep the emblem's gold and crimson:

| | Neutrals | Gold | Crimson | Seen on |
|---|---|---|---|---|
| **Black lacquer** | near-black iron, no brown | display headings and hairlines, pulled toward bone at size | the one interactive accent | Diablo IV |
| **Cold steel** | iron with a blue cast | strict accent: wordmark, one outlined button, focus, badges | large fields only, never text | LoL, Avowed |
| **Ink and cream** | the parchment theme | hairlines and small marks only (gold text on cream fails contrast) | headings and emphasis | Tolkien Estate (light), KCD2 (dark mirror) |

Tasteful WoW hints: class colors as data on the roster only; item-quality colors as a status
scale; an eyebrow label with a gold underline instead of Friz Quadrata; a single hairline,
corner-cut CTA instead of gold fills or frames.

### Typefaces (OFL, on Google Fonts)

Engraved or inscription: **Marcellus** (Trajan-flavored but softer; SC variant for titling),
**Forum** (Roman capitals with Art Nouveau warmth), **Castoro Titling** (Venetian all-caps),
**Luxurious Roman** (chunkier, more medieval). Modern editorial: **Fraunces** (variable: opsz,
wght, SOFT, WONK), **Cormorant Garamond** (high-contrast luxury Garamond), **Newsreader**
(magazine serif with an opsz axis), **Spectral**. Wildcards: Eczar, IM Fell Double Pica,
Grenze Gotisch, Alegreya. Bodies that pair: Inter, Source Sans 3, Instrument Sans, Figtree.

The three concept mockups each try one pairing: A Fraunces + Instrument Sans + JetBrains Mono;
B Marcellus + Figtree; C Cormorant Garamond + Newsreader + IBM Plex Sans.

### Design references

- Method's recruitment page: order to borrow (goal, what you get, requirements, Apply top and
  bottom). Ignore the rest of method.gg.
- Raider.IO's guild profile: the About block (logs, Discord, apply), officer quick-look, and
  per-tier progression. The best compact progression layout found.
- Guildfindr's guild page: the minimal tag banner and Recruiting badge. Shows the floor.
- Syndicate's Forever page: a pre-launch key-facts strip (Beta / Launch Nov 4 / Cap 60),
  a dated roadmap, a four-step guild plan, one Discord CTA.

## Design direction

Brief from the GM side (2026-10-25): clean and modern, WoW hints allowed, don't lock into WoW
yellow-and-brown, and push it: bold, creative, beautiful. Logo is fixed (`assets/brand`).

### Palette stance

The emblem gives us gold, crimson, and iron. The trap is gold-on-brown. The stance:

- **Iron is the canvas.** Near-black `iron.900`/`iron.950` with the warm parchment text we
  already have. Dark stays the default.
- **Crimson is the big shape.** Large fields (hero band, section blocks, the "tag" motif) use
  `crimson.700`–`900`. Crimson at scale reads as premium, not WoW.
- **Gold is a line, not a fill.** Gilt rules, numerals, the active state, the emblem. Never a
  background. Gold used thin is the single strongest "this is Vintage" cue.
- **Parchment is a surprise section.** One mid-page band flips to the parchment theme (a notice
  board, a pinned post). The site already ships both themes; a split page uses both at once.
- **Class and quality colors are the only other hues.** Names in class colors, items in quality
  colors: Blizzard's values, unchanged. They carry the WoW feel for free.

### Typography stance

Cinzel is the placeholder display face and it's not even loading today (no `@font-face`; the
page renders Georgia). Pick the real faces in this feature. Candidates and pairing come from
the research pass; constraints: OFL or self-hostable, display face preloaded, body face with a
real text range (300–700), and tabular numerals for counters and kill dates.

The AFD base already sizes `h1` at `clamp(3.5rem, 11vw, 13rem)` and ships hard offset shadows
(`--shadow-offset-*`). That's an editorial, big-type language; the home page should use it.

### Three directions to choose from

| | A · The Ledger | B · The Tag | C · The Broadsheet |
|---|---|---|---|
| Idea | The guild as a record: a kill ledger, a roster wall, a schedule. Dense, typographic, data-forward | The emblem is a tag on a chain. The chain becomes the page's spine: a vertical line sections hang from, a timeline from launch to raids | A magazine front page: oversized headline, one lead story, columns, the parchment band as the pinned notice |
| Hero | Massive numerals: days to launch, raid nights, bosses down. Emblem small and sharp | Emblem huge, hanging; a manifesto line; the chain runs down into the timeline | A headline in the display face at `h1` size, a standfirst, the emblem as a masthead stamp |
| Risk | Can feel like a dashboard | Chain motif can get kitsch if drawn too literally | Needs real writing (officers' news) to look alive |
| WoW hints | Class-colored names, quality-colored loot, boss names | Chain and tag, iron textures, inscription numerals | Kill posts, loot of the week, strategy columns |

**First round (2026-10-25):** A, B, and C were mocked up on the real token CSS. Feedback from
Bloodfen: all three stuck too hard to brown and gold and read as monotone; the Tag wastes the
top of the page; the Broadsheet is busy; the Ledger's data vis is the keeper but needs to show
what fills the slots once raids start; the header should be sticky and update as you scroll;
look at afd.dev for space, and at Farsight's image work for imagery. Also: the signed-in
member in the mockups is a flex-raider warrior (tank or DPS), not an officer.

### Concept D · Ember (the revision)

What changed, and where it came from:

- **Palette:** Farsight's Ember workspace palette (cool graphite neutrals with a slight green
  cast, chalk text, cool silver for supporting text, one ember-orange action color, mint for
  "open / going", brass only as a hairline). The emblem's gold and crimson appear only in the
  logo. One full-bleed chalk band (recruiting) breaks the dark, the way afd.dev's cream bands do.
  These are candidate tokens for a `graphite` scale and an `action` role in the `vintage` node.
- **Imagery:** Farsight's generated instance art (the Ragefire Chasm scene from
  `web/src/assets`) behind a compact hero, faded into the canvas. The pattern Farsight uses on
  guide pages (`instance-art.ts`: one piece per zone, positioned per image) carries over: one
  scene per raid, used behind the hero and the next-raid card.
- **Space:** hero is content-height with the four figures on its lower edge, not a viewport
  of emblem. Sections are afd.dev-style bands with one big heading each.
- **Sticky header that follows the page:** an IntersectionObserver swaps the header's section
  label and its action (Sign up / See the ledger / Apply / Find me / Open the log) as sections
  pass, with a thin scroll-progress line. The member chip shows who is signed in.
- **Three data states** behind a switch: pre-launch (Oct 25), launch week (Nov 8), raiding
  (Dec 17). The ledger slots fill with first-kill dates and show the datamined boss names
  on hover; a "first kill" card carries a quality-colored loot line; the roster shows levels in
  launch week and attendance when raiding; the next-raid card shows the member's own answer,
  character, and roster slot.
- **Type:** Archivo (variable width) for headlines, Instrument Sans body, JetBrains Mono labels.
  No serif: the WoW hint is the art, the class colors, and the emblem.

Boss names for Barrow Deeps (8) and Hyjal Summit (13) come from beta-client datamining and are
not published by Blizzard; the page says so next to the ledger.

**Second round (2026-10-25):** D read as much better. Feedback: try slab serifs, Archivo is too
literal to AFD; the Ember orange was not the point of the Farsight reference, the imagery was;
Blizzard's Forever roadmap and site bring in other colors (dusk sky, teal banners, cream,
gold band, plum darks) and its lights, darks, and greys work, so extend that with a Vintage
voice in more vintage tones; subtle noise or texture; the logo needs to be bigger.

### Concept E · Dusk (the second revision)

D's layout, header behavior, and three states, re-colored and re-set:

- **Palette:** plum-black ink scale (`#17161d` → `#282733`), cream text and a cream band,
  dusty rose for emphasis (the accent word, section eyebrows, "you"), verdigris teal for every
  action and "open / going" state, ochre for kills and the hairline over the figures, dusty
  blue for queue and history. Crimson stays for "can't" and danger. The emblem is the only
  place its own gold and crimson appear at full strength.
- **Imagery:** the scene art is desaturated and washed with a plum-to-rose gradient
  (`mix-blend-mode: color`), so any future raid art lands in the palette. A fractal-noise
  grain (inline SVG, 7% overlay) sits over the whole page.
- **Type:** slab serif display with a live switcher in the concept bar: Hepta Slab (default,
  variable 300–900), Zilla Slab, Rokkitt (condensed), Bitter, Alfa Slab One (heavy, one
  weight). IBM Plex Sans body, IBM Plex Mono labels. Section eyebrows in rose.
- **Logo:** the painted color emblem in the header at about 5rem wide instead of the small
  two-tone trace, with the header a touch taller.

**Third round (2026-10-25):** Bitter chosen as the display face. The palette felt washed, so
the darks went darker (`#100f15` canvas), the lights lighter, and surfaces got a 1px top
highlight plus a shadow; the action button and ochre kill slots got a soft glow. The hero
now uses Bloodfen's Horde-versus-dragon art with the dark fade only on the left, so the right
side shows the image clean; headline and standfirst carry a text shadow, and the figures strip
sits on a blurred dark panel over the art's lower edge. On phones the whole hero darkens so
the text stays readable over the art.

## Page anatomy

Top to bottom. "Source" is the command the section reads; "now" says what ships in this feature.

| # | Section | What it shows | Source | Now |
|---|---|---|---|---|
| 1 | Hero | Emblem, manifesto, one Apply CTA and one Discord link, and the **identity strip**: ruleset, raid size, Wed + Thu with time zone, tier (research item 1) | static | real |
| 2 | Timeline (the chain) | Three dated marks the page hangs from: name reservation 2026-10-27, launch 2026-11-04, raids 2026-12-09; a countdown to the next one | static + clock | real |
| 3 | Next raid | The next event: instance, local time (`Intl`), role counters "Tanks 2/4 · Healers 6/9 · DPS 20/27", signup CTA, lock time | `raid-list`, `signup-list` | fixture client |
| 4 | Progression ledger | Per raid (Barrow Deeps 8 bosses, Hyjal Summit 13, Onyxia's Lair 1): bosses with first-kill dates; pre-launch shows "unlocks Dec 9" | `progress-get` (`progress` module; leaders record with `kill-record`) | real |
| 5 | Recruiting (parchment band) | Per class and spec: High / Medium / Closed, with a short pitch, the loot system in one line, and the Apply CTA again | officer config (`recruit-needs-set`, later) | page fixture, marked |
| 6 | Roster wall | Officers quick-look, then every member as a class-colored name grouped by rank; hover shows spec and role; pre-launch, a level progress column | `member-list`, `character-list` | fixture client |
| 7 | From the coordinator | The last few bot posts rendered as dated cards, newest first (signup post, lock notice, kill) | `coordinator-log` (`CoordinatorAction` rows) | fixture client |
| 8 | Polls (concept) | "Off-night on Sunday or Monday?" with live-looking bars; a preview of a future `polls` module. (Ruleset and loot are officer decisions, so the sample poll isn't one of those) | none | page fixture, marked |
| 9 | Footer | Discord, GitHub, addon (CurseForge, later), "built on AFD", theme switch, and a **last updated** date | static + build time | real |

Sign-in state: the same page for everyone. Signed-in members get a "You" marker on the roster
wall and their own signup state on the next-raid block once sign-in (#7) lands.

## Data: stub through the command client, not around it

Invariant 1 says surfaces hold no logic and read through commands. So the stubs do too:

- **`createFixtureClient()`** in `packages/ui-kit` (next to `createStubClient`): answers `read`
  for `member-list`, `character-list`, `raid-list`, `signup-list` with typed fixtures built from
  the module contracts (`Member`, `Character`, `RaidEvent`, `Signup`). `run` still answers
  `NOT_CONNECTED`. `apps/web` installs it in dev (`import.meta.env.DEV`) until Convex is wired;
  swapping to the Convex client changes one line.
- **Fixtures** live in `apps/web/src/fixtures/` as plain data: ~30 members with Forever-style
  names across nine classes, two raid nights (Wed/Thu), signups with the queue and Late states
  from #58, a handful of coordinator actions.
- **Concept sections** (progression, recruiting needs, polls) have no command yet. Their data
  is a local fixture file with a header comment naming the module that will own it, and the
  section carries a small "preview" mark in dev. No fake command names in the manifest.

## Components

New `packages/ui-kit` composites (tokens only, CEM entries, `@command` for anything that writes):

| Element | Built on | Notes |
|---|---|---|
| `vintage-countdown` | `violet-text` | Tabular numerals; `datetime` attr; ticks once a minute, no layout shift |
| `vintage-raid-next` | `violet-card`, `violet-progress` | Evolves `vintage-signup-card`; role counters; `@command` → `signup-set` once sign-in exists |
| `vintage-boss-ledger` | plain | One row per raid, one slot per boss: gold check + first-kill date, dashed next target, "unlocks Dec 9" before; boss names on hover/focus with the datamined note; a first-kill card with quality-colored loot (built, pass 3) |
| `vintage-roster-wall` | plain | Class-colored names in a dense wrap; rank groups; hover card |
| `vintage-role-meter` | `violet-progress` | Open/full per role for recruiting |
| `vintage-feed-card` | `violet-card` | Renders a `CoordinatorAction` the way Discord would |
| `vintage-poll-card` | `violet-card`, `violet-progress`, `violet-radio-group` | Concept; vote button disabled with a note |
| `vintage-chain-rail` | plain | The vertical spine and the hooks sections hang from (direction B) |

Primitives from `violet-elements` already vendored: card, badge, button, progress, divider,
persona, skeleton, empty-state, segmented-control, tabs, data-grid. Anything missing goes
upstream (`upstream:fast-af`) and gets a local stub with the issue link.

## Fonts

- Self-host woff2 under `apps/web/public/fonts/`, `@font-face` with `font-display: swap`,
  preload the display face only (PLAN §3.8).
- The display family is a token (`vintage.tokens.json` → `font.family.display`); change it
  there and rebuild. If the body face changes too, that's an `afd-site` override in `vintage`.
- Licenses: OFL files ship with their license text next to them.

## Build log

**Pass 1 (2026-10-25), from concept E:**

- Tokens: `plum`, `verdigris`, and `rose` scales in the `vintage` node; `vintage-dark` rebuilt
  on them (canvas plum 950, raised 800, text parchment 50, accent verdigris, emphasis rose,
  secondary accent gold 500). Fonts as tokens: Bitter Variable, IBM Plex Sans, IBM Plex Mono.
  Contrast tests pass in both themes; parchment is unchanged apart from the faces.
- Fonts self-hosted from Fontsource, imported in `apps/web/src/main.ts`. Preloading the display
  face is still to do (Vite only preloads modules).
- **Fixtures run the real commands.** Instead of a client that fakes answers, `apps/web/src/
  fixtures` builds the guild-kit registry over identity's and raids' memory stores, seeds it
  through `member-sync`, `character-add`, `raid-create`, and `signup-set`, and signs in Bloodfen
  (flex raider). Pages read through the normal `CommandClient`. The seed already caught one
  real rule: `member`-rank people can't answer a raid (`signup-set` is a recruit command).
- `vintage-logo-header` is now sticky with a section context block, an action, a member slot,
  and a scroll-progress line; `apps/web/src/site-context.ts` drives it from `data-section`
  attributes. New `vintage-hero` and `vintage-figure` elements. Home page at `/`, About moved
  to `/about`. The two-tone vector logo stays in the header, larger.
- Verified: both themes, phone width, the `/ui` gallery; `validate:final` green.

**Pass 2 (2026-10-25), the raids section:**

- `vintage-signup-card` is now the real thing: statuses from `raid-list`, roles from
  `signup-list`, and the member's answer as the `vintage.signup-set` component command (Going,
  Late, Tentative, Can't; bench stays a leader's call). The command takes the status as its
  argument with a JSON-schema `parameters` block, so agents and the command palette can call
  it. The server answers with the stored signup and its reasoning line, which the card shows.
- The home page's raids section: the next raid's card, the rest of the calendar (two months)
  with the member's own answer where they have one, and a reload after every answer so the
  counts stay honest. Times render in the viewer's zone.
- A `color.signup.late` token (the Raid-Helper "late" state, J12) and a `font.weight.heavy`
  (800) token. The hero heading and section headings are restated from the page at the
  concept's scale, because a page's own `h1` rule outranks the hero's `::slotted` styles.
- Parchment: untouched except the `late` color override the contrast test requires.

**Pass 3 (2026-10-25), the progression ledger:**

- A `progress` module (official): the three launch raids and their bosses are data in the
  contract, flagged `datamined` for Barrow Deeps and Hyjal Summit (beta client build
  1.60.1.70532 via wowforeverbuilds.com; Onyxia is the only name Blizzard has confirmed). The
  guild owns its kills: `kill-record` (leader; raid, boss, time, loot with quality) and
  `progress-get` (member; per-raid rows with first-kill times, the next target, totals, the
  latest first kill). First kill = earliest `killedAt`; later kills stay in the log. The
  `kills` component is wired into apps/api; its generated files were written by hand to match
  the others because `dev:local` and the botcore scaffold couldn't reach the network here.
- `vintage-boss-ledger`: killed slots gold-500 with a check and the date, next target dashed
  verdigris, closed rows "unlocks Dec 9" (a calendar date, so it reads the same in every zone),
  tooltips on hover and keyboard focus that double as the slot's accessible name, and the
  "first kill" callout with loot in `--color-quality-*`. Hidden tooltips take no layout space,
  so the 13-slot Hyjal row never widens the page on a phone.
- Home page: the `#progress` section after raids, the hero's "bosses down" figure now from
  `progress-get`, and a fallback to the empty ledger from `LAUNCH_RAIDS` when the read fails
  (`progress-get` is member tier; a public read is an open question).
- No dev switch exists for a "raiding" state, so the fixtures seed no kills and the page shows
  the pre-launch state; the `/ui` gallery shows both states. JTBD J16 covers the job.
- Verified: dark theme at desktop and phone width, both states, no console errors.

**Pass 4 (2026-10-26), the rest of the page:**

- **Nav moves down the page, not between pages.** The header's links are section links
  (Raids, Progress, Recruiting, Roster, News). The sections live in the home page's shadow
  root, and the router read `/#raids` as a route, so `site-context.ts` takes section-link
  clicks before the router: scroll on the home page, or navigate home and scroll once it
  mounts. The link for the section in view is marked. The theme switch left the header (it
  lives on `/ui`); the logo is the single-color vector in the text color.
- **Member menu.** `vintage-member-menu`: round avatar, name, rank, and a menu with Profile and
  Characters. Discord sign-in can supply the avatar (its OAuth profile carries the avatar hash;
  the image is `cdn.discordapp.com/avatars/<id>/<hash>.png`), so `Session.avatarUrl` is the
  seam; the fixtures draw the member's initial until then.
- **Recruiting** is a cream band on the inverse surface tokens with the open roles table.
  The content is a static module (`apps/web/src/content/recruiting.ts`), not a fixture, so
  production shows the same thing; a `site` module takes it over later.
- **Roster** is `vintage-roster-wall` over `member-list`: class-colored mains grouped by rank,
  the member's own row marked.
- **News** is real coordinator output: the fixture host now carries the coordinator (memory
  store, a tick source over the memory stores, a fake Discord) and the seed runs
  `coordinator-config-set` then `coordinator-run`, so `coordinator-log` answers with actions
  the real tick logged. The page reads the log per upcoming raid and shows the newest six, with
  the tick's rule kinds in words.
- **Polls** run the polls module: the seed has a raid leader `poll-create` an off-night poll
  for raiders and up and twenty members `vote-cast`. `vintage-poll-card` shows the live tally
  from `poll-get` and votes through `vote-cast` as the `vintage.vote-cast` command.
- Footer with the build date (`__BUILD_TIME__` from the Vite config) and links.
- Verified: every section at desktop and phone width, the section links on the home page and
  from About, the member menu, the `/ui` gallery; `validate:final` green.
- Not done here: a JTBD job for voting from the website (the polls module's own jobs cover the
  commands); preloading the display face; alpha shadows and highlights in ui-kit styles are
  literal `rgb()` values rather than tokens.

**Review fixes (2026-10-26), from a 7/10 walk of the live page:**

- **Rhythm:** sections open with a tighter top (`--space-xl`) and no gradient band, so the
  page reads as one page moving down rather than stacked screens.
- **Raids:** the counts show Going, Tanks, Healers, DPS, then Late, Tentative, and Queued only
  when someone is in them, so zeros don't crowd the row. The Coming up card fills its column
  with the real timings from the raids contract (lead days, lock hours, reminder hours).
- **Time zones:** times always carry the zone, and show in the member's own zone when their
  profile has one (`member-prefs-set timezone`, which identity already stored); the browser's
  otherwise. The dev fixtures set Bloodfen's to Eastern, so "8:00 PM EST" matches the pill.
  The signup card takes a `time-zone` attribute for the same reason.
- **Progress before Dec 9:** a callout with the days to the first pull and what the three raids
  are, numbered slots, and the plain `0 / n` tally; the unlock date is said once, not per row.
- **News:** post entries carry how many answered and how many are going, and a short line
  explains the log while it is thin.
- **Discord:** "Join the Discord" is back in the hero. `DISCORD_INVITE_URL` is null until the
  GM sets one (open question 3), so it points at the recruiting band, which says invites come
  from an officer; once set, both the hero and the band link straight to it.

## Tasks

- [x] Research pass folded into this doc; direction chosen (concept E, 2026-10-25)
- [x] Fonts: pick display + body, self-host, token update (preload still to do)
- [x] Fixtures through the real registry; `apps/web` uses them in dev
- [x] Hero + identity pills + figures
- [x] Sticky header with section context, both themes, phone width
- [x] Next raid block (`raid-list` / `signup-list`): the member's own answer as `@command` → `signup-set`
- [x] Progression ledger (`progress-get`; `kill-record` for leaders)
- [x] Recruiting band (cream, on the inverse surface tokens)
- [x] Roster wall (`member-list`)
- [x] Coordinator feed (`coordinator-log` from a real tick in the fixtures)
- [x] Poll card on the polls module (`poll-get` / `vote-cast`)
- [x] Footer; `/ui` gallery entries for every new element; CEM check
- [x] Docs: `apps/web/README.md`, `packages/ui-kit/README.md`, architecture status line
- [x] Section nav, member menu with avatar, vector logo, theme switch out of the header
- [ ] Preload the display face; shadow and highlight tokens; a JTBD job for voting from the website
- [ ] Once sign-in (#7) lands: Discord avatar into `Session.avatarUrl`, Sign out in the member menu

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-25 | Dev fixtures are the real registry over memory stores, seeded through commands; no fixture client fakes a command's answer | Keeps the page honest to AFD, and the seed exercises the real tier rules; swapping to Convex is one line in `main.ts` |
| 2026-10-25 | The site palette is plum, verdigris, rose, and gold 500 on top of the emblem palette; Bitter / IBM Plex as token families | Concept E, chosen by Bloodfen after three rounds; the emblem's gold and crimson stay for the logo and WoW frames |
| 2026-10-25 | Sections with no command yet use marked local fixtures and no fake command names | The manifest is the contract; no phantom commands |
| 2026-10-26 | The header navigates within the home page's sections; routes stay for About, Profile, and Characters | Bloodfen: the concept moves down the page, the first build swapped pages |
| 2026-10-26 | Recruiting copy is static site content, not a fixture, until a `site` module owns it | Production must show it too; a fixture would leave production empty |
| 2026-10-25 | Raids and bosses are data in the `progress` contract, not rows; kills are the records. Datamined names carry a flag every surface shows | Blizzard's launch raids don't vary per guild; the flag keeps the page honest until the names are official |

## Open questions

| # | Question | Owner |
|---|---|---|
| 1 | Display and body typefaces (shortlist from research) | Bloodfen → GM |
| 2 | How literal the chain motif gets (line only vs drawn links) | Bloodfen |
| 3 | Discord invite link and whether recruiting is "apply" or "ask an officer" | GM |
| 4 | Does the parchment band stay a one-off, or do long-form pages (news, strategy) adopt it | later |
| 5 | Ruleset (Normal / PvP / RP), realm, and start time with zone for the identity strip (PLAN Q2) | GM |
| 6 | Enable the Discord server widget so the page can show online count and the invite without auth | GM |
| 7 | Loot system line for the recruiting band (PLAN Q5); until decided, the band says "decided before the first raid" | GM + officers |
| 8 | Should `progress-get` be public, so signed-out visitors see the ledger? Today it is member tier and the page falls back to the empty ledger | GM |
| 9 | A dev switch for the fixtures' "raiding" state (seed kills through `kill-record`), so the page can be checked filled without the gallery | Bloodfen |

## Sources

Guild sites and recruiting (read 2026-10-25):

- Raidify, WoW Forever guild finder guide: https://www.raidify.app/docs/guides/wow-forever-guild-finder
- Guild Order, build a guild website: https://guildorder.com/games/wow/guides/build-a-guild-website
- Guild Order, fresh-realm launch week: https://guildorder.com/games/wow_classic/guides/fresh-realm-launch-week
- Syndicate, WoW guild recruitment in 2026: https://www.syndicateguild.com/posts/wow-guild-recruitment-in-2026-every-way-to-find-a-guild-or-fill-one.html
- Syndicate's Forever page: https://www.syndicateguild.com/forever.html
- Warcraft Logs recruitment: https://www.warcraftlogs.com/recruitment
- Method, Road to World First: https://www.method.gg/road-to-world-first
- Raider.IO guild profile (Liquid): https://raider.io/guilds/us/illidan/Liquid
- Guildfindr example page: https://guildfindr.com/floorpov
- Blizzard forum thread on guild websites (Nov 2025): https://us.forums.blizzard.com/en/wow/t/guild-websites/2194565
- Discord guild widget: https://docs.discord.com/developers/resources/guild
- Forever roadmap and raids: https://www.warcrafttavern.com/forever/news/world-of-warcraft-forever-roadmap-beta-launch-date-raids/ and https://news.blizzard.com/en-us/article/24303009/
- ThatsMyBIS (supports Forever): https://thatsmybis.com/

Design and type (read 2026-10-25):

- Diablo IV: https://diablo4.blizzard.com/en-us/
- Expedition 33: https://www.expedition33.com/
- League of Legends: https://www.leagueoflegends.com/en-us/
- D&D Beyond: https://www.dndbeyond.com/
- Avowed: https://avowed.obsidian.net/
- Tolkien Estate: https://www.tolkienestate.com/
- Kingdom Come: Deliverance II: https://www.deepsilver.com/games/kingdom-come-deliverance-ii
- Path of Exile 2 (counter-example): https://pathofexile2.com/
- Class colors: https://warcraft.wiki.gg/wiki/Class_colors · item quality: https://warcraft.wiki.gg/wiki/API_GetItemQualityColor
- Concept mockups (A, B, C, D): https://claude.ai/artifact/5zXk2shvmVkbn1x1Jv4Wsa (private)
- afd.dev (live, newer than the `afdsite` source): https://afd.dev
- Farsight design and Ember palette: `Farsight/docs/design.md`, `web/src/ui/workspace-tokens.css`,
  `web/src/instance-art.ts` on the `falk/overview-app-design` branch
- Datamined raid bosses: https://wowforeverbuilds.com/raids/barrow-deeps and
  https://wowforeverbuilds.com/raids/hyjal-summit (unconfirmed by Blizzard)
