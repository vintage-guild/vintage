// Signup buttons on the coordinator's raid posts (PLAN §6.1). Pure over ports, so Convex
// (convex/discord.ts) and the JTBD host run the same flow:
//   button  signup:<eventId>:<status>          → pick a character if needed, ask a reason for
//                                                late/tentative, else answer right away
//   select  signup-pick:<eventId>:<status>      → the chosen character, then as above
//   modal   signup-note:<eventId>:<status>:<ch> → answer with the typed reason as the note
// Every reply is ephemeral: only the person who clicked sees it. The post itself is refreshed by
// the coordinator tick that `afterChange` starts.
import {
  actionRow,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  interactionUser,
  modal,
  modalValues,
  reply,
  stringSelect,
  TextInputStyle,
  textInput,
  updateMessage,
} from '@vintage/discord-kit';
import { type Caller, type CommandResult, tierAllows } from '@vintage/guild-kit';
import type { Character, Member } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupStatus } from '@vintage/raids/contract';

const STATUSES: readonly SignupStatus[] = ['accepted', 'late', 'tentative', 'bench', 'declined'];
/** Answers that open the reason form. */
const ASKS_REASON: ReadonlySet<SignupStatus> = new Set(['late', 'tentative']);

export interface SignupPorts {
  /** The guild's Discord server id; clicks from any other server are refused. */
  discordGuildId: string | undefined;
  /** The Vintage guild id the caller acts in. */
  guildId: string;
  memberByDiscordId(discordId: string): Promise<Member | null>;
  characters(memberId: string): Promise<Character[]>;
  event(eventId: string): Promise<RaidEvent | null>;
  signup(eventId: string, memberId: string): Promise<Signup | null>;
  /** Runs `signup-set` through the registry as this caller. */
  signupSet(
    caller: Caller,
    input: { eventId: string; characterId: string; status: SignupStatus; note?: string | null },
  ): Promise<CommandResult<Signup>>;
  /** A signup changed: refresh the post soon (starts a coordinator tick). */
  afterChange(): Promise<void>;
}

type Parsed =
  | { kind: 'button'; eventId: string; status: SignupStatus }
  | { kind: 'pick'; eventId: string; status: SignupStatus; characterId: string }
  | {
      kind: 'note';
      eventId: string;
      status: SignupStatus;
      characterId: string;
      note: string | null;
    };

const isStatus = (s: string | undefined): s is SignupStatus =>
  !!s && (STATUSES as readonly string[]).includes(s);

/** The signup interaction this is, or null when it isn't one of ours. */
export function parseSignupInteraction(interaction: Interaction): Parsed | null {
  const [prefix, eventId, status, characterId] = (interaction.data?.custom_id ?? '').split(':');
  if (!eventId || !isStatus(status)) return null;
  if (prefix === 'signup' && interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return { kind: 'button', eventId, status };
  }
  const picked = interaction.data?.values?.[0];
  if (
    prefix === 'signup-pick' &&
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    picked
  ) {
    return { kind: 'pick', eventId, status, characterId: picked };
  }
  if (
    prefix === 'signup-note' &&
    interaction.type === InteractionType.MODAL_SUBMIT &&
    characterId
  ) {
    const note = modalValues(interaction).note?.trim();
    return { kind: 'note', eventId, status, characterId, note: note ? note : null };
  }
  return null;
}

const ephemeral = (content: string) => reply(content, { ephemeral: true });

const NEEDS_RECRUIT =
  'Signing up needs the Recruit rank or higher in this server. Ask an officer if that seems wrong.';

const LABEL: Record<SignupStatus, string> = {
  accepted: 'accepted',
  late: 'late',
  tentative: 'tentative',
  bench: 'bench',
  declined: 'declined',
};

function reasonForm(eventId: string, status: SignupStatus, characterId: string, raid: string) {
  const late = status === 'late';
  return modal(
    `signup-note:${eventId}:${status}:${characterId}`,
    (late ? `Late for ${raid}` : `Tentative for ${raid}`).slice(0, 45),
    textInput('note', late ? 'How late, and why? (optional)' : 'What might stop you? (optional)', {
      style: TextInputStyle.SHORT,
      required: false,
      max_length: 200,
      placeholder: late ? 'About 20 min, after work' : 'Might have to work',
    }),
  );
}

