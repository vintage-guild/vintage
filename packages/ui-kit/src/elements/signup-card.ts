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
import { SIGNUP_STATUSES, type SignupStatus } from '@vintage/comp-solver';
import { CLASSES, ROLES, type Role, type WowClass } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { isRole, roleLabel, titleCase } from '../labels';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';

export { SIGNUP_STATUSES, type SignupStatus };

/** A character the member can bring (a row of `character-list`). */
export interface SignupCharacter {
  id: string;
  name: string;
  class: WowClass;
  spec: string;
  role: Role;
  isMain: boolean;
}

/** A comp role the raid is short of (raids `rolesNeeded`). */
export type NeededRole = 'tank' | 'healer' | 'dps';

const NEEDED_WORDS: Record<NeededRole, string> = {
  tank: 'tanks needed',
  healer: 'healers needed',
  dps: 'DPS needed',
};

const neededFor = (role: Role, needed: readonly string[]): string => {
  const comp: NeededRole = role === 'melee' || role === 'ranged' ? 'dps' : role;
  return needed.includes(comp) ? ` · ${NEEDED_WORDS[comp]}` : '';
};

/** `feral-tank` → "Feral": the tank version of a spec reads as the spec, its role beside it. */
const specName = (spec: string) => titleCase(spec.replace(/-tank$/, ''));

/** The card's choice for the raid, put back when the server refuses a change. */
interface Choice {
  characterId: string;
  spec: string;
  playRole: string;
  reason: string;
}

