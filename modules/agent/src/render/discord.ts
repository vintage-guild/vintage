// The agent's replies in Discord (#18). Pure: a run view in, discord-kit MessageData out. Every
// reply is private to the member who asked (ephemeral). A change the agent prepared shows as one
// line with Confirm and Drop buttons; the click runs agent-confirm or agent-decline as the
// clicker, and only the member who asked can confirm.
import { actionRow, ButtonStyle, button, type MessageData, truncate } from '@vintage/discord-kit';
import type { CommandResult } from '@vintage/guild-kit';
import type { ConfirmationView, RunStatus } from '../contract';

const PREFIX = 'agent';
/** Discord allows five action rows; one per prepared change. */
export const MAX_CHANGES_SHOWN = 5;
const MAX_CONTENT = 2000;

export type AgentButton = 'ok' | 'no';

export const agentCustomId = (kind: AgentButton, confirmationId: string) =>
  `${PREFIX}:${kind}:${confirmationId}`;

export function parseAgentCustomId(
  customId: string,
): { kind: AgentButton; confirmationId: string } | null {
  const [prefix, kind, confirmationId] = customId.split(':');
  if (prefix !== PREFIX || (kind !== 'ok' && kind !== 'no') || !confirmationId) return null;
  return { kind, confirmationId };
}

export interface ReplyView {
  status: RunStatus;
  answer: string | null;
  error: string | null;
  confirmations: ConfirmationView[];
}

/** The deferred reply, edited once the run ends. */
export function renderAgentReply(view: ReplyView): MessageData {
  if (view.status !== 'answered') {
    return {
      content: `I couldn't answer that. ${view.error ?? 'Please try again in a minute.'}`,
      components: [],
      allowed_mentions: { parse: [] },
    };
  }
  const pending = view.confirmations.filter((c) => c.status === 'pending');
  const shown = pending.slice(0, MAX_CHANGES_SHOWN);
  const lines = shown.map((c, i) => `**Change ${i + 1}:** ${c.summary}`);
  if (pending.length > shown.length) {
    lines.push(`(${pending.length - shown.length} more; ask again with fewer changes at once.)`);
  }
  const tail = lines.length ? `\n\n${lines.join('\n')}` : '';
  const answer = truncate(view.answer ?? '', MAX_CONTENT - tail.length);
  return {
    content: `${answer}${tail}`,
    components: shown.map((c, i) =>
      actionRow(
        button(agentCustomId('ok', c.id), `Confirm change ${i + 1}`, ButtonStyle.SUCCESS),
        button(agentCustomId('no', c.id), 'Drop', ButtonStyle.SECONDARY),
      ),
    ),
    allowed_mentions: { parse: [] },
  };
}

/** What a Confirm or Drop click answers, replacing the buttons on that message. */
export function renderChangeResult(
  kind: AgentButton,
  result: CommandResult<unknown>,
  previous: string,
): MessageData {
  const note = (() => {
    if (!result.success) {
      const suggestion = result.error?.suggestion ? ` ${result.error.suggestion}.` : '';
      return `Not done: ${result.error?.message ?? 'it failed'}.${suggestion}`;
    }
    return kind === 'ok' ? 'Done.' : 'Dropped; nothing changed.';
  })();
  return {
    content: truncate(`${previous}\n\n${note}`, MAX_CONTENT),
    components: [],
    allowed_mentions: { parse: [] },
  };
}