function characterPicker(eventId: string, status: SignupStatus, characters: Character[]) {
  const sorted = [...characters].sort((a, b) => Number(b.isMain) - Number(a.isMain));
  return reply(
    {
      content: 'Which character are you bringing?',
      components: [
        actionRow(
          stringSelect(
            `signup-pick:${eventId}:${status}`,
            sorted.slice(0, 25).map((c) => ({
              label: c.name,
              value: c.id,
              description: `${c.spec} ${c.class}${c.isMain ? ' · main' : ''}`,
            })),
            { placeholder: 'Pick a character' },
          ),
        ),
      ],
    },
    { ephemeral: true },
  );
}

/** Turn a signup-set result into the line the member sees. */
function outcome(result: CommandResult<Signup>, raid: string): string {
  if (result.success) {
    const s = result.data!;
    const status = LABEL[s.status];
    const base = `${s.characterName}: **${status}** for ${raid}.`;
    if (s.queued)
      return `${base} The raid is full, so you're in the queue; you'll be told if a spot opens.`;
    return `${base} The signup post updates in a few seconds.`;
  }
  const error = result.error!;
  if (error.code === 'COMMAND_NOT_FOUND') return NEEDS_RECRUIT;
  return [error.message, error.suggestion].filter(Boolean).join('. ');
}

async function answer(
  ports: SignupPorts,
  caller: Caller,
  event: RaidEvent,
  input: { status: SignupStatus; characterId: string; note?: string | null },
  respond: (content: string) => InteractionResponse,
) {
  const result = await ports.signupSet(caller, { eventId: event.id, ...input });
  if (result.success) await ports.afterChange();
  return respond(outcome(result, event.name));
}

/** The character to use without asking: the one already signed up, or their only one. */
async function defaultCharacter(ports: SignupPorts, member: Member, eventId: string) {
  const existing = await ports.signup(eventId, member.id);
  const characters = await ports.characters(member.id);
  const chosen = existing?.characterId ?? (characters.length === 1 ? characters[0]!.id : null);
  return { chosen, characters };
}

export async function handleSignupInteraction(
  interaction: Interaction,
  ports: SignupPorts,
): Promise<InteractionResponse | null> {
  const parsed = parseSignupInteraction(interaction);
  if (!parsed) return null;
  if (!ports.discordGuildId || interaction.guild_id !== ports.discordGuildId) {
    return ephemeral('Vintage only takes signups in the Vintage guild server.');
  }
  const user = interactionUser(interaction);
  const member = user ? await ports.memberByDiscordId(user.id) : null;
  if (!member) {
    return ephemeral(
      "I don't know you yet. Discord roles sync every 15 minutes; if you just joined, try again shortly.",
    );
  }
  if (!tierAllows(member.tier, 'recruit')) return ephemeral(NEEDS_RECRUIT);
  const event = await ports.event(parsed.eventId);
  if (!event) return ephemeral('That raid no longer exists.');
  const caller: Caller = {
    surface: 'discord',
    guildId: ports.guildId,
    tier: member.tier,
    memberId: member.id,
    discordId: member.discordId,
  };

  if (parsed.kind === 'note') {
    return answer(ports, caller, event, parsed, ephemeral);
  }
  if (parsed.kind === 'pick') {
    if (ASKS_REASON.has(parsed.status)) {
      return reasonForm(event.id, parsed.status, parsed.characterId, event.name);
    }
    // Replace the ephemeral picker with the result.
    return answer(ports, caller, event, parsed, (content) =>
      updateMessage({ content, components: [] }),
    );
  }

  const { chosen, characters } = await defaultCharacter(ports, member, event.id);
  if (!chosen && characters.length === 0) {
    return ephemeral('Register a character first (character-add), then answer again.');
  }
  if (!chosen) return characterPicker(event.id, parsed.status, characters);
  if (ASKS_REASON.has(parsed.status))
    return reasonForm(event.id, parsed.status, chosen, event.name);
  return answer(ports, caller, event, { status: parsed.status, characterId: chosen }, ephemeral);
}
