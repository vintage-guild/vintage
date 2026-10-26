import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { SIGNUP_STATUSES, type SignupStatus } from '@vintage/comp-solver';
import { getCommandClient } from '../client';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';

export { SIGNUP_STATUSES, type SignupStatus };

/** How a member answers from the card; bench is a leader's decision, not an answer. */
export const ANSWERS = [
  'accepted',
  'late',
  'tentative',
  'declined',
] as const satisfies readonly SignupStatus[];
export type Answer = (typeof ANSWERS)[number];

export const ANSWER_LABELS: Record<Answer, string> = {
  accepted: 'Going',
  late: 'Late',
  tentative: 'Tentative',
  declined: "Can't",
};

const STATUS_LABELS: Record<SignupStatus | 'none', string> = {
  accepted: 'Going',
  late: 'Coming late',
  tentative: 'Tentative',
  bench: 'On the bench',
  declined: 'Not coming',
  none: 'No answer yet',
};

/** Counts the card shows: `raid-list` gives the statuses, `signup-list` the roles. */
export interface SignupCounts {
  accepted: number;
  late: number;
  tentative: number;
  bench: number;
  declined: number;
  tank: number;
  healer: number;
  dps: number;
  queued: number;
}

export const EMPTY_COUNTS: SignupCounts = {
  accepted: 0,
  late: 0,
  tentative: 0,
  bench: 0,
  declined: 0,
  tank: 0,
  healer: 0,
  dps: 0,
  queued: 0,
};

const isStatus = (value: string): value is SignupStatus =>
  (SIGNUP_STATUSES as readonly string[]).includes(value);
const isAnswer = (value: unknown): value is Answer =>
  (ANSWERS as readonly unknown[]).includes(value);

const template = html<VintageSignupCard>`
  <article class="card" part="card">
    <span class="eyebrow" part="eyebrow">${(x) => x.eyebrow}</span>
    <h3 class="title" part="title">${(x) => x.eventTitle}</h3>
    <p class="when" part="when">
      <time datetime="${(x) => x.startsAt}">${(x) => x.startsLabel}</time>
      ${when((x) => x.lockLabel, html<VintageSignupCard>` · ${(x) => x.lockLabel}`)}
    </p>
    <slot></slot>
    <div class="counts" part="counts">
      ${repeat(
        (x) => x.countRows,
        html<[string, number, string]>`
          <div class="${(r) => r[2]}"><b class="num">${(r) => r[1]}</b> <span>${(r) => r[0]}</span></div>
        `,
      )}
    </div>
    <div class="answer" part="answer">
      <span class="eyebrow">Your answer</span>
      <div class="row">
        <div class="seg" role="group" aria-label="Your answer">
          ${repeat(
            () => ANSWERS,
            html<Answer, VintageSignupCard>`
              <button
                type="button"
                class="${(a) => a}"
                aria-pressed="${(a, c) => String(c.parent.statusKey === a)}"
                ?disabled="${(_, c) => !c.parent.answerCanExecute}"
                @click="${(a, c) => c.parent.answer(a)}"
              >${(a) => ANSWER_LABELS[a]}</button>
            `,
          )}
        </div>
        ${when(
          (x) => x.characterLabel,
          html<VintageSignupCard>`<span class="as">as <b part="character">${(x) => x.characterLabel}</b></span>`,
        )}
      </div>
      <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">
        ${(x) => x.statusText}
      </p>
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
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: linear-gradient(180deg, var(--color-surface-raised), var(--card-bg));
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

  .title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-tight);
  }

  .when,
  .as,
  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4.25rem, 1fr));
    gap: var(--space-xs);
  }

  .counts div {
    display: grid;
    gap: 0.1rem;
    padding-block-start: var(--space-xs);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .counts b {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: var(--font-size-xl);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .counts span {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .counts .queued b {
    color: var(--color-signup-bench);
  }

  .answer {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-canvas);
    box-shadow: inset 0 1px 0 rgb(255 244 228 / 6%);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  .seg {
    display: inline-flex;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
    overflow: hidden;
  }

  .seg button {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.5rem 0.9rem;
    background: transparent;
    color: var(--color-text-secondary);
    border: 0;
    border-inline-end: var(--border-width-thin) solid var(--color-border-strong);
    cursor: pointer;
  }

  .seg button:last-child {
    border-inline-end: 0;
  }

  .seg button:hover:not(:disabled) {
    color: var(--color-text-primary);
  }

  .seg button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .seg button[aria-pressed='true'] {
    background: var(--color-accent-primary);
    color: var(--color-accent-contrast);
  }

  .seg button.late[aria-pressed='true'] {
    background: var(--color-signup-late);
    color: var(--color-accent-contrast);
  }

  .seg button.tentative[aria-pressed='true'] {
    background: var(--color-signup-tentative);
    color: var(--color-accent-contrast);
  }

  .seg button.declined[aria-pressed='true'] {
    background: var(--color-feedback-danger);
    color: var(--color-accent-contrast);
  }

  .seg button:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: calc(-1 * var(--border-width-thick));
  }

  .as b {
    color: var(--color-text-primary);
  }

  .status {
    min-block-size: var(--font-leading-relaxed);
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }
`;

