// Message components: buttons and string select menus inside action rows.

export const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
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
}

export type Component = Button | StringSelect;

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
  const selects = components.filter((c) => c.type === ComponentType.STRING_SELECT).length;
  if (selects > 0 && components.length !== 1) {
    throw new Error('a select menu must be alone in its action row');
  }
  if (components.length === 0 || components.length > COMPONENT_LIMITS.buttonsPerRow) {
    throw new Error(`an action row holds 1-${COMPONENT_LIMITS.buttonsPerRow} components`);
  }
  return { type: ComponentType.ACTION_ROW, components };
}
