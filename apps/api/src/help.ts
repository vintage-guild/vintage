// Random's help pages (#155), built from the slash command definitions the gateway registers
// (RANDOM_COMMAND) plus the hand-written topics in help-topics.ts, and rendered for one reader's
// tier: what they can do first, what higher ranks can do in one line. Pure. `help-get` serves
// the pages to every surface, so `/random help` and the agent answer from the same text.
import type { ApplicationCommandOption } from '@vintage/discord-kit';
import { ApplicationCommandOptionType as T } from '@vintage/discord-kit';
import { RANDOM_COMMAND } from '@vintage/gateway/commands';
import {
  type AnyGuildCommand,
  defineGuildCommand,
  success,
  type Tier,
  tierAllows,
} from '@vintage/guild-kit';
import { z } from 'zod';
import { HELP_TOPICS, type HelpTopic } from './help-topics';

export const HELP_SUBCOMMAND = 'help';
export const HELP_TOPIC_KEYS = HELP_TOPICS.map((t) => t.key) as [string, ...string[]];

/** A `/random` leaf subcommand, by its path under `/random` (`poll create`, `ask`). */
export interface SlashLeaf {
  path: string;
  definition: ApplicationCommandOption;
}

/** Every `/random` leaf subcommand except the help ones, in definition order. */
export function slashLeaves(
  options: readonly ApplicationCommandOption[] = RANDOM_COMMAND.options,
): SlashLeaf[] {
  const leaves: SlashLeaf[] = [];
  for (const o of options) {
    if (o.type === T.SUB_COMMAND_GROUP) {
      for (const sub of o.options ?? []) {
        if (sub.type === T.SUB_COMMAND && sub.name !== HELP_SUBCOMMAND) {
          leaves.push({ path: `${o.name} ${sub.name}`, definition: sub });
        }
      }
    } else if (o.type === T.SUB_COMMAND && o.name !== HELP_SUBCOMMAND) {
      leaves.push({ path: o.name, definition: o });
    }
  }
  return leaves;
}

export const topicByKey = (key: string): HelpTopic | undefined =>
  HELP_TOPICS.find((t) => t.key === key);

export const topicByGroup = (group: string): HelpTopic | undefined =>
  HELP_TOPICS.find((t) => t.group === group);

/**
 * Option values by name; only the given names start a new option, so values may hold spaces.
 * Null when text comes before the first option or names one the leaf does not have.
 */
function splitOptions(rest: string, names: readonly string[]): Record<string, string> | null {
  if (!rest) return {};
  // A `name:` the leaf doesn't define (a renamed or removed option) doesn't fit either.
  for (const m of rest.matchAll(/(?:^|\s)([a-z_]+):/g)) {
    if (!names.includes(m[1] as string)) return null;
  }
  const starts = new RegExp(`(?:^|\\s)(${names.join('|') || '(?!)'}):`, 'g');
  const marks = [...rest.matchAll(starts)];
  if (marks[0]?.index !== 0) return null;
  const values: Record<string, string> = {};
  marks.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = marks[i + 1]?.index ?? rest.length;
    values[m[1] as string] = rest.slice(from, to).trim();
  });
  return values;
}

/** The leaf an example runs and its options, or the reason it doesn't fit the definitions. */
export function parseExample(
  example: string,
  leaves: readonly SlashLeaf[] = slashLeaves(),
): { leaf: SlashLeaf; values: Record<string, string> } | { problem: string } {
  const words = example.trim().split(/\s+/);
  if (words[0] !== `/${RANDOM_COMMAND.name}`) return { problem: 'not a /random command' };
  const leaf =
    leaves.find((l) => l.path === `${words[1]} ${words[2]}`) ??
    leaves.find((l) => l.path === words[1]);
  if (!leaf) return { problem: `no subcommand ${words.slice(1, 3).join(' ')}` };
  const rest = words.slice(1 + leaf.path.split(' ').length).join(' ');
  const options = leaf.definition.options ?? [];
  const values = splitOptions(
    rest,
    options.map((o) => o.name),
  );
  if (!values)
    return { problem: `${leaf.path}: text before the first option, or an option it does not have` };
  for (const option of options) {
    const value = values[option.name];
    const problem =
      value === undefined ? (option.required ? 'is required' : null) : optionProblem(option, value);
    if (problem) return { problem: `${leaf.path}: ${option.name} ${problem}` };
  }
  return { leaf, values };
}