/**
 * One raid, its signup counts, and the member's own answer. Clicking an answer runs the
 * `vintage.signup-set` component command, which calls the server's `signup-set` with the
 * member's character; the server applies the lock, queue, and tier rules and answers with
 * the stored signup.
 *
 * @tagname vintage-signup-card
 * @summary A raid's signups and the member's answer, backed by `signup-set`.
 * @fires signup-changed - The server accepted the answer; `detail` is the stored signup.
 * @slot - Extra content between the time and the counts, such as the raid's notes.
 * @csspart card - The surface.
 * @csspart eyebrow - The label above the title.
 * @csspart title - The raid's name.
 * @csspart when - The start time and lock note.
 * @csspart counts - The counts grid.
 * @csspart answer - The member's answer block.
 * @csspart character - The character the answer is for.
 * @csspart status - The result line (`role="status"`).
 */
export class VintageSignupCard extends FASTElement {
  /** The raid's id; answers go to this event. */
  @attr({ attribute: 'event-id' }) eventId = '';
  /** The raid's name. */
  @attr({ attribute: 'event-title' }) eventTitle = 'Raid night';
  /** Small label above the title. */
  @attr eyebrow = 'Next up';
  /** ISO 8601 or epoch-ms start time; shown in the viewer's time zone. */
  @attr({ attribute: 'starts-at' }) startsAt = '';
  /** Shown after the time, e.g. "signups lock 6:00 pm". */
  @attr({ attribute: 'lock-label' }) lockLabel = '';
  /** The member's current signup status, or `none`. */
  @attr status = 'none';
  /** The character the member answers with; empty disables answering. */
  @attr({ attribute: 'character-id' }) characterId = '';
  /** How that character is shown, e.g. "Bloodfen · Protection". */
  @attr({ attribute: 'character-label' }) characterLabel = '';
  /** IANA zone to show the start time in; empty uses the viewer's. The zone is always shown. */
  @attr({ attribute: 'time-zone' }) timeZone = '';

  @observable counts: SignupCounts = EMPTY_COUNTS;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  get statusKey(): SignupStatus | 'none' {
    return isStatus(this.status) ? this.status : 'none';
  }

  get startsLabel(): string {
    const raw = /^\d+$/.test(this.startsAt) ? Number(this.startsAt) : this.startsAt;
    const date = new Date(raw);
    if (!this.startsAt || Number.isNaN(date.getTime())) return 'Time to be announced';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    };
    try {
      return date.toLocaleString(
        undefined,
        this.timeZone ? { ...options, timeZone: this.timeZone } : options,
      );
    } catch {
      return date.toLocaleString(undefined, options);
    }
  }

  /**
   * The counts as [label, value, class] rows: who is going and the comp, then the secondary
   * states (late, tentative, queued) only when someone is in them, so zeros don't crowd the row.
   */
  get countRows(): [string, number, string][] {
    const c = this.counts;
    const rows: [string, number, string][] = [
      ['Going', c.accepted, 'accepted'],
      ['Tanks', c.tank, 'tank'],
      ['Healers', c.healer, 'healer'],
      ['DPS', c.dps, 'dps'],
    ];
    if (c.late) rows.push(['Late', c.late, 'late']);
    if (c.tentative) rows.push(['Tentative', c.tentative, 'tentative']);
    if (c.queued) rows.push(['Queued', c.queued, 'queued']);
    return rows;
  }

  /** Reactive availability for `vintage.signup-set`. */
  get answerCanExecute(): boolean {
    return !this.busy && Boolean(this.eventId) && Boolean(this.characterId);
  }

  @command('vintage.signup-set', {
    label: 'Answer a raid',
    description:
      'Sign up for the raid, or change your answer: accepted, late, tentative, or declined.',
    category: 'Raids',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', enum: [...ANSWERS] } },
      required: ['status'],
    },
  })
  async answer(status: unknown): Promise<ElementResult<unknown>> {
    if (!isAnswer(status)) {
      return failure({
        code: 'INVALID_PARAMETERS',
        message: `Answer with one of ${ANSWERS.join(', ')}`,
      });
    }
    if (!this.answerCanExecute) {
      return failure({
        code: 'COMMAND_DISABLED',
        message: this.busy ? 'Already sending an answer' : 'No raid or character to answer with',
      });
    }
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('signup-set', {
          eventId: this.eventId,
          characterId: this.characterId,
          status,
        }),
      );
      this.report(result, status);
      return result;
    } finally {
      this.busy = false;
    }
  }

  private report(result: ElementResult<unknown>, status: Answer): void {
    if (!result.success) {
      this.statusKind = 'error';
      this.statusText = describeError(result);
      return;
    }
    this.status = status;
    this.statusKind = 'success';
    this.statusText = String(result.metadata?.reasoning ?? STATUS_LABELS[status]);
    this.$emit('signup-changed', result.data);
  }
}

if (!customElements.get('vintage-signup-card')) {
  await VintageSignupCard.define({ name: 'vintage-signup-card', template, styles });
}
