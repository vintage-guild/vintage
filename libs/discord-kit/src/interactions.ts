// Interaction payloads and the responses Discord accepts for them.
// Only the fields Vintage reads are typed; everything else passes through untouched.
import { type ActionRow, actionRow, ComponentType, type Label, type TextInput } from './components';
import type { Embed } from './embeds';
import type { LayoutComponent } from './layout';

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
  /** The answer to APPLICATION_COMMAND_AUTOCOMPLETE: up to 25 choices. */
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;
export type InteractionResponseType =
  (typeof InteractionResponseType)[keyof typeof InteractionResponseType];

export const MessageFlags = {
  EPHEMERAL: 64,
  /** The message is made only of Components V2 layout (no content or embeds). */
  IS_COMPONENTS_V2: 1 << 15,
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
  /** Autocomplete: the option the member is typing in (its value is the text so far). */
  focused?: boolean;
  options?: CommandInteractionOption[];
}

/**
 * A submitted modal field: a text input's value, a select's values, or a radio group's value
 * (null when nothing was picked).
 */
export interface SubmittedField {
  type: number;
  custom_id: string;
  value?: string | null;
  values?: string[];
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
    /**
     * Modal submits: action rows of text inputs (each carrying its value), or labels (type 18)
     * holding one text input or select (carrying its values).
     */
    components?: {
      type: number;
      components?: SubmittedField[];
      component?: SubmittedField;
    }[];
  };
  /**
   * The message a component is attached to (Discord sends the whole message), also on a modal
   * submit when the modal was opened from one of its components.
   */
  message?: { id: string; content?: string; embeds?: Embed[] };
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
  /** Action rows, or with IS_COMPONENTS_V2 any layout components (containers, text, …). */
  components?: (ActionRow | LayoutComponent)[];
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
      type: typeof InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT;
      data: { choices: AutocompleteChoice[] };
    }
  | {
      type: typeof InteractionResponseType.MODAL;
      data: { custom_id: string; title: string; components: (ActionRow | Label)[] };
    };

/** One autocomplete suggestion: the name shown (1-100 characters) and the value sent. */
export interface AutocompleteChoice {
  name: string;
  value: string;
}

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

/**
 * Open a modal (type 9): the answer to a component or slash command, never to a modal submit.
 * Plain text inputs go one per action row; labels (which can hold a select menu) go as they are.
 */
export function modal(
  customId: string,
  title: string,
  ...inputs: (TextInput | Label)[]
): InteractionResponse {
  if (customId.length === 0 || customId.length > 100)
    throw new Error('custom_id must be 1-100 characters');
  if (title.length === 0 || title.length > 45) throw new Error('a modal title is 1-45 characters');
  if (inputs.length === 0 || inputs.length > 5) throw new Error('a modal holds 1-5 fields');
  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: customId,
      title,
      components: inputs.map((input) =>
        input.type === ComponentType.LABEL ? input : actionRow(input),
      ),
    },
  };
}

/** Every field a modal submit carried, from action rows and labels alike. */
function submittedFields(interaction: Interaction): SubmittedField[] {
  return (interaction.data?.components ?? []).flatMap((row) => [
    ...(row.components ?? []),
    ...(row.component ? [row.component] : []),
  ]);
}

/** The text a modal submit carried, by text input custom_id. */
export function modalValues(interaction: Interaction): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of submittedFields(interaction)) {
    if (field.values === undefined && field.type !== ComponentType.RADIO_GROUP) {
      values[field.custom_id] = field.value ?? '';
    }
  }
  return values;
}

/**
 * The choices a modal submit carried, by select menu or radio group custom_id (empty when none
 * was picked). A radio group's single value comes back as a one-item list, like a select's.
 */
export function modalSelections(interaction: Interaction): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const field of submittedFields(interaction)) {
    if (field.type === ComponentType.RADIO_GROUP) {
      values[field.custom_id] = typeof field.value === 'string' ? [field.value] : [];
    } else if (field.values !== undefined) values[field.custom_id] = field.values;
  }
  return values;
}

/** Answer an autocomplete interaction (type 8). Discord shows at most 25 choices. */
export function autocompleteResult(choices: AutocompleteChoice[]): InteractionResponse {
  return {
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices: choices
        .slice(0, 25)
        .map((c) => ({ name: c.name.slice(0, 100), value: c.value.slice(0, 100) })),
    },
  };
}

/** The option an autocomplete interaction is for, and the text typed into it so far. */
export function focusedOption(
  interaction: Interaction,
): { name: string; value: string } | undefined {
  const walk = (
    options: CommandInteractionOption[] | undefined,
  ): { name: string; value: string } | undefined => {
    for (const o of options ?? []) {
      if (o.focused) return { name: o.name, value: String(o.value ?? '') };
      const inner = walk(o.options);
      if (inner) return inner;
    }
    return undefined;
  };
  return walk(interaction.data?.options);
}
