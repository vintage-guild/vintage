import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { command } from '../store';

export type { LootDeps, LootStore } from '../store';

export const lootList = command({
  name: 'loot-list',
  description:
    'What dropped in a raid and who looted it, in the order it was looted, as recorded from the ' +
    'addon export (raid-export-record). Empty until an officer records the raid.',
  tier: 'member',
  input: z.object({ eventId: z.string().min(1) }),
  handler: async ({ eventId }, { guildId, deps }) => {
    const drops = await deps.loot.listDrops(guildId, eventId);
    return success(
      { eventId, drops },
      {
        reasoning: drops.length
          ? `${drops.length} drop${drops.length === 1 ? '' : 's'} recorded`
          : 'No loot recorded for this raid',
      },
    );
  },
});

/** Every loot command, registered by apps/api through guild-kit. */
export const lootCommands = [lootList] as const;
