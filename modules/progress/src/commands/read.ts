import { success } from '@vintage/guild-kit';
import { z } from 'zod';
import { buildProgress } from '../domain/ledger';
import { command } from '../store';

export const progressGet = command({
  name: 'progress-get',
  description:
    'The progression ledger: the three launch raids, every boss with the guild’s first-kill ' +
    'time (null until it dies), the next target per raid, the totals, and the latest first ' +
    'kill with its loot. Before the raids unlock, `open` is false and every slot is empty. ' +
    'Boss names flagged `datamined` come from the beta client, not from Blizzard.',
  tier: 'member',
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) =>
    success(buildProgress(await deps.progress.listKills(guildId), now())),
});
