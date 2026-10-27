// Polls in Discord (#62). Pure over ports, so Convex (convex/discord.ts) and the JTBD host run the
// same flow:
//   /random poll create …           → poll-create as the member, then the post goes up in this channel
//   button  poll:v:<pollId>:<option>  → vote-cast with that option
//   select  poll:s:<pollId>           → vote-cast with the picked options
//   button  poll:x:<pollId>           → vote-retract
//   button  poll:c:<pollId>           → poll-close preview, with a Confirm button
//   button  poll:cc:<pollId>          → poll-close for real (the click is the confirmation)
// Every reply is ephemeral. Commands decide everything (tiers, visibility, who may close); this
// file only translates Discord to commands and results to words.
import {
  actionRow,
  ButtonStyle,
  button,
  discordTimestamp,
  type Interaction,
  type InteractionResponse,
  InteractionType,
  reply,
  subcommandPath,
  TimestampStyle,
  updateMessage,
} from '@vintage/discord-kit';
import type { Caller, CommandResult } from '@vintage/guild-kit';
import { parsePollCustomId, pollCustomId } from '@vintage/polls/commands';
import type { Poll, PollResults } from '@vintage/polls/contract';
import {
  commandOptions,
  discordCaller,
  ephemeral,
  failureText,
  type MemberPorts,
  type OptionValues,
  SLASH_COMMAND,
} from './discord-common';

export { SLASH_COMMAND } from './discord-common';

export const DEFAULT_POLL_HOURS = 24;

export interface PollPorts extends MemberPorts {
  /** Runs a command through the registry as this caller, with a confirm token when given. */
  run(
    caller: Caller,
    name: string,
    input: unknown,
    confirmToken?: string,
  ): Promise<CommandResult<unknown>>;
  /** Put a new poll's post up in a channel. */
  post(pollId: string, channelId: string): Promise<void>;
  /** A poll changed: re-render its posts soon. */
  refresh(pollId: string): Promise<void>;
  now(): number;
}

