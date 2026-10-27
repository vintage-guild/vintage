# @vintage/web

The Vintage website: a Vite SPA on FAST-AF's router (`@microsoft/fast-router`, vendored) and
[`@vintage/ui-kit`](../../packages/ui-kit/README.md).

```bash
pnpm --filter @vintage/web dev     # http://localhost:5173
pnpm --filter @vintage/web build   # dist/
```

| Route | Page |
|---|---|
| `/` | Home, one page of sections ([feature plan](../../docs/features/active/home-page/home-page.plan.md)): the hero (identity pills, headline, figures from `member-list` and `progress-get`); **Raids** (the next raid as a `vintage-signup-card` with the member's own answer via `signup-set`, the rest of the calendar from `raid-list`); **Progress** (`vintage-boss-ledger` from `progress-get`); **Recruiting** (a cream band with the open roles from `recruiting-get`, each row led by its class icon); **Roster** (`vintage-roster-wall` from `member-list`); **News** (the coordinator's log from `coordinator-log` per upcoming raid, and, for members and up, the first open poll from `poll-list` / `poll-get` as a `vintage-poll-card` that votes through `vote-cast`; visitors get a note without asking the server) |
| `/polls`, `/polls/<id>` | Members and up (by the role view): open polls as voting cards, including ranked ones, which Discord links here for, and the last ten closed ones with their result when the poll shows it (`poll-list`, `poll-get`). Visitors get the sign-in card |
| `/about` | The guild in its own words: `guild-profile-get`'s lead and sections, edited in the quarters' Guild tab |
| `/profile` | Your Discord avatar, name, rank, and main, then `vintage-member-prefs`: main character (`character-update`), the time zone raid times show in, and reminder DMs (`member-prefs-set`). A change refreshes the session so times follow a new zone. Sign-in card when signed out; a note when signed in but not in the guild |
| `/characters` | Your characters (`vintage-character-list` over `member-me`): make main (`character-update`), remove (`character-remove`, preview then confirm), and the add form (`vintage-character-form`). Sign-in card when signed out |
| `/privacy` | What the site keeps, why, and how to have it removed (`pages/privacy.ts`); keep it true when a module stores something new |
| `/terms` | Ground rules, the Blizzard non-affiliation notice (`pages/terms.ts`); `content/legal.ts` holds the updated date |
| `/officers` | The officers' quarters, for leaders and officers (others get a sign-in card or a note): the Tonight tab (`vintage-tonight`) over `raid-list`, `signup-list`, `comp-suggest`, `coordinator-status`, the roster commands, and `addon-import-get`; the Calendar tab (`vintage-calendar-desk`, `?tab=calendar`) over `raid-list` (a month back, two ahead, every status) and `schedule-list`, with one-offs, moves, cancel (preview, then confirm), done, and schedules added, edited, paused, and created now; the Random tab (`vintage-coordinator-desk`, `?tab=coordinator`) over `coordinator-status` and `coordinator-log` (upcoming raids and the last week's), with pause, resume, run a check, replace a signup post, and the settings (officers save; leaders read them); the Polls tab (`vintage-polls-desk`, `?tab=polls`) over `poll-list` and `poll-results`, with open, close and cancel (preview, then confirm) and the sweep; the Recruiting tab (`vintage-recruiting-desk`, `?tab=recruiting`) over `recruiting-get`, saving with `recruiting-set` (officers; leaders read it); the Guild tab (`vintage-guild-profile-desk`, `?tab=guild`) over `guild-profile-get`, saving with `guild-profile-set`; the Progress tab (`vintage-progress-desk`, `?tab=progress`) over `progress-get`, recording with `kill-record` (closed until the raids unlock); the Roster tab (`vintage-roster-desk`, `?tab=roster`) over `member-list` and `guild-roles-get`, saving the role map with `guild-roles-set` (officers; preview, then confirm) |
| `/ui` | Dev only: every ui-kit element (and the theme switch), for checking both themes |

- `index.html` is the shell: the sticky `vintage-logo-header` (the single-color vector logo
  in the text color, section links, the section context and its action, the member menu, and
  the scroll-progress line), `<fast-router>`, and the footer with the build date. Vite inlines
  `assets/brand/vintage-logo.svg` at build time.
- **Section links.** The nav and the hero buttons point at the home page's sections, which live
  inside its shadow root, so a fragment alone would find nothing and the router would read
  `/#raids` as a route. Links carry `data-section-link="<section id>"`; `src/site-context.ts`
  takes the click before the router, scrolls on the home page, and from another page navigates
  home and scrolls once it mounts. The same module puts the section in view on the header and
  marks its nav link, and keeps the progress line in step with scroll.
- **The member menu** (`vintage-member-menu`) shows the session's Discord avatar, name, and
  rank with Profile and Characters links, and Sign out when signed in for real. Signed out, the
  header shows a Sign in button instead. The dev fixtures use a generated initial and no sign-out.
