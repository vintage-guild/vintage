# @vintage/forever-api

A small client for Blizzard's **WoW: Forever** profile API, platform-free (`fetch` is injected).
Used by the armory module through `apps/api/convex/armory.ts`.

```ts
const api = createForeverApi({ region: 'us', clientId, clientSecret });
await api.characterProfile('Judgement', 'Judy'); // null when the armory has no such character
await api.characterEquipment('Judgement', 'Judy');
await api.characterMedia('Judgement', 'Judy');
await api.guildRoster('vintage');
```

## What it does

- Takes a client-credentials token from `https://oauth.battle.net/token` and keeps it until a
  minute before it expires; a 401 takes a new one, once.
- Sends `namespace=profile-forever-{region}` and the region's locale, so names are strings.
- Answers `null` for a 404. Everything else that isn't a 2xx, a dropped connection, or a body that
  doesn't parse is a `ForeverApiError` with `kind` (`http`, `auth`, `network`, `shape`) and
  `retryable` (429, 5xx, network). Messages never carry the credentials.
- Parses each body with Zod, keeping only the fields Vintage reads and making most optional, so
  a new or missing field never breaks a fetch.

## What's known about the Forever API (Nov 2026)

Blizzard hasn't documented it. These come from community probes in the first days after launch;
treat each as unverified until a live call here confirms it.

| Fact | Source |
|---|---|
| Characters have no realm; the slug is `{name}-{surname}`, lowercased; unique per region | [forum 60334](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334) |
| Namespaces: `profile-forever-{region}`, `dynamic-forever-{region}`, `static-1.60.1_70399-forever-{region}` (plain `static-forever` 403'd early on) | [forum 59774](https://us.forums.blizzard.com/en/blizzard/t/world-of-warcraft-forever-api-namespace/59774) |
| Characters appear from level 10, after a logout; media lags by hours | forum 60334 |
| Profile has `surname` and `ruleset` instead of `realm`; `active_spec` is absent for now | forum 60334 |
| Guilds have no realm: `/data/wow/guild/{slug}/roster` in the profile namespace; members carry `surname` | forum 60334, [Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api) |
| US equipment works with client credentials; EU character endpoints 404'd for one developer on Nov 6 | [forum 60355](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-eu-all-character-profile-endpoints-return-404/60355) |

When a live call disagrees, fix the schema here and note it in the table.
