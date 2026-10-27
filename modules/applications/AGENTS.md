# applications module

Guild applications (epic #126, #134, #135): raiders and flex raiders apply from Discord (or the
site, next); one Decisions request labels each application; officers accept, reply, or decline
from the review post in the recruitment channel. Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `Application`, `ApplicationLabels`, statuses (`OPEN_STATUSES`), `APPLY_ROLES` (raider, flex-raider), limits, `OwnApplicationView` / `toOwnView`, `ApplicationsConfig` with the default onboarding note |
| `src/store.ts` | `ApplicationsStore` port, `ApplicationEffects` (submitted, accepted, replied, changed), `ApplicationsDeps`, `command` |
| `src/commands/` | `application-submit`, `application-get`, `application-withdraw` (public, own); `application-list`, `application-review`, `application-decline` (destructive), `application-config-get`, `application-config-set` (officer) |
| `src/domain/labels.ts` | The Decisions request (role it reads as, complete, fit to the open needs) and `LABEL_THRESHOLDS` |
| `src/render/discord.ts` | The apply modal, the review post with Accept / Reply / Decline, the decline preview, DMs, the `/random recruiting` post; custom ids `app:<action>:<id>` |
| `src/testing.ts` | Memory store and deps (recording effects) |
| `convex/` | The `applications` component: `applications` and `config` |

## Rules

- **A Discord account is the identity.** `application-submit` needs `caller.discordId` and is
  open to the public tier: applicants aren't members yet. Raiders can't apply
  (`ALREADY_RAIDING`); one open application per person (`APPLICATION_OPEN`); at most three per
  30 days (`TOO_MANY_APPLICATIONS`).
- **Applicants see only their own status and reply** (`toOwnView`): never the labels or who
  reviewed. Someone else's id answers `APPLICATION_NOT_FOUND`.
- **Labels inform, never decide.** One Decisions request after submit (`applications:afterSubmit`)
  asks what the text reads as, whether it is complete, and its fit to the site's open needs (the
  starter needs until an officer saves the band). The floors are conservative because no real
  applications exist to score yet; below them a label reads "unsure". Re-check with
  `pnpm --filter @vintage/applications exec tsx scripts/label-sample.ts`.
- **Decline is destructive.** In Discord the Decline button shows a preview and the Confirm click
  declines. A reply is optional and is DMed.
- **Accept never touches Discord roles.** The bot doesn't hold Manage Roles (`vintage-discord`
  skill): accepting DMs the onboarding note (`{site}` is replaced) and asks officers, in the
  recruitment channel, to give the recruit role; role sync then makes them a recruit.
- **Effects run outside the transaction** as scheduled actions (`apps/api/convex/applications.ts`):
  label and post, onboarding, reply DM, post refresh. Without a bot token they do nothing;
  without an OpenAI key the post is unlabeled.
- **`guildId` on every row**, read through guild-scoped indexes.
