# applications module

Guild applications (epic #126, #134, #135): raiders and flex raiders apply from Discord or the
site (`/apply`, `vintage-apply-form`); one Decisions request labels each application; officers
accept, reply, or decline from the review post in the recruitment channel or the quarters'
Applications tab (`vintage-applications-desk`). Maturity: **official**.

## Shape

| Path | Holds |
|---|---|
| `src/contract.ts` | `Application` (with `onboardedAt`), `ApplicationLabels`, statuses (`OPEN_STATUSES`), `APPLY_ROLES` (raider, flex-raider), limits, `OwnApplicationView` / `toOwnView`, `GiveRole` / `AcceptedApplication`, `ApplicationsConfig` with the default onboarding note and the rolling limit, `ApplyCheck` / `ApplyBlock` |
| `src/store.ts` | `ApplicationsStore` port, `ApplicationEffects` (submitted, accepted, onboard, replied, changed, limitReached), `ApplicationRoles` (the recruit role id), `ApplicationMembers` (in the Vintage server, from identity), `ApplicationsDeps`, `command` |
| `src/commands/` | `application-check`, `application-submit`, `application-get`, `application-withdraw` (public, own); `application-list`, `application-review`, `application-decline` (destructive), `application-config-get`, `application-config-set` (officer); `application-onboard` (system only) |
| `src/domain/eligibility.ts` | `checkApply`: who may apply now, in order, and `BLOCKS` (each refusal's code and words); `guildLimit` |
| `src/domain/labels.ts` | The Decisions request (role it reads as, complete, fit to the open needs) and `LABEL_THRESHOLDS` |
| `src/render/discord.ts` | The apply modals (the slash command's, and the full one behind the recruiting post's Apply buttons, `app:start:<role>` → `app:open:<role>`), the review post with Accept / Ask more / Decline, the decline preview, the officer's accept reply, DMs, the `/random recruiting` post; custom ids `app:<action>:<id>` |
| `src/testing.ts` | Memory store and deps (recording effects) |
| `convex/` | The `applications` component: `applications` and `config` |

## Rules

- **A Discord account is the identity.** `application-submit` needs `caller.discordId` and is
  open to the public tier: applicants aren't members yet.
- **One answer to "may I apply?"** (#145). `checkApply` decides for `application-check` (read
  before any form, on the site and in Discord) and for `application-submit`, in this order:
  signed in with Discord (`DISCORD_REQUIRED`), not a raider (`ALREADY_RAIDING`), in the Vintage
  Discord server (`JOIN_DISCORD_FIRST`), no open application (`APPLICATION_OPEN`), at most three
  per 30 days (`TOO_MANY_APPLICATIONS`), and the guild under its rolling limit
  (`APPLICATIONS_BUSY`, retryable, with `retryAt`). Surfaces show the block's message and
  suggestion; they never re-derive it.
- **Join the Discord first** (decided 2026-10-27). Officers answer applicants in Discord, so
  applying needs membership of the server. `/random` callers are in it by definition; on the
  site, identity's `Member.inServer` from the last sync (every 15 minutes) decides, and the
  site's "I've joined" runs `member-refresh` to re-read it now.
- **A rolling limit, not a cap** (decided 2026-10-27). At most `limitCount` applications
  (default 10) per `limitWindowMinutes` (default 30) across the guild; past it, applicants are
  told when to try again, so a flood has to keep coming back. Officers set both with
  `application-config-set`. The first refusal in a window (`limitAlertedAt`) posts one note
  to the recruitment channel (`applications:limitAlert`).
- **Applicants see only their own status and reply** (`toOwnView`): never the labels or who
  reviewed. Someone else's id answers `APPLICATION_NOT_FOUND`.
- **Labels inform, never decide.** One Decisions request after submit (`applications:afterSubmit`)
  asks what the text reads as, whether it is complete, and its fit to the site's open needs (the
  starter needs until an officer saves the band). The floors are conservative because no real
  applications exist to score yet; below them a label reads "unsure". Re-check with
  `pnpm --filter @vintage/applications exec tsx scripts/label-sample.ts`.
- **The recruitment channel is officers-only.** Posts carry the applicant's Discord mention,
  answers, labels, and the officers' reply. Nothing checks the channel's permissions, so
  `application-config-set channelId` must name a channel only officers can read.
- **Decline is destructive.** In Discord the Decline button shows a preview and the Confirm click
  declines. A reply is optional and is DMed.
- **Accept never touches Discord roles** (decided 2026-10-27). The bot doesn't hold Manage Roles
  (`vintage-discord` skill). `application-review` accepted answers `giveRole`, the role mapped to
  recruit; Discord tells the accepting officer privately (a role mention, no ping) and the quarters
  say it in the status line. The officer gives the role; role sync promotes the member.
- **Onboarding follows the promotion, once.** `application-onboard` (system only) marks the
  latest accepted application `onboardedAt` and schedules the onboarding DM (`{site}` becomes
  `VINTAGE_SITE_URL`), unless the member turned DMs off; marked either way, so it never repeats.
  apps/api runs it (`src/onboarding.ts`) when member-sync lifts someone from below recruit to
  recruit or above, and after an accept when they already hold the role. Any onboarded application
  of theirs counts, so a recruit who applies again isn't welcomed twice. Rows accepted before this
  count as onboarded (they got the DM at accept time); accepting now writes `onboardedAt: null`,
  so an older row accepted later still onboards. Without a bot token the mark is still set and the
  DM is lost. A failing onboard is logged and never stops member-sync.
- **The class comes from free text behind the Apply button.** Modals hold five text inputs, so
  the button's form asks "Spec and class" and `parseClassSpec` finds the class word; with none,
  the applicant is asked again.
- **Effects run outside the command's transaction** as scheduled functions
  (`apps/api/convex/applications.ts`): label and post, reply DM, post refresh, and the onboarding
  DM (actions), and onboard-if-promoted after an accept (a mutation). Without a bot token the
  Discord parts do nothing; without an OpenAI key the post is unlabeled. `application-onboard`
  itself runs inside member-sync's transaction.
- **`guildId` on every row**, read through guild-scoped indexes.
