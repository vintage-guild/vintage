# The addon for everyone: raid sync, the officers' quarters, and wishlist picks

> Status: proposed · Created 2026-11-08 · Owner: Bloodfen · Area: addon
> Related: [the Vintage addon](../../active/vintage-addon/vintage-addon.plan.md),
> [role-aware views and the officers' quarters](../../active/role-aware-views/role-aware-views.plan.md),
> the wishlist module (#27), [`libs/bridge-format`](../../../../libs/bridge-format/README.md)

**The ask.** "Make this addon more useful to non-officers. Not everyone has the import/export
capability." Then, refining it: share the raid as a quick version check and a fetch only when
behind, scoped to the guild (and the raid); let members pick their BiS and wishlist in the game
and feed it back to the officers; mirror the site, with features for everyone at the top level
and an officers' quarters for the officer work; and keep a member who edits their own copy of
the addon from abusing any of it.

**Done when:** a member who never pastes anything opens the addon on raid night and sees the
raid's start time, their group and role, and who the priority list says gets each drop. The data
came from an officer's addon over the guild channel and was checked by the rules under Trust.
Officers find today's forming, loot, and export tools under **Officers**, in the same places the
site's quarters put them. A member's wishlist picks reach the website through an officer's
export. Every trust rule has a spec, and the new JTBD jobs pass on the fake client.

## Why

An addon can't reach the internet. Data gets into the game only as a pasted string, a message
from another player's addon, or a file an outside app writes. Today the only way in is the
officers' import (`addon-import-get` needs the leader tier), so for everyone else the addon has
nothing to show. A raider wants three answers in the game: am I in, which group, and who gets
that drop. Each is already in the officer's import.

## Scope

**In:**

1. **Raid sync:** an officer's addon shares a member view of each imported raid. Clients
   announce what they hold and fetch only when behind. Guild channel, plus the raid channel on
   raid night.
2. **The officers' quarters:** the window's tabs split the way the site does. Raid and Loot are
   for everyone; **Officers** opens the quarters (Tonight, Loot, Export, Guild).
3. **Tooltips:** an item in the raid's loot plan shows its priority on its tooltip.
4. **Wishlist picks:** members pick and rank items in the game. The picks reach the officers'
   addons and, through the next export, the website (needs #27 first).

**Out:** cryptographic signatures from the website (see Trust: later, if relaying without an
officer matters); a companion app that writes saved data; anything on the site beyond #27 and
accepting relayed picks; the guild-roster reconciliation itself (its branch moves into the
quarters' Guild tab as is); and translations beyond `enUS`.

## The window: features for everyone, and the officers' quarters

The site gives every member top-level pages and gives leaders and officers an **Officers** link
in the header to the quarters (Tonight, Calendar, Roster, Guild, ...). The addon matches it.

**Everyone** (the window's tabs):

| Tab | Shows |
|---|---|
| **Raid** | The shared raid: title and start time, everyone by group (read-only) with your group and role highlighted, and whether you're on standby. Before any share: "Your officers haven't shared tonight's raid yet." |
| **Loot** | Drops so far, read from loot messages (today the capture records only into an imported raid; PR 4 records into the shared raid too), and each item's priority from the shared loot plan: where you stand, or the whole list (Q2) |
| **Wishlist** | Your picks and their ranks, per character (phase 3) |

**Officers** (a header button, shown when you qualify; it swaps the tab bar to the quarters):

| Quarters tab | Holds (today's tabs, moved) |
|---|---|
| **Tonight** | Import, the roster by role, Standby with reasons, **Invite missing**, **Arrange groups** (today's Roster and Groups, with their buttons) |
| **Loot** | **Set loot method**, the loot plan, the master looter's popup settings |
| **Export** | Stood by, snapshots, **Make export string** |
| **Guild** | Roster reconciliation (from `feat/guild-roster-reconciliation`) |

**Who sees Officers:** anyone trusted as an officer (M7: the **Officer** rank, plus Bloodfen
for development), and anyone holding a
pasted import. Only the leader tier can fetch an import from the site, so holding one already
proves that tier; that is how a raid leader who isn't an officer by rank gets in. Hiding the
button is a convenience, not security: the site's tiers and the receiver checks under Trust do
the protecting.

The lists stay; buttons move. Roster and Groups render read-only on Raid and with their actions
in the quarters. The About tab splits into "For everyone" and "In the officers' quarters".

## Raid sync

**Version.** A shared raid is identified by `eventId` and versioned by the import's
`generatedAt`, which the website stamps. Every client agrees on which copy is newer, and players'
clock differences don't matter.

**The member view** (a new bridge-format kind, `raid-share`). An officer's addon derives it from
the import (`Core/Share.lua`, pure). It carries the raid (`eventId`, title, `startsAt`),
`generatedAt`, the roster (character, name, class, role, spec), the groups, who is on the bench
(without reasons), and the loot plan's priority per item as Q2 decides. It never carries bench
reasons or anything else officer-only. It is encoded with LibSerialize's `stable` option and
LibDeflate, so two officers holding the same import send the same bytes.

**Fingerprint.** The SHA-256 of those bytes. It travels in announcements, and a client keeps a
share only when the bytes match a fingerprint it learned from an officer (Trust).

**Messages** (prefix `VINTAGE`, through AceComm and ChatThrottleLib):

| Message | Channel | Sent by | Carries |
|---|---|---|---|
| `HAVE` | GUILD; RAID when in a raid group | anyone, at login, after an import, and after a fetch | `{ eventId, generatedAt, hash }` for each raid held, newest few only |
| `WANT` | WHISPER to a sender of a newer `HAVE` | a client that is behind | `{ eventId, hash }` |
| `SHARE` | WHISPER | anyone holding bytes that match the hash | the encoded `raid-share` |
| `PICKS` | WHISPER to an online officer | a member, after changing picks (phase 3) | that member's wishlist, `updatedAt` |

The flow: an officer imports, saves, and sends `HAVE`. Each client compares versions per event
and sends `WANT` to one sender of the newer version, preferring officers. It then checks
`SHARE` against the fingerprint, saves it, and sends its own `HAVE`, so later arrivals have more
than one source. Clients keep shares in saved data, so a member who logs in with no officer
online still has the last raid, and can fetch a newer copy from another member if they learned
its fingerprint from an officer earlier.

**Limits.**
- Nothing is sent during an encounter. Messages wait for `ENCOUNTER_END`, since Midnight-era
  clients restrict addon messages in encounters (check on Forever).
- `HAVE` is sent at most once per 30 s per client.
- Per sender, the client answers at most one `WANT` per event per minute and ignores beyond
  that.
- Everything received goes through the same validation and size limits as a pasted string
  before use.
- Old events drop from saved data a day after they start.

## Trust

Anyone can edit the Lua on their own machine, and nothing inside the game can stop it. The
design accepts that: **a modified addon can only fool itself.** Each client decides whom to
trust from facts the game server or the website vouch for, never from what the sender claims.
The game server vouches for two things: the sender's name on an addon message, and the
sender's guild rank as your own guild roster shows it.

| A modified addon tries to… | Rule (each gets a spec) |
|---|---|
| Pose as an officer and send a fake raid | A `HAVE` counts as authoritative only when the sender's rank, read from the receiver's own guild roster, is an officer rank. A message from outside the guild, or from someone the roster hasn't loaded yet, is ignored until the roster is loaded |
| Relay a tampered copy of real data | `SHARE` bytes are kept only when their SHA-256 matches a fingerprint learned from an officer's `HAVE` for that `eventId` and `generatedAt` |
| Read officer-only data | It is never sent: the member view is built without it, and nothing officer-only goes on GUILD, which every addon can read. If officers ever share officer data with each other, the officer answering a `WANT` checks the asker's rank first |
| Submit picks for someone else | An officer's addon records `PICKS` only for the characters of the server-verified sender, matched through the roster in the import. The website records which officer relayed them |
| Fake an export | Already handled: recording an export needs an officer on the website (`raid-export-record`) |
| Flood announcements or requests | The rate limits above; oversized or malformed messages are dropped before decoding finishes |
| Change which ranks count as officers | It only changes their own client. Everyone else uses the shipped list (M7) |

What remains is the officers themselves: a modified officer client can send anything. Officers
are trusted with this data already, and the website keeps a record of who relayed what.

**Later, if needed:** the website signs each `raid-share` and every client checks the signature,
so relays need no officer at all. That means a signature check in pure Lua, which is real work
and may be slow, so it waits until relaying without officers turns out to matter.

## Wishlist picks (phase 3)

#27 builds the wishlist on the site (`wishlist-set|get|list`, ranked items per character, used
for council candidates). The game is then a second place to edit it:

- Pick an item from the raid's loot plan, or right-click an item link, then rank it and add an
  optional note. Your tooltips show your picks right away.
- `PICKS` goes to an online officer's addon. The officer's next `raid-export` carries the picks
  it collected (a bridge-format field, `wishlists`, with each member's `updatedAt`).
- The website applies the newest copy per character (Q3) and records it as "via the addon,
  relayed by <officer>". The next import carries the merged list back to the game.
- For a member who doesn't want an officer to relay their picks, a member-tier string from the
  site works as a fallback (paste once).

## Bridge format changes

- A new kind, `raid-share` (v1), in `schemas.ts` and `Core/BridgeFormat/schema.lua`, with the
  same limits and error codes as the import it is cut from, and golden fixtures both ways
  (`libs/bridge-format/README.md`, Fixtures).
- Phase 3: `raid-export` gains an optional `wishlists`, which bumps the schema version on both
  sides.

## Decisions (proposed; recorded in the addon plan and `AGENTS.md` when accepted)

| # | Decision | Why |
|---|---|---|
| M1 | **Addon messages are in**, which reverses the addon plan's "Out: addon-to-addon messages". Only officers' addons need to *send* a share; members mostly receive. | The original reasons were that nothing needed them and that trial accounts can't send. Members now need them, and receiving doesn't require sending (check on Forever) |
| M2 | **Authority comes from guild rank as the receiver sees it**, not from the sender's claims | The server vouches for the sender's name and rank; nothing else in the game can be trusted |
| M3 | **Relays are allowed but checked by fingerprint** | Members who log in while no officer is online still get the raid; tampered copies are dropped |
| M4 | **The member view is a separate kind cut from the import**, never the import itself | Bench reasons and other officer-only fields stay with the officers |
| M5 | **The window mirrors the site:** Raid, Loot, Wishlist for everyone; **Officers** opens the quarters | The same words and places in the game and on the site |
| M6 | **The new layout ships with the read-only sync,** not before it | Without the sync, the members' tabs would be empty |
| M7 | **Officers are the guild rank named `Officer`, plus the character Bloodfen** (Bloodfen Il, the maintainer) **while the addon is in development** (decided 2026-11-08). Both lists live in `Config.lua` (`OFFICER_RANKS = { "Officer" }`, `TRUSTED_CHARACTERS = { "Bloodfen" }`), match rank *names* (ranks get renumbered when one is added), and are shipped, so every client agrees. Bloodfen must also be in the guild | Lets the maintainer serve shares, open the quarters, and test from any rank. A character name is as safe as a rank: the game server vouches for the sender's name. Remove Bloodfen from `TRUSTED_CHARACTERS` once development settles, or keep it on purpose (a later decision) |

## Open questions

| # | Question | Recommended default |
|---|---|---|
| Q1 | ~~Which guild ranks count as officers?~~ | **Decided (M7):** the `Officer` rank, plus Bloodfen for development. Still to check: whether the Guild Master rank should count too (it has its own name, and isn't `Officer`) |
| Q2 | Do members see each item's whole priority list, or only their own place? | The whole list: names and reasons in order. Members can already see loot on the site (`loot-list`), and an open list causes fewer "why did they get it?" whispers |
| Q3 | When an in-game pick and a website edit conflict: newest wins, or do officers approve? | Newest wins for the member's own list; approval belongs in the loot method (council), not in the sync |
| Q4 | The button's name: "Officers" or "Officers' Quarters"? | "Officers", the site's word in the same place |
| Q5 | Can trial or free accounts on Forever receive addon messages, and do messages stop during encounters? | Check on the Forever client before PR 3 |

## Work breakdown

| PR | Contents | Done when |
|---|---|---|
| **1 Libraries and the fake client** | AceComm-3.0 and ChatThrottleLib through `libs.sync` with version pins in `Tools/validate.py`; a SHA-256 in `Core/` (pure Lua that also runs on PUC Lua 5.1 without `bit`); the fake client gains `C_ChatInfo.SendAddonMessage`, `CHAT_MSG_ADDON`, a guild roster with ranks, and **several clients on one host** so specs can run an officer and members together | A two-client spec passes a message from one client to the other; the SHA-256 matches known vectors |
| **2 `raid-share`** | The kind on both sides, `Core/Share.lua` (import → member view), and fixtures | The TS and Lua sides decode each other's fixtures; the member view has no bench reasons |
| **3 Sync** | `Core/Sync.lua` (pure: version compare, trust decisions, rate limits) and `Bridge/Comms.lua` (channels, encounter queue); saved shares with a migration step | Every row of the Trust table has a passing spec; an officer and three members on one host converge, including a member who joins late with no officer online |
| **4 The window** | Raid and Loot for everyone, **Officers** and the quarters, the About split, and the empty states | Lifecycle specs for a member (no quarters) and an officer; checked in the game |
| **5 Tooltips** | The priority line on item tooltips for items in the shared loot plan | A spec on the fake tooltip; checked in the game |
| **6 Wishlist (site)** | #27 | Its own acceptance criteria |
| **7 Picks** | The Wishlist tab, `PICKS`, the export's `wishlists`, and the website applying relayed picks | A member's pick on the fake host reaches the website through an officer's export; the next import carries it back |

New JTBD jobs (`docs/jtbd`, the `vintage-jtbd` skill): a member sees their group and role
without importing anything; a member sees who gets a drop; a member's wishlist pick reaches the
officers' export.

## Risks

- **Load at login:** 40 clients announcing at once. `HAVE` is small and rate-limited, but the
  guild channel's real capacity on Forever is unmeasured; PR 3 measures it on the fake host and
  then live.
- **Roster timing:** guild rank needs the guild roster loaded. Until it is, messages wait (not
  rejected forever).
- **Two officers, two imports:** the newer `generatedAt` wins. If two hashes arrive for the same
  version (different import code), the client keeps the one from the higher rank and logs the
  conflict for Mechanic.
- **Scope creep:** each PR above stands alone. Stop after PR 4 if members don't use it.