function numberProblem(option: ApplicationCommandOption, value: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || (option.type === T.INTEGER && !Number.isInteger(n))) {
    return 'must be a number';
  }
  if (option.min_value !== undefined && n < option.min_value) return 'is below the minimum';
  if (option.max_value !== undefined && n > option.max_value) return 'is above the maximum';
  return null;
}

function optionProblem(option: ApplicationCommandOption, value: string): string | null {
  if (option.choices && !option.choices.some((c) => String(c.value) === value)) {
    return `must be one of ${option.choices.map((c) => c.value).join(', ')}`;
  }
  if (option.type === T.INTEGER || option.type === T.NUMBER) return numberProblem(option, value);
  if (option.type === T.BOOLEAN && value !== 'true' && value !== 'false') {
    return 'must be true or false';
  }
  if (option.max_length !== undefined && value.length > option.max_length) return 'is too long';
  return null;
}

/** Who a tier is, in the words of the guild's ranks. */
export function tierWords(tier: Tier): string {
  switch (tier) {
    case 'public':
      return 'Anyone';
    case 'member':
      return 'Members';
    case 'recruit':
      return 'Recruits and up';
    case 'raider':
      return 'Raiders and up';
    case 'leader':
      return 'Raid leaders and officers';
    case 'officer':
      return 'Officers';
  }
}

const slash = (path: string) => `\`/${RANDOM_COMMAND.name} ${path}\``;

/** One option as a short line: name, required, the allowed values, then its own description. */
function optionLine(option: ApplicationCommandOption): string {
  const allowed = option.choices
    ? option.choices.map((c) => c.name).join(' / ')
    : option.min_value !== undefined && option.max_value !== undefined
      ? `${option.min_value}–${option.max_value}`
      : option.type === T.BOOLEAN
        ? 'true / false'
        : null;
  const parts = [
    `\`${option.name}\`${option.required ? ' *(required)*' : ''}`,
    allowed,
    option.description,
  ];
  return `• ${parts.filter(Boolean).join(' · ')}`;
}

export interface HelpContext {
  /** The reader's tier. */
  tier: Tier;
  /** The minimum tier of a guild command, by name; undefined when no such command exists. */
  tierOf(command: string): Tier | undefined;
  /** VINTAGE_SITE_URL, without a trailing slash; null when not configured. */
  siteUrl: string | null;
}

export interface HelpPage {
  /** The topic key, or null for the overview. */
  topic: string | null;
  title: string;
  /** Discord markdown; also what the agent reads. */
  text: string;
  /** The site page for this topic, when there is one. */
  url: string | null;
}

/** Everything the topic offers, with the tier each needs, in definition order. */
function topicActions(topic: HelpTopic, ctx: HelpContext) {
  const leaves = slashLeaves();
  const slashActions = Object.entries(topic.runs).map(([path, command]) => ({
    kind: 'slash' as const,
    path,
    leaf: leaves.find((l) => l.path === path),
    tier: ctx.tierOf(command) ?? 'officer',
  }));
  const buttonActions = (topic.buttons ?? []).map((b) => ({
    kind: 'button' as const,
    text: b.text,
    label: b.label,
    tier: ctx.tierOf(b.command) ?? 'officer',
  }));
  return [...slashActions, ...buttonActions];
}

/** "Raid leaders and officers can also: `/random raid create`." One line per tier above. */
function higherRankLines(
  actions: ReturnType<typeof topicActions>,
  ctx: HelpContext,
  also: boolean,
): string[] {
  const byTier = new Map<Tier, string[]>();
  for (const a of actions) {
    if (tierAllows(ctx.tier, a.tier)) continue;
    const label = a.kind === 'slash' ? slash(a.path) : a.label;
    byTier.set(a.tier, [...(byTier.get(a.tier) ?? []), label]);
  }
  return [...byTier].map(
    ([tier, labels]) => `-# ${tierWords(tier)} can${also ? ' also' : ''}: ${labels.join(', ')}.`,
  );
}

