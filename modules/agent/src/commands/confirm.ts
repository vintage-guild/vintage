import { error, success } from '@vintage/guild-kit';
import { z } from 'zod';
import { type AgentConfirmation, toConfirmationView } from '../contract';
import { command } from '../store';

const notFound = (id: string) =>
  error('CONFIRMATION_NOT_FOUND', `No pending change ${id} for you`, {
    suggestion: 'Ask the agent again; only the member who asked can confirm its changes',
    retryable: false,
  });

const closed = (c: AgentConfirmation) =>
  error('CONFIRMATION_CLOSED', `That change is already ${c.status}`, {
    suggestion: 'Ask the agent again for a fresh one',
    retryable: false,
  });

export const agentConfirm = command({
  name: 'agent-confirm',
  description:
    'Run a change the agent prepared for you: the exact command and input it showed. Only the member who asked can confirm, within 5 minutes for destructive changes and 30 for others.',
  tier: 'member',
  mutation: true,
  input: z.object({ confirmationId: z.string().min(1) }),
  handler: async ({ confirmationId }, { caller, guildId, deps, now }) => {
    const pending = await deps.agent.getConfirmation(guildId, confirmationId);
    if (!pending || !caller.memberId || pending.memberId !== caller.memberId) {
      return notFound(confirmationId);
    }
    if (pending.status !== 'pending') return closed(pending);
    const at = now();
    if (at > pending.expiresAt) {
      await deps.agent.updateConfirmation(guildId, pending.id, {
        status: 'expired',
        finishedAt: at,
      });
      return error('CONFIRMATION_EXPIRED', 'That change waited too long to be confirmed', {
        suggestion: 'Ask the agent again for a fresh one',
        retryable: false,
      });
    }
    const result = await deps.agentRunner.run(
      caller,
      pending.command,
      pending.input,
      pending.confirmToken ?? undefined,
    );
    const updated = await deps.agent.updateConfirmation(guildId, pending.id, {
      status: result.success ? 'done' : 'failed',
      result,
      finishedAt: at,
    });
    if (!result.success) return result;
    return success(
      { confirmation: toConfirmationView(updated), result: result.data },
      { reasoning: `Ran ${pending.command}` },
    );
  },
});

export const agentDecline = command({
  name: 'agent-decline',
  description: 'Drop a change the agent prepared for you, without running it.',
  tier: 'member',
  mutation: true,
  input: z.object({ confirmationId: z.string().min(1) }),
  handler: async ({ confirmationId }, { caller, guildId, deps, now }) => {
    const pending = await deps.agent.getConfirmation(guildId, confirmationId);
    if (!pending || !caller.memberId || pending.memberId !== caller.memberId) {
      return notFound(confirmationId);
    }
    if (pending.status !== 'pending') return closed(pending);
    const updated = await deps.agent.updateConfirmation(guildId, pending.id, {
      status: 'declined',
      finishedAt: now(),
    });
    return success(toConfirmationView(updated));
  },
});
