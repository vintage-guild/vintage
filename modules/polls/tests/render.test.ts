import {
  COMPONENT_LIMITS,
  ComponentType,
  countComponents,
  LAYOUT_LIMITS,
  type LayoutComponent,
  layoutText,
  MessageFlags,
} from '@vintage/discord-kit';
import { describe, expect, it } from 'vitest';
import type { Poll } from '../src/contract';
import { tally } from '../src/domain/tally';
import {
  type PollAction,
  type PollCard,
  parsePollCustomId,
  pollCustomId,
  renderKey,
  renderPollPost,
} from '../src/render/discord';

// A Convex id is 32 characters; use one that long so the custom-id limit is tested for real.
const POLL_ID = 'k17a9xq0m3v8b2n5c6d4f1g7h0j3k5l8';

const poll = (overrides: Partial<Poll> = {}): Poll => ({
  id: POLL_ID,
  guildId: 'g1',
  question: 'Which raid night?',
  description: null,
  options: ['Tuesday', 'Thursday', 'Friday'].map((label, i) => ({
    id: `o${i + 1}`,
    label,
    emoji: null,
    value: null,
  })),
  method: 'single',
  maxChoices: null,
  eligibleTier: 'raider',
  anonymous: false,
  resultsVisible: 'live',
  quorum: null,
  status: 'open',
  opensAt: 1,
  closesAt: Date.UTC(2026, 10, 1),
  createdBy: 'm1',
  closedBy: null,
  createdAt: 1,
  closedAt: null,
  tags: [],
  configVersion: 1,
  results: null,
  ...overrides,
});

const card = (p: Poll, votes: string[][] = [], extra: Partial<PollCard> = {}): PollCard => ({
  poll: p,
  results: tally(
    p,
    votes.map((choices) => ({ choices, weight: 1 })),
  ),
  eligible: 30,
  pollUrl: null,
  ...extra,
});

/** Every interactive component in the message, flattened. */
function controlsOf(
  components: readonly LayoutComponent[],
): { type: number; custom_id?: string; url?: string; max_values?: number }[] {
  const out: { type: number; custom_id?: string; url?: string; max_values?: number }[] = [];
  const walk = (list: readonly unknown[]) => {
    for (const c of list as { type: number; components?: unknown[] }[]) {
      if (c.type === ComponentType.BUTTON || c.type === ComponentType.STRING_SELECT) out.push(c);
      if (c.components) walk(c.components);
    }
  };
  walk(components);
  return out;
}

const render = (c: PollCard) => {
  const message = renderPollPost(c);
  const components = (message.components ?? []) as LayoutComponent[];
  return { message, text: layoutText(components), controls: controlsOf(components) };
};

describe('poll custom ids', () => {
  it('round-trips every action and stays under the Discord limit', () => {
    const actions: PollAction[] = [
      { kind: 'vote', pollId: POLL_ID, optionId: 'o25' },
      { kind: 'select', pollId: POLL_ID },
      { kind: 'retract', pollId: POLL_ID },
      { kind: 'close', pollId: POLL_ID },
      { kind: 'close-confirm', pollId: POLL_ID },
    ];
    for (const action of actions) {
      const id = pollCustomId(action);
      expect(id.length).toBeLessThanOrEqual(COMPONENT_LIMITS.customId);
      expect(parsePollCustomId(id)).toEqual(action);
    }
  });

  it('ignores ids that are not poll controls', () => {
    expect(parsePollCustomId('signup:e1:accepted')).toBeNull();
    expect(parsePollCustomId('poll:zz:p1')).toBeNull();
    expect(parsePollCustomId('poll:v:p1')).toBeNull();
    expect(parsePollCustomId(undefined)).toBeNull();
  });
});