/** "Tuesday; Thursday | Friday" or one per line → labels. */
export function splitOptions(text: string): string[] {
  return text
    .split(/[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The poll-create input from the slash command's options. */
export function createInput(values: OptionValues, now: number) {
  const hours = typeof values.hours === 'number' ? values.hours : DEFAULT_POLL_HOURS;
  return {
    question: String(values.question ?? ''),
    options: splitOptions(String(values.options ?? '')),
    method: values.method ?? 'single',
    ...(typeof values.max_choices === 'number' ? { maxChoices: values.max_choices } : {}),
    eligibleTier: values.audience ?? 'raider',
    anonymous: values.anonymous === true,
    resultsVisible: values.results ?? 'live',
    closesAt: now + hours * 60 * 60 * 1000,
  };
}

const NEEDS_MEMBER =
  'Voting needs a guild rank in this server. Ask an officer if that seems wrong.';
const NEEDS_RAIDER =
  'Creating polls needs the Raider rank or higher. Ask a raid leader to post it.';

const failure = (result: CommandResult<unknown>, notFound: string) =>
  failureText(result, notFound, "That poll isn't valid.");

/** The result in words; with a hidden tally, only how many voted. */
function summary(
  poll: Pick<Poll, 'options'>,
  results: PollResults | null,
  ballots: number,
): string {
  const count = `${ballots} ballot${ballots === 1 ? '' : 's'}`;
  if (ballots === 0) return 'Nobody voted.';
  if (!results) return `${count} cast; the poll keeps the result hidden from you.`;
  const name = (id: string) => poll.options.find((o) => o.id === id)?.label ?? id;
  const top = results.winners.map(name).join(' and ');
  const lead = results.winners.length > 1 ? `Tie between ${top}` : `${top} wins`;
  const quorum = results.quorumMet ? '' : ' Quorum was not met, so it does not count.';
  return `${lead} with ${count}.${quorum}`;
}

async function create(ports: PollPorts, caller: Caller, interaction: Interaction) {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral('Run this in a server channel so the poll has somewhere to go.');
  const now = ports.now();
  const result = await ports.run(
    caller,
    'poll-create',
    createInput(commandOptions(interaction), now),
  );
  if (!result.success) return ephemeral(failure(result, NEEDS_RAIDER));
  const poll = result.data as Poll;
  await ports.post(poll.id, channelId);
  const closes = poll.closesAt
    ? ` It closes ${discordTimestamp(poll.closesAt, TimestampStyle.RELATIVE)}.`
    : '';
  return ephemeral(`Your poll is going up in this channel.${closes}`);
}

async function vote(ports: PollPorts, caller: Caller, pollId: string, choices: string[]) {
  const result = await ports.run(caller, 'vote-cast', { pollId, choices });
  if (!result.success) return ephemeral(failure(result, NEEDS_MEMBER));
  await ports.refresh(pollId);
  const { labels } = result.data as { labels: string[] };
  return ephemeral(
    `You voted for **${labels.join(', ')}**. You can change it until the poll closes.`,
  );
}

async function retract(ports: PollPorts, caller: Caller, pollId: string) {
  const result = await ports.run(caller, 'vote-retract', { pollId });
  if (!result.success) return ephemeral(failure(result, NEEDS_MEMBER));
  const { retracted } = result.data as { retracted: boolean };
  if (retracted) await ports.refresh(pollId);
  return ephemeral(retracted ? 'Your vote is taken back.' : "You haven't voted on this poll.");
}

/** Step one of closing: the registry's preview, shown with a Confirm button. */
async function closePreview(ports: PollPorts, caller: Caller, pollId: string) {
  const result = await ports.run(caller, 'poll-close', { pollId });
  if (!result.success) return ephemeral(failure(result, NEEDS_MEMBER));
  const { preview } = result.data as {
    preview: { willClose: string; ballots: number; results: PollResults | null };
  };
  const poll = await pollFor(ports, caller, pollId);
  return reply(
    {
      content: `Close **${preview.willClose}** now? ${poll ? summary(poll, preview.results, preview.ballots) : ''} Closing can't be undone.`,
      components: [
        actionRow(
          button(pollCustomId({ kind: 'close-confirm', pollId }), 'Close it', ButtonStyle.DANGER),
        ),
      ],
    },
    { ephemeral: true },
  );
}

/** Step two: the member clicked Confirm, so take a fresh preview and confirm it right away. */
async function closeConfirm(ports: PollPorts, caller: Caller, pollId: string) {
  const preview = await ports.run(caller, 'poll-close', { pollId });
  if (!preview.success)
    return updateMessage({ content: failure(preview, NEEDS_MEMBER), components: [] });
  const token = (preview.data as { confirmToken?: string }).confirmToken;
  const result = await ports.run(caller, 'poll-close', { pollId }, token);
  if (!result.success)
    return updateMessage({ content: failure(result, NEEDS_MEMBER), components: [] });
  await ports.refresh(pollId);
  const { poll, results } = result.data as { poll: Poll; results: PollResults | null };
  const votes = await ports.run(caller, 'poll-get', { pollId });
  const ballots = votes.success ? (votes.data as { ballots: number }).ballots : 0;
  return updateMessage({
    content: `Closed **${poll.question}**. ${summary(poll, results, ballots)}`,
    components: [],
  });
}

async function pollFor(ports: PollPorts, caller: Caller, pollId: string): Promise<Poll | null> {
  const result = await ports.run(caller, 'poll-get', { pollId });
  return result.success ? (result.data as { poll: Poll }).poll : null;
}

/** Is this one of ours? A poll control, or `/random poll …`. */
export function isPollInteraction(interaction: Interaction): boolean {
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return interaction.data?.name === SLASH_COMMAND && subcommandPath(interaction)[0] === 'poll';
  }
  return (
    interaction.type === InteractionType.MESSAGE_COMPONENT &&
    parsePollCustomId(interaction.data?.custom_id) !== null
  );
}

export async function handlePollInteraction(
  interaction: Interaction,
  ports: PollPorts,
): Promise<InteractionResponse | null> {
  if (!isPollInteraction(interaction)) return null;
  const who = await discordCaller(interaction, ports, 'polls');
  if ('refusal' in who) return who.refusal;
  const { caller } = who;

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const [, sub] = subcommandPath(interaction);
    return sub === 'create' ? create(ports, caller, interaction) : null;
  }
  const action = parsePollCustomId(interaction.data?.custom_id);
  if (!action) return null;
  switch (action.kind) {
    case 'vote':
      return vote(ports, caller, action.pollId, [action.optionId]);
    case 'select':
      return vote(ports, caller, action.pollId, interaction.data?.values ?? []);
    case 'retract':
      return retract(ports, caller, action.pollId);
    case 'close':
      return closePreview(ports, caller, action.pollId);
    case 'close-confirm':
      return closeConfirm(ports, caller, action.pollId);
  }
}
