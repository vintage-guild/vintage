// Applications and recruiting in Discord (#135). Pure over ports, so Convex (convex/discord.ts)
// and tests run the same flow:
//   /random apply character class spec role → the apply modal (anyone in the server may apply)
//   modal  app:form:…            → application-submit as the applicant
//   button app:ok:<id>           → application-review accepted (officers)
//   button app:re:<id>           → the reply modal (officers); modal app:rs:<id> → in-review + reply
//   button app:no:<id>           → application-decline preview with a Confirm button (officers)
//   button app:nn:<id>           → application-decline for real (the click is the confirmation)
//   /random recruiting           → the open needs; leaders and officers post it to the channel
//   button recruit:hi:<class>    → recruiting-set that class to high (the weekly assessment)
// Commands decide everything; this file only translates.

import {
  APPLY_FIELDS,
  applyModal,
  parseApplicationCustomId,
  REPLY_FIELD,
  renderApplicationPost,
  renderDeclinePreview,
  renderRecruitingPost,
  replyModal,
} from '@vintage/applications/commands';
import type { Application } from '@vintage/applications/contract';
import { parseRaiseNeedCustomId } from '@vintage/coordinator/commands';
import {
  type CommandInteractionOption,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  modalValues,
  reply,
  subcommandPath,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, publicCaller, tierAllows } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { CLASS_NAMES, type WowClass } from '@vintage/wow-data';
import { SLASH_COMMAND } from './discord-polls';

export const APPLY_SUBCOMMAND = 'apply';
export const RECRUITING_SUBCOMMAND = 'recruiting';

