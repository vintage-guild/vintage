# Armory

A member links a registered character to its WoW: Forever armory entry, and the guild sees what
the armory says about it ([feature doc](../features/active/armory/armory.plan.md)). Automated in
`apps/api/tests/jtbd/armory.jtbd.test.ts`, with Blizzard as a fake fetch behind the real client.

**Cast:** Ana (Officer), Aeryn (Raider), Pip (Member), whose mage is Pipwick Thornbury.

## Live setup

1. The local backend is running (`pnpm --filter @vintage/api dev:local:watch`) with
   `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, and `BLIZZARD_REGION` set (SETUP.md).
2. Use a real Forever character at level 10 or above that has logged out since, in that region.
3. Run commands as the system caller (`npx convex run commands:runAsSystem '{…}'` in `apps/api`),
   or as a member with `commands:run --identity` (SETUP.md).

## Jobs

### J49 · Link a character to the armory and see its gear
**When** I've registered my character, **I want** to link it to the Forever armory, **so I can**
show the guild my level, item level, and gear without typing them, and keep them current.
- [ ] `character-add` Pipwick (mage), then `armory-link` with a wrong surname: the link is pending,
  and a moment later `armory-get` shows `not-found` with no profile.
- [ ] `armory-link` with the right surname right away saves it without a fetch (the answer says
  it waits for the cooldown); 10 minutes later `npx convex run armory:sweep` fetches it.
- [ ] Then `armory-get` shows `found`, the level, class, guild,
  equipped item level, each equipped item with its quality and item level, and an `https` portrait;
  `classMismatch` is false.
- [ ] A raider's `armory-list allGuild:true` shows the link; a member's is refused (`FORBIDDEN`),
  and another member's `armory-get` on Pipwick answers `CHARACTER_NOT_FOUND`.
- [ ] Aeryn can't link Pip's character (`CHARACTER_NOT_FOUND`).
- [ ] `armory-refresh` right away answers `ARMORY_REFRESH_TOO_SOON` with the wait; after 10 minutes
  it fetches again and `checkedAt` moves.
- [ ] `npx convex run armory:sweep` 12 hours after a check asks again; after `character-remove`,
  the next sweep drops the link.
- [ ] Ana's `armory-unlink` previews the slug, and after confirming `armory-get` shows no link
  while `character-list` still has Pipwick.
