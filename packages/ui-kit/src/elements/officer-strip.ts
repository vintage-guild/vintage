import { attr, css, FASTElement, html, observable, volatile, when } from '@lushly-dev/fast-element';

/** The coordinator's state as the strip shows it. */
export const COORDINATOR_STATES = ['running', 'paused', 'unconfigured', 'unknown'] as const;
export type CoordinatorState = (typeof COORDINATOR_STATES)[number];

const STATE_LABELS: Record<CoordinatorState, string> = {
  running: 'running',
  paused: 'paused',
  unconfigured: 'not set up',
  unknown: 'no status',
};

/** How many names show before "+n more". */
const NAMES_SHOWN = 4;

const template = html<VintageOfficerStrip>`
  <aside class="strip" part="strip" aria-label="Officers: ${(x) => x.eventTitle || 'next raid'}">
    <span class="tag" part="tag">Officers</span>
    <div class="cell" part="waiting">
      <span class="label">Waiting on</span>
      <b class="${(x) => (x.waiting.length ? 'warn' : 'ok')}">${(x) => x.waitingCount}</b>
      <span class="detail">${(x) => x.waitingNames}</span>
    </div>
    <div class="cell" part="comp">
      <span class="label">Comp</span>
      <b class="${(x) => (x.gaps.length ? 'warn' : 'ok')}">${(x) => x.compHeadline}</b>
      <span class="detail">${(x) => x.gapsText}</span>
    </div>
    <div class="cell" part="coordinator">
      <span class="label">Coordinator</span>
      <b class="${(x) => (x.state === 'running' ? 'ok' : 'warn')}">${(x) => x.stateLabel}</b>
      <span class="detail">${(x) => x.stateDetail}</span>
    </div>
    ${when(
      (x) => Boolean(x.href),
      html<VintageOfficerStrip>`<a class="go" part="link" href="${(x) => x.href}">Officers' quarters</a>`,
    )}
  </aside>
`;

const styles = css`
  /* The band runs edge to edge; its contents line up with the page's 80rem column. */
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--color-accent-secondary) 10%, transparent),
        transparent 40%
      ),
      var(--color-surface-sunken);
  }

  .strip {
    display: grid;
    grid-template-columns: auto repeat(3, minmax(0, 1fr)) auto;
    align-items: center;
    gap: var(--space-xs) var(--space-lg);
    max-inline-size: 80rem;
    margin-inline: auto;
    padding: var(--space-sm) var(--space-inset);
    font-size: var(--font-size-sm);
  }

  .tag {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-accent-secondary);
    padding: 0.15rem 0.5rem;
    border: var(--border-width-thin) dashed
      color-mix(in srgb, var(--color-accent-secondary) 60%, transparent);
    border-radius: 999px;
  }

  .cell {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--space-xs);
    align-items: baseline;
    min-inline-size: 0;
  }

  .label {
    grid-column: 1 / -1;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .cell b {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-md);
  }

  .cell b.ok {
    color: var(--color-accent-secondary);
  }

  .cell b.warn {
    color: var(--color-text-accent);
  }

  .detail {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
  }

  .go {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
    white-space: nowrap;
  }

  .go::after {
    content: ' →';
  }

  .go:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .go:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  @media (max-width: 62rem) {
    .strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .tag,
    .go {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  @media (max-width: 40rem) {
    .strip {
      grid-template-columns: 1fr;
    }

    .cell {
      grid-template-columns: 7rem auto 1fr;
    }

    .label {
      grid-column: auto;
    }
  }
`;

/**
 * The officer strip: a one-line glance for leaders and officers at the next raid, under the
 * header. Who among the expected ranks hasn't answered (`coordinator-status` → `waiting`), the
 * comp gaps (`comp-suggest` → `gaps[].reason`), and the coordinator's state. A glance, not a
 * dashboard: the work happens in the officers' quarters, which `href` links to once it exists.
 *
 * @tagname vintage-officer-strip
 * @summary Non-responders, comp gaps, and coordinator status for the next raid.
 * @csspart strip - The bar.
 * @csspart tag - The "Officers" label.
 * @csspart waiting - Who hasn't answered.
 * @csspart comp - The comp gaps.
 * @csspart coordinator - The coordinator's state.
 * @csspart link - The link to the quarters.
 */
export class VintageOfficerStrip extends FASTElement {
  /** The raid the strip is about. */
  @attr({ attribute: 'event-title' }) eventTitle = '';
  /** The coordinator's state. */
  @attr state: CoordinatorState = 'unknown';
  /** A short note after the state: "next: remind-24h". */
  @attr({ attribute: 'state-detail' }) stateDetail = '';
  /** Where "Officers' quarters" goes. Empty hides the link. */
  @attr href = '';
  /** Still reading: every cell says so, rather than "0" or "no status". */
  @attr({ mode: 'boolean' }) loading = false;
  /** Display names of the expected members who haven't answered, sorted. */
  @observable waiting: string[] = [];
  /** Comp gaps as reasons: "need 1 more healer", "no Mark of the Wild". */
  @observable gaps: string[] = [];

  @volatile
  get waitingCount(): string {
    return this.loading ? '…' : String(this.waiting.length);
  }

  @volatile
  get waitingNames(): string {
    if (this.loading) return 'checking';
    if (!this.waiting.length) return 'everyone expected has answered';
    const shown = this.waiting.slice(0, NAMES_SHOWN).join(', ');
    const more = this.waiting.length - NAMES_SHOWN;
    return more > 0 ? `${shown} +${more} more` : shown;
  }

  @volatile
  get compHeadline(): string {
    if (this.loading) return '…';
    const n = this.gaps.length;
    return n === 0 ? 'no gaps' : `${n} gap${n === 1 ? '' : 's'}`;
  }

  get gapsText(): string {
    return this.gaps.join(' · ');
  }

  @volatile
  get stateLabel(): string {
    if (this.loading) return '…';
    return STATE_LABELS[this.state] ?? STATE_LABELS.unknown;
  }
}

if (!customElements.get('vintage-officer-strip')) {
  await VintageOfficerStrip.define({ name: 'vintage-officer-strip', template, styles });
}
