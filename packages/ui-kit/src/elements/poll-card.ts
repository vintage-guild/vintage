import {
  attr,
  css,
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

/** One option with its live count, as the page builds it from `poll-get`. */
export interface PollCardOption {
  id: string;
  label: string;
  votes: number;
}

const template = html<VintagePollCard>`
  <article class="card" part="card">
    <span class="eyebrow" part="eyebrow">${(x) => x.eyebrow}</span>
    <h3 class="question" part="question">${(x) => x.question}</h3>
    ${when(
      (x) => x.description,
      html<VintagePollCard>`<p class="description" part="description">${(x) => x.description}</p>`,
    )}
    <div class="options" role="group" aria-label="Options">
      ${repeat(
        (x) => x.options,
        html<PollCardOption, VintagePollCard>`
          <button
            type="button"
            class="option ${(o, c) => (c.parent.isMine(o.id) ? 'mine' : '')} ${(o, c) => (c.parent.isLeading(o) ? 'leading' : '')}"
            aria-pressed="${(o, c) => String(c.parent.isMine(o.id))}"
            ?disabled="${(_, c) => !c.parent.voteCanExecute}"
            @click="${(o, c) => c.parent.vote(o.id)}"
          >
            <span class="row"><span class="label">${(o) => o.label}</span> <span class="pct num">${(o, c) => c.parent.percent(o)}% · ${(o) => o.votes}</span></span>
            <span class="track"><i style="${(o, c) => `inline-size: ${c.parent.percent(o)}%`}"></i></span>
          </button>
        `,
        { positioning: true },
      )}
    </div>
    <div class="foot">
      <span class="muted" part="note">${(x) => x.note}</span>
      <span class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</span>
    </div>
  </article>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
    box-shadow:
      inset 0 1px 0 rgb(255 244 228 / 6%),
      0 14px 34px rgb(0 0 0 / 45%);
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .question {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-tight);
    line-height: var(--font-leading-normal);
  }

  .description,
  .muted,
  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .options {
    display: grid;
    gap: var(--space-xs);
  }

  .option {
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .option:hover:not(:disabled) {
    border-color: var(--color-border-strong);
    background: color-mix(in srgb, var(--color-text-primary) 4%, transparent);
  }

  .option:disabled {
    cursor: default;
  }

  .option:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .option.mine {
    border-color: var(--color-accent-primary);
    background: color-mix(in srgb, var(--color-accent-primary) 10%, transparent);
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    align-items: baseline;
  }

  .label {
    font-weight: var(--font-weight-medium);
  }

  .pct {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .track {
    display: block;
    block-size: 6px;
    border-radius: 3px;
    background: var(--color-border-default);
    overflow: hidden;
  }

  .track i {
    display: block;
    block-size: 100%;
    background: var(--color-verdigris-200);
    transition: inline-size var(--motion-duration-normal) var(--motion-ease-out);
  }

  .option.leading .track i {
    background: var(--color-accent-primary);
  }

  .foot {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }

  @media (prefers-reduced-motion: reduce) {
    .track i {
      transition: none;
    }
  }
`;

/**
 * A single-choice poll: the question, each option as a button with its live share, and the
 * member's own vote marked. Choosing an option runs the `vintage.vote-cast` component command,
 * which calls the server's `vote-cast`; the server applies eligibility and closing rules.
 *
 * @tagname vintage-poll-card
 * @summary A poll with live results; voting runs `vote-cast`.
 * @fires vote-cast - The server accepted the vote; `detail` is the stored ballot.
 * @csspart card - The surface.
 * @csspart eyebrow - The label above the question.
 * @csspart question - The question.
 * @csspart description - The poll's description.
 * @csspart note - The line under the options (ballots, closing).
 * @csspart status - The result line (`role="status"`).
 */
export class VintagePollCard extends FASTElement {
  /** The poll's id; votes go to it. Empty disables voting. */
  @attr({ attribute: 'poll-id' }) pollId = '';
  @attr eyebrow = 'The question';
  @attr question = '';
  @attr description = '';
  /** Shown under the options, e.g. "20 ballots · closes Friday". */
  @attr note = '';
  /** `true` once the poll is closed or the member may not vote. */
  @attr({ mode: 'boolean' }) readonly = false;

  @observable options: PollCardOption[] = [];
  /** The option id the member voted for, or empty. */
  @observable myVote = '';
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  get ballots(): number {
    return this.options.reduce((n, o) => n + o.votes, 0);
  }

  percent(option: PollCardOption): number {
    return this.ballots ? Math.round((option.votes / this.ballots) * 100) : 0;
  }

  isMine(optionId: string): boolean {
    return this.myVote === optionId;
  }

  isLeading(option: PollCardOption): boolean {
    const top = Math.max(0, ...this.options.map((o) => o.votes));
    return option.votes > 0 && option.votes === top;
  }

  /** Reactive availability for `vintage.vote-cast`. */
  @volatile
  get voteCanExecute(): boolean {
    return !this.busy && !this.readonly && Boolean(this.pollId);
  }

  @command('vintage.vote-cast', {
    label: 'Vote',
    description: 'Vote for one option of the poll, or change your vote.',
    category: 'Polls',
    parameters: {
      type: 'object',
      properties: { optionId: { type: 'string' } },
      required: ['optionId'],
    },
  })
  async vote(optionId: unknown): Promise<ElementResult<unknown>> {
    if (typeof optionId !== 'string' || !this.options.some((o) => o.id === optionId)) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick one of the poll’s options' });
    }
    if (!this.voteCanExecute) {
      return failure({
        code: 'COMMAND_DISABLED',
        message: this.busy ? 'Already sending a vote' : 'This poll is not taking votes',
      });
    }
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('vote-cast', { pollId: this.pollId, choices: [optionId] }),
      );
      if (!result.success) {
        this.statusKind = 'error';
        this.statusText = describeError(result);
        return result;
      }
      const previous = this.myVote;
      this.myVote = optionId;
      this.options = this.options.map((o) => ({
        ...o,
        votes: o.votes + (o.id === optionId ? 1 : 0) - (o.id === previous ? 1 : 0),
      }));
      this.statusKind = 'success';
      this.statusText = String(result.metadata?.reasoning ?? 'Vote counted');
      this.$emit('vote-cast', result.data);
      return result;
    } finally {
      this.busy = false;
    }
  }
}

if (!customElements.get('vintage-poll-card')) {
  await VintagePollCard.define({ name: 'vintage-poll-card', template, styles });
}
