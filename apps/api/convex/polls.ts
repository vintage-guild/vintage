// Scheduled polls work: runs `poll-sweep` from crons.ts every 5 minutes, as the system caller
// through the same registry every surface uses (#61).
//   npx convex run polls:sweep
import { internalMutation } from './_generated/server';
import { runSystemCommand } from './commands';

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await runSystemCommand(ctx, 'poll-sweep', {});
    if (!result.success) throw new Error(`poll-sweep failed: ${result.error?.message}`);
    return result.data;
  },
});
