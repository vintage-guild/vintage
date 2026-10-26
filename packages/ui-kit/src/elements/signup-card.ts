import { attr, css, FASTElement, html } from '@lushly-dev/fast-element';
import '../primitives';

/** Signup states, matching the `--color-signup-*` tokens. The raids module (#14) owns the real list. */
export const SIGNUP_STATUSES = [
  'accepted',
  'tentative',
  'bench',
  'declined',
  'no-response',
] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

const STATUS_LABELS: Record<SignupStatus, string> = {
  accepted: 'Signed up',
  tentative: 'Tentative',
  bench: 'Bench',
  declined: 'Declined',
  'no-response': 'No response',
};

const isStatus = (value: string): value is SignupStatus =>
  (SIGNUP_STATUSES as readonly string[]).includes(value);

const template = html<VintageSignupCard>`
  <violet-card appearance="outline" padding="medium" part="card">
    <div slot="header" class="header">
      <h3 class="title" part="title">${(x) => x.eventTitle}</h3>
      <time class="when" part="when" datetime="${(x) => x.startsAt}">${(x) => x.startsLabel}</time>
    </div>
    <p class="status" part="status">
      <span class="dot" style="${(x) => `--_status: var(--color-signup-${x.statusKey})`}"></span>
      ${(x) => STATUS_LABELS[x.statusKey]}
    </p>
    <slot></slot>
    <div slot="footer" class="footer">
      <violet-button appearance="primary" disabled>Sign up</violet-button>
      <violet-button appearance="secondary" disabled>Tentative</violet-button>
      <violet-button appearance="quiet" disabled>Decline</violet-button>
      <span class="note" part="note">${(x) => x.note}</span>
    </div>
  </violet-card>
`;

const styles = css`
  :host {
    display: block;
    max-inline-size: 26rem;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    --violet-card-background: var(--card-bg);
    --violet-card-border-color: var(--card-border);
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    color: var(--color-text-accent);
  }

  .when,
  .note {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
    font-weight: var(--font-weight-medium);
  }

  .dot {
    inline-size: 0.7em;
    block-size: 0.7em;
    border-radius: 50%;
    background: var(--_status);
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  violet-button {
    font-family: var(--font-family-sans);
  }
`;

/**
 * Placeholder for a raid signup: the event, its start time, and the member's status. The
 * buttons stay disabled until the raids module's signup commands exist (#14); they will become
 * `@command`s that call them, like the character form does.
 *
 * @tagname vintage-signup-card
 * @summary Raid signup card placeholder (event, time, status).
 * @slot - Extra content, such as the signed-up character's badges.
 * @csspart card - The violet-card surface.
 * @csspart title - The event name.
 * @csspart when - The start time.
 * @csspart status - The signup status line.
 * @csspart note - The note next to the buttons.
 * @cssprop --color-signup-accepted - One `--color-signup-<status>` token per status (from @vintage/design-tokens).
 */
export class VintageSignupCard extends FASTElement {
  /** The raid's name. */
  @attr({ attribute: 'event-title' }) eventTitle = 'Raid night';
  /** ISO 8601 start time; shown in the viewer's time zone. */
  @attr({ attribute: 'starts-at' }) startsAt = '';
  /** One of SIGNUP_STATUSES; anything else shows as no response. */
  @attr status = 'no-response';
  /** The note shown while signups are unavailable. */
  @attr note = 'Signups open here once raids are scheduled.';

  get statusKey(): SignupStatus {
    return isStatus(this.status) ? this.status : 'no-response';
  }

  get startsLabel(): string {
    const date = new Date(this.startsAt);
    if (!this.startsAt || Number.isNaN(date.getTime())) return 'Time to be announced';
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

if (!customElements.get('vintage-signup-card')) {
  await VintageSignupCard.define({ name: 'vintage-signup-card', template, styles });
}
