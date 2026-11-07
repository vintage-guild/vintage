# Armory

Status: first slice built and tested (`libs/forever-api`, `modules/armory`, the fetch action and
cron in `apps/api`). Not deployed; never called against the live Blizzard API (no client
credentials yet). No website or Discord surface yet: commands only (site, `/mcp`, agent).

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

- **First live call:** register a client on develop.battle.net, set the env, link a real
  character, and run J49's live checklist. Confirm the region, the slug for names with accents,
  and which endpoints answer (EU 404s were reported on Nov 6).
- **Website:** a surname field and the armory card (level, ilvl, portrait, gear) on the
  characters page; ilvl on rosters. Discord: an `/random character armory` view.
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
