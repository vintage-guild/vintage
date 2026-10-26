// Interaction payloads and the responses Discord accepts for them.
// Only the fields Vintage reads are typed; everything else passes through untouched.
import { type ActionRow, actionRow, type TextInput } from './components';
import type { Embed } from './embeds';

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType];

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  MODAL: 9,
} as const;
export type InteractionResponseType =
  (typeof InteractionResponseType)[keyof typeof InteractionResponseType];

export const MessageFlags = {
  EPHEMERAL: 64,
} as const;

export const ApplicationCommandOptionType = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
} as const;
export type ApplicationCommandOptionType =
  (typeof ApplicationCommandOptionType)[keyof typeof ApplicationCommandOptionType];

export interface CommandInteractionOption {
  name: string;
  type: ApplicationCommandOptionType;
  value?: string | number | boolean;
  options?: CommandInteractionOption[];
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

/** The subset of an incoming interaction that Vintage reads. */
export interface Interaction {
  id: string;
  application_id: string;
  type: InteractionType;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user: DiscordUser; roles: string[]; nick?: string | null };
  user?: DiscordUser;
  data?: {
    id?: string;
    name?: string;
    type?: number;
    options?: CommandInteractionOption[];
    custom_id?: string;
    component_type?: number;
    values?: string[];
    /** Modal submits: one row per text input, each carrying its value. */
    components?: {
      type: number;
      components: { type: number; custom_id: string; value?: string }[];
    }[];
  };
  message?: { id: string };
}

/** The user behind an interaction, whether it came from a guild or a DM. */
export function interactionUser(interaction: Interaction): DiscordUser | undefined {
  return interaction.member?.user ?? interaction.user;
}

/** The subcommand path of a slash command: `/vintage ping` → `['ping']`. */
export function subcommandPath(interaction: Interaction): string[] {
  const path: string[] = [];
  let options = interaction.data?.options;
  for (;;) {
    const next = options?.find(
      (o) =>
        o.type === ApplicationCommandOptionType.SUB_COMMAND ||
        o.type === ApplicationCommandOptionType.SUB_COMMAND_GROUP,
    );
    if (!next) return path;
    path.push(next.name);
    options = next.options;
  }
}

export interface AllowedMentions {
  parse?: Array<'roles' | 'users' | 'everyone'>;
  roles?: string[];
  users?: string[];
}

export interface MessageData {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  flags?: number;
  allowed_mentions?: AllowedMentions;
}

export type InteractionResponse =
  | { type: typeof InteractionResponseType.PONG }
  | {
      type:
        | typeof InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE
        | typeof InteractionResponseType.UPDATE_MESSAGE;
      data: MessageData;
    }
  | {
      type: typeof InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE;
      data?: { flags?: number };
    }
  | { type: typeof InteractionResponseType.DEFERRED_UPDATE_MESSAGE }
  | {
      type: typeof InteractionResponseType.MODAL;
      data: { custom_id: string; title: string; components: ActionRow[] };
    };

export interface ReplyOptions {
  /** Only the invoking user sees the message. */
  ephemeral?: boolean;
}

const withFlags = (data: MessageData, { ephemeral }: ReplyOptions): MessageData =>
  ephemeral ? { ...data, flags: (data.flags ?? 0) | MessageFlags.EPHEMERAL } : data;

/** Answer to Discord's PING (endpoint verification and health probes). */
export const pong = (): InteractionResponse => ({ type: InteractionResponseType.PONG });

/** Reply immediately with a message (type 4). Mentions are off unless set explicitly. */
export function reply(data: MessageData | string, options: ReplyOptions = {}): InteractionResponse {
  const message = typeof data === 'string' ? { content: data } : data;
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: withFlags({ allowed_mentions: { parse: [] }, ...message }, options),
  };
}

/** Acknowledge now, edit the original response later via the interaction token (type 5). */
export function deferReply(options: ReplyOptions = {}): InteractionResponse {
  return options.ephemeral
    ? {
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: MessageFlags.EPHEMERAL },
      }
    : { type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE };
}

/** Acknowledge a component interaction without changing the message yet (type 6). */
export const deferUpdate = (): InteractionResponse => ({
  type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
});

/** Edit the message a component is attached to, immediately (type 7). */
export function updateMessage(data: MessageData): InteractionResponse {
  return { type: InteractionResponseType.UPDATE_MESSAGE, data };
}

/** Open a modal (type 9): the answer to a component or slash command, never to a modal submit. */
export function modal(
  customId: string,
  title: string,
  ...inputs: TextInput[]
): InteractionResponse {
  if (customId.length === 0 || customId.length > 100)
    throw new Error('custom_id must be 1-100 characters');
  if (title.length === 0 || title.length > 45) throw new Error('a modal title is 1-45 characters');
  if (inputs.length === 0 || inputs.length > 5) throw new Error('a modal holds 1-5 text inputs');
  return {
    type: InteractionResponseType.MODAL,
    data: { custom_id: customId, title, components: inputs.map((input) => actionRow(input)) },
  };
}

/** The values a modal submit carried, by text input custom_id. */
export function modalValues(interaction: Interaction): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components) values[field.custom_id] = field.value ?? '';
  }
  return values;
}
