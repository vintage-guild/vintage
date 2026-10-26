// Application (slash) command definitions, as sent to the register endpoints.
import type { ApplicationCommandOptionType } from './interactions';

export interface ApplicationCommandOption {
  type: ApplicationCommandOptionType;
  name: string;
  description: string;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  /** INTEGER and NUMBER options: the allowed range, checked by Discord. */
  min_value?: number;
  max_value?: number;
  /** STRING options: the allowed length, checked by Discord. */
  min_length?: number;
  max_length?: number;
  options?: ApplicationCommandOption[];
}

export const ApplicationCommandType = {
  CHAT_INPUT: 1,
  USER: 2,
  MESSAGE: 3,
} as const;

export interface ApplicationCommand {
  name: string;
  description: string;
  type?: (typeof ApplicationCommandType)[keyof typeof ApplicationCommandType];
  options?: ApplicationCommandOption[];
  /** Permission bitfield as a string; `"0"` hides the command from everyone but admins. */
  default_member_permissions?: string | null;
  /** Interaction contexts: 0 guild, 1 bot DM, 2 private channel. */
  contexts?: number[];
}
