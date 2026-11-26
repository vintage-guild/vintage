// The tentative-check DM's buttons (coordinator `tentativeCheck`). Once the leads get the party
// draft, the coordinator DMs each member who was Tentative and asks if they can make it:
//   button  tentative-check:<eventId>:yes     → signup-set Going (accepted), the Tentative reason cleared
//   button  tentative-check:<eventId>:no      → signup-set Absent (declined), the reason kept
//   button  tentative-check:<eventId>:unsure  → no change; they stay Tentative
// The click comes from a DM, so there is no guild id to check: the clicking Discord user must be a
// known member, and the answer only ever changes their own signup. The DM is rewritten with the
// result and loses its buttons. Pure over ports, so Convex (convex/discord.ts) and tests run the
// same flow.

import {
  TENTATIVE_ANSWERS,
  TENTATIVE_CHECK_PREFIX,
  type TentativeAnswer,
} from '@vintage/coordinator/contract';
import {
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  updateMessage,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupStatus } from '@vintage/raids/contract';
import { failureText } from './discord-common';

export interface TentativePorts {
  /** The guild's Discord server id; a click from any other server is refused. */
  discordGuildId: string | undefined;
  /** The Vintage guild id the caller acts in. */
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  event(eventId: string): Promise<RaidEvent | null>;
  signup(eventId: string, memberId: string): Promise<Signup | null>;
  /** Runs `signup-set` through the registry as this caller. */
  signupSet(
    caller: Caller,
    input: { eventId: string; characterId: string; status: SignupStatus; note?: string | null },
  ): Promise<CommandResult<Signup>>;
  /** A signup changed: refresh the post and the leads' change feed soon. */
  afterChange(): Promise<void>;
}

const ANSWERS: ReadonlySet<string> = new Set(TENTATIVE_ANSWERS);

/** `tentative-check:<eventId>:<answer>`, or null for any other click. */
export function parseTentativeCheck(
  interaction: Interaction,
): { eventId: string; answer: TentativeAnswer } | null {
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return null;
  const parts = (interaction.data?.custom_id ?? '').split(':');
  if (parts.length !== 3 || parts[0] !== TENTATIVE_CHECK_PREFIX) return null;
  const [, eventId, answer] = parts as [string, string, string];
  if (!eventId || !ANSWERS.has(answer)) return null;
  return { eventId, answer: answer as TentativeAnswer };
}

/** Rewrite the DM with the result and drop its buttons, so it can't be answered twice. */
const done = (content: string): InteractionResponse =>
  updateMessage({ content, components: [], allowed_mentions: { parse: [] } });

const STATUS_WORDS: Record<SignupStatus, string> = {
  accepted: 'Going',
  late: 'Late',
  tentative: 'Tentative',
  bench: 'on Standby',
  declined: 'Absent',
};

/** The clicking member, the raid, and their Tentative signup, or the reply to send instead. */
async function tentativeSignup(
  interaction: Interaction,
  ports: TentativePorts,
  eventId: string,
): Promise<{ member: Member; event: RaidEvent; signup: Signup } | { reply: InteractionResponse }> {
  // A DM has no guild id; a click inside a server must be ours.
  if (interaction.guild_id && interaction.guild_id !== ports.discordGuildId) {
    return { reply: done('Random only takes signups for the Vintage guild.') };
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) return { reply: done("I don't know you yet, so I couldn't change your signup.") };
  const event = await ports.event(eventId);
  if (!event) return { reply: done('That raid no longer exists.') };
  const signup = await ports.signup(event.id, member.id);
  if (!signup) {
    return {
      reply: done(`You're not signed up for ${event.name} anymore. Use the signup post to answer.`),
    };
  }
  if (signup.status !== 'tentative') {
    return {
      reply: done(
        `You already changed your answer for ${event.name}: you're ${STATUS_WORDS[signup.status]}. ` +
          'Use the signup post to change it again.',
      ),
    };
  }
  return { member, event, signup };
}

export async function handleTentativeInteraction(
  interaction: Interaction,
  ports: TentativePorts,
): Promise<InteractionResponse | null> {
  const parsed = parseTentativeCheck(interaction);
  if (!parsed) return null;
  const found = await tentativeSignup(interaction, ports, parsed.eventId);
  if ('reply' in found) return found.reply;
  const { member, event, signup } = found;
  if (parsed.answer === 'unsure') {
    return done(
      `OK, you're still Tentative for ${event.name}. Change your answer on the signup post once you know.`,
    );
  }

  const caller: Caller = {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };
  const going = parsed.answer === 'yes';
  const result = await ports.signupSet(caller, {
    eventId: event.id,
    characterId: signup.characterId,
    status: going ? 'accepted' : 'declined',
    // The Tentative reason no longer applies once they're coming; kept as the reason they're not.
    ...(going ? { note: null } : {}),
  });
  if (!result.success || !result.data) {
    const why = failureText(result, 'Your rank can’t sign up for this raid.');
    const sentence = /[.!?]$/.test(why) ? why : `${why}.`;
    return done(`I couldn't change your signup. ${sentence} Use the signup post instead.`);
  }
  await ports.afterChange();
  const now = STATUS_WORDS[result.data.status];
  return done(
    going
      ? `Thanks! You're ${now} for ${event.name} on ${result.data.characterName}.`
      : `Got it. You're Absent for ${event.name}. The raid leaders will see it.`,
  );
}
