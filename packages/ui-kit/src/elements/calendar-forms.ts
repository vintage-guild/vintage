import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import {
  browserTimeZone,
  dayKey,
  instantFromInputs,
  isTimeZone,
  timeOfDay,
  type WallWeekday,
} from '../zoned';
import {
  CALENDAR_SIZES,
  type CalendarRaid,
  type CalendarRaidSize,
  type CalendarSchedule,
  formatWhen,
  WEEK,
} from './calendar-shared';
import { deskStyles } from './desk-styles';

/** What a form hands the desk: the command to run and its input. */
export interface CalendarFormSubmit {
  command: 'schedule-create' | 'schedule-update' | 'raid-create' | 'raid-reschedule';
  input: Record<string, unknown>;
}

/** A raid runs 30 minutes to 8 hours, as the raids commands take it. */
const okDuration = (m: number) => Number.isInteger(m) && m >= 30 && m <= 480;

/** Every IANA zone the browser knows, for the zone field's suggestions. */
function zoneSuggestions(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

const formStyles = css`
  form {
    display: grid;
    gap: var(--space-md);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
  }

  h3 {
    margin: 0;
    font: var(--font-weight-bold) var(--font-size-lg) var(--font-family-display);
  }

  .grid {
    display: grid;
    gap: var(--space-md);
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  }

  .days {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
  }

  .days label {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: var(--font-weight-regular);
  }

  input,
  select {
    background: var(--color-surface-canvas);
  }
`;

const zoneField = html<VintageScheduleForm | VintageRaidForm>`
  <div class="field">
    <label for="zone">Time zone</label>
    <input
      id="zone"
      list="zones"
      required
      autocomplete="off"
      :value="${(x) => x.zone}"
      @input="${(x, c) => x.set('zone', (c.event.target as HTMLInputElement).value)}"
    />
    <datalist id="zones">
      ${repeat(() => zoneSuggestions(), html<string>`<option value="${(z) => z}"></option>`)}
    </datalist>
    <small>The guild's clock: the raid stays at this local time through daylight saving.</small>
  </div>
`;

const durationField = html<VintageScheduleForm | VintageRaidForm>`
  <div class="field">
        <label for="duration">Length (minutes)</label>
        <input id="duration" type="number" min="30" max="480" step="15" required
          :value="${(x) => String(x.durationMinutes)}"
          @input="${(x, c) => x.set('durationMinutes', Number((c.event.target as HTMLInputElement).value))}" />
      </div>
`;

const scheduleTemplate = html<VintageScheduleForm>`
  <form part="form" @submit="${(x, c) => x.submit(c.event)}" novalidate>
    <h3>${(x) => (x.schedule ? `Edit ${x.schedule.name}` : 'New raid schedule')}</h3>
    <div class="grid">
      <div class="field">
        <label for="name">Name</label>
        <input id="name" maxlength="60" required placeholder="Raid night"
          :value="${(x) => x.name}"
          @input="${(x, c) => x.set('name', (c.event.target as HTMLInputElement).value)}" />
      </div>
      <div class="field">
        <label for="instance">Instance</label>
        <input id="instance" maxlength="60" required placeholder="Onyxia's Lair"
          :value="${(x) => x.instance}"
          @input="${(x, c) => x.set('instance', (c.event.target as HTMLInputElement).value)}" />
      </div>
      <div class="field">
        <label for="size">Size</label>
        <select id="size" :value="${(x) => String(x.size)}"
          @change="${(x, c) => x.set('size', Number((c.event.target as HTMLSelectElement).value))}">
          ${repeat(() => CALENDAR_SIZES, html<number>`<option value="${(n) => n}">${(n) => n}-player</option>`)}
        </select>
      </div>
    </div>

    <fieldset>
      <legend>Raid nights</legend>
      <div class="days">
        ${repeat(
          () => WEEK,
          html<(typeof WEEK)[number], VintageScheduleForm>`
            <label>
              <input type="checkbox"
                :checked="${(w, c) => c.parent.weekdays.includes(w.day)}"
                @change="${(w, c) => c.parent.toggleDay(w.day, (c.event.target as HTMLInputElement).checked)}" />
              ${(w) => w.long}
            </label>
          `,
        )}
      </div>
    </fieldset>

    <div class="grid">
      <div class="field">
        <label for="time">Start time</label>
        <input id="time" type="time" required :value="${(x) => x.time}"
          @input="${(x, c) => x.set('time', (c.event.target as HTMLInputElement).value)}" />
      </div>
      ${zoneField}
      ${durationField}
    </div>

    <fieldset>
      <legend>Signups</legend>
      <div class="grid">
        <div class="field">
          <label for="lead">Post days ahead</label>
          <input id="lead" type="number" min="1" max="28" required :value="${(x) => String(x.leadDays)}"
            @input="${(x, c) => x.set('leadDays', Number((c.event.target as HTMLInputElement).value))}" />
        </div>
        <div class="field">
          <label for="lock">Lock hours before</label>
          <input id="lock" type="number" min="0" max="72" required :value="${(x) => String(x.lockHours)}"
            @input="${(x, c) => x.set('lockHours', Number((c.event.target as HTMLInputElement).value))}" />
        </div>
        <div class="field">
          <label for="reminders">Reminder hours</label>
          <input id="reminders" placeholder="72, 24" :value="${(x) => x.reminders}"
            @input="${(x, c) => x.set('reminders', (c.event.target as HTMLInputElement).value)}" />
        </div>
      </div>
      <small>Random posts the signup that many days ahead, reminds anyone who hasn't answered at each reminder, and locks signups before the pull.</small>
    </fieldset>

    ${when(
      (x) => x.schedule,
      html`<p class="note">Raids already created keep their time. Move those one by one from the agenda.</p>`,
    )}
    <p class="status error" role="alert">${(x) => x.problem}</p>
    <p class="actions">
      <button type="submit" class="primary">${(x) => (x.schedule ? 'Save the schedule' : 'Add the schedule')}</button>
      <button type="button" @click="${(x) => x.$emit('form-cancel')}">Close</button>
    </p>
  </form>
`;

/**
 * Adds or edits a raid schedule. It checks the fields, then raises `form-submit` with
 * `schedule-create`'s input, or `schedule-update`'s with only what changed; `form-cancel` when
 * the officer backs out. The desk runs the command.
 *
 * @tagname vintage-schedule-form
 */
export class VintageScheduleForm extends FASTElement {
  /** The schedule being edited; null adds a new one. */
  @observable schedule: CalendarSchedule | null = null;
  /** The zone a new schedule starts in. */
  @attr({ attribute: 'default-zone' }) defaultZone = '';
  @observable name = '';
  @observable instance = '';
  @observable size: CalendarRaidSize = 40;
  @observable weekdays: WallWeekday[] = [];
  @observable time = '20:00';
  @observable zone = '';
  @observable durationMinutes = 180;
  @observable leadDays = 7;
  @observable lockHours = 2;
  @observable reminders = '72, 24';
  @observable problem = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.scheduleChanged();
  }

  scheduleChanged(): void {
    const s = this.schedule;
    this.name = s?.name ?? '';
    this.instance = s?.instance ?? '';
    this.size = s?.size ?? 40;
    this.weekdays = [...(s?.recurrence.weekdays ?? [])];
    this.time = s?.recurrence.time ?? '20:00';
    this.zone = s?.recurrence.timeZone ?? (this.defaultZone || browserTimeZone());
    this.durationMinutes = s?.durationMinutes ?? 180;
    this.leadDays = s?.timings.leadDays ?? 7;
    this.lockHours = s?.timings.lockHours ?? 2;
    this.reminders = (s?.timings.reminderHours ?? [72, 24]).join(', ');
    this.problem = '';
  }

  set(field: string, value: string | number): void {
    (this as unknown as Record<string, unknown>)[field] = value;
    this.problem = '';
  }

  toggleDay(day: WallWeekday, on: boolean): void {
    const rest = this.weekdays.filter((d) => d !== day);
    this.weekdays = on ? [...rest, day] : rest;
    this.problem = '';
  }

  /** The reminder hours typed, or null when one isn't a whole number from 1 to 336. */
  reminderHours(): number[] | null {
    const parts = this.reminders
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const hours = parts.map(Number);
    if (hours.some((h) => !Number.isInteger(h) || h < 1 || h > 336) || hours.length > 5) {
      return null;
    }
    return [...new Set(hours)].sort((a, b) => b - a);
  }

  /** What's wrong with the fields, in the order they appear, or empty. */
  check(): string {
    if (!this.name.trim()) return 'Give the schedule a name.';
    if (!this.instance.trim()) return 'Say which instance it runs.';
    if (this.weekdays.length === 0) return 'Pick at least one raid night.';
    if (!/^\d{2}:\d{2}$/.test(this.time)) return 'Pick a start time.';
    if (!isTimeZone(this.zone.trim()))
      return 'Use a time zone from the list, like America/New_York.';
    if (!Number.isInteger(this.leadDays) || this.leadDays < 1 || this.leadDays > 28) {
      return 'Post signups between 1 and 28 days ahead.';
    }
    if (!Number.isInteger(this.lockHours) || this.lockHours < 0 || this.lockHours > 72) {
      return 'Lock signups between 0 and 72 hours before.';
    }
    if (!this.reminderHours()) return 'List up to five reminder hours, like 72, 24.';
    return '';
  }

  /** The full input `schedule-create` takes. */
  fields(): Record<string, unknown> {
    const order = WEEK.map((w) => w.day);
    return {
      name: this.name.trim(),
      instance: this.instance.trim(),
      size: this.size,
      weekdays: [...this.weekdays].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      time: this.time,
      timeZone: this.zone.trim(),
      durationMinutes: this.durationMinutes,
      leadDays: this.leadDays,
      lockHours: this.lockHours,
      reminderHours: this.reminderHours() ?? [],
    };
  }

  submit(event: Event): void {
    event.preventDefault();
    this.problem = this.check();
    if (this.problem) return;
    const fields = this.fields();
    const s = this.schedule;
    if (!s) {
      this.$emit('form-submit', { command: 'schedule-create', input: fields });
      return;
    }
    const before: Record<string, unknown> = {
      name: s.name,
      instance: s.instance,
      size: s.size,
      weekdays: WEEK.map((w) => w.day).filter((d) => s.recurrence.weekdays.includes(d)),
      time: s.recurrence.time,
      timeZone: s.recurrence.timeZone,
      durationMinutes: s.durationMinutes,
      leadDays: s.timings.leadDays,
      lockHours: s.timings.lockHours,
      reminderHours: [...s.timings.reminderHours].sort((a, b) => b - a),
    };
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])),
    );
    if (Object.keys(changed).length === 0) {
      this.problem = 'Nothing changed.';
      return;
    }
    this.$emit('form-submit', {
      command: 'schedule-update',
      input: { scheduleId: s.id, ...changed },
    });
  }
}