describe('renderPollPost', () => {
  it('is a Components V2 message with no mentions', () => {
    const { message } = render(card(poll()));
    expect(message.flags).toBe(MessageFlags.IS_COMPONENTS_V2);
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });

  it('shows live bars, counts, and one vote button per option', () => {
    const { text, controls } = render(card(poll(), [['o2'], ['o2'], ['o1']]));
    expect(text).toContain('## Which raid night?');
    expect(text).toContain('Pick one · Raiders and up');
    expect(text).toMatch(/\*\*Thursday\*\*\n`█{8}░{4}` 2 · 67%/);
    expect(text).toContain('3 of 30 voted');
    expect(controls.map((c) => c.custom_id)).toEqual([
      `poll:v:${POLL_ID}:o1`,
      `poll:v:${POLL_ID}:o2`,
      `poll:v:${POLL_ID}:o3`,
      `poll:x:${POLL_ID}`,
      `poll:c:${POLL_ID}`,
    ]);
  });

  it('uses a select for more than five options and for multi polls', () => {
    const many = poll({
      options: Array.from({ length: 6 }, (_, i) => ({
        id: `o${i + 1}`,
        label: `Option ${i + 1}`,
        emoji: null,
        value: null,
      })),
    });
    expect(render(card(many)).controls[0]).toMatchObject({
      type: ComponentType.STRING_SELECT,
      custom_id: `poll:s:${POLL_ID}`,
      max_values: 1,
    });
    const multi = poll({ method: 'multi', maxChoices: 2 });
    expect(render(card(multi)).controls[0]).toMatchObject({
      type: ComponentType.STRING_SELECT,
      max_values: 2,
    });
  });

  it('sends ranked polls to the website when there is one', () => {
    const ranked = poll({ method: 'ranked' });
    const withSite = render(card(ranked, [], { pollUrl: 'https://vintage.example/polls/p1' }));
    expect(withSite.controls[0]).toMatchObject({ url: 'https://vintage.example/polls/p1' });
    const noSite = render(card(ranked));
    expect(noSite.controls.map((c) => c.custom_id)).toEqual([
      `poll:x:${POLL_ID}`,
      `poll:c:${POLL_ID}`,
    ]);
  });

  it('hides the tally until close when results are after-close', () => {
    const hidden = poll({ resultsVisible: 'after-close', anonymous: true });
    const { text } = render(card(hidden, [['o1'], ['o2']]));
    expect(text).not.toContain('█');
    expect(text).toContain('**1.** Tuesday');
    expect(text).toContain('results show at close');
    expect(text).toContain('anonymous');
    expect(text).toContain('2 of 30 voted');
  });

  it('marks the winner and drops the controls once closed', () => {
    const p = poll({ status: 'closed' });
    const c = card(p, [['o2'], ['o2'], ['o1']]);
    const { text, controls } = render({ ...c, poll: { ...p, results: c.results } });
    expect(text).toContain('**Thursday** ✓');
    expect(text).toContain('**closed**');
    expect(controls).toEqual([]);
  });

  it('says when a closed poll missed its quorum or tied', () => {
    const p = poll({ status: 'closed', quorum: 5 });
    expect(render(card(p, [['o1'], ['o2']])).text).toContain('no result: quorum not met');
    expect(render(card(poll({ status: 'closed' }), [['o1'], ['o2']])).text).toContain('tie');
  });

  it('keeps an officers-only tally off the public post even after close', () => {
    const p = poll({ status: 'closed', resultsVisible: 'officers' });
    expect(render(card(p, [['o1']])).text).not.toContain('█');
  });
});

describe('renderKey', () => {
  it('changes with the tally, status, and config, but not for a hidden vote change', () => {
    const live = poll();
    expect(renderKey(card(live, [['o1']]))).not.toBe(renderKey(card(live, [['o2']])));
    expect(renderKey(card(live))).not.toBe(renderKey(card({ ...live, configVersion: 2 })));
    expect(renderKey(card(live))).not.toBe(renderKey(card({ ...live, status: 'closed' })));
    const hidden = poll({ resultsVisible: 'after-close' });
    expect(renderKey(card(hidden, [['o1']]))).toBe(renderKey(card(hidden, [['o2']])));
  });
});

describe('Discord limits', () => {
  it('keeps the longest possible poll under the 4000-character text limit', () => {
    const long = (n: number, c: string) => c.repeat(n);
    const biggest = poll({
      question: long(300, 'Q'),
      description: long(1000, 'D'),
      options: Array.from({ length: 25 }, (_, i) => ({
        id: `o${i + 1}`,
        label: `${i}`.padEnd(80, 'L'),
        emoji: '🗡️',
        value: null,
      })),
      quorum: 25,
      closesAt: Date.UTC(2026, 10, 1),
    });
    const votes = Array.from({ length: 999 }, (_, i) => [`o${(i % 25) + 1}`]);
    const { message } = render(card(biggest, votes, { eligible: 999 }));
    const text = layoutText((message.components ?? []) as LayoutComponent[]);
    expect(text.length).toBeLessThanOrEqual(LAYOUT_LIMITS.text);
    expect(countComponents((message.components ?? []) as LayoutComponent[])).toBeLessThanOrEqual(
      LAYOUT_LIMITS.components,
    );
  });
});
