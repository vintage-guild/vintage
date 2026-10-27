// Random's help from Discord (#155). Pure over ports, so Convex (convex/discord.ts) and the JTBD
// host run the same flow:
//   /random help [topic:…]   → help-get as the member: the overview, or one topic
//   /random <group> help     → help-get for that group's topic (`/random poll help` → polls)
// Someone Random doesn't know yet gets the public page and the role-sync note. The reply is
// private. help-get decides what each tier sees; this file only translates.
import {
  embed,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  reply,
  subcommandPath,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, publicCaller } from '@vintage/guild-kit';
import { commandOptions, ephemeral, type MemberPorts, SLASH_COMMAND } from './discord-common';
import { HELP_SUBCOMMAND, type HelpPage, topicByGroup } from './help';

export const UNKNOWN_MEMBER_NOTE =
  "-# I don't know you yet: Discord roles sync every 15 minutes, so this shows what anyone can do. If you just joined, ask again shortly.";

export interface HelpPorts extends MemberPorts {
  /** Runs a command through the registry as this caller. */
  run(caller: Caller, name: string, input: unknown): Promise<CommandResult<unknown>>;
}

/** The topic a help interaction asks for: undefined for the overview, null when it isn't help. */
function requestedTopic(interaction: Interaction): string | undefined | null {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND ||
    interaction.data?.name !== SLASH_COMMAND
  ) {
    return null;
  }
  const [first, second] = subcommandPath(interaction);
  if (first === HELP_SUBCOMMAND) {
    const topic = commandOptions(interaction).topic;
    return typeof topic === 'string' ? topic : undefined;
  }
  if (second === HELP_SUBCOMMAND && first) return topicByGroup(first)?.key;
  return null;
}

/** Is this `/random help` or `/random <group> help`? */
export function isHelpInteraction(interaction: Interaction): boolean {
  return requestedTopic(interaction) !== null;
}

export async function handleHelpInteraction(
  interaction: Interaction,
  ports: HelpPorts,
): Promise<InteractionResponse | null> {
  const topic = requestedTopic(interaction);
  if (topic === null) return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Random only answers help in the Vintage guild server.');
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  const caller: Caller = member
    ? {
        surface: 'discord',
        guildId: ports.guildId,
        tier: member.tier,
        memberId: member.id,
        discordId: member.discordId,
      }
    : publicCaller(ports.guildId, 'discord');
  const result = await ports.run(caller, 'help-get', topic ? { topic } : {});
  if (!result.success) return ephemeral('Help is unavailable right now. Please try again.');
  const page = result.data as HelpPage;
  const text = member ? page.text : `${UNKNOWN_MEMBER_NOTE}\n\n${page.text}`;
  return reply(
    {
      embeds: [
        embed({ title: page.title, description: text, ...(page.url ? { url: page.url } : {}) }),
      ],
    },
    { ephemeral: true },
  );
}
