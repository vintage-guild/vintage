# Recruiting

The open roles on the website, from an officer changing them to the public recruiting band
(`docs/features/active/role-aware-views`, the Recruiting tab). Automated in
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
