// Scheduled polls work: runs `poll-sweep` from crons.ts every 5 minutes, as the system caller
// through the same registry every surface uses (#61), then re-renders Discord posts (#62). The
// refresh also catches votes cast on the website or over MCP, whose posts nothing else updates.
//   npx convex run polls:sweep
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { pollsStore } from './stores';

export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await runSystemCommand(ctx, 'poll-sweep', {});
    if (!result.success) throw new Error(`poll-sweep failed: ${result.error?.message}`);
    const { opened, closed } = result.data as { opened: string[]; closed: string[] };
    const open = await pollsStore(ctx).listPolls(GUILD_ID, { statuses: ['open'] });
    for (const pollId of new Set([...closed, ...open.map((p) => p.id)])) {
      await ctx.scheduler.runAfter(0, internal.pollPosts.refresh, { pollId });
    }
    return { opened, closed };
  },
});
