# Character choice: which character a raider brings

**Status:** active (2026-10-27): §1–2 built and tested (#148), not yet deployed; §3–4 to do
(#149). **Owner modules:** raids (signups), identity (characters).

Raiders and flex raiders often bring a different character, class or spec from one raid to the next: a
main on Molten Core, an alt on the Rage Fire Chasm run, or the same druid as a tank one night and
DPS the next. Vintage should guess the character well, show the guess, and make switching one click,
for this raid only.

## Today

| Piece | Where | State |
|---|---|---|
| Characters (name, class, spec, role, `isMain`) | identity: `character-add/update/remove/list` | ✅ commands, and the site's `/characters` page |
| `prefs.defaultCharacterId` | identity: `member-prefs-set` | ⚠️ stored but nothing reads it |
| Signup copies of the character | raids `Signup.characterName/class/spec/role` | ✅ posts and comp read the copy |
| Discord signup buttons | `apps/api/src/discord-signups.ts` | ✅ sign up with `signup-suggest`'s guess and say why; Switch character and Change spec in the reply (#148) |
| Site signup card | `vintage-signup-card` (ui-kit) on the home page | ✅ the guess and its reason, with the same two menus (#148) |
| Characters from Discord | none | ❌ "Register a character first (character-add)", but there's no way to do that in Discord (#149) |
| Spec for one raid | raids `signup-set` `spec` | ✅ on the signup only; the saved character keeps its spec (#148) |

## How other bots do it

- **Raid-Helper** has no idea of a character. Each signup picks a class, and the spec it remembers is
  per class, so the member isn't asked again. To change spec, they sign up for the class again. It's
  easy to use, but nothing knows which character came, so there's no addon export by name or
  attendance per character. ([Raid-Helper docs](https://raid-helper.dev/documentation/advanced),
  [listing](https://discordbotlist.com/bots/raid-helper))
- **whentoraid** (another WoW: Forever guild's tool) signs up with the character's saved spec in one
  click. The private confirmation names the character, spec and role, and a "Change spec for this
  raid" menu sets a spec for that raid only. The saved character doesn't change. Switching to another
  character clears that choice, and moving between going, late and tentative keeps it.
  ([PR #32](https://github.com/whentoraid/whentoraid.github.io/pull/32))
- **Guild Order** links signups to characters (main or alt), works out roles from the active
  spec, and lets officers bench alts by name. It's a web tool, not a bot. Its claims come from the
  vendor's own page and aren't verified.
  ([page](https://guildorder.com/plugins/wow-raid-signup))
- **Spec Switch Announce** and **RaidPlanningHelper** (addons) import Raid-Helper exports and warn
  when someone's in-game spec doesn't match their signup.
  ([1](https://www.curseforge.com/wow/addons/spec-switch-announce),
  [2](https://www.curseforge.com/wow/addons/raidplanninghelper))

**What we take from them:** one click with a visible guess (Raid-Helper, whentoraid), a spec for one
raid that doesn't change the saved character (whentoraid), and real characters behind each signup
(Guild Order), which the addon roster and invites need.

## Design

### 1. Guessing the character

There's a new read-only command, **`signup-suggest`** (tier: recruit), in the raids module. Its input
is `{ eventId }` and it returns `{ characterId, spec, reason }`, or `null` when there's no good
guess. Discord, the site and the agent all use it. The guess, in order:

1. **Already signed up for this raid:** that character and spec.
2. **Same series:** the character used most often in the member's last 5 signups for raids from the
   same schedule (`scheduleId`), newest raid first and declines left out. For a one-off, it's
   raids in the same instance (an event with no instance has no series). A tie goes to the most
   recent, and the spec comes from the newest of those nights.
3. **Main:** the character marked `isMain`.
4. **Only character:** if they have just one.
5. Otherwise there's no guess, and Discord shows the picker.

`reason` is a short line the member sees, such as "you brought Aeryn to your last 3 Molten Core
nights" or "your main". It makes the guess easy to check and explains why it was made.

**Learning** means reading signup history; there's no model to train. That keeps it predictable,
easy to explain, and right for a guild whose members switch characters on purpose. It needs one new
store query in raids, **`listSignupsByMember(guildId, memberId, limit)`**, backed by a
`by_guild_member` index. The raids module gets the member's characters through the identity
contract (`apps/api` passes them in), never from identity's tables.

### 2. Showing the guess and switching

A Discord Accept, Late or Tentative click signs up with the guess straight away (late and tentative
still ask for a reason first). The private reply names what was used:

> ✅ Accepted for **Molten Core** as **Aeryn** (Protection Warrior, tank): your last 3 MC nights.
> [Switch character ▾] [Change spec ▾]

- **Switch character** is a select menu of their characters, main first. Each entry shows class,
  spec and role, and marks a role the raid is short of (for example "healers needed"). Picking one
  runs `signup-set` with the new character. Their place in line is kept, as J05 already promises,
  and any spec chosen for this raid is cleared.
- **Change spec** is a select menu of the specs for this character's class, with the role on each
  (Feral is listed twice, as tank and DPS). Picking one runs `signup-set` with the new optional
  `spec` field. The signup's copy of spec and role changes, but the saved character doesn't. Moving
  between accepted, late and tentative keeps it, as whentoraid does.
- When nothing can be guessed, the picker is the same select menu with **➕ New character…** at
  the end (see §3).

On the site, the raid's signup form gets the same two controls, with the guess and its reason
filled in.

**As built (#148):**

- Custom ids: `signup-char:<event>` and `signup-spec:<event>` (the choice is the menu's value),
  and the reason form's `signup-note:<event>:<status>:<character>:<spec>` carries the guessed
  spec (the old four-part form still parses). Ids and values must match `[A-Za-z0-9_-]{1,64}`.
- "Needed" means fewer going (accepted or late, not queued) than the event's role targets
  (raids `rolesNeeded`), not counting the member's own signup, so a raid's only healer still
  sees "healers needed" on the healer spec.
- Switch character appears only with two or more characters; a decline gets no menus. A menu
  used before answering says "Answer the raid first".
- With the same character and no `spec`, `signup-set` keeps the signup's spec and role, so a
  status change keeps a spec chosen for the raid. A changed saved spec reaches an existing
  signup only through Change spec or switching character.

### 3. Managing characters from Discord

A new `/random character` group is forwarded to Convex like `poll` and `raid`:

| Subcommand | Runs | Notes |
|---|---|---|
| `add name class spec [main]` | `character-add` | Discord shows `class` as a list of choices. `spec` uses autocomplete filtered by class; the fallback is free text checked by the command |
| `list` | `character-list` | Private; marks the main |
| `main name` | `character-update { isMain }` | Autocomplete from their own characters |
| `remove name` | `character-remove` | Destructive: preview, then confirm, like the poll close flow |

**New character from the picker:** **➕ New character…** opens a modal with a name field and class
and spec selects. Discord modals can hold select menus now, but discord-kit needs to be checked for
support first. If that doesn't work out, the modal just asks for the name and the class, and the
member then picks a spec from the Change spec menu. Saving it signs them up with the new character
in the same step.

**Autocomplete** means the gateway has to forward `APPLICATION_COMMAND_AUTOCOMPLETE` (type 4) to
Convex and answer with type 8 within 3 seconds. Today those get a 400. It's a small, separate
gateway change, and it's what the `spec` and `name` options need.

### 4. The agent

`/random ask "I'm bringing my priest Thursday"` works once the agent's tool list includes these
commands (`signup-suggest`, and `signup-set` with `spec`). The intent router sends it to
`signup-set` with the character it resolved, and the reply names the character and spec it used.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Guess from signup history with fixed rules, not a learned model | Easy to explain, has no failures nobody can see, and a wrong guess costs one click to fix |
| 2 | A spec for one raid lives on the signup, not on the character | Changing a saved character for one night is how saved data drifts out of date |
| 3 | `isMain` is the default; drop `prefs.defaultCharacterId` | Two meanings of "default" would compete. Removing the field changes `member-prefs-set`'s input, so the PR needs the `breaking-contract` label |
| 4 | Keep real characters, not class-only signups like Raid-Helper | Addon exports, invites and attendance need character names |
| 5 | Series window: the member's last 5 signups for the same schedule; one-offs, the same instance | Decided by Bloodfen, 2026-10-27 (#148) |
| 6 | Discord and the site both ship Switch character and Change spec in #148 | Decided by Bloodfen, 2026-10-27 |
| 7 | Flex raiders get a "needed" hint in the picker and nothing more | Decided by Bloodfen, 2026-10-27 |
| 8 | Addon attendance correcting the history is out of scope | Decided by Bloodfen, 2026-10-27; follow-up #185 |

## Open questions

None open; the four from the proposal are decisions 5–8.

## Tasks

- [x] **Signups guess and switch** (#148) (raids, apps/api, web): `signup-suggest`,
  `listSignupsByMember` with its index, optional `spec` on `signup-set`, the private reply with
  Switch character and Change spec, the site's signup form, and J05 and J15 extended plus a new job
  for "brings a different character" (J39).
- [ ] **Characters from Discord** (#149) (gateway, apps/api, identity): the `/random character` group,
  autocomplete forwarding, **➕ New character…** in the picker, and removing
  `defaultCharacterId` (`breaking-contract`).
