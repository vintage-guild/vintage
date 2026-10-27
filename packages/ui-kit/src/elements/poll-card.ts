import {
  attr,
  css,
  type ExecutionContext,
  FASTElement,
  html,
  nullableNumberConverter,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { describeError, type ElementResult, toElementResult } from '../result';

/** One option with its count, as the page builds it from `poll-get` (0 when the tally is hidden). */
export interface PollCardOption {
  id: string;
  label: string;
  votes: number;
}

/** How the poll is answered, as in the polls contract. */
export type PollCardMethod = 'single' | 'multi' | 'ranked';

/** In an option row (inside the repeat), the card itself. */
const card = (c: ExecutionContext) => c.parent as VintagePollCard;

const template = html<VintagePollCard>`
  <article class="card" part="card">
    <span class="eyebrow" part="eyebrow">${(x) => x.eyebrow}</span>
    <h3 class="question" part="question">${(x) => x.question}</h3>
    ${when(
      (x) => x.description,
      html<VintagePollCard>`<p class="description" part="description">${(x) => x.description}</p>`,
    )}
    ${when(
      (x) => x.instruction,
      html<VintagePollCard>`<p class="instruction" part="instruction">${(x) => x.instruction}</p>`,
    )}
    <div class="options" role="group" aria-label="Options">
      ${repeat(
        (x) => x.options,
        html<PollCardOption, VintagePollCard>`
          <button
            type="button"
            class="option ${(o, c) => card(c).optionClass(o)}"
            aria-pressed="${(o, c) => String(card(c).isPicked(o.id))}"
            ?disabled="${(_, c) => !card(c).voteCanExecute}"
            @click="${(o, c) => card(c).choose(o.id)}"
          >
            <span class="row">
              <span class="label">
                ${when(
                  (o, c) => card(c).rankOf(o.id) > 0,
                  html<
                    PollCardOption,
                    VintagePollCard
                  >`<span class="rank" aria-label="${(o, c) => `choice ${card(c).rankOf(o.id)}`}">${(o, c) => card(c).rankOf(o.id)}</span>`,
                )}
                ${(o) => o.label}${(o, c) => (card(c).isWinner(o.id) ? ' ✓' : '')}
              </span>
              ${when(
                (_, c) => !card(c).resultsHidden,
                html<
                  PollCardOption,
                  VintagePollCard
                >`<span class="pct num">${(o, c) => card(c).percent(o)}% · ${(o) => o.votes}</span>`,
              )}
            </span>
            ${when(
              (_, c) => !card(c).resultsHidden,
              html<
                PollCardOption,
                VintagePollCard
              >`<span class="track"><i style="${(o, c) => `inline-size: ${card(c).percent(o)}%`}"></i></span>`,
            )}
          </button>
        `,
        { positioning: true },
      )}
    </div>
    ${when(
      (x) => x.hasActions,
      html<VintagePollCard>`
        <div class="actions" part="actions">
          ${when(
            (x) => x.method !== 'single',
            html<VintagePollCard>`
              <button
                type="button"
                class="btn primary"
                ?disabled="${(x) => !x.submitCanExecute}"
                @click="${(x) => x.vote(x.draft)}"
              >${(x) => (x.myChoices.length ? 'Change my vote' : 'Vote')}</button>
            `,
          )}
          ${when(
            (x) => x.myChoices.length > 0,
            html<VintagePollCard>`
              <button
                type="button"
                class="btn"
                ?disabled="${(x) => !x.voteCanExecute}"
                @click="${(x) => x.retract()}"
              >Take back my vote</button>
            `,
          )}
        </div>
      `,
    )}
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
    box-shadow: var(--shadow-raised);
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
  .instruction,
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

  .option:focus-visible,
  .btn:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .option.mine,
  .option.picked {
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
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    font-weight: var(--font-weight-medium);
  }

  .rank {
    display: inline-grid;
    place-items: center;
    min-inline-size: 1.3rem;
    block-size: 1.3rem;
    border-radius: 50%;
    background: var(--color-accent-primary);
    color: var(--color-surface-canvas);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
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

  .option.leading .track i,
  .option.winner .track i {
    background: var(--color-accent-primary);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .btn {
    font: var(--font-size-sm) var(--font-family-sans);
    font-weight: var(--font-weight-medium);
    padding: 0.4rem 0.8rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    border-color: transparent;
    background: var(--color-accent-secondary);
    color: var(--color-surface-canvas);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: default;
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
 * A poll: the question, each option with its share when results may show, the member's own
 * ballot marked, and the winner once it closes. Pick-one polls vote on a click; pick-any and
 * ranked polls collect a draft and vote with a button. Voting runs the `vintage.vote-cast`
 * component command (the server's `vote-cast`), and "Take back my vote" runs
 * `vintage.vote-retract`. The server decides eligibility, closing, and whether the tally shows;
 * the card never adjusts counts itself, it fires an event so the page re-reads.
 *
 * @tagname vintage-poll-card
 * @summary A poll with results when visible; voting runs `vote-cast`.
 * @fires vote-cast - The server accepted the vote; `detail` is its answer.
 * @fires vote-retract - The server took the vote back.
 * @csspart card - The surface.
 * @csspart eyebrow - The label above the question.
 * @csspart question - The question.
 * @csspart description - The poll's description.
 * @csspart instruction - How to answer (pick-any and ranked polls).
 * @csspart actions - The Vote and take-back buttons.
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
  @attr method: PollCardMethod = 'single';
  /** Pick-any: the most options one ballot may pick; empty means any number. */
  @attr({ attribute: 'max-choices', converter: nullableNumberConverter }) maxChoices:
    | number
    | null = null;
  /** The poll keeps its tally from this member for now: no bars, counts, or shares. */
  @attr({ attribute: 'results-hidden', mode: 'boolean' }) resultsHidden = false;
  /** Ballots cast, from `poll-get`; pick-any shares are of ballots, not of picks. */
  @attr({ converter: nullableNumberConverter }) ballots: number | null = null;

  @observable options: PollCardOption[] = [];
  /** The member's stored ballot (option ids, in order for ranked). */
  @observable myChoices: string[] = [];
  /** Winning option ids, once the poll is closed. */
  @observable winners: string[] = [];
  /** Pick-any and ranked: what the member has picked but not sent yet. */
  @observable draft: string[] = [];
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  /** The denominator for shares: ballots when known, otherwise the sum of the counts. */
  @volatile
  get total(): number {
    return this.ballots ?? this.options.reduce((n, o) => n + o.votes, 0);
  }

  percent(option: PollCardOption): number {
    return this.total ? Math.round((option.votes / this.total) * 100) : 0;
  }

  isMine(optionId: string): boolean {
    return this.myChoices.includes(optionId);
  }

  /** Shown as chosen: the draft while editing, otherwise the stored ballot. */
  isPicked(optionId: string): boolean {
    return this.method !== 'single' && this.draft.length > 0
      ? this.draft.includes(optionId)
      : this.isMine(optionId);
  }

  /** Ranked: the option's place in the draft (or the stored ballot), 1-based; 0 when unranked. */
  rankOf(optionId: string): number {
    if (this.method !== 'ranked') return 0;
    const order = this.draft.length > 0 ? this.draft : this.myChoices;
    return order.indexOf(optionId) + 1;
  }

  isWinner(optionId: string): boolean {
    return this.winners.includes(optionId);
  }

  isLeading(option: PollCardOption): boolean {
    if (this.resultsHidden) return false;
    const top = Math.max(0, ...this.options.map((o) => o.votes));
    return option.votes > 0 && option.votes === top;
  }

  optionClass(option: PollCardOption): string {
    return [
      this.isPicked(option.id) ? (this.draft.length > 0 ? 'picked' : 'mine') : '',
      this.isLeading(option) ? 'leading' : '',
      this.isWinner(option.id) ? 'winner' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** The pick-any limit, or null for any number (an empty or zero attribute means no limit). */
  @volatile
  get limit(): number | null {
    return this.maxChoices !== null && this.maxChoices > 0 ? this.maxChoices : null;
  }

  @volatile
  get instruction(): string {
    if (this.readonly) return '';
    if (this.method === 'multi') {
      return this.limit ? `Pick up to ${this.limit}, then vote.` : 'Pick any, then vote.';
    }
    if (this.method === 'ranked') {
      return 'Click options in order of preference, then vote. Click one again to take it out.';
    }
    return '';
  }

  @volatile
  get hasActions(): boolean {
    return !this.readonly && (this.method !== 'single' || this.myChoices.length > 0);
  }

  /** Reactive availability for `vintage.vote-cast` and `vintage.vote-retract`. */
  @volatile
  get voteCanExecute(): boolean {
    return !this.busy && !this.readonly && Boolean(this.pollId);
  }

  @volatile
  get submitCanExecute(): boolean {
    return this.voteCanExecute && this.draft.length > 0;
  }

  /** A click on an option: vote at once (pick-one) or edit the draft (pick-any, ranked). */
  choose(optionId: string): void {
    if (!this.voteCanExecute) return;
    if (this.method === 'single') {
      void this.vote([optionId]);
      return;
    }
    const base = this.draft.length > 0 ? this.draft : [...this.myChoices];
    if (base.includes(optionId)) {
      this.draft = base.filter((id) => id !== optionId);
      return;
    }
    if (this.method === 'multi' && this.limit !== null && base.length >= this.limit) {
      this.say('error', `Pick at most ${this.limit}`);
      return;
    }
    this.say('idle', '');
    this.draft = [...base, optionId];
  }

  @command('vintage.vote-cast', {
    label: 'Vote',
    description:
      'Vote on the poll, or change your vote. Give the option ids: one for pick-one, up to the ' +
      'limit for pick-any, in preference order for ranked.',
    category: 'Polls',
    parameters: {
      type: 'object',
      properties: { choices: { type: 'array', items: { type: 'string' } } },
      required: ['choices'],
    },
  })
  async vote(choices: unknown): Promise<ElementResult<unknown>> {
    const picked = typeof choices === 'string' ? [choices] : choices;
    const known = new Set(this.options.map((o) => o.id));
    if (
      !Array.isArray(picked) ||
      picked.length === 0 ||
      !picked.every((c) => typeof c === 'string' && known.has(c))
    ) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick from the poll’s options' });
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
        await getCommandClient().run('vote-cast', { pollId: this.pollId, choices: picked }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.myChoices = [...(picked as string[])];
      this.draft = [];
      this.say('success', String(result.metadata?.reasoning ?? 'Vote counted'));
      this.$emit('vote-cast', result.data);
      return result;
    } finally {
      this.busy = false;
    }
  }

  @command('vintage.vote-retract', {
    label: 'Take back my vote',
    description: 'Remove your vote from the poll while it is open.',
    category: 'Polls',
  })
  async retract(): Promise<ElementResult<unknown>> {
    if (!this.voteCanExecute) {
      return failure({ code: 'COMMAND_DISABLED', message: 'This poll is not taking votes' });
    }
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('vote-retract', { pollId: this.pollId }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.myChoices = [];
      this.draft = [];
      this.say('success', 'Your vote is taken back');
      this.$emit('vote-retract', result.data);
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

if (!customElements.get('vintage-poll-card')) {
  await VintagePollCard.define({ name: 'vintage-poll-card', template, styles });
}
