// The guild agent in Discord (#18). Pure over ports, so Convex (convex/discord.ts) and tests run
// the same flow:
//   /random ask question:…        → agent-ask as the member; a private "thinking" reply now, edited
//                                   with the answer when the run ends (convex/agent.ts)
//   button  agent:ok:<confirmId>  → agent-confirm as the clicker
//   button  agent:no:<confirmId>  → agent-decline as the clicker
// Commands decide everything (who may ask, caps, who may confirm); this file only translates.

import { parseAgentCustomId, renderChangeResult } from '@vintage/agent/commands';
import type { AgentDelivery } from '@vintage/agent/contract';
import {
  deferReply,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  reply,
  subcommandPath,
  updateMessage,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import { SLASH_COMMAND } from './discord-polls';

export const ASK_SUBCOMMAND = 'ask';

export interface AgentDiscordPorts {
  discordGuildId: string | undefined;
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  /** agent-ask as this caller; the answer is delivered by editing this interaction's reply. */
  ask(
    caller: Caller,
    input: { question: string; thread?: string },
    delivery: AgentDelivery,
  ): Promise<CommandResult<unknown>>;
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

const refusal = (result: CommandResult<unknown>) => {
  const suggestion = result.error?.suggestion ? ` ${result.error.suggestion}.` : '';
  return ephemeral(`${result.error?.message ?? 'That did not work'}.${suggestion}`);
};

function isAgentInteraction(interaction: Interaction): boolean {
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const [sub] = subcommandPath(interaction);
    return interaction.data?.name === SLASH_COMMAND && sub === ASK_SUBCOMMAND;
  }
  return (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    parseAgentCustomId(interaction.data?.custom_id ?? '') !== null
  );
}

function questionOf(interaction: Interaction): string {
  const option = interaction.data?.options
    ?.find((o) => o.name === ASK_SUBCOMMAND)
    ?.options?.find((o) => o.name === 'question');
  return typeof option?.value === 'string' ? option.value : '';
}

/** The clicking or asking member as a caller, or the reply that refuses them. */
async function callerFor(
  interaction: Interaction,
  ports: AgentDiscordPorts,
): Promise<Caller | InteractionResponse> {
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Random only answers questions in the Vintage guild server.');
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) {
    return ephemeral(
      "I don't know you yet. Discord roles sync every 15 minutes; if you just joined, try again shortly.",
    );
  }
  return {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
}

async function ask(interaction: Interaction, ports: AgentDiscordPorts, caller: Caller) {
  const question = questionOf(interaction).trim();
  if (!question)
    return ephemeral('Ask a question, for example `/random ask when is the next raid?`');
  const result = await ports.ask(
    caller,
    { question, ...(interaction.channel_id ? { thread: interaction.channel_id } : {}) },
    { kind: 'discord', applicationId: interaction.application_id, token: interaction.token },
  );
  return result.success ? deferReply({ ephemeral: true }) : refusal(result);
}

export async function handleAgentInteraction(
  interaction: Interaction,
  ports: AgentDiscordPorts,
): Promise<InteractionResponse | null> {
  if (!isAgentInteraction(interaction)) return null;
  const caller = await callerFor(interaction, ports);
  if (!('surface' in caller)) return caller;
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return ask(interaction, ports, caller);
  }
  const action = parseAgentCustomId(interaction.data?.custom_id ?? '');
  if (!action) return null;
  const result = await ports.run(caller, action.kind === 'ok' ? 'agent-confirm' : 'agent-decline', {
    confirmationId: action.confirmationId,
  });
  return updateMessage(renderChangeResult(action.kind, result, interaction.message?.content ?? ''));
}
