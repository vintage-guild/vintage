// The slash commands the gateway answers. The register script sends these definitions to
// Discord, and the interaction handler routes on the same names, so they cannot drift apart.
import { type ApplicationCommand, ApplicationCommandOptionType } from '@vintage/discord-kit';

export const VINTAGE_COMMAND = {
  name: 'vintage',
  description: 'Vintage guild tools',
  contexts: [0],
  options: [
    {
      type: ApplicationCommandOptionType.SUB_COMMAND,
      name: 'ping',
      description: 'Check that Vintage is answering',
    },
  ],
} satisfies ApplicationCommand;

export const COMMANDS: readonly ApplicationCommand[] = [VINTAGE_COMMAND];