export interface ApplicationDiscordPorts {
  discordGuildId: string | undefined;
  guildId: string;
  siteUrl: string | null;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  run(
    caller: Caller,
    name: string,
    input: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<unknown>>;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

const refusal = (result: CommandResult<unknown>) => {
  const suggestion = result.error?.suggestion ? ` ${result.error.suggestion}.` : '';
  return ephemeral(`${result.error?.message ?? 'That did not work'}.${suggestion}`);
};

function isOurs(interaction: Interaction): boolean {
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const [sub] = subcommandPath(interaction);
    return (
      interaction.data?.name === SLASH_COMMAND &&
      (sub === APPLY_SUBCOMMAND || sub === RECRUITING_SUBCOMMAND)
    );
  }
  const id = interaction.data?.custom_id ?? '';
  return parseApplicationCustomId(id) !== null || parseRaiseNeedCustomId(id) !== null;
}

/** Applicants needn't be members yet: an unknown Discord user is a public caller with their id. */
async function callerFor(interaction: Interaction, ports: ApplicationDiscordPorts) {
  const user = interactionUser(interaction);
  if (!user) return null;
  const member = await ports.memberByDiscordId(user.id);
  const caller: Caller = member
    ? {
        surface: 'discord',
        guildId: ports.guildId,
        tier: member.tier,
        memberId: member.id,
        discordId: member.discordId,
      }
    : { ...publicCaller(ports.guildId, 'discord'), discordId: user.id };
  return { caller, name: user.global_name ?? user.username };
}

function options(interaction: Interaction): Record<string, string> {
  const values: Record<string, string> = {};
  const walk = (list: CommandInteractionOption[] | undefined) => {
    for (const o of list ?? []) {
      if (o.options) walk(o.options);
      else if (typeof o.value === 'string') values[o.name] = o.value;
    }
  };
  walk(interaction.data?.options);
  return values;
}

async function startApply(interaction: Interaction): Promise<InteractionResponse> {
  const o = options(interaction);
  const wowClass = CLASS_NAMES.find((c) => c === o.class);
  const role = o.role === 'flex-raider' ? 'flex-raider' : 'raider';
  if (!wowClass || !o.character?.trim() || !o.spec?.trim()) {
    return ephemeral(
      'Give your character, class, and spec: `/random apply character:Kol class:shaman spec:restoration`',
    );
  }
  return applyModal({ wowClass, role, characterName: o.character.trim(), spec: o.spec.trim() });
}

async function postRecruiting(
  ports: ApplicationDiscordPorts,
  caller: Caller,
): Promise<InteractionResponse> {
  const result = await ports.run(caller, 'recruiting-get', {});
  if (!result.success) return refusal(result);
  const band = result.data as {
    headline: string;
    needs: { wowClass: WowClass; specs: string; need: 'high' | 'medium' | 'closed' }[];
  };
  const post = renderRecruitingPost(band.headline, band.needs, ports.siteUrl);
  // Leaders and officers post it for the channel; anyone else sees it privately.
  return tierAllows(caller.tier, 'leader') ? reply(post) : reply(post, { ephemeral: true });
}

/** recruit:hi:<class>: set one class to high need, keeping the rest of the band. */
async function raiseNeed(
  ports: ApplicationDiscordPorts,
  caller: Caller,
  wowClass: string,
): Promise<InteractionResponse> {
  if (!tierAllows(caller.tier, 'officer'))
    return ephemeral('Only officers change recruiting needs.');
  const current = await ports.run(caller, 'recruiting-get', {});
  if (!current.success) return refusal(current);
  const needs = (current.data as { needs: { wowClass: string; specs: string; need: string }[] })
    .needs;
  const next = needs.some((n) => n.wowClass === wowClass)
    ? needs.map((n) => (n.wowClass === wowClass ? { ...n, need: 'high' } : n))
    : [...needs, { wowClass, specs: 'any', need: 'high' }];
  const result = await ports.run(caller, 'recruiting-set', { needs: next });
  return result.success
    ? ephemeral(
        `${wowClass.charAt(0).toUpperCase()}${wowClass.slice(1)} is now a high need on the site.`,
      )
    : refusal(result);
}

async function officerAction(
  interaction: Interaction,
  ports: ApplicationDiscordPorts,
  caller: Caller,
): Promise<InteractionResponse | null> {
  const parsed = parseApplicationCustomId(interaction.data?.custom_id);
  if (!parsed || parsed.action === 'form') return null;
  if (!tierAllows(caller.tier, 'officer')) return ephemeral('Only officers answer applications.');
  const applicationId = parsed.applicationId;
  switch (parsed.action) {
    case 'ok': {
      const result = await ports.run(caller, 'application-review', {
        applicationId,
        status: 'accepted',
      });
      return result.success
        ? updateMessage(renderApplicationPost(result.data as Application))
        : refusal(result);
    }
    case 're':
      return replyModal(applicationId);
    case 'rs': {
      const text = modalValues(interaction)[REPLY_FIELD]?.trim() ?? '';
      const result = await ports.run(caller, 'application-review', {
        applicationId,
        status: 'in-review',
        reply: text,
      });
      return result.success
        ? updateMessage(renderApplicationPost(result.data as Application))
        : refusal(result);
    }
    case 'no': {
      const found = await ports.run(caller, 'application-get', { applicationId });
      return found.success
        ? reply(renderDeclinePreview(found.data as Application), { ephemeral: true })
        : refusal(found);
    }
    case 'nn': {
      const preview = await ports.run(caller, 'application-decline', { applicationId });
      if (!preview.success) return refusal(preview);
      const { confirmToken } = preview.data as { confirmToken: string };
      const done = await ports.run(caller, 'application-decline', { applicationId }, confirmToken);
      return done.success ? updateMessage({ content: 'Declined.', components: [] }) : refusal(done);
    }
  }
}

export async function handleApplicationInteraction(
  interaction: Interaction,
  ports: ApplicationDiscordPorts,
): Promise<InteractionResponse | null> {
  if (!isOurs(interaction)) return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Applications are taken in the Vintage guild server.');
  }
  const who = await callerFor(interaction, ports);
  if (!who) return null;
  const { caller } = who;

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const [sub] = subcommandPath(interaction);
    return sub === APPLY_SUBCOMMAND ? startApply(interaction) : postRecruiting(ports, caller);
  }
  const id = interaction.data?.custom_id ?? '';
  const raise = parseRaiseNeedCustomId(id);
  if (raise) return raiseNeed(ports, caller, raise);

  const parsed = parseApplicationCustomId(id);
  if (parsed?.action === 'form') {
    const values = modalValues(interaction);
    const result = await ports.run(caller, 'application-submit', {
      ...parsed.form,
      about: values[APPLY_FIELDS.about],
      experience: values[APPLY_FIELDS.experience],
      availability: values[APPLY_FIELDS.availability],
      applicantName: who.name,
    });
    return result.success
      ? ephemeral('Thanks! Your application is with the officers; they answer here in Discord.')
      : refusal(result);
  }
  return officerAction(interaction, ports, caller);
}
