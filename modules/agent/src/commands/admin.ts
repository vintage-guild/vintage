import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { AGENT_EFFORTS, usageKey } from '../contract';
import { dayStart, monthStart } from '../domain/limits';
import { command } from '../store';

export const agentStatus = command({
  name: 'agent-status',
  description:
    'Whether the guild agent is on, its model and caps, and how much it has been used today and this month (questions, wording jobs, Decisions calls, failures in the last day).',
  tier: 'officer',
  input: z.object({}),
  handler: async (_input, { guildId, deps, now }) => {
    const at = now();
    const config = await deps.agent.getConfig(guildId);
    const count = (filter: Parameters<typeof deps.agent.countRuns>[1]) =>
      deps.agent.countRuns(guildId, filter);
    const [asksToday, asksThisMonth, wordingThisMonth, decisionsThisMonth, failedLastDay] =
      await Promise.all([
        count({ kind: 'ask', since: dayStart(at) }),
        count({ kind: 'ask', since: monthStart(at) }),
        count({ kind: 'wording', since: monthStart(at) }),
        deps.agent.getUsage(guildId, usageKey('decision', at)),
        count({ statuses: ['failed'], since: at - 24 * 60 * 60 * 1000 }),
      ]);
    return success({
      config,
      usage: { asksToday, asksThisMonth, wordingThisMonth, decisionsThisMonth, failedLastDay },
    });
  },
});

const setPaused = (paused: boolean) =>
  command({
    name: paused ? 'agent-pause' : 'agent-resume',
    description: paused
      ? 'Stop the guild agent: no questions, no wording, no Decisions calls until resumed. Everything falls back to templates and plain commands.'
      : 'Turn the guild agent back on after agent-pause.',
    tier: 'officer',
    mutation: true,
    input: z.object({}),
    handler: async (_input, { caller, guildId, deps, now }) => {
      const config = await deps.agent.setConfig(
        guildId,
        { paused },
        now(),
        caller.memberId ?? null,
      );
      return success(config, { reasoning: paused ? 'Agent paused' : 'Agent resumed' });
    },
  });

export const agentPause = setPaused(true);
export const agentResume = setPaused(false);

export const agentConfigSet = command({
  name: 'agent-config-set',
  description:
    'Change the guild agent: the model and reasoning effort for questions, and the caps (questions per member per day, questions and Decisions calls per guild per month). Fields left out stay as they are.',
  tier: 'officer',
  mutation: true,
  input: z.object({
    model: z
      .string()
      .trim()
      .regex(/^gpt-[a-z0-9.-]+$/)
      .optional(),
    effort: z.enum(AGENT_EFFORTS).optional(),
    memberDailyAsks: z.number().int().min(0).max(500).optional(),
    guildMonthlyAsks: z.number().int().min(0).max(100000).optional(),
    guildMonthlyDecisions: z.number().int().min(0).max(1000000).optional(),
  }),
  handler: async (input, { caller, guildId, deps, now }) => {
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(patch).length) {
      return error('NOTHING_TO_CHANGE', 'Give at least one field to change', {
        suggestion: 'Read the current settings with agent-status',
        retryable: false,
      });
    }
    const config = await deps.agent.setConfig(guildId, patch, now(), caller.memberId ?? null);
    return success(config, { reasoning: `Updated ${Object.keys(patch).join(', ')}` });
  },
});
