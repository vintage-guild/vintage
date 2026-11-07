# Armory

Status: first slice built and tested (`libs/forever-api`, `modules/armory`, the fetch action and
cron in `apps/api`), and J49 run live on the local backend against Blizzard US
([run](../../../jtbd/runs/2026-11-07.md)). Not deployed: production needs the `BLIZZARD_*` env.
The website's characters page has an Armory section: one card per character with the portrait,
level, race, class, spec, guild, item level, and gear, and Find / Refresh / Unlink (built and
tested in happy-dom and the dev fixtures; not checked in a visible browser). No Discord surface yet.

## Why

The WoW: Forever armory went live with launch (Nov 4, 2026), and Blizzard's profile API answers
for Forever characters under `profile-forever-{region}`, undocumented. Vintage can read what
members otherwise type by hand, and keep it current: level, item level, gear, portrait. PLAN.md
listed "Battle.net / Armory sync if Blizzard exposes Forever profile data" under Later.

## Job

[J49](../../../jtbd/armory.md): a member links a registered character by giving its surname, and
the guild sees its level, item level, and gear.

## How it works

1. `armory-link { characterId, surname }` saves a link (`{name}-{surname}` lowercased: Forever
   has no realms) and schedules `armory:refresh`.
2. The action asks Blizzard for the profile, equipment, and media (`@vintage/forever-api`, client
   credentials), maps them (`fetchArmory`), and records the result through the system-only
   `armory-record`. Gear and media failing don't stop the profile.
3. An hourly cron runs `armory-sweep`: up to 25 links not checked in 12 hours, never-checked
   first; it drops links whose character was removed.
4. `armory-get` / `armory-list` read it back with the character's current owner from identity.

Config (Convex env): `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION` (default
`us`). Without credentials, links save and each fetch records an error saying so.

## Not in this slice (follow-ups)

- **Production:** set `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, and `BLIZZARD_REGION=us`
  in the production Convex env (the Vintage Guild client on develop.battle.net). Still unchecked:
  the slug for names with accents.
- **Website:** item level on rosters and the raid roster. Discord: an `/random character armory`
  view.
- **Surname in identity:** the reconcile branch's live check covers first/last names from the
  game client; once identity stores a surname, `armory-link` can default to it.
- **Battle.net sign-in** (`/profile/user/wow`, user token, `wow.profile` scope) to verify that
  an armory character is the member's, and offer one-click linking of every character on the
  account.
- **Guild roster from the API** (`guildRoster`, already in the client): compare with the addon's
  export in reconciliation.
- **Raid encounters** (`/encounters/raids`) to cross-check the progress ledger, and **item
  media** for loot icons, once confirmed live.

## Decisions

| Date | Decision |
|---|---|
| 2026-11-07 | Armory is its own labs module that reads identity's characters through a port; identity is unchanged. |
| 2026-11-07 | Our own small client with Zod-checked responses, not `@pinta365/blizzard_api`: the API is undocumented and moving, and we need four endpoints. |
| 2026-11-07 | A link is a member's claim, not proof of ownership; ownership waits for Battle.net sign-in. |
| 2026-11-07 | Found replaces the stored profile; not-found and errors keep the last good one. |
| 2026-11-07 | The characters page polls `armory-list` every 3 s (10 times) after a change instead of a reactive read, since the fetch lands after the command; portraits load from `render.worldofwarcraft.com`, added to the site's CSP `img-src`. |
| 2026-11-07 | The guild plays on US; the active spec comes from `/specializations` (the tree with the most points), since Forever's profile has none. |
