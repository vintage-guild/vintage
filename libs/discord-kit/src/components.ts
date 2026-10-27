// Message components: buttons and string select menus inside action rows, and text inputs
// inside modals.

export const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  /** A labelled field in a modal, holding a text input or a select menu. */
  LABEL: 18,
} as const;

export const ButtonStyle = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const;
export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle];

export interface Emoji {
  id?: string;
  name?: string;
  animated?: boolean;
}

export interface Button {
  type: typeof ComponentType.BUTTON;
  style: ButtonStyle;
  label?: string;
  emoji?: Emoji;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: Emoji;
  default?: boolean;
}

export interface StringSelect {
  type: typeof ComponentType.STRING_SELECT;
  custom_id: string;
  options: SelectOption[];
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  /** In a modal: whether a choice must be made (Discord's default is true). */
  required?: boolean;
}

export const TextInputStyle = {
  SHORT: 1,
  PARAGRAPH: 2,
} as const;
export type TextInputStyle = (typeof TextInputStyle)[keyof typeof TextInputStyle];

/** A text field in a modal. */
export interface TextInput {
  type: typeof ComponentType.TEXT_INPUT;
  custom_id: string;
  style: TextInputStyle;
  label: string;
  placeholder?: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  value?: string;
}

/**
 * A modal field with its label (type 18): wraps one text input or string select. It's how a
 * modal holds a select menu; Discord reads the label here, so the inner text input has none.
 */
export interface Label {
  type: typeof ComponentType.LABEL;
  label: string;
  description?: string;
  component: Omit<TextInput, 'label'> | StringSelect;
}

/** A text field for inside a Label: the same as textInput, with the label left to the Label. */
export function labelledTextInput(
  customId: string,
  extra: Omit<TextInput, 'type' | 'custom_id' | 'label' | 'style'> & {
    style?: TextInputStyle;
  } = {},
): Omit<TextInput, 'label'> {
  assertCustomId(customId);
  const { style = TextInputStyle.SHORT, ...rest } = extra;
  return { type: ComponentType.TEXT_INPUT, custom_id: customId, style, ...rest };
}

/** A labelled modal field. Labels are 1-45 characters, descriptions up to 100. */
export function label(text: string, component: Label['component'], description?: string): Label {
  if (text.length === 0 || text.length > 45) throw new Error('a label is 1-45 characters');
  if (description !== undefined && description.length > 100) {
    throw new Error('a label description is up to 100 characters');
  }
  return {
    type: ComponentType.LABEL,
    label: text,
    ...(description ? { description } : {}),
    component,
  };
}

export type Component = Button | StringSelect | TextInput;

export interface ActionRow {
  type: typeof ComponentType.ACTION_ROW;
  components: Component[];
}

export const COMPONENT_LIMITS = {
  rowsPerMessage: 5,
  buttonsPerRow: 5,
  customId: 100,
  buttonLabel: 80,
  selectOptions: 25,
} as const;

function assertCustomId(customId: string): void {
  if (customId.length === 0 || customId.length > COMPONENT_LIMITS.customId) {
    throw new Error(`custom_id must be 1-${COMPONENT_LIMITS.customId} characters`);
  }
}

export type ActionButtonStyle = Exclude<ButtonStyle, typeof ButtonStyle.LINK>;

/** A button that sends a MESSAGE_COMPONENT interaction carrying `customId`. */
export function button(
  customId: string,
  label: string,
  style: ActionButtonStyle = ButtonStyle.SECONDARY,
  extra: Pick<Button, 'emoji' | 'disabled'> = {},
): Button {
  assertCustomId(customId);
  return { type: ComponentType.BUTTON, style, label, custom_id: customId, ...extra };
}

/** A button that opens `url`; it sends no interaction. */
export function linkButton(url: string, label: string): Button {
  return { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url };
}

/** A string select menu. */
export function stringSelect(
  customId: string,
  options: SelectOption[],
  extra: Omit<StringSelect, 'type' | 'custom_id' | 'options'> = {},
): StringSelect {
  assertCustomId(customId);
  if (options.length === 0 || options.length > COMPONENT_LIMITS.selectOptions) {
    throw new Error(`a select menu needs 1-${COMPONENT_LIMITS.selectOptions} options`);
  }
  return { type: ComponentType.STRING_SELECT, custom_id: customId, options, ...extra };
}

/** An action row: up to five buttons, or exactly one select menu. */
export function actionRow(...components: Component[]): ActionRow {
  const alone = components.filter(
    (c) => c.type === ComponentType.STRING_SELECT || c.type === ComponentType.TEXT_INPUT,
  ).length;
  if (alone > 0 && components.length !== 1) {
    throw new Error('a select menu or text input must be alone in its action row');
  }
  if (components.length === 0 || components.length > COMPONENT_LIMITS.buttonsPerRow) {
    throw new Error(`an action row holds 1-${COMPONENT_LIMITS.buttonsPerRow} components`);
  }
  return { type: ComponentType.ACTION_ROW, components };
}

/** A text field for a modal. Labels are capped at 45 characters by Discord. */
export function textInput(
  customId: string,
  label: string,
  extra: Omit<TextInput, 'type' | 'custom_id' | 'label' | 'style'> & {
    style?: TextInputStyle;
  } = {},
): TextInput {
  assertCustomId(customId);
  if (label.length === 0 || label.length > 45)
    throw new Error('a text input label is 1-45 characters');
  const { style = TextInputStyle.SHORT, ...rest } = extra;
  return { type: ComponentType.TEXT_INPUT, custom_id: customId, label, style, ...rest };
}
