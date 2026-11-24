// Scheduled polls work: runs `poll-sweep` from crons.ts every 5 minutes, as the system caller
// through the same registry every surface uses (#61), then re-renders Discord posts (#62). The
// refresh also catches votes cast on the website or over MCP, whose posts nothing else updates.
// Failures are caught and posted (deduplicated per hour) to the coordinator's ops channel (#262).
//   npx convex run polls:sweep
import { runPollSweepWithAlerts } from '../src/ops-alerts';
import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { GUILD_ID, runSystemCommand } from './commands';
import { reportCronFailure } from './opsAlerts';
import { pollsStore } from './stores';

export const runSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await runSystemCommand(ctx, 'poll-sweep', {});
    if (!result.success) throw new Error(`poll-sweep failed: ${result.error?.message}`);
    const {
      opened,
      closed,
      surveysOpened = [],
      surveysClosed = [],
    } = result.data as {
      opened: string[];
      closed: string[];
      surveysOpened?: string[];
      surveysClosed?: string[];
    };
    const store = pollsStore(ctx);
    const [open, openSurveys] = await Promise.all([
      store.listPolls(GUILD_ID, { statuses: ['open'] }),
      store.listSurveys(GUILD_ID, { statuses: ['open'] }),
    ]);
    for (const pollId of new Set([...closed, ...open.map((p) => p.id)])) {
      await ctx.scheduler.runAfter(0, internal.pollPosts.refresh, { pollId });
    }
    for (const surveyId of new Set([...surveysClosed, ...openSurveys.map((s) => s.id)])) {
      await ctx.scheduler.runAfter(0, internal.pollPosts.refreshSurvey, { surveyId });
    }
    return { opened, closed, surveysOpened, surveysClosed };
  },
});

export const sweep = internalAction({
  args: {},
  handler: async (ctx): Promise<{ opened: string[]; closed: string[] } | { failed: string }> =>
    runPollSweepWithAlerts(
      () => ctx.runMutation(internal.polls.runSweep, {}),
      (alert, at) => reportCronFailure(ctx, alert, at),
    ),
});