- **Sign-in** (`src/connect.ts`) goes through
  [`@vintage/web-session`](../../packages/web-session/README.md): Discord sign-in, the session,
  and the `CommandClient` over Convex. The shell waits for the first known session (including
  the return from Discord) before the router mounts a page, then reloads when who is signed in
  or their tier changes, so the page is composed for them; a new time zone just updates the
  session. Tab focus re-reads the session for rank changes from role sync. The sign-in card and
  the header button raise `sign-in-requested` and the shell answers, so ui-kit never sees the
  auth client. Someone signed in with Discord who isn't in the guild's server has no member id
  and is `public`, so they see the storefront. The server is production
  (`PROD_CONVEX_URL`) unless `VITE_CONVEX_URL` says otherwise; if it can't be reached the site
  stays up, signed out.
- **Fonts** are self-hosted from Fontsource (Bitter variable for display, IBM Plex Sans and
  Mono), imported in `src/main.ts`; the families are design tokens.
- **Art** (`public/art/`, Bloodfen's generated pieces, used with permission; not covered by the
  code license) is listed in `src/content/art.ts`: the hero and its portrait for phones
  (`art-phone-src`), one scene per launch raid behind its ledger row (dimmed until the raids
  unlock), the shield and staff on the recruiting band, the coordinator's raven beside the news
  heading, and the dusk sky under the footer. The tab and home-screen icons (`public/icon-*.png`,
  `apple-touch-icon.png`) are sized from the square emblem in `assets/brand`.
- Theme: `data-theme` on `<html>` (`vintage-dark` default, `vintage-parchment`), saved in
  `localStorage` and applied before first paint. The switch lives on `/ui` for now.
- **Development fixtures** (`src/fixtures/`): in dev, `main.ts` installs an in-memory guild
  behind the real command registry (identity, raids, progress, polls, applications, and coordinator commands
  over the modules' memory stores), seeded only through commands: `member-sync`,
  `character-add`, `raid-create`, `signup-set`, `coordinator-config-set` and `coordinator-run`
  (a real tick against a fake Discord, whose logged actions feed the News section),
  `poll-create` and `vote-cast`, and two open `application-submit`s from Discord accounts that
  are not members, so the quarters’ Applications tab has something to review. Random, the officers’
  side panel, answers through the real agent commands with a stand-in turn (`src/fixtures/agent.ts`):
  a progress note, a real read (or a prepared change for "lock"), then the answer, with no OpenAI. It signs in a fixture member chosen by the dev switch
  (`src/fixtures/persona.ts`): `?as=visitor|member|recruit|raider|leader|officer`, remembered
  for the tab and set by the floating "View as" control; the default is Bloodfen, a flex raider,
  and visitor signs in nobody and runs commands as a public caller. No kills are seeded (today
  is before the raids unlock), so the ledger shows the pre-launch state; `/ui` shows a raiding
  one. Pages read through the normal `CommandClient`, the same one the live server answers.
  `?as=live` uses the real server and Discord sign-in from the dev server instead: real
  members, and production data (production's `SITE_URL` allows http://localhost:5173).
  Production builds always connect to the server and leave the fixtures out.
- `src/session.ts` is the sign-in seam: `currentSession()`, and `signIn` / `signOut` /
  `refreshSession`, which do nothing until a backend installs handlers (`canSignIn()`).
- **Views** (`src/view.ts`, [feature plan](../../docs/features/active/role-aware-views/role-aware-views.plan.md)):
  the home page composes by the session's tier. Visitors get the storefront; members, recruits,
  and raiders get a compact hero with their own figures, "Your next raid" on top, and
  recruiting as one line at the foot; leaders and officers get the same plus the officer strip above the hero. The view only
  orders sections; each command's tier is still the gate. A section the session's tier can't read
  isn't rendered at all, and its header link is removed (`HOME_SECTIONS`): visitors see the hero
  and recruiting, `member` tier everything but the roster. While a read is pending, its section
  says it is loading, so a slow connection never reads as "nothing here".
- **Preview as** (`src/preview.ts`): leaders and officers get a control at the bottom right, on
  the live site too, to see every page as a visitor, member, recruit, raider, or (for officers)
  raid leader. `?preview=<tier>` picks one and the tab remembers it; `?preview=self` ends it.
  The session is capped to that tier (`currentSession()`; `realSession()` is who is signed in),
  reads above it answer `COMMAND_NOT_FOUND` by the manifest's tiers, and every action answers
  `PREVIEW_ONLY`, so nothing is saved while previewing.
- **First paint** (`index.html`): a small inline style paints the theme's canvas and text and hides
  the header at its own height until its element is defined, so the inline logo never flashes
  page-wide; `src/first-paint.test.ts` keeps those literal colors equal to the tokens.
- **Times** (`src/dates.ts`) always show their zone, in the member's profile zone when they
  have set one (`member-prefs-set timezone`), else the browser's. The hero's "8 pm ET" pill is
  the guild's stated time; the cards show the viewer's.
- **Discord invite:** `DISCORD_INVITE_URL` in `src/content/recruiting.ts`, null until the GM
  sets it; the calls to action then point at the recruiting band.
- **Deployed** on Vercel as `vintage-web`: https://vintageguild.gg (www redirects to it; https://vintage-web-pi.vercel.app also serves it). `vercel.json`
  here sets the build and an SPA fallback, so deep links like `/officers` load the app. Every push
  to `main` deploys it, and each PR gets a preview (SETUP.md → Deployments).
