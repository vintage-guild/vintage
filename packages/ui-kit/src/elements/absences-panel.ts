import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { describeError, type ElementResult, toElementResult } from '../result';

export type AbsenceWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface AbsenceWeeklyNight {
  day: AbsenceWeekday;
  type: 'away' | 'late';
  lateMinutes: 5 | 15 | 30 | null;
}

export interface AbsenceRow {
  id: string;
  kind: 'dates' | 'weekly';
  from: string | null;
  to: string | null;
  nights: AbsenceWeeklyNight[] | null;
  reason: string | null;
}

const WEEKDAYS: readonly [AbsenceWeekday, string][] = [
  ['sun', 'Sunday'],
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
];

const NIGHT_MODES = [
  ['on-time', 'On time'],
  ['late-5', '5m late'],
  ['late-15', '15m late'],
  ['late-30', '30m late'],
  ['away', 'Absent'],
] as const;

type NightMode = (typeof NIGHT_MODES)[number][0];

function formatDateSpan(a: AbsenceRow): string {
  if (a.from && a.to) return a.from === a.to ? a.from : `${a.from} to ${a.to}`;
  return 'Dates';
}

const template = html<VintageAbsencesPanel>`
  <div class="panel" part="panel">
    <section class="block" part="dates" aria-labelledby="abs-dates-heading">
      <h3 id="abs-dates-heading">Absences</h3>
      <form class="date-form" @submit="${(x, c) => x.onDateSubmit(c.event)}">
        <label>
          <span>From</span>
          <input
            type="date"
            .value="${(x) => x.from}"
            ?disabled="${(x) => x.busy}"
            @input="${(x, c) => {
              x.from = (c.event.target as HTMLInputElement).value;
            }}"
            required
          />
        </label>
        <label>
          <span>To (optional)</span>
          <input
            type="date"
            .value="${(x) => x.to}"
            ?disabled="${(x) => x.busy}"
            @input="${(x, c) => {
              x.to = (c.event.target as HTMLInputElement).value;
            }}"
          />
        </label>
        <label class="reason">
          <span>Reason (leaders only)</span>
          <input
            type="text"
            maxlength="200"
            placeholder="Work trip"
            .value="${(x) => x.reason}"
            ?disabled="${(x) => x.busy}"
            @input="${(x, c) => {
              x.reason = (c.event.target as HTMLInputElement).value;
            }}"
          />
        </label>
        <button type="submit" class="btn primary" ?disabled="${(x) => x.busy || !x.from}">
          Save absence
        </button>
      </form>
      ${when(
        (x) => x.dateAbsences.length > 0,
        html<VintageAbsencesPanel>`
          <ul class="list" part="list">
            ${repeat(
              (x) => x.dateAbsences,
              html<AbsenceRow, VintageAbsencesPanel>`
                <li>
                  <span>
                    <b>${(a) => formatDateSpan(a)}</b>
                    ${when((a) => a.reason, html<AbsenceRow>` · ${(a) => a.reason}`)}
                  </span>
                  <button
                    type="button"
                    class="btn"
                    ?disabled="${(_, c) => c.parent.busy}"
                    @click="${(a, c) => c.parent.removeAbsence(a.id)}"
                  >Remove</button>
                </li>
              `,
            )}
          </ul>
        `,
      )}
    </section>

    <section class="block" part="weekly" aria-labelledby="abs-weekly-heading">
      <h3 id="abs-weekly-heading">Weekly nights</h3>
      <div class="weekly-grid">
        ${repeat(
          () => WEEKDAYS,
          html<[AbsenceWeekday, string], VintageAbsencesPanel>`
            <label class="day-row">
              <span>${(d) => d[1]}</span>
              <select
                ?disabled="${(_, c) => c.parent.busy}"
                @change="${(d, c) => c.parent.setDayMode(d[0], (c.event.target as HTMLSelectElement).value as NightMode)}"
              >
                ${repeat(
                  () => NIGHT_MODES,
                  html<[NightMode, string]>`
                    <option
                      value="${(m) => m[0]}"
                      :selected="${(m, c) => (c.parentContext.parent as VintageAbsencesPanel).modeFor(c.parent[0]) === m[0]}"
                    >${(m) => m[1]}</option>
                  `,
                )}
              </select>
            </label>
          `,
        )}
      </div>
      <div class="weekly-actions">
        <button
          type="button"
          class="btn primary"
          ?disabled="${(x) => x.busy}"
          @click="${(x) => x.saveWeekly()}"
        >Save weekly nights</button>
      </div>
    </section>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .panel {
    display: grid;
    gap: var(--space-lg);
    max-inline-size: 38rem;
  }

  .block {
    display: grid;
    gap: var(--space-sm);
  }

  h3 {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-md);
  }

  .date-form {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: end;
  }

  .date-form label {
    display: grid;
    gap: 0.2rem;
    font-size: var(--font-size-sm);
  }

  .date-form label.reason {
    flex: 1 1 12rem;
  }

  input,
  select {
    font: var(--font-size-sm) var(--font-family-sans);
    padding: 0.4rem 0.55rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-xs);
  }

  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    padding: 0.45rem 0.65rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-subtle);
    background: var(--color-surface-raised);
  }

  .weekly-grid {
    display: grid;
    gap: var(--space-xs);
  }

  .day-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    max-inline-size: 20rem;
  }

  .btn {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.45rem 0.8rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--color-accent-secondary);
    color: var(--color-accent-secondary);
  }

  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status:empty {
    display: none;
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }
`;

