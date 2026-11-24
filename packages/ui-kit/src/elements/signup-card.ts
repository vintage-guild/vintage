import {
  attr,
  css,
  FASTElement,
  html,
  nullableNumberConverter,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { SIGNUP_STATUSES, type SignupStatus } from '@vintage/comp-solver';
import {
  CLASSES,
  classRoles,
  cleanAlsoRoles,
  ROLES,
  type Role,
  type WowClass,
} from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { isRole, roleLabel, titleCase } from '../labels';
import '../primitives';
import { describeError, type ElementResult, toElementResult } from '../result';

export { SIGNUP_STATUSES, type SignupStatus };

/** Minutes late a member can pick when answering Late (more than 30 is Absent). */
export const LATE_MINUTES = [5, 15, 30] as const;
export type LateMinutes = (typeof LATE_MINUTES)[number];

const isLateMinutes = (value: unknown): value is LateMinutes =>
  typeof value === 'number' && (LATE_MINUTES as readonly number[]).includes(value);

/** A character the member can bring (a row of `character-list`). */
export interface SignupCharacter {
  id: string;
  name: string;
  class: WowClass;
  spec: string;
  role: Role;
  isMain: boolean;
  /** Other roles the character can flex to (from `character-list`). */
  alsoRoles?: Role[];
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
  alsoRoles: Role[];
  alsoRolesTouched: boolean;
}

type FieldElement = HTMLElement & { value: string };
const fieldValue = (event: Event) => (event.currentTarget as FieldElement).value;

/** How a member can answer from the card (including Standby). */
export const ANSWERS = [
  'accepted',
  'late',
  'tentative',
  'bench',
  'declined',
] as const satisfies readonly SignupStatus[];
export type Answer = (typeof ANSWERS)[number];

/** Flex Raiders on guild raids start on Standby rather than Going. */
const FLEX_ANSWERS: readonly Answer[] = ['bench', 'late', 'tentative', 'declined'];

export const ANSWER_LABELS: Record<Answer, string> = {
  accepted: 'Going',
  late: 'Late',
  tentative: 'Tentative',
  bench: 'Standby',
  declined: 'Absent',
};

const STATUS_LABELS: Record<SignupStatus | 'none', string> = {
  accepted: 'Going',
  late: 'Coming late',
  tentative: 'Tentative',
  bench: 'Standby',
  declined: 'Absent',
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

/** Optional extra values when answering through `answer(...)`. */
export interface AnswerOptions {
  /** Required when status is `late` (`5`, `15`, or `30`). Pass `null` to clear on `accepted`. */
  lateMinutes?: LateMinutes | null;
  /** Optional reason for `tentative` only (max 200 chars). */
  note?: string | null;
}

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
      ${when(
        (x) => x.coverageLine,
        html<VintageSignupCard>`
          <div class="coverage" part="coverage">
            <p>${(x) => x.coverageLine}</p>
            ${when(
              (x) => x.showOnTimeButton,
              html<VintageSignupCard>`
                <button
                  type="button"
                  class="chip"
                  ?disabled="${(x) => !x.answerCanExecute}"
                  @click="${(x) => x.markOnTime()}"
                >On time this week</button>
              `,
            )}
          </div>
        `,
      )}
      <div class="row">
        <div class="seg" role="group" aria-label="Your answer">
          ${repeat(
            (x) => x.visibleAnswers,
            html<Answer, VintageSignupCard>`
              <button
                type="button"
                class="${(a) => a}"
                aria-pressed="${(a, c) => String(c.parent.statusKey === a)}"
                ?disabled="${(_, c) => !c.parent.answerCanExecute}"
                @click="${(a, c) => c.parent.pickAnswer(a)}"
              >${(a, c) => c.parent.answerButtonLabel(a)}</button>
            `,
          )}
        </div>
        ${when(
          (x) => x.asLabel,
          html<VintageSignupCard>`<span class="as">as <b part="character">${(x) => x.asLabel}</b></span>`,
        )}
      </div>
      ${when(
        (x) => x.picking === 'late',
        html<VintageSignupCard>`
          <div class="subrow late-picker" part="late-picker" role="group" aria-label="How late?">
            <span class="sublabel">How late?</span>
            <div class="chips">
              ${repeat(
                () => LATE_MINUTES,
                html<LateMinutes, VintageSignupCard>`
                  <button
                    type="button"
                    class="chip ${(m, c) => (c.parent.weeklyLateMinutes === m ? 'usual' : '')}"
                    aria-pressed="${(m, c) => String(c.parent.statusKey === 'late' && c.parent.lateMinutes === m)}"
                    ?disabled="${(_, c) => !c.parent.answerCanExecute}"
                    @click="${(m, c) => c.parent.answer('late', { lateMinutes: m })}"
                  >${(m, c) => (c.parent.weeklyLateMinutes === m ? `${m} min (usual)` : `${m} min`)}</button>
                `,
              )}
              <button type="button" class="link" @click="${(x) => x.cancelPick()}">Cancel</button>
            </div>
            <small class="hint">Later than 30 minutes? Pick Absent instead.</small>
          </div>
        `,
      )}
      ${when(
        (x) => x.picking === 'tentative',
        html<VintageSignupCard>`
          <form class="subrow tentative-picker" part="tentative-picker" @submit="${(x, c) => x.submitTentative(c.event)}">
            <label class="sublabel" for="tentative-note">Tentative reason (optional)</label>
            <div class="chips">
              <input
                id="tentative-note"
                type="text"
                maxlength="200"
                placeholder="e.g. depends on work"
                :value="${(x) => x.draftNote}"
                @input="${(x, c) => x.setDraftNote((c.event.target as HTMLInputElement).value)}"
              />
              <button type="submit" class="chip primary" ?disabled="${(x) => !x.answerCanExecute}">
                Save Tentative
              </button>
              <button type="button" class="link" @click="${(x) => x.cancelPick()}">Cancel</button>
            </div>
          </form>
        `,
      )}
      ${when(
        (x) => x.statusKey === 'tentative' && x.note && x.picking !== 'tentative',
        html<VintageSignupCard>`<p class="reason" part="note">Reason: ${(x) => x.note}</p>`,
      )}
      ${when(
        (x) => x.standbyLine,
        html<VintageSignupCard>`<p class="standby" part="standby">${(x) => x.standbyLine}</p>`,
      )}
      ${when(
        (x) => x.flexStandbyOnly && !x.standbyLine,
        html<VintageSignupCard>`<p class="reason" part="flex-note">Flex Raiders start on Standby for guild raids; leaders seat you where the comp needs you.</p>`,
      )}
      ${when(
        (x) => x.queueLine,
        html<VintageSignupCard>`<p class="queue" part="queue">${(x) => x.queueLine}</p>`,
      )}
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
              placeholder="${(x) => x.roleChoices[0]?.[1] ?? 'Guess from spec'}"
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
      ${when(
        (x) => x.otherRoleChoices.length > 0,
        html<VintageSignupCard>`
          <div class="also-roles" part="also-roles" role="group" aria-label="Can also play">
            <span class="sublabel">Can also play</span>
            <div class="chips">
              ${repeat(
                (x) => x.otherRoleChoices,
                html<Role, VintageSignupCard>`
                  <label class="role-toggle">
                    <input
                      type="checkbox"
                      :checked="${(r, c) => c.parent.effectiveAlsoRoles.includes(r)}"
                      ?disabled="${(_, c) => !c.parent.changeSpecCanExecute}"
                      @change="${(r, c) => c.parent.toggleAlsoRole(r, (c.event.target as HTMLInputElement).checked)}"
                    />
                    ${(r) => roleLabel(r)}
                  </label>
                `,
              )}
            </div>
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
    box-shadow: var(--shadow-raised);
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

  .counts .queued b,
  .counts .bench b {
    color: var(--color-signup-bench);
  }

  .answer {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-canvas);
    box-shadow: var(--shadow-edge);
  }

  .coverage {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: 0.25rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .coverage p {
    margin: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  .seg {
    display: inline-flex;
    flex-wrap: wrap;
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

  .seg button.bench[aria-pressed='true'] {
    background: var(--color-signup-bench);
    color: var(--color-accent-contrast);
  }

  .seg button.declined[aria-pressed='true'] {
    background: var(--color-feedback-danger);
    color: var(--color-accent-contrast);
  }

  .seg button:focus-visible,
  .chip:focus-visible,
  .link:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: calc(-1 * var(--border-width-thick));
  }

  .subrow {
    display: grid;
    gap: 0.35rem;
    padding: var(--space-xs) var(--space-sm);
    border-radius: 0.25rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
  }

  .sublabel {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  .chips input[type='text'] {
    flex: 1 1 12rem;
    min-inline-size: 0;
    padding: 0.4rem 0.6rem;
    font: var(--font-weight-regular) var(--font-size-sm) var(--font-family-sans);
    color: var(--color-text-primary);
    background: var(--color-surface-canvas);
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
  }

  .chip {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.35rem 0.7rem;
    border-radius: 0.25rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-canvas);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .chip.usual,
  .chip.primary,
  .chip[aria-pressed='true'] {
    background: var(--color-accent-primary);
    border-color: var(--color-accent-primary);
    color: var(--color-accent-contrast);
  }

  .chip:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .link {
    font: var(--font-weight-regular) var(--font-size-xs) var(--font-family-sans);
    padding: 0.25rem 0.4rem;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: underline;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .also-roles {
    display: grid;
    gap: 0.25rem;
  }

  .role-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .as b {
    color: var(--color-text-primary);
  }

  .queue,
  .standby {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-accent);
    text-wrap: pretty;
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
 * member's character; the server applies the lock, Standby, and tier rules and answers with
 * the stored signup.
 *
 * @tagname vintage-signup-card
 * @summary A raid's signups and the member's answer, backed by `signup-set`.
 * @fires signup-changed - The server accepted the answer, character, spec, role, or flex roles;
 *   `detail` is the stored signup.
 * @slot - Extra content between the time and the counts, such as the raid's notes.
 * @csspart card - The surface.
 * @csspart eyebrow - The label above the title.
 * @csspart title - The raid's name.
 * @csspart when - The start time and lock note.
 * @csspart counts - The counts grid.
 * @csspart answer - The member's answer block.
 * @csspart coverage - Active absence or weekly-late coverage banner.
 * @csspart late-picker - Inline 5 / 15 / 30 minute late picker.
 * @csspart tentative-picker - Inline optional Tentative reason form.
 * @csspart standby - Private explanation of why the member is on Standby.
 * @csspart character - The character the answer is for.
 * @csspart queue - Where the member is in line when the raid is full.
 * @csspart reason - Why that character was guessed.
 * @csspart switch - The Switch character, Change spec and Role menus.
 * @csspart also-roles - Can also play flex-role toggles for hybrid classes.
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
  /** Shown after the time, e.g. "signups lock Sat 6:00 PM". */
  @attr({ attribute: 'lock-label' }) lockLabel = '';
  /**
   * The member's place in line when they're going but the raid is full (`signup-list`'s
   * `queuePosition`, 1 is next); 0 when they aren't queued.
   */
  @attr({ attribute: 'queue-position', converter: nullableNumberConverter }) queuePosition:
    | number
    | null = null;
  /** The member's current signup status, or `none`. */
  @attr status = 'none';
  /** Minutes late (5, 15, or 30) on the member's current signup, or null. */
  @attr({ attribute: 'late-minutes', converter: nullableNumberConverter }) lateMinutes:
    | number
    | null = null;
  /** The member's Tentative reason note, if any. */
  @attr note = '';
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
  /** Roster state of the member's signup (`pending`, `rostered`, `benched`, or empty). */
  @attr({ attribute: 'roster-state' }) rosterState = '';
  /** True when the member is a Flex Raider on a guild raid (starts on Standby). */
  @attr({ attribute: 'flex-standby-only', mode: 'boolean' }) flexStandbyOnly = false;
  /** True once a raid leader has approved the party roster. */
  @attr({ attribute: 'roster-approved', mode: 'boolean' }) rosterApproved = false;
  /** Custom private Standby explanation; overrides the derived message when set. */
  @attr({ attribute: 'standby-reason' }) standbyReason = '';
  /** Active absence coverage for this raid: `away`, `late`, or empty. */
  @attr({ attribute: 'absence-coverage' }) absenceCoverage = '';
  /** Reason on the active `away` absence covering this raid, if any. */
  @attr({ attribute: 'absence-reason' }) absenceReason = '';
  /** Minutes late from a weekly late rule covering this raid (`5`, `15`, or `30`), or null. */
  @attr({ attribute: 'weekly-late-minutes', converter: nullableNumberConverter })
  weeklyLateMinutes: number | null = null;

  /** The member's characters. With them the card offers Switch character and Change spec. */
  @observable characters: SignupCharacter[] = [];
  /** Other roles the member can flex to for this raid (`signup.alsoRoles`). */
  @observable alsoRoles: Role[] = [];
  /** Roles the raid is short of; the menus mark characters and specs that fill one. */
  @observable needed: NeededRole[] = [];
  @observable counts: SignupCounts = EMPTY_COUNTS;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  /** Which inline sub-picker is currently open (`late` or `tentative`), or null. */
  @observable picking: 'late' | 'tentative' | null = null;
  @observable draftNote = '';
  private alsoRolesTouched = false;

  /** Buttons shown in the segmented answer bar. */
  @volatile
  get visibleAnswers(): readonly Answer[] {
    return this.flexStandbyOnly ? FLEX_ANSWERS : ANSWERS;
  }

  /** Button label, showing minutes on Late when the member is currently Late. */
  answerButtonLabel(a: Answer): string {
    if (a === 'late' && this.statusKey === 'late' && isLateMinutes(this.lateMinutes)) {
      return `Late (${this.lateMinutes}m)`;
    }
    return ANSWER_LABELS[a];
  }

  /** Private explanation when the member is on Standby, or empty. */
  @volatile
  get standbyLine(): string {
    if (this.standbyReason) return this.standbyReason;
    if (this.statusKey !== 'bench' && this.rosterState !== 'benched') return '';
    if (this.flexStandbyOnly) {
      return 'You’re on Standby because Flex Raiders start on Standby for guild raids; leaders seat you where the comp needs you.';
    }
    if (this.rosterApproved) {
      return 'You’re on Standby because parties are already approved; leaders will seat you if a spot opens.';
    }
    return 'You’re on Standby; leaders will seat you if a spot opens.';
  }

  /** Banner describing active absence or weekly-late coverage for this raid, or empty. */
  @volatile
  get coverageLine(): string {
    if (this.absenceCoverage === 'away') {
      const why = this.absenceReason ? `: ${this.absenceReason}` : '';
      return `Covered by your absence${why}. Answer below if your plans changed.`;
    }
    if (
      (this.absenceCoverage === 'late' || isLateMinutes(this.weeklyLateMinutes)) &&
      isLateMinutes(this.weeklyLateMinutes)
    ) {
      if (this.statusKey === 'late') {
        return `Marked ${this.lateMinutes ?? this.weeklyLateMinutes} min late from your weekly rule.`;
      }
      if (this.statusKey === 'none') {
        return `Your weekly rule marks you ${this.weeklyLateMinutes} min late for this night.`;
      }
    }
    return '';
  }

  /** Show "On time this week" when covered by a weekly late rule and not already marked Going. */
  @volatile
  get showOnTimeButton(): boolean {
    return (
      !this.flexStandbyOnly &&
      isLateMinutes(this.weeklyLateMinutes) &&
      this.absenceCoverage !== 'away' &&
      (this.statusKey === 'late' || this.statusKey === 'none')
    );
  }

  /** "You're next in line…", or how many are ahead; empty when not queued. */
  @volatile
  get queueLine(): string {
    const position = this.queuePosition ?? 0;
    if (position < 1) return '';
    const place =
      position === 1 ? 'You’re next in line' : `You’re in line with ${position - 1} ahead of you`;
    return `The raid is full. ${place}; Vintage tells you when a spot opens.`;
  }

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
   * states (late, tentative, standby, queued) only when someone is in them.
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
    if (c.bench) rows.push(['Standby', c.bench, 'bench']);
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

  /** Other roles the active character's class can play, excluding its active role. */
  @volatile
  get otherRoleChoices(): Role[] {
    const c = this.current;
    if (!c || !this.activeRole) return [];
    return classRoles(c.class).filter((r) => r !== this.activeRole);
  }

  /** Active `alsoRoles`, falling back to the character's defaults when unanswered. */
  @volatile
  get effectiveAlsoRoles(): Role[] {
    const c = this.current;
    if (!c || !this.activeRole) return [];
    const source =
      this.alsoRolesTouched || this.answered !== null ? this.alsoRoles : (c.alsoRoles ?? []);
    return cleanAlsoRoles(c.class, this.activeRole, source).alsoRoles;
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

  /** Handle a button press in the answer bar: Late and Tentative open inline pickers. */
  pickAnswer(answer: Answer): void {
    if (answer === 'late') {
      this.picking = this.picking === 'late' ? null : 'late';
      return;
    }
    if (answer === 'tentative') {
      this.draftNote = this.note;
      this.picking = this.picking === 'tentative' ? null : 'tentative';
      return;
    }
    this.picking = null;
    void this.answer(answer);
  }

  cancelPick(): void {
    this.picking = null;
  }

  setDraftNote(value: string): void {
    this.draftNote = value;
  }

  submitTentative(event: Event): void {
    event.preventDefault();
    const cleaned = this.draftNote.trim();
    void this.answer('tentative', { note: cleaned || null });
  }

  /** Override a weekly late rule for this raid night. */
  markOnTime(): Promise<ElementResult<unknown>> {
    this.picking = null;
    return this.answer('accepted', { lateMinutes: null });
  }

  toggleAlsoRole(role: Role, checked: boolean): void {
    const current = this.effectiveAlsoRoles;
    const next = checked ? [...current, role] : current.filter((r) => r !== role);
    void this.changeAlsoRoles(next);
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
    this.alsoRoles = [...(next.alsoRoles ?? [])];
    this.alsoRolesTouched = false;
    return this.resend({ characterId: next.id }, before);
  }

  /** What a refused switch puts back. */
  private get choice(): Choice {
    return {
      characterId: this.characterId,
      spec: this.spec,
      playRole: this.playRole,
      reason: this.reason,
      alsoRoles: [...this.alsoRoles],
      alsoRolesTouched: this.alsoRolesTouched,
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

  @command('vintage.signup-change-also-roles', {
    label: 'Can also play',
    description: 'Set other roles your character can flex to for this raid only.',
    category: 'Raids',
    parameters: {
      type: 'object',
      properties: { roles: { type: 'array', items: { type: 'string' } } },
      required: ['roles'],
    },
  })
  async changeAlsoRoles(roles: unknown): Promise<ElementResult<unknown>> {
    const c = this.current;
    const mainRole = this.activeRole;
    if (!c || !mainRole || !Array.isArray(roles) || roles.some((r) => !isRole(r))) {
      return failure({
        code: 'INVALID_PARAMETERS',
        message: 'Pick roles your class can flex to',
      });
    }
    const cleaned = cleanAlsoRoles(c.class, mainRole, roles as Role[]);
    if (cleaned.rejected.length > 0) {
      return failure({
        code: 'INVALID_PARAMETERS',
        message: `${titleCase(c.class)} cannot play ${cleaned.rejected.map(roleLabel).join(', ')}`,
      });
    }
    if (!this.changeSpecCanExecute) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Already sending an answer' });
    }
    const before = this.choice;
    this.alsoRoles = cleaned.alsoRoles;
    this.alsoRolesTouched = true;
    return this.resend({ characterId: c.id, alsoRoles: cleaned.alsoRoles }, before);
  }

  /**
   * After a switch: unanswered, the choice waits for the answer; answered, `signup-set` stores
   * it now with the same status. A refusal puts the previous choice back.
   */
  private async resend(
    input: { characterId: string; spec?: string; role?: Role | null; alsoRoles?: Role[] },
    before: Choice,
  ): Promise<ElementResult<unknown>> {
    const status = this.answered;
    if (!status) return { success: true, data: null };
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('signup-set', {
          eventId: this.eventId,
          ...input,
          status,
          ...(status === 'late' && isLateMinutes(this.lateMinutes)
            ? { lateMinutes: this.lateMinutes }
            : {}),
        }),
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
      'Sign up for the raid, or change your answer: accepted, late (with 5, 15, or 30 minutes), ' +
      'tentative (optional note), bench (Standby), or declined (Absent).',
    category: 'Raids',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...ANSWERS] },
        lateMinutes: { type: 'number', enum: [...LATE_MINUTES] },
        note: { type: 'string' },
      },
      required: ['status'],
    },
  })
  async answer(statusOrInput: unknown, options?: AnswerOptions): Promise<ElementResult<unknown>> {
    const req = parseAnswerRequest(statusOrInput, options);
    if (!isAnswer(req.status)) {
      return failure({
        code: 'INVALID_PARAMETERS',
        message: `Answer with one of ${ANSWERS.join(', ')}`,
      });
    }
    const status = req.status;
    const lateMinutes = this.resolveLateInput(status, req.lateMinutes);
    if (status === 'late' && lateMinutes === undefined) {
      return failure({
        code: 'INVALID_PARAMETERS',
        message: 'Pick how late you will be: 5, 15, or 30 minutes',
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
      const payload = this.buildAnswerInput(status, lateMinutes, req.note);
      const result = toElementResult(await getCommandClient().run('signup-set', payload));
      this.report(result, status, lateMinutes ?? null, status === 'tentative' ? req.note : null);
      return result;
    } finally {
      this.busy = false;
    }
  }

  private buildAnswerInput(
    status: Answer,
    lateMinutes: LateMinutes | null | undefined,
    note: string | null | undefined,
  ): Record<string, unknown> {
    return {
      eventId: this.eventId,
      characterId: this.characterId,
      status,
      ...(lateMinutes !== undefined ? { lateMinutes } : {}),
      ...(status === 'tentative' && note !== undefined ? { note } : {}),
      ...(this.spec ? { spec: this.spec } : {}),
      ...(isRole(this.playRole) ? { role: this.playRole } : {}),
      ...(this.alsoRolesTouched ? { alsoRoles: this.effectiveAlsoRoles } : {}),
    };
  }

  private resolveLateInput(
    status: Answer,
    given: LateMinutes | null | undefined,
  ): LateMinutes | null | undefined {
    if (status === 'late') {
      if (isLateMinutes(given)) return given;
      if (this.statusKey === 'late' && isLateMinutes(this.lateMinutes)) return this.lateMinutes;
      return undefined;
    }
    return given === null ? null : undefined;
  }

  private report(
    result: ElementResult<unknown>,
    status: SignupStatus,
    sentLate?: LateMinutes | null,
    sentNote?: string | null,
  ): void {
    if (!result.success) {
      this.statusKind = 'error';
      this.statusText = describeError(result);
      return;
    }
    const storedStatus = this.applyStoredSignup(result.data, status, sentLate, sentNote);
    this.picking = null;
    this.alsoRolesTouched = false;
    this.statusKind = 'success';
    this.statusText = String(result.metadata?.reasoning ?? STATUS_LABELS[storedStatus]);
    this.$emit('signup-changed', result.data);
  }

  private applyStoredSignup(
    raw: unknown,
    fallbackStatus: SignupStatus,
    sentLate?: LateMinutes | null,
    sentNote?: string | null,
  ): SignupStatus {
    const data = (raw && typeof raw === 'object' ? raw : null) as StoredSignupPayload | null;
    const next = data?.status && isStatus(data.status) ? data.status : fallbackStatus;
    this.status = next;
    this.lateMinutes = resolvedLate(data, next, sentLate);
    this.note = resolvedNote(data, next, sentNote);
    if (Array.isArray(data?.alsoRoles)) this.alsoRoles = data.alsoRoles;
    if (typeof data?.roster === 'string') this.rosterState = data.roster;
    return next;
  }
}

interface StoredSignupPayload {
  status?: SignupStatus;
  lateMinutes?: number | null;
  note?: string | null;
  alsoRoles?: Role[];
  roster?: string;
}

function parseAnswerRequest(
  statusOrInput: unknown,
  options?: AnswerOptions,
): { status?: unknown } & AnswerOptions {
  if (statusOrInput && typeof statusOrInput === 'object') {
    return statusOrInput as { status?: unknown } & AnswerOptions;
  }
  return { status: statusOrInput, ...options };
}

function resolvedLate(
  data: StoredSignupPayload | null,
  status: SignupStatus,
  sentLate?: LateMinutes | null,
): number | null {
  if (data && 'lateMinutes' in data) return data.lateMinutes ?? null;
  return status === 'late' && isLateMinutes(sentLate) ? sentLate : null;
}

function resolvedNote(
  data: StoredSignupPayload | null,
  status: SignupStatus,
  sentNote?: string | null,
): string {
  if (data && 'note' in data) return data.note ?? '';
  return status === 'tentative' && sentNote !== undefined ? (sentNote ?? '') : '';
}

if (!customElements.get('vintage-signup-card')) {
  await VintageSignupCard.define({ name: 'vintage-signup-card', template, styles });
}
