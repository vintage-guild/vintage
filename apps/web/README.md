# @vintage/web

The Vintage website: a Vite SPA on FAST-AF's router (`@microsoft/fast-router`, vendored) and
[`@vintage/ui-kit`](../../packages/ui-kit/README.md).

```bash
pnpm --filter @vintage/web dev     # http://localhost:5173
pnpm --filter @vintage/web build   # dist/
```

| Route | Page |
|---|---|
| `/` | About and recruitment (public; placeholder copy until the `site` module) |
| `/profile` | Member profile; signed out until Discord sign-in (#7) |
| `/characters` | Character registration; signed out until #7, then `vintage-character-form` |
| `/ui` | Dev only: every ui-kit element, for checking both themes |

- `index.html` is the shell: the header and `<fast-router>`. Vite inlines the two-tone logo from
  `assets/brand/` at build time so it can follow `--logo-ink` / `--logo-paper`.
- Theme: `data-theme` on `<html>` (`vintage-dark` default, `vintage-parchment`), saved in
  `localStorage` and applied before first paint.
- `src/session.ts` is the sign-in seam: `currentSession()` returns null until #7.
- Not deployed yet: Vercel needs its GitHub app installed on the org first.