/**
 * Date-range absences and weekly absent/late raid nights for the signed-in member's profile.
 *
 * @tagname vintage-absences-panel
 * @summary Add or remove date absences and set weekly absent or late raid nights.
 * @fires absences-changed - After an absence is added, removed, or weekly nights are saved.
 * @csspart panel - The outer container.
 * @csspart dates - The date-range absence section.
 * @csspart list - Active date-range absences.
 * @csspart weekly - The weekly nights editor.
 * @csspart status - Status feedback line.
 */
export class VintageAbsencesPanel extends FASTElement {
  @observable absences: AbsenceRow[] = [];
  @observable from = '';
  @observable to = '';
  @observable reason = '';
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  @observable private weeklyModes: Record<AbsenceWeekday, NightMode> = {
    sun: 'on-time',
    mon: 'on-time',
    tue: 'on-time',
    wed: 'on-time',
    thu: 'on-time',
    fri: 'on-time',
    sat: 'on-time',
  };

  get dateAbsences(): AbsenceRow[] {
    return this.absences.filter((a) => a.kind === 'dates');
  }

  absencesChanged(): void {
    const next: Record<AbsenceWeekday, NightMode> = {
      sun: 'on-time',
      mon: 'on-time',
      tue: 'on-time',
      wed: 'on-time',
      thu: 'on-time',
      fri: 'on-time',
      sat: 'on-time',
    };
    const weekly = this.absences.find((a) => a.kind === 'weekly');
    for (const n of weekly?.nights ?? []) {
      next[n.day] = n.type === 'away' ? 'away' : (`late-${n.lateMinutes ?? 15}` as NightMode);
    }
    this.weeklyModes = next;
  }

  modeFor(day: AbsenceWeekday): NightMode {
    return this.weeklyModes[day];
  }

  setDayMode(day: AbsenceWeekday, mode: NightMode): void {
    this.weeklyModes = { ...this.weeklyModes, [day]: mode };
  }

  onDateSubmit(event: Event): void {
    event.preventDefault();
    void this.addAbsence({
      from: this.from,
      ...(this.to ? { to: this.to } : {}),
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    });
  }

  @command('vintage.absence-add', {
    label: 'Add absence',
    description: 'Mark yourself absent for a single day or date range.',
    category: 'Profile',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['from'],
    },
  })
  async addAbsence(input: unknown): Promise<ElementResult<unknown>> {
    const obj = input as { from?: string; to?: string; reason?: string } | null;
    if (!obj?.from) return failure({ code: 'INVALID_PARAMETERS', message: 'Pick a start date' });
    const res = await this.run('absence-add', obj, 'Absence saved');
    if (res.success) {
      this.from = '';
      this.to = '';
      this.reason = '';
    }
    return res;
  }

  @command('vintage.absence-remove', {
    label: 'Remove absence',
    description: 'Remove an active date absence.',
    category: 'Profile',
    parameters: {
      type: 'object',
      properties: { absenceId: { type: 'string' } },
      required: ['absenceId'],
    },
  })
  async removeAbsence(absenceId: unknown): Promise<ElementResult<unknown>> {
    if (typeof absenceId !== 'string' || !absenceId) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Missing absence id' });
    }
    return this.run('absence-remove', { absenceId }, 'Absence removed');
  }

  @command('vintage.absence-weekly-save', {
    label: 'Save weekly nights',
    description: 'Save your weekly absent and late raid nights.',
    category: 'Profile',
    parameters: { type: 'object', properties: {} },
  })
  async saveWeekly(): Promise<ElementResult<unknown>> {
    const nights: AbsenceWeeklyNight[] = [];
    for (const [day] of WEEKDAYS) {
      const mode = this.weeklyModes[day];
      if (mode === 'away') nights.push({ day, type: 'away', lateMinutes: null });
      else if (mode.startsWith('late-')) {
        nights.push({ day, type: 'late', lateMinutes: Number(mode.slice(5)) as 5 | 15 | 30 });
      }
    }
    return this.run(
      'absence-weekly-set',
      { nights },
      nights.length ? 'Weekly nights saved' : 'Weekly nights cleared',
    );
  }

  private async run(
    name: string,
    input: Record<string, unknown>,
    done: string,
  ): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.statusKind = 'error';
        this.statusText = describeError(result);
        return result;
      }
      this.statusKind = 'success';
      this.statusText = done;
      this.$emit('absences-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }
}

if (!customElements.get('vintage-absences-panel')) {
  await VintageAbsencesPanel.define({ name: 'vintage-absences-panel', template, styles });
}
