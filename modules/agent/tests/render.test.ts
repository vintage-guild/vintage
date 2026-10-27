import { describe, expect, it } from 'vitest';
import type { ConfirmationView } from '../src/contract';
import {
  agentCustomId,
  MAX_CHANGES_SHOWN,
  parseAgentCustomId,
  renderAgentReply,
  renderChangeResult,
} from '../src/render/discord';

const change = (id: string, status: ConfirmationView['status'] = 'pending'): ConfirmationView => ({
  id,
  guildId: 'g',
  runId: 'r1',
  memberId: 'm1',
  command: 'signup-set',
  input: {},
  preview: null,
  summary: `signup-set: change ${id}`,
  status,
  createdAt: 0,
  expiresAt: 1,
  result: null,
  finishedAt: null,
});

const customIds = (message: ReturnType<typeof renderAgentReply>) =>
  (message.components ?? []).flatMap((row) =>
    'components' in row ? row.components.map((c) => ('custom_id' in c ? c.custom_id : '')) : [],
  );

describe('agent custom ids', () => {
  it('round-trip and reject anything else', () => {
    expect(parseAgentCustomId(agentCustomId('ok', 'abc'))).toEqual({
      kind: 'ok',
      confirmationId: 'abc',
    });
    expect(parseAgentCustomId('poll:v:1:2')).toBeNull();
    expect(parseAgentCustomId('agent:maybe:abc')).toBeNull();
    expect(parseAgentCustomId('agent:ok:')).toBeNull();
  });
});

describe('renderAgentReply', () => {
  it('shows the answer and one Confirm/Drop row per pending change', () => {
    const message = renderAgentReply({
      status: 'answered',
      answer: 'Press Confirm to mark you tentative.',
      error: null,
      confirmations: [change('c1'), change('c2', 'done')],
    });
    expect(message.content).toBe(
      'Press Confirm to mark you tentative.\n\n**Change 1:** signup-set: change c1',
    );
    expect(customIds(message)).toEqual(['agent:ok:c1', 'agent:no:c1']);
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });

  it('shows at most five changes and says how many more', () => {
    const many = Array.from({ length: MAX_CHANGES_SHOWN + 2 }, (_, i) => change(`c${i}`));
    const message = renderAgentReply({
      status: 'answered',
      answer: 'ok',
      error: null,
      confirmations: many,
    });
    expect(message.components).toHaveLength(MAX_CHANGES_SHOWN);
    expect(message.content).toMatch(/\(2 more; ask again with fewer changes at once\.\)/);
  });

  it("keeps the whole message under Discord's limit", () => {
    const message = renderAgentReply({
      status: 'answered',
      answer: 'x'.repeat(5000),
      error: null,
      confirmations: [change('c1')],
    });
    expect(message.content?.length).toBeLessThanOrEqual(2000);
    expect(message.content).toMatch(/\*\*Change 1:\*\*/);
  });

  it('says why it could not answer, with no buttons', () => {
    const message = renderAgentReply({
      status: 'failed',
      answer: null,
      error: 'The agent took too long to answer',
      confirmations: [],
    });
    expect(message.content).toBe("I couldn't answer that. The agent took too long to answer");
    expect(message.components).toEqual([]);
  });
});

describe('renderChangeResult', () => {
  it('keeps the original text and replaces the buttons with the outcome', () => {
    expect(renderChangeResult('ok', { success: true, data: {} }, 'Answer')).toEqual({
      content: 'Answer\n\nDone.',
      components: [],
      allowed_mentions: { parse: [] },
    });
    expect(renderChangeResult('no', { success: true, data: {} }, 'Answer').content).toMatch(
      /Dropped; nothing changed\.$/,
    );
    expect(
      renderChangeResult(
        'ok',
        {
          success: false,
          error: {
            code: 'CONFIRMATION_EXPIRED',
            message: 'That change waited too long to be confirmed',
            suggestion: 'Ask the agent again for a fresh one',
            retryable: false,
          },
        },
        'Answer',
      ).content,
    ).toBe(
      'Answer\n\nNot done: That change waited too long to be confirmed. Ask the agent again for a fresh one.',
    );
  });
});
