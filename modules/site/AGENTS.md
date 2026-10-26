# site module

The website's editable copy: the recruiting band on the home page (headline, pitch, and the
classes the guild is recruiting with the specs wanted and how much) and the guild profile (the
hero's facts and intro, the About page, the Discord invite, the contact email). Officers set them
from the officers' quarters (Recruiting and Guild tabs), Discord, or an agent; everyone reads them.
Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `ClassNeed`, `NEED_LEVELS` (high, medium, closed), `RECRUITING_LIMITS`, the `Recruiting` view, `STARTER_RECRUITING`. The only import other modules may use |
| `src/store.ts` | `SiteStore` port (`getRecruiting`, `putRecruiting`), `SiteDeps`, `command` |
| `src/commands/` | `recruiting-get` / `guild-profile-get` (public) and `recruiting-set` / `guild-profile-set` (officer) |
| `src/testing.ts` | Memory store, same behavior as the component |
| `convex/` | The `site` Convex component: the `recruiting` and `profile` tables, one row each per guild |

## Rules

- **One recruiting row per guild.** `put` replaces it; there is no history yet. Until the first
  save, `recruiting-get` answers `STARTER_RECRUITING` with `updatedAt: null`, so the band never
  goes blank and a fresh deployment shows the copy the site shipped with.
- **`recruiting-set` merges.** Fields left out keep their saved value; `needs` is the whole list
  when given. One row per class (`DUPLICATE_CLASS`); an input with no
  field is `NOTHING_TO_CHANGE`.
- **`recruiting-get` sorts the needs** high, medium, closed (`byNeed`), keeping the saved order
  within a level, so no surface can show a closed class above an open one.
- **Classes come from `@vintage/wow-data`.** The component's `wowClass` validator lists the same
  nine; change both together.
- **`recruiting-get` is public.** It answers the band and when it was saved, never who saved it
  (`updatedBy` stays in the row).
- **The profile works like the band.** `guild-profile-get` answers `STARTER_PROFILE` until the
  first save, never `updatedBy`; `guild-profile-set` merges, `aboutSections` is the whole list, and
  `discordInvite` / `contactEmail` take null to clear. The invite must match
  `DISCORD_INVITE_PATTERN` (https discord.gg or discord.com/invite), so the site's "Join the
  Discord" can never point anywhere else.
- **Raid nights are not here.** The website derives them and the signup timings from the raids
  module's `schedule-list`; the hero's facts are the profile's `pills`, which officers keep true.
- **`guildId` on every row**, read through `by_guild`.