type FieldElement = HTMLElement & { value: string };
const fieldValue = (event: Event) => (event.currentTarget as FieldElement).value;

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
          (x) => x.asLabel,
          html<VintageSignupCard>`<span class="as">as <b part="character">${(x) => x.asLabel}</b></span>`,
        )}
      </div>
      ${when(
        (x) => x.reason,
        html<VintageSignupCard>`<p class="reason" part="reason">Guessed from ${(x) => x.reason}</p>`,
      )}
      ${when(
        (x) => x.specChoices.length > 0,
        html<VintageSignupCard>`
          <div class="switch" part="switch">
            ${when(
              (x) => x.characterChoices.length > 1,
              html<VintageSignupCard>`
                <violet-select
                  label="Switch character"
                  name="character"
                  :value="${(x) => x.characterId}"
                  ?disabled="${(x) => !x.switchCharacterCanExecute}"
                  @change="${(x, c) => x.switchCharacter(fieldValue(c.event))}"
                >
                  ${repeat(
                    (x) => x.characterChoices,
                    html<
                      [string, string]
                    >`<violet-option value="${(o) => o[0]}">${(o) => o[1]}</violet-option>`,
                  )}
                </violet-select>
              `,
            )}
            <violet-select
              label="Change spec"
              name="spec"
              :value="${(x) => x.activeSpec}"
              ?disabled="${(x) => !x.changeSpecCanExecute}"
              @change="${(x, c) => x.changeSpec(fieldValue(c.event))}"
            >
              ${repeat(
                (x) => x.specChoices,
                html<
                  [string, string]
                >`<violet-option value="${(o) => o[0]}">${(o) => o[1]}</violet-option>`,
              )}
            </violet-select>
            <violet-select
              label="Role"
              name="role"
              :value="${(x) => x.playRole}"
              ?disabled="${(x) => !x.changeSpecCanExecute}"
              @change="${(x, c) => x.changeRole(fieldValue(c.event))}"
            >
              ${repeat(
                (x) => x.roleChoices,
                html<
                  [string, string]
                >`<violet-option value="${(o) => o[0]}">${(o) => o[1]}</violet-option>`,
              )}
            </violet-select>
          </div>
        `,
      )}
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

  .reason {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .switch {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-xs);
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
 * @fires signup-changed - The server accepted the answer, character, spec, or role; `detail`
 *   is the stored signup.
 * @slot - Extra content between the time and the counts, such as the raid's notes.
 * @csspart card - The surface.
 * @csspart eyebrow - The label above the title.
 * @csspart title - The raid's name.
 * @csspart when - The start time and lock note.
 * @csspart counts - The counts grid.
 * @csspart answer - The member's answer block.
 * @csspart character - The character the answer is for.
 * @csspart reason - Why that character was guessed.
 * @csspart switch - The Switch character, Change spec and Role menus.
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
  /** The spec to play for this raid only; empty plays the character's saved spec. */
  @attr spec = '';
  /** Why this character was picked (`signup-suggest`'s reason), e.g. "your main". */
  @attr reason = '';
  /**
   * A role picked for this raid only (a Fury warrior tanking); empty follows the spec. (Not
   * `role`: that's the host's ARIA role.)
   */
  @attr({ attribute: 'play-role' }) playRole = '';

  /** The member's characters. With them the card offers Switch character and Change spec. */
  @observable characters: SignupCharacter[] = [];
  /** Roles the raid is short of; the menus mark characters and specs that fill one. */
  @observable needed: NeededRole[] = [];
  @observable counts: SignupCounts = EMPTY_COUNTS;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  get statusKey(): SignupStatus | 'none' {
    return isStatus(this.status) ? this.status : 'none';
  }

  @volatile
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
  @volatile
  get answerCanExecute(): boolean {
    return !this.busy && Boolean(this.eventId) && Boolean(this.characterId);
  }

  /** The character answering, when the card has the member's characters. */
  @volatile
  get current(): SignupCharacter | undefined {
    return this.characters.find((c) => c.id === this.characterId);
  }

  /** The spec being played: the one chosen for this raid, else the saved one. */
  @volatile
  get activeSpec(): string {
    return this.spec || this.current?.spec || '';
  }

  /**
   * The role the spec gives, as the server guesses it: the character's saved role for its saved
   * spec (which may be one the member picked), otherwise the spec's own role.
   */
  @volatile
  get specRole(): Role | '' {
    const c = this.current;
    if (!c) return '';
    if (this.activeSpec === c.spec) return c.role;
    return (CLASSES[c.class] as Record<string, Role>)[this.activeSpec] ?? c.role;
  }

  /** The role being played: the one picked for this raid, else the spec's. */
  @volatile
  get activeRole(): Role | '' {
    return isRole(this.playRole) ? this.playRole : this.specRole;
  }

  /** "Aerbark · Feral Druid · Tank", or the `character-label` attribute without characters. */
  @volatile
  get asLabel(): string {
    const c = this.current;
    if (!c) return this.characterLabel;
    return `${c.name} · ${specName(this.activeSpec)} ${titleCase(c.class)} · ${roleLabel(this.activeRole)}`;
  }

  /** Role's [value, label] options: guess from the spec (naming its role), then each role. */
  @volatile
  get roleChoices(): [string, string][] {
    const guessed = this.specRole;
    return [
      ['', guessed ? `Guess from spec (${roleLabel(guessed)})` : 'Guess from spec'],
      ...ROLES.map((r): [string, string] => [r, `${roleLabel(r)}${neededFor(r, this.needed)}`]),
    ];
  }

  /** Switch character's [id, label] options: main first, each marked when the raid needs it. */
  get characterChoices(): [string, string][] {
    return [...this.characters]
      .sort((a, b) => Number(b.isMain) - Number(a.isMain))
      .map((c) => [
        c.id,
        `${c.name} · ${titleCase(c.class)} · ${roleLabel(c.role)}${c.isMain ? ' · main' : ''}${neededFor(c.role, this.needed)}`,
      ]);
  }

  /** Change spec's [spec, label] options for the character's class, each with its role. */
  @volatile
  get specChoices(): [string, string][] {
    const c = this.current;
    if (!c) return [];
    const specs: Record<string, Role> = CLASSES[c.class];
    return Object.entries(specs).map(([spec, role]) => [
      spec,
      `${specName(spec)} · ${roleLabel(role)}${neededFor(role, this.needed)}`,
    ]);
  }

  @volatile
  get switchCharacterCanExecute(): boolean {
    return !this.busy && Boolean(this.eventId) && this.characters.length > 1;
  }

  @volatile
  get changeSpecCanExecute(): boolean {
    return !this.busy && Boolean(this.eventId) && Boolean(this.current);
  }

  /** Whether the member has answered, so a switch changes the stored signup right away. */
  private get answered(): SignupStatus | null {
    return this.statusKey === 'none' ? null : this.statusKey;
  }

  @command('vintage.signup-switch-character', {
    label: 'Switch character',
    description:
      'Bring another of your characters to this raid. Keeps your answer and place in line; a ' +
      'spec chosen for the raid is cleared.',
    category: 'Raids',
    parameters: {
      type: 'object',
      properties: { characterId: { type: 'string' } },
      required: ['characterId'],
    },
  })
  async switchCharacter(characterId: unknown): Promise<ElementResult<unknown>> {
    const next = this.characters.find((c) => c.id === characterId);
    if (!next) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick one of your characters' });
    }
    if (!this.switchCharacterCanExecute) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Nothing to switch to right now' });
    }
    const before = this.choice;
    this.characterId = next.id;
    this.spec = '';
    this.playRole = '';
    this.reason = '';
    return this.resend({ characterId: next.id }, before);
  }

  /** What a refused switch puts back. */
  private get choice(): Choice {
    return {
      characterId: this.characterId,
      spec: this.spec,
      playRole: this.playRole,
      reason: this.reason,
    };
  }

  @command('vintage.signup-change-spec', {
    label: 'Change spec',
    description:
      "Play another spec of this character's class for this raid only; the saved character " +
      'keeps its spec.',
    category: 'Raids',
    parameters: { type: 'object', properties: { spec: { type: 'string' } }, required: ['spec'] },
  })
  async changeSpec(spec: unknown): Promise<ElementResult<unknown>> {
    const c = this.current;
    if (!c || typeof spec !== 'string' || !Object.hasOwn(CLASSES[c.class], spec)) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick one of this class’s specs' });
    }
    if (!this.changeSpecCanExecute) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Already sending an answer' });
    }
    const before = this.choice;
    this.spec = spec;
    return this.resend({ characterId: c.id, spec }, before);
  }

  @command('vintage.signup-change-role', {
    label: 'Change role',
    description:
      'Play another role for this raid only (a Fury warrior tanking), or an empty role to ' +
      'guess it from the spec again. A picked role stays when the spec changes.',
    category: 'Raids',
    parameters: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] },
  })
  async changeRole(role: unknown): Promise<ElementResult<unknown>> {
    const c = this.current;
    if (!c || typeof role !== 'string' || (role !== '' && !isRole(role))) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick a role, or guess from spec' });
    }
    if (!this.changeSpecCanExecute) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Already sending an answer' });
    }
    const before = this.choice;
    this.playRole = role;
    return this.resend({ characterId: c.id, role: isRole(role) ? role : null }, before);
  }

  /**
   * After a switch: unanswered, the choice waits for the answer; answered, `signup-set` stores
   * it now with the same status. A refusal puts the previous choice back.
   */
  private async resend(
    input: { characterId: string; spec?: string; role?: Role | null },
    before: Choice,
  ): Promise<ElementResult<unknown>> {
    const status = this.answered;
    if (!status) return { success: true, data: null };
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('signup-set', { eventId: this.eventId, ...input, status }),
      );
      if (!result.success) Object.assign(this, before);
      this.report(result, status);
      return result;
    } finally {
      this.busy = false;
    }
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
          ...(this.spec ? { spec: this.spec } : {}),
          ...(isRole(this.playRole) ? { role: this.playRole } : {}),
        }),
      );
      this.report(result, status);
      return result;
    } finally {
      this.busy = false;
    }
  }

  private report(result: ElementResult<unknown>, status: SignupStatus): void {
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