const raidTemplate = html<VintageRaidForm>`
  <form part="form" @submit="${(x, c) => x.submit(c.event)}" novalidate>
    <h3>${(x) => (x.raid ? `Move ${x.raid.name}` : 'One-off raid')}</h3>
    ${when(
      (x) => x.raid,
      html<VintageRaidForm>`<p class="note">Now ${(x) => (x.raid ? formatWhen(x.raid.startsAt, x.zone) : '')}. Signups and the roster come along.</p>`,
    )}
    ${when(
      (x) => !x.raid,
      html<VintageRaidForm>`
        <div class="grid">
          <div class="field">
            <label for="name">Name</label>
            <input id="name" maxlength="60" required placeholder="Alt run"
              :value="${(x) => x.name}"
              @input="${(x, c) => x.set('name', (c.event.target as HTMLInputElement).value)}" />
          </div>
          <div class="field">
            <label for="instance">Instance</label>
            <input id="instance" maxlength="60" required placeholder="Barrow Deeps"
              :value="${(x) => x.instance}"
              @input="${(x, c) => x.set('instance', (c.event.target as HTMLInputElement).value)}" />
          </div>
          <div class="field">
            <label for="size">Size</label>
            <select id="size" :value="${(x) => String(x.size)}"
              @change="${(x, c) => x.set('size', Number((c.event.target as HTMLSelectElement).value))}">
              ${repeat(() => CALENDAR_SIZES, html<number>`<option value="${(n) => n}">${(n) => n}-player</option>`)}
            </select>
          </div>
        </div>
      `,
    )}
    <div class="grid">
      <div class="field">
        <label for="date">Date</label>
        <input id="date" type="date" required :value="${(x) => x.date}"
          @input="${(x, c) => x.set('date', (c.event.target as HTMLInputElement).value)}" />
      </div>
      <div class="field">
        <label for="time">Start time</label>
        <input id="time" type="time" required :value="${(x) => x.time}"
          @input="${(x, c) => x.set('time', (c.event.target as HTMLInputElement).value)}" />
      </div>
      ${zoneField}
      ${when(
        (x) => !x.raid,
        html<VintageRaidForm>`
          ${durationField}
        `,
      )}
    </div>
    <p class="status error" role="alert">${(x) => x.problem}</p>
    <p class="actions">
      <button type="submit" class="primary">${(x) => (x.raid ? 'Move the raid' : 'Add the raid')}</button>
      <button type="button" @click="${(x) => x.$emit('form-cancel')}">Close</button>
    </p>
  </form>
`;

