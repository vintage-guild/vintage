# @vintage/ui-kit

Vintage's web composites on FAST-AF (`@lushly-dev/fast-element`) and `@lushly-dev/violet-elements`,
both vendored in [`vendor/`](../../vendor/VENDORED.md). Primitives come from Violet; this package
holds the guild-specific pieces (PLAN §3.9).

| Element | What it is |
|---|---|
| `vintage-logo-header` | Sticky site header: the logo (slot), nav, a section context block with its action, the signed-in member (slot), actions, and a scroll-progress line |
| `vintage-member-menu` | The signed-in member: round avatar (Discord's once sign-in supplies it, the initial until then), name, rank, and a menu with Profile and Characters |
| `vintage-roster-wall` | Every member grouped by rank, each as their main's name in its class color with spec and role; the signed-in member's row marked. Fed from `member-list` |
| `vintage-poll-card` | A single-choice poll with live shares; choosing an option runs the `vintage.vote-cast` command → server `vote-cast` |
| `vintage-hero` | The home page opener: full-bleed art under a dark fade, with slots for eyebrow pills, the heading, a standfirst, actions, and figures |
| `vintage-figure` | One big tabular number with a unit and caption; rows of them sit in the hero |
| `vintage-class-badge` / `vintage-role-badge` | Class (and spec) or raid role with its color token, from `@vintage/wow-data` |
| `vintage-character-form` | Name, class, spec, main; submits through the `vintage.character-add` command |
| `vintage-boss-ledger` | The progression ledger: one row per raid, one slot per boss. Killed slots are gold with a check and the first-kill date, the next target is dashed verdigris, closed rows say "unlocks Dec 9"; boss names show on hover/focus with a datamined note; a "first kill" card above names the latest kill with its loot in `--color-quality-*`. Fed from `progress-get` |
| `vintage-signup-card` | One raid: its counts (statuses from `raid-list`, roles from `signup-list`) and the member's own answer. Going / Late / Tentative / Can't run the `vintage.signup-set` command → server `signup-set` with the member's character |
| `vintage-sign-in-card` | What member pages show when signed out; enabled once sign-in (#7) gives it an `href` |
| `vintage-theme-switch` | Dark / parchment switch (`data-theme` on `<html>`), also the `vintage.theme-toggle` command. Shown in the `/ui` gallery; the site header no longer carries it |

## Rules

- **Tokens only.** Styles read `var(--…)` from `@vintage/design-tokens`; no literal colors, fonts,
  or spacing. Load `src/violet-bridge.css` after the token CSS so Violet's primitives follow the
  theme.
- **Data changes are `@command`s.** A component action that changes data is a FAST-AF `@command`
  (`vintage.<server-command>`) that calls the server command through `getCommandClient()` and
  returns its result. Reactive availability is a `<method>CanExecute` getter.
- **The client is a port.** `CommandClient` (`read` → `commands.read`, `run` → `commands.run`) is
  stubbed with `createStubClient()` (every call answers `NOT_CONNECTED`) until the Convex adapter
  lands; tests swap it with `setCommandClient`.
- **Every element is in the Custom Elements Manifest.** Give the class a `@tagname` JSDoc tag.
  `pnpm --filter @vintage/ui-kit build` writes `dist/custom-elements.json` (with each element's
  `commands`) and `scripts/check-cem.mjs` fails on a missing element or command. CI runs it.
- **Violet primitives are imported in one place** (`src/primitives.ts`): violet-elements has no
  per-component exports, so these are deep imports a FAST-AF re-sync may need to touch.

## Tests

Vitest with happy-dom. happy-dom has no `ElementInternals`, so `src/test-setup.ts` stubs the parts
Violet's form fields call. `src/test-helpers.ts` mounts an element and waits for FAST's updates.
