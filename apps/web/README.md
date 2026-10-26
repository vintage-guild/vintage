# @vintage/web

The Vintage website: a Vite SPA on FAST-AF's router (`@microsoft/fast-router`, vendored) and
[`@vintage/ui-kit`](../../packages/ui-kit/README.md).

```bash
pnpm --filter @vintage/web dev     # http://localhost:5173
pnpm --filter @vintage/web build   # dist/
```

| Route | Page |
|---|---|
| `/` | Home: the hero (identity pills, headline, figures from `member-list` and `progress-get`), the raids section (the next raid as a `vintage-signup-card` with the member's own answer via `signup-set`, the rest of the calendar from `raid-list`), and the progression section (`vintage-boss-ledger` from `progress-get`: the three launch raids with first-kill slots, "unlocks Dec 9" before the raids open). Recruiting, roster, and the coordinator feed follow ([feature plan](../../docs/features/proposed/home-page/home-page.plan.md)) |
| `/about` | About and recruitment (placeholder copy until the `site` module) |
| `/profile` | Member profile; signed out until Discord sign-in (#7) |
| `/characters` | Character registration; signed out until #7, then `vintage-character-form` |
| `/ui` | Dev only: every ui-kit element, for checking both themes |

- `index.html` is the shell: the sticky `vintage-logo-header` (logo, nav, section context, the
  signed-in member, theme switch, scroll progress) and `<fast-router>`. Vite inlines the
  two-tone logo from `assets/brand/` at build time so it can follow `--logo-ink` / `--logo-paper`.
- **Section context:** a page marks its sections with `data-section` and
  `data-section-eyebrow / -title / -action / -href`; `src/site-context.ts` watches them and
  puts the one in view on the header, and keeps the header's progress line in step with scroll.
- **Fonts** are self-hosted from Fontsource (Bitter variable for display, IBM Plex Sans and
  Mono), imported in `src/main.ts`; the families are design tokens.
- **Art:** `public/art/forever-dragon.webp` is the home hero (Bloodfen's generated art, used
  with permission; not covered by the code license).
- Theme: `data-theme` on `<html>` (`vintage-dark` default, `vintage-parchment`), saved in
  `localStorage` and applied before first paint.
- **Development fixtures** (`src/fixtures/`): in dev, `main.ts` installs an in-memory guild
  behind the real command registry (identity, raids, and progress commands over the modules'
  memory stores), seeded only through commands (`member-sync`, `character-add`, `raid-create`,
  `signup-set`), and signs in an example flex raider. No kills are seeded (today is before the
  raids unlock), so the home page shows the pre-launch ledger; `/ui` shows a raiding one. Pages read through the normal
  `CommandClient`, so swapping to Convex changes `main.ts`, not the pages. Production stays on
  the stub client until sign-in (#7) and a hosted deployment exist.
- `src/session.ts` is the sign-in seam: `currentSession()` is null until sign-in sets it.
- Not deployed yet: Vercel needs its GitHub app installed on the org first.