/**
 * Adds a one-off raid (`raid-create`) or moves one (`raid-reschedule`), reading the date and
 * time in the chosen zone. Raises `form-submit` / `form-cancel` like the schedule form.
 *
 * @tagname vintage-raid-form
 */
export class VintageRaidForm extends FASTElement {
  /** The raid being moved; null adds a one-off. */
  @observable raid: CalendarRaid | null = null;
  @attr({ attribute: 'default-zone' }) defaultZone = '';
  /** The clock, so a time in the past is caught before the server says so (tests pin it). */
  @observable now = Date.now();
  @observable name = '';
  @observable instance = '';
  @observable size: CalendarRaidSize = 40;
  @observable date = '';
  @observable time = '20:00';
  @observable zone = '';
  @observable durationMinutes = 180;
  @observable problem = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.raidChanged();
  }

  raidChanged(): void {
    this.zone = this.defaultZone || browserTimeZone();
    const r = this.raid;
    this.date = r ? dayKey(r.startsAt, this.zone) : '';
    this.time = r ? timeOfDay(r.startsAt, this.zone) : '20:00';
    this.problem = '';
  }

  set(field: string, value: string | number): void {
    (this as unknown as Record<string, unknown>)[field] = value;
    this.problem = '';
  }

  submit(event: Event): void {
    event.preventDefault();
    const zone = this.zone.trim();
    if (!this.raid && !this.name.trim()) {
      this.problem = 'Give the raid a name.';
      return;
    }
    if (!this.raid && !this.instance.trim()) {
      this.problem = 'Say which instance it runs.';
      return;
    }
    if (!isTimeZone(zone)) {
      this.problem = 'Use a time zone from the list, like America/New_York.';
      return;
    }
    if (!this.raid && !okDuration(this.durationMinutes)) {
      this.problem = 'A raid runs 30 to 480 minutes.';
      return;
    }
    const startsAt = instantFromInputs(this.date, this.time, zone);
    if (startsAt === null) {
      this.problem = 'Pick a date and a start time.';
      return;
    }
    if (startsAt <= this.now) {
      this.problem = 'That time has already passed. Pick a future one.';
      return;
    }
    if (this.raid) {
      if (startsAt === this.raid.startsAt) {
        this.problem = 'That is when it already starts.';
        return;
      }
      this.$emit('form-submit', {
        command: 'raid-reschedule',
        input: { eventId: this.raid.id, startsAt },
      });
      return;
    }
    this.$emit('form-submit', {
      command: 'raid-create',
      input: {
        name: this.name.trim(),
        instance: this.instance.trim(),
        size: this.size,
        startsAt,
        durationMinutes: this.durationMinutes,
      },
    });
  }
}

if (!customElements.get('vintage-schedule-form')) {
  await VintageScheduleForm.define({
    name: 'vintage-schedule-form',
    template: scheduleTemplate,
    styles: [deskStyles, formStyles],
  });
}
if (!customElements.get('vintage-raid-form')) {
  await VintageRaidForm.define({
    name: 'vintage-raid-form',
    template: raidTemplate,
    styles: [deskStyles, formStyles],
  });
}