const siteLink = (topic: HelpTopic, ctx: HelpContext) =>
  topic.sitePath && ctx.siteUrl ? `${ctx.siteUrl}${topic.sitePath}` : null;

/** One topic's page for this reader. */
export function renderTopic(topic: HelpTopic, ctx: HelpContext): HelpPage {
  const actions = topicActions(topic, ctx);
  const mine = actions.filter((a) => tierAllows(ctx.tier, a.tier));
  const lines: string[] = [topic.summary, ''];
  for (const a of mine) {
    if (a.kind === 'button') {
      lines.push(a.text);
      continue;
    }
    lines.push(`**${slash(a.path)}** · ${a.leaf?.definition.description ?? ''}`);
    for (const option of a.leaf?.definition.options ?? []) lines.push(optionLine(option));
  }
  const minePaths = new Set(mine.flatMap((a) => (a.kind === 'slash' ? [a.path] : [])));
  const examples = topic.examples.filter((e) => {
    const parsed = parseExample(e);
    return 'problem' in parsed
      ? mine.some((a) => a.kind === 'button')
      : minePaths.has(parsed.leaf.path);
  });
  if (examples.length) {
    lines.push('', '**Examples**', ...examples.map((e) => (e.startsWith('/') ? `\`${e}\`` : e)));
  }
  if (!mine.length) lines.push('Your rank can’t use these yet.');
  const higher = higherRankLines(actions, ctx, mine.length > 0);
  if (higher.length) lines.push('', ...higher);
  const url = siteLink(topic, ctx);
  if (url) lines.push('', `On the website: ${url}`);
  return { topic: topic.key, title: `Random help: ${topic.title}`, text: lines.join('\n'), url };
}

/** What Random does, topic by topic, for this reader. */
export function renderOverview(ctx: HelpContext): HelpPage {
  const lines = ['Random is Vintage’s guild bot. Its replies to you are private.', ''];
  for (const topic of HELP_TOPICS) {
    const actions = topicActions(topic, ctx);
    const mine = actions.filter((a) => tierAllows(ctx.tier, a.tier));
    const commands = mine.flatMap((a) => (a.kind === 'slash' ? [slash(a.path)] : []));
    const yours = [
      ...(commands.length ? [`use ${commands.join(', ')}`] : []),
      ...mine.flatMap((a) => (a.kind === 'button' ? [a.label] : [])),
    ].join(' or ');
    lines.push(`**${topic.title}** · ${topic.summary}${yours ? ` You can ${yours}.` : ''}`);
    lines.push(...higherRankLines(actions, ctx, mine.length > 0));
  }
  lines.push(
    '',
    `Details and examples: ${slash(`${HELP_SUBCOMMAND} topic:`)}, or ${slash(`<group> ${HELP_SUBCOMMAND}`)}.`,
  );
  return { topic: null, title: 'Random help', text: lines.join('\n'), url: ctx.siteUrl };
}

export function renderHelp(topicKey: string | undefined, ctx: HelpContext): HelpPage {
  const topic = topicKey ? topicByKey(topicKey) : undefined;
  return topic ? renderTopic(topic, ctx) : renderOverview(ctx);
}

/**
 * `help-get`: the help page for the caller's own tier. Read-only and public, so the agent can
 * call it for "how do I…?" questions and Discord can show it to someone Random doesn't know yet.
 * It reads the other commands' tiers, so the registry builds it from the full list.
 */
export function helpGetCommand(
  others: readonly AnyGuildCommand[],
  siteUrl: () => string | null = () => null,
): AnyGuildCommand {
  const tiers = new Map(others.map((c) => [c.name, c.tier as Tier]));
  return defineGuildCommand({
    name: 'help-get',
    description:
      'How to use Random, the guild’s Discord bot: an overview, or one topic’s commands, options, and examples, for your own rank.',
    tier: 'public',
    input: z.object({
      topic: z.enum(HELP_TOPIC_KEYS).optional().describe('One topic; leave out for the overview'),
    }),
    handler: async (input, { caller }) => {
      const url = siteUrl();
      const page = renderHelp(input.topic, {
        tier: caller.tier,
        tierOf: (name) => tiers.get(name),
        siteUrl: url ? url.replace(/\/+$/, '') : null,
      });
      return success(page, { reasoning: `help for tier ${caller.tier}` });
    },
  });
}
