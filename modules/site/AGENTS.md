# site module

The website's editable copy. Today that is the recruiting band on the home page: its headline,
its pitch, and the classes the guild is recruiting with the specs wanted and how much. Officers
set it from the officers' quarters (Recruiting tab), Discord, or an agent; everyone reads it.
Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `ClassNeed`, `NEED_LEVELS` (high, medium, closed), `RECRUITING_LIMITS`, the `Recruiting` view, `STARTER_RECRUITING`. The only import other modules may use |
| `src/store.ts` | `SiteStore` port (`getRecruiting`, `putRecruiting`), `SiteDeps`, `command` |
| `src/commands/` | `recruiting-get` (public) and `recruiting-set` (officer) |
| `src/testing.ts` | Memory store, same behavior as the component |
| `convex/` | The `site` Convex component: the `recruiting` table, one row per guild |

## Rules

- **One recruiting row per guild.** `put` replaces it; there is no history yet. Until the first
  save, `recruiting-get` answers `STARTER_RECRUITING` with `updatedAt: null`, so the band never
  goes blank and a fresh deployment shows the copy the site shipped with.
- **`recruiting-set` merges.** Fields left out keep their saved value; `needs` is the whole list
  when given (order is display order). One row per class (`DUPLICATE_CLASS`); an input with no
  field is `NOTHING_TO_CHANGE`.
- **Classes come from `@vintage/wow-data`.** The component's `wowClass` validator lists the same
  nine; change both together.
- **The Discord invite is not here yet.** It stays in `apps/web/src/content/recruiting.ts` until
  the GM picks one (feature plan, open question 3); move it here as a field when it changes from
  null.
- **`recruiting-get` is public.** It answers the band and when it was saved, never who saved it
  (`updatedBy` stays in the row).
- **`guildId` on every row**, read through `by_guild`.
