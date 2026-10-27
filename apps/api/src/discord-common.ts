// What every `/random` flow shares (polls, raids): the command name, reading a slash command's
// options, the guild check and the member behind an interaction, and a failed command in words.
// Pure; the flows themselves stay in their own files.
import {
  ApplicationCommandOptionType,
  type CommandInteractionOption,
  type Interaction,
  type InteractionResponse,
  interactionUser,
  reply,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';

/** The bot's slash command; the same name as RANDOM_COMMAND in apps/gateway/src/commands.ts. */
export const SLASH_COMMAND = 'random';

export type OptionValues = Record<string, string | number | boolean>;

export const ephemeral = (content: string): InteractionResponse =>
  reply(content, { ephemeral: true });

/** A slash command's leaf options, by name, whatever subcommand or group they sit under. */
export function commandOptions(interaction: Interaction): OptionValues {
  const values: OptionValues = {};
  const walk = (options: CommandInteractionOption[] | undefined) => {
    for (const o of options ?? []) {
      if (
        o.type === ApplicationCommandOptionType.SUB_COMMAND ||
        o.type === ApplicationCommandOptionType.SUB_COMMAND_GROUP
      ) {
        walk(o.options);
      } else if (o.value !== undefined) {
        values[o.name] = o.value;
      }
    }
  };
  walk(interaction.data?.options);
  return values;
}

/**
 * A failed command as one line for the member, in the commands' own words. `notFound` is what to
 * say for COMMAND_NOT_FOUND (the caller's rank is too low), `invalid` leads a validation error.
 */
export function failureText(
  result: CommandResult<unknown>,
  notFound: string,
  invalid = 'That isn’t valid.',
): string {
  const error = result.error;
  if (!error) return 'Something went wrong. Please try again.';
  if (error.code === 'COMMAND_NOT_FOUND') return notFound;
  if (error.code === 'VALIDATION_ERROR') {
    const issues = (error.details as { issues?: { path?: unknown[]; message?: string }[] })?.issues;
    const first = issues?.[0];
    const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
    return `${invalid} ${where}${first?.message ?? error.message}`;
  }
  return [error.message, error.suggestion].filter(Boolean).join('. ');
}

export interface MemberPorts {
  /** The guild's Discord server id; interactions from any other server are refused. */
  discordGuildId: string | undefined;
  /** The Vintage guild id the caller acts in. */
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
}

/**
 * The caller behind an interaction from the guild's own server, or the private refusal to send.
 * `what` names the feature for the wrong-server line ("polls", "raids").
 */
export async function discordCaller(
  interaction: Interaction,
  ports: MemberPorts,
  what: string,
): Promise<{ caller: Caller } | { refusal: InteractionResponse }> {
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return { refusal: ephemeral(`Random only runs ${what} in the Vintage guild server.`) };
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) {
    return {
      refusal: ephemeral(
        "I don't know you yet. Discord roles sync every 15 minutes; if you just joined, try again shortly.",
      ),
    };
  }
  return {
    caller: {
      surface: 'discord',
      guildId: ports.guildId,
      tier: member.tier,
      memberId: member.id,
      discordId: member.discordId,
    },
  };
}
