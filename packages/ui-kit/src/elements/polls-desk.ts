import {
  attr,
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { describeError, type ElementResult, toElementResult } from '../result';

/** A tally as polls reports it (`PollResults`), the slice the desk reads. */
export interface PollsDeskResults {
  ballots: number;
  quorumMet: boolean;
  winners: string[];
  options: { optionId: string; votes: number }[];
}

/**
 * One poll on the officers' desk: the poll from `poll-list`, plus its tally (the frozen result
 * once closed, a live one from `poll-results` while open). Officers always see the tally; for a
 * raid leader it is null when the poll keeps it from them (officers-only, or results at close).
 */
export interface PollsDeskPoll {
  id: string;
  question: string;
  status: 'draft' | 'open' | 'closed' | 'cancelled';
  method: 'single' | 'multi' | 'ranked';
  eligibleTier: string;
  anonymous: boolean;
  resultsVisible: 'live' | 'after-close' | 'officers';
  quorum: number | null;
  opensAt: number | null;
  closesAt: number | null;
  closedAt: number | null;
  options: { id: string; label: string }[];
  ballots: number;
  results: PollsDeskResults | null;
}

/** A destructive command's preview, waiting for the officer to confirm or keep. */
interface Pending {
  pollId: string;
  kind: 'close' | 'cancel';
  question: string;
  token: string;
  summary: string;
}

const AUDIENCE: Record<string, string> = {
  member: 'members and up',
  recruit: 'recruits and up',
  raider: 'raiders and up',
  leader: 'leaders and officers',
  officer: 'officers',
};

const METHOD: Record<PollsDeskPoll['method'], string> = {
  single: 'pick one',
  multi: 'pick any',
  ranked: 'ranked',
};

const VISIBILITY: Record<PollsDeskPoll['resultsVisible'], string> = {
  live: '',
  'after-close': 'members see results at close',
  officers: 'results for officers only',
};

const label = (poll: PollsDeskPoll, id: string) =>
  poll.options.find((o) => o.id === id)?.label ?? id;

/** The confirm line for closing, from the server's preview. */
function closeSummary(
  poll: PollsDeskPoll,
  preview: { ballots?: number; results?: PollsDeskResults | null } | undefined,
): string {
  const ballots = preview?.results?.ballots ?? preview?.ballots ?? 0;
  const count = `${ballots} ballot${ballots === 1 ? '' : 's'}`;
  const r = preview?.results;
  if (!r || ballots === 0) return `It closes with ${count}. The result is frozen and can't change.`;
  const top = r.winners.map((id) => label(poll, id)).join(' and ');
  const lead = r.winners.length > 1 ? `a tie between ${top}` : `${top} winning`;
  const quorum = r.quorumMet ? '' : ' Quorum isn’t met, so the result won’t count.';
  return `It closes with ${count}, ${lead}.${quorum} The result is frozen and can't change.`;
}

/** The confirm line for cancelling, from the server's preview. */
function cancelSummary(preview: { ballots?: number } | undefined): string {
  const ballots = preview?.ballots ?? 0;
  return `No result is recorded; ${ballots} ballot${ballots === 1 ? '' : 's'} won’t count. Votes are kept for history.`;
}

/** In a poll row (inside the repeat), the desk itself. */
const desk = (c: ExecutionContext) => c.parent as VintagePollsDesk;

const optionRows = html<PollsDeskPoll, VintagePollsDesk>`
  <ul class="tally">
    ${repeat(
      (p) => p.options,
      html<{ id: string; label: string }, PollsDeskPoll>`
        <li class="${(o, c) => (c.parent.results?.winners.includes(o.id) && c.parent.status === 'closed' ? 'winner' : '')}">
          <span class="opt">${(o) => o.label}${(o, c) => (c.parent.results?.winners.includes(o.id) && c.parent.status === 'closed' ? ' ✓' : '')}</span>
          <span class="bar"><i style="${(o, c) => `inline-size: ${share(c.parent, o.id)}%`}"></i></span>
          <span class="num">${(o, c) => votesOf(c.parent, o.id)} · ${(o, c) => share(c.parent, o.id)}%</span>
        </li>
      `,
    )}
  </ul>
`;

const votesOf = (p: PollsDeskPoll, id: string) =>
  p.results?.options.find((o) => o.optionId === id)?.votes ?? 0;

const share = (p: PollsDeskPoll, id: string) => {
  const ballots = p.results?.ballots ?? 0;
  return ballots ? Math.round((votesOf(p, id) / ballots) * 100) : 0;
};

const template = html<VintagePollsDesk>`
  <section class="desk" part="desk" aria-labelledby="desk-title">
    <header class="top">
      <div>
        <span class="eyebrow">Polls</span>
        <h2 id="desk-title">${(x) => x.headline}</h2>
      </div>
      <button
        type="button"
        class="btn"
        ?disabled="${(x) => x.busy}"
        @click="${(x) => x.sweep()}"
        title="Open drafts whose time has come and close polls past their close time"
      >Run the sweep</button>
    </header>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>

    ${when(
      (x) => x.pending,
      html<VintagePollsDesk>`
        <div class="confirm" part="confirm" role="alertdialog" aria-labelledby="desk-confirm">
          <p id="desk-confirm">
            ${(x) => (x.pending?.kind === 'close' ? 'Close' : 'Cancel')} <b>${(x) => x.pending?.question}</b>
            <span>${(x) => x.pending?.summary}</span>
          </p>
          <button type="button" class="btn danger" @click="${(x) => x.confirm()}">
            ${(x) => (x.pending?.kind === 'close' ? 'Close it' : 'Cancel it')}
          </button>
          <button type="button" class="btn" @click="${(x) => x.keep()}">Keep it open</button>
        </div>
      `,
    )}

    <h3 class="section">Open <span>${(x) => x.live.length}</span></h3>
    ${when((x) => x.live.length === 0, html`<p class="empty">No open polls.</p>`)}
    <ul class="polls" part="open">
      ${repeat(
        (x) => x.live,
        html<PollsDeskPoll, VintagePollsDesk>`
          <li class="poll">
            <div class="head">
              <h4>${(p) => p.question}</h4>
              <span class="meta">${(p, c) => desk(c).metaLine(p)}</span>
            </div>
            ${when((p) => p.results, optionRows)}
            <div class="row-actions">
              ${when(
                (p) => p.status === 'draft',
                html<PollsDeskPoll, VintagePollsDesk>`
                  <button
                    type="button"
                    class="btn small primary"
                    ?disabled="${(_, c) => desk(c).busy}"
                    @click="${(p, c) => desk(c).open(p.id)}"
                  >Open now</button>
                `,
              )}
              ${when(
                (p) => p.status === 'open',
                html<PollsDeskPoll, VintagePollsDesk>`
                  <button
                    type="button"
                    class="btn small"
                    ?disabled="${(_, c) => desk(c).busy}"
                    @click="${(p, c) => desk(c).close(p.id)}"
                  >Close</button>
                `,
              )}
              <button
                type="button"
                class="btn small danger"
                ?disabled="${(_, c) => desk(c).busy}"
                @click="${(p, c) => desk(c).cancel(p.id)}"
              >Cancel</button>
            </div>
          </li>
        `,
      )}
    </ul>

    <h3 class="section">Closed <span>${(x) => x.closed.length}</span></h3>
    ${when((x) => x.closed.length === 0, html`<p class="empty">No closed polls yet.</p>`)}
    <ul class="polls" part="closed">
      ${repeat(
        (x) => x.closed,
        html<PollsDeskPoll, VintagePollsDesk>`
          <li class="poll closed">
            <div class="head">
              <h4>${(p) => p.question}</h4>
              <span class="meta">${(p, c) => desk(c).metaLine(p)}</span>
            </div>
            <p class="outcome">${(p, c) => desk(c).outcome(p)}</p>
            ${when((p) => p.results, optionRows)}
          </li>
        `,
      )}
    </ul>
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .desk {
    display: grid;
    gap: var(--space-md);
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: end;
    gap: var(--space-sm);
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  h2 {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
  }

  .section {
    margin: var(--space-sm) 0 0;
    font-size: var(--font-size-md);
  }

  .section span,
  .meta,
  .empty,
  .outcome {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .empty,
  .outcome {
    margin: 0;
  }

  .polls {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .poll {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: 0.45rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
  }

  .head {
    display: grid;
    gap: 0.15rem;
  }

  h4 {
    margin: 0;
    font-size: var(--font-size-md);
  }

  .tally {
    display: grid;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tally li {
    display: grid;
    grid-template-columns: minmax(6rem, 14rem) 1fr auto;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
  }

  .tally li.winner .opt {
    font-weight: var(--font-weight-bold);
  }

  .bar {
    display: block;
    block-size: 6px;
    border-radius: 3px;
    background: var(--color-border-default);
    overflow: hidden;
  }

  .bar i {
    display: block;
    block-size: 100%;
    background: var(--color-verdigris-200);
  }

  .winner .bar i {
    background: var(--color-accent-primary);
  }

  .num {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .btn {
    font: var(--font-size-sm) var(--font-family-sans);
    font-weight: var(--font-weight-medium);
    padding: 0.4rem 0.8rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    background: var(--color-accent-secondary);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  .btn.danger {
    color: var(--color-text-accent);
  }

  .btn.small {
    padding: 0.25rem 0.55rem;
    font-size: var(--font-size-xs);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status.error {
    color: var(--color-text-accent);
  }

  .status.success {
    color: var(--color-accent-secondary);
  }

  .status:empty {
    display: none;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-text-accent) 55%, transparent);
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--color-text-accent) 8%, var(--color-surface-raised));
  }

  .confirm p {
    flex: 1 1 18rem;
    margin: 0;
  }

  .confirm p span {
    display: block;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  @media (max-width: 40rem) {
    .tally li {
      grid-template-columns: 1fr auto;
    }

    .bar {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
`;

/**
 * The officers' Polls tab: open polls with their live tally (officers always see it), closed
 * polls with their frozen result, and the actions. Close and cancel are destructive: the first
 * call shows the server's preview, and nothing changes until the officer confirms. Open, close,
 * cancel, and the sweep are `@command`s calling the server commands of the same names.
 *
 * @tagname vintage-polls-desk
 * @summary Officers' polls: open and closed with results; open, close, cancel, sweep.
 * @fires polls-changed - A poll was opened, closed, or cancelled, or the sweep ran.
 * @csspart desk - The section.
 * @csspart status - The result line (`role="status"`).
 * @csspart confirm - A close or cancel waiting for confirmation.
 * @csspart open - The open and draft polls.
 * @csspart closed - The closed polls.
 */
export class VintagePollsDesk extends FASTElement {
  /** Optional IANA zone for times; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  @observable polls: PollsDeskPoll[] = [];
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  @observable pending: Pending | null = null;

  /** Open and draft polls, soonest to close first. */
  @volatile
  get live(): PollsDeskPoll[] {
    return this.polls.filter((p) => p.status === 'open' || p.status === 'draft');
  }

  /** Closed polls, most recently closed first. */
  @volatile
  get closed(): PollsDeskPoll[] {
    return this.polls
      .filter((p) => p.status === 'closed')
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  }

  @volatile
  get headline(): string {
    const open = this.live.length;
    return open === 0 ? 'Nothing open' : `${open} open`;
  }

  when(ms: number | null): string {
    if (ms === null) return '';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    try {
      return new Date(ms).toLocaleString(undefined, {
        ...options,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
      });
    } catch {
      return new Date(ms).toLocaleString(undefined, options);
    }
  }

  /** "pick one · raiders and up · anonymous · 7 ballots · closes Fri, Oct 30, 8:00 PM". */
  metaLine(p: PollsDeskPoll): string {
    const parts = [METHOD[p.method], AUDIENCE[p.eligibleTier] ?? p.eligibleTier];
    if (p.anonymous) parts.push('anonymous');
    if (VISIBILITY[p.resultsVisible]) parts.push(VISIBILITY[p.resultsVisible]);
    parts.push(`${p.ballots} ballot${p.ballots === 1 ? '' : 's'}`);
    if (p.quorum !== null) parts.push(`quorum ${p.quorum}`);
    if (p.status === 'draft') parts.push(p.opensAt ? `opens ${this.when(p.opensAt)}` : 'draft');
    if (p.status === 'open' && p.closesAt) parts.push(`closes ${this.when(p.closesAt)}`);
    if (p.status === 'closed' && p.closedAt) parts.push(`closed ${this.when(p.closedAt)}`);
    return parts.join(' · ');
  }

  /** A closed poll's result in a line. */
  outcome(p: PollsDeskPoll): string {
    const r = p.results;
    if (!r) return p.ballots > 0 ? 'The result is for officers.' : 'Nobody voted.';
    if (r.ballots === 0) return 'Nobody voted.';
    const top = r.winners.map((id) => label(p, id)).join(' and ');
    const lead = r.winners.length > 1 ? `Tie between ${top}` : `${top} won`;
    return `${lead} with ${r.ballots} ballot${r.ballots === 1 ? '' : 's'}.${r.quorumMet ? '' : ' Quorum not met, so it doesn’t count.'}`;
  }

  @command('vintage.poll-open', {
    label: 'Open a poll',
    description: 'Open a draft poll for voting now.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { pollId: { type: 'string' } },
      required: ['pollId'],
    },
  })
  async open(pollId: unknown): Promise<ElementResult<unknown>> {
    if (typeof pollId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a poll to open' });
    }
    return this.change('poll-open', { pollId }, 'Opened');
  }

  @command('vintage.poll-close', {
    label: 'Close a poll',
    description: 'Preview closing a poll and its result; confirm to close it.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { pollId: { type: 'string' } },
      required: ['pollId'],
    },
  })
  async close(pollId: unknown): Promise<ElementResult<unknown>> {
    return this.preview('close', pollId);
  }

  @command('vintage.poll-cancel', {
    label: 'Cancel a poll',
    description: 'Preview cancelling a poll with no result; confirm to cancel it.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { pollId: { type: 'string' } },
      required: ['pollId'],
    },
  })
  async cancel(pollId: unknown): Promise<ElementResult<unknown>> {
    return this.preview('cancel', pollId);
  }

  @command('vintage.poll-sweep', {
    label: 'Run the poll sweep',
    description: 'Open drafts whose time has come and close polls past their close time.',
    category: 'Officers',
  })
  async sweep(): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run<{ opened: string[]; closed: string[] }>('poll-sweep', {}),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const data = result.data as { opened?: string[]; closed?: string[] } | undefined;
      this.say(
        'success',
        `Sweep done: opened ${data?.opened?.length ?? 0}, closed ${data?.closed?.length ?? 0}`,
      );
      this.$emit('polls-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  /** Run the confirmed close or cancel with the preview's token. */
  async confirm(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'Nothing waiting' });
    this.busy = true;
    try {
      const name = pending.kind === 'close' ? 'poll-close' : 'poll-cancel';
      const result = toElementResult(
        await getCommandClient().run(
          name,
          { pollId: pending.pollId },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say(
        'success',
        `${pending.kind === 'close' ? 'Closed' : 'Cancelled'} “${pending.question}”`,
      );
      this.$emit('polls-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  keep(): void {
    if (this.pending) this.say('idle', `Kept “${this.pending.question}” open`);
    this.pending = null;
  }

  private async preview(kind: 'close' | 'cancel', pollId: unknown) {
    if (typeof pollId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: `Give a poll to ${kind}` });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const poll = this.polls.find((p) => p.id === pollId);
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: { ballots?: number; results?: PollsDeskResults | null };
        confirmToken?: string;
      }>(kind === 'close' ? 'poll-close' : 'poll-cancel', { pollId });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (!token) {
        this.say('success', kind === 'close' ? 'Closed' : 'Cancelled');
        this.$emit('polls-changed');
        return result;
      }
      const preview = raw.success ? raw.data?.preview : undefined;
      const question = poll?.question ?? 'this poll';
      this.pending = {
        pollId,
        kind,
        question,
        token,
        summary: kind === 'close' && poll ? closeSummary(poll, preview) : cancelSummary(preview),
      };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private async change(name: string, input: unknown, done: string) {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', done);
      this.$emit('polls-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private say(kind: 'idle' | 'error' | 'success', text: string): void {
    this.statusKind = kind;
    this.statusText = text;
  }
}

if (!customElements.get('vintage-polls-desk')) {
  await VintagePollsDesk.define({ name: 'vintage-polls-desk', template, styles });
}
