import {
  attr,
  css,
  FASTElement,
  html,
  observable,
  repeat,
  Updates,
  when,
} from '@lushly-dev/fast-element';
import {
  AKind,
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  hasSplitDpsTargets,
  instanceOptional,
  KIND_LABELS,
  KIND_SIZES,
  kindNoun,
  MAX_EVENT_SIZE,
  type RoleTargets,
  sizeFits,
  sizeLabel,
  sizesText,
  totalRoleTargets,
} from '@vintage/comp-solver';
import {
  browserTimeZone,
  dayKey,
  instantFromInputs,
  isTimeZone,
  timeOfDay,
  type WallWeekday,
} from '../zoned';
import {
  type CalendarRaid,
  type CalendarRaidAccess,
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

/** The longest notes the raids commands take (RAID_NOTES_MAX). */
const NOTES_MAX = 500;

/** Notes as the commands store them: trimmed, and an empty box is none (null). */
const cleanNotes = (notes: string): string | null => notes.trim() || null;

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
    border-radius: var(--desk-control-radius);
    background: var(--color-surface-raised);
  }

  h3 {
    margin: 0;
    font: var(--font-weight-bold) var(--font-size-md) var(--font-family-display);
  }

  .grid {
    display: grid;
    gap: var(--space-sm);
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    align-items: start;
  }

  /* Kind, size, and the three counts fit one row: the counts are two-digit numbers. */
  .grid.comp {
    grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  }

  .days {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
  }

  .days label,
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-weight: var(--font-weight-regular);
  }

  .toggle {
    margin-top: var(--space-xs);
  }

  input,
  select,
  textarea {
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

const REQUIRED_COUNT_FIELDS = [
  ['tanks', 'Tanks'],
  ['healers', 'Healers'],
] as const;

const SPLIT_COUNT_FIELDS = [
  ['melee', 'Melee'],
  ['ranged', 'Ranged'],
] as const;

/**
 * Kind and size, then the tank, healer, melee, and ranged counts. Tanks and healers start at the
 * kind's usual comp for the size; melee and ranged stay blank until set, so legacy DPS-only
 * targets and kind defaults keep DPS combined (#323).
 */
const kindFields = html<KindedForm>`
  <div class="field">
    <label for="kind">Kind</label>
    <select id="kind" :value="${(x) => x.kind}"
      @change="${(x, c) => x.setKind((c.event.target as HTMLSelectElement).value as EventKind)}">
      ${repeat(
        () => EVENT_KINDS,
        html<EventKind>`<option value="${(k) => k}">${(k) => KIND_LABELS[k]}</option>`,
      )}
    </select>
  </div>
  <div class="field">
    <label for="size">Size</label>
    ${when(
      (x) => x.kind !== 'other',
      html<KindedForm>`
        <select id="size" :value="${(x) => String(x.size)}"
          @change="${(x, c) => x.setSize(Number((c.event.target as HTMLSelectElement).value))}">
          ${repeat(
            (x) => x.sizeChoices(),
            html<number>`<option value="${(n) => n}">${(n) => n}-player</option>`,
          )}
        </select>
      `,
    )}
    ${when(
      (x) => x.kind === 'other',
      html<KindedForm>`
        <input id="size" type="number" min="1" max="${MAX_EVENT_SIZE}" step="1"
          placeholder="Open"
          :value="${(x) => (x.size === null ? '' : String(x.size))}"
          @input="${(x, c) => x.setSize(sizeFromInput((c.event.target as HTMLInputElement).value))}" />
        <small>Leave it empty for an open event: no cap, no queue.</small>
      `,
    )}
  </div>
  ${repeat(
    () => REQUIRED_COUNT_FIELDS,
    html<(typeof REQUIRED_COUNT_FIELDS)[number], KindedForm>`
      <div class="field">
        <label for="${(f) => f[0]}">${(f) => f[1]}</label>
        <input id="${(f) => f[0]}" type="number" min="0" max="${MAX_EVENT_SIZE}" step="1" required
          :value="${(f, c) => String(c.parent[f[0]])}"
          @input="${(f, c) => c.parent.setCount(f[0], Number((c.event.target as HTMLInputElement).value))}" />
      </div>
    `,
  )}
  ${repeat(
    () => SPLIT_COUNT_FIELDS,
    html<(typeof SPLIT_COUNT_FIELDS)[number], KindedForm>`
      <div class="field">
        <label for="${(f) => f[0]}">${(f) => f[1]}</label>
        <input id="${(f) => f[0]}" type="number" min="0" max="${MAX_EVENT_SIZE}" step="1"
          placeholder="Any"
          :value="${(f, c) => (c.parent[f[0]] === null ? '' : String(c.parent[f[0]]))}"
          @input="${(f, c) => c.parent.setSplitCount(f[0], countFromInput((c.event.target as HTMLInputElement).value))}" />
      </div>
    `,
  )}
`;

/** The size box: empty is an open event (null), anything else a number to check. */
const sizeFromInput = (value: string): number | null => (value.trim() ? Number(value) : null);

/** Optional melee/ranged box: empty means unsplit / leave to the rest (null). */
const countFromInput = (value: string): number | null => (value.trim() ? Number(value) : null);

const countsNote = html<KindedForm>`
  <small class="counts-note">${(x) => x.countsNote()}</small>
`;

const accessField = html<KindedForm>`
  <label class="toggle">
    <input id="access" type="checkbox"
      :checked="${(x) => x.access === 'open'}"
      @change="${(x, c) => x.setAccess((c.event.target as HTMLInputElement).checked)}" />
    Open to pugs <small>(Friends and Members can sign up)</small>
  </label>
`;

/**
 * What both forms share: the event's kind, its size, its tank/healer/melee/ranged counts, and
 * whether pugs can sign up. Commands keep "null means the kind's default", so the counts go out
 * as roleTargets only when they differ from that default.
 */
export abstract class KindedForm extends FASTElement {
  @observable kind: EventKind = 'raid';
  @observable size: CalendarRaidSize = 40;
  @observable access: CalendarRaidAccess = 'guild';
  @observable tanks = 0;
  @observable healers = 0;
  /** Blank (null) until split targets are set, so legacy DPS-only targets stay combined. */
  @observable melee: number | null = null;
  @observable ranged: number | null = null;
  /** True once the officer typed a count; then kind and size changes leave the counts alone. */
  @observable countsTouched = false;
  /** Preserves a loaded legacy combined-DPS target until the officer edits counts or size. */
  private legacyDps: number | null = null;

  kindChanged(): void {
    this.syncSelects();
  }

  sizeChanged(): void {
    this.syncSelects();
  }

  /**
   * Point the kind and size pickers at the form's values once their options exist. A select's
   * value binding runs before `repeat` adds the options, so on first open the browser showed its
   * first option (a 10-player raid) while the form held 40.
   */
  protected syncSelects(): void {
    Updates.enqueue(() => {
      const pick = (id: string, value: string) => {
        const select = this.shadowRoot?.querySelector<HTMLSelectElement>(`select#${id}`);
        if (select && select.value !== value) select.value = value;
      };
      pick('kind', this.kind);
      pick('size', String(this.size));
    });
  }

  /** The sizes the size picker offers for the kind (`other` types one instead). */
  sizeChoices(): readonly number[] {
    return this.kind === 'other' ? [] : KIND_SIZES[this.kind];
  }

  /** Kind, access, size, and counts from a stored event or schedule, or the defaults for a new one. */
  loadKind(
    from: {
      kind: EventKind;
      access?: CalendarRaidAccess;
      size: number | null;
      roleTargets?: RoleTargets | null;
    } | null,
  ): void {
    this.kind = from?.kind ?? 'raid';
    this.access = from?.access ?? 'guild';
    this.size = from ? from.size : 40;
    const saved = from?.roleTargets ?? null;
    const targets = saved ?? defaultRoleTargets(this.kind, this.size);
    this.tanks = targets.tank;
    this.healers = targets.healer;
    if (saved && hasSplitDpsTargets(saved)) {
      this.melee = saved.melee;
      this.ranged = saved.ranged;
      this.legacyDps = null;
    } else {
      this.melee = null;
      this.ranged = null;
      this.legacyDps = saved ? saved.dps : null;
    }
    this.countsTouched = !!saved;
    this.syncSelects();
  }

  setKind(kind: EventKind): void {
    this.kind = kind;
    // Keep the size when the new kind allows it; otherwise its first (a dungeon is 5). Every
    // size fits `other`, including none.
    if (!sizeFits(kind, this.size)) {
      this.size = kind === 'other' ? this.size : KIND_SIZES[kind][0]!;
    }
    this.legacyDps = null;
    this.refillCounts();
    this.changed();
  }

  setSize(size: number | null): void {
    this.size = size;
    this.legacyDps = null;
    this.refillCounts();
    this.changed();
  }

  setAccess(open: boolean): void {
    this.access = open ? 'open' : 'guild';
    this.changed();
  }

  setCount(field: 'tanks' | 'healers', value: number): void {
    this[field] = value;
    this.legacyDps = null;
    this.countsTouched = true;
    this.changed();
  }

  setSplitCount(field: 'melee' | 'ranged', value: number | null): void {
    this[field] = value;
    this.legacyDps = null;
    this.countsTouched = true;
    this.changed();
  }

  /** "Usual for a 5-player dungeon", "Set by hand", or optional for `other`. */
  countsNote(): string {
    if (this.countsTouched) return 'Counts set by hand; they stay when the kind or size changes.';
    if (this.kind === 'other') {
      return 'Optional: leave them at 0 and the card lists everyone in one column.';
    }
    return `The usual comp for a ${sizeLabel(this.kind, this.size)}.`;
  }

  private refillCounts(): void {
    if (this.countsTouched || !sizeFits(this.kind, this.size)) return;
    const targets = defaultRoleTargets(this.kind, this.size);
    this.tanks = targets.tank;
    this.healers = targets.healer;
    this.melee = null;
    this.ranged = null;
  }

  /** "Instance", or a free-text "where or what" for `other`, where it's optional. */
  instanceLabel(): string {
    return instanceOptional(this.kind) ? 'Where or what (optional)' : 'Instance';
  }

  /** Called after any kind/size/count/access change, to clear the form's problem line. */
  protected abstract changed(): void;

  /** What's wrong with kind, size, or counts, or empty. */
  kindProblem(): string {
    if (!sizeFits(this.kind, this.size)) {
      return this.kind === 'other'
        ? `An event is 1 to ${MAX_EVENT_SIZE} players, or leave the size empty for an open one.`
        : `${AKind(this.kind)} is ${sizesText(this.kind)} players.`;
    }
    const required = [this.tanks, this.healers];
    const optional = [this.melee, this.ranged].filter((n): n is number => n !== null);
    if ([...required, ...optional].some((n) => !Number.isInteger(n) || n < 0)) {
      return 'Tank, healer, melee, and ranged counts are whole numbers, 0 or more.';
    }
    if (this.size !== null) {
      const total =
        this.melee !== null || this.ranged !== null
          ? this.tanks + this.healers + (this.melee ?? 0) + (this.ranged ?? 0)
          : this.tanks + this.healers + (this.legacyDps ?? 0);
      if (total > this.size) {
        return `The counts add up to more than ${this.size} players.`;
      }
    }
    return '';
  }

  /** The counts as roleTargets, or null when they are the kind's default (the command's null). */
  roleTargets(): RoleTargets | null {
    const usual = defaultRoleTargets(this.kind, this.size);
    if (this.melee !== null || this.ranged !== null) {
      const rest = this.size === null ? 0 : Math.max(0, this.size - this.tanks - this.healers);
      const melee = this.melee ?? Math.max(0, rest - (this.ranged ?? 0));
      const ranged = this.ranged ?? Math.max(0, rest - melee);
      const typed: RoleTargets = { tank: this.tanks, healer: this.healers, melee, ranged };
      return totalRoleTargets(typed) === 0 && totalRoleTargets(usual) === 0 ? null : typed;
    }
    if (!this.countsTouched) return null;
    const dps =
      this.legacyDps !== null
        ? this.legacyDps
        : this.size === null
          ? 0
          : Math.max(0, this.size - this.tanks - this.healers);
    const typed: RoleTargets = { tank: this.tanks, healer: this.healers, dps };
    return JSON.stringify(typed) === JSON.stringify(usual) ? null : typed;
  }
}

/** The notes box both forms share: what to bring and when to be on. */
const notesField = (hint: string) => html<VintageScheduleForm | VintageRaidForm>`
  <div class="field">
    <label for="notes">Notes (optional)</label>
    <textarea id="notes" rows="3" maxlength="${NOTES_MAX}"
      placeholder="Fire resist and flasks. On at 7:45 for buffs."
      :value="${(x) => x.notes}"
      @input="${(x, c) => x.set('notes', (c.event.target as HTMLTextAreaElement).value)}"></textarea>
    <small>${hint}</small>
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
        <label for="instance">${(x) => x.instanceLabel()}</label>
        <input id="instance" maxlength="60" ?required="${(x) => !instanceOptional(x.kind)}"
          placeholder="${(x) => (instanceOptional(x.kind) ? 'Westfall, levels 10–20' : "Onyxia's Lair")}"
          :value="${(x) => x.instance}"
          @input="${(x, c) => x.set('instance', (c.event.target as HTMLInputElement).value)}" />
      </div>
    </div>

    <fieldset>
      <legend>Kind and comp</legend>
      <div class="grid comp">${kindFields}</div>
      ${countsNote}
      ${accessField}
    </fieldset>

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

    ${notesField('Each new raid copies these; change one raid from the agenda. A blank line starts a new paragraph.')}

    ${when(
      (x) => x.schedule,
      html`<p class="note">Raids already created keep their time and notes. Edit those one by one from the agenda.</p>`,
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
export class VintageScheduleForm extends KindedForm {
  /** The schedule being edited; null adds a new one. */
  @observable schedule: CalendarSchedule | null = null;
  /** The zone a new schedule starts in. */
  @attr({ attribute: 'default-zone' }) defaultZone = '';
  @observable name = '';
  @observable instance = '';
  @observable weekdays: WallWeekday[] = [];
  @observable time = '20:00';
  @observable zone = '';
  @observable durationMinutes = 180;
  @observable leadDays = 7;
  @observable lockHours = 2;
  @observable reminders = '72, 24';
  @observable notes = '';
  @observable problem = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.scheduleChanged();
  }

  scheduleChanged(): void {
    const s = this.schedule;
    this.name = s?.name ?? '';
    this.instance = s?.instance ?? '';
    this.loadKind(s);
    this.weekdays = [...(s?.recurrence.weekdays ?? [])];
    this.time = s?.recurrence.time ?? '20:00';
    this.zone = s?.recurrence.timeZone ?? (this.defaultZone || browserTimeZone());
    this.durationMinutes = s?.durationMinutes ?? 180;
    this.leadDays = s?.timings.leadDays ?? 7;
    this.lockHours = s?.timings.lockHours ?? 2;
    this.reminders = (s?.timings.reminderHours ?? [72, 24]).join(', ');
    this.notes = s?.notes ?? '';
    this.problem = '';
  }

  set(field: string, value: string | number): void {
    (this as unknown as Record<string, unknown>)[field] = value;
    this.problem = '';
  }

  protected changed(): void {
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
    if (!this.instance.trim() && !instanceOptional(this.kind)) return 'Say which instance it runs.';
    const kindProblem = this.kindProblem();
    if (kindProblem) return kindProblem;
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
      kind: this.kind,
      access: this.access,
      size: this.size,
      roleTargets: this.roleTargets(),
      weekdays: [...this.weekdays].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
      time: this.time,
      timeZone: this.zone.trim(),
      durationMinutes: this.durationMinutes,
      leadDays: this.leadDays,
      lockHours: this.lockHours,
      reminderHours: this.reminderHours() ?? [],
      notes: cleanNotes(this.notes),
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
      kind: s.kind,
      access: s.access ?? 'guild',
      size: s.size,
      roleTargets: s.roleTargets,
      weekdays: WEEK.map((w) => w.day).filter((d) => s.recurrence.weekdays.includes(d)),
      time: s.recurrence.time,
      timeZone: s.recurrence.timeZone,
      durationMinutes: s.durationMinutes,
      leadDays: s.timings.leadDays,
      lockHours: s.timings.lockHours,
      reminderHours: [...s.timings.reminderHours].sort((a, b) => b - a),
      notes: s.notes ?? null,
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
    <h3>${(x) => (x.raid ? `Edit ${x.raid.name}` : 'One-off event')}</h3>
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
            <label for="instance">${(x) => x.instanceLabel()}</label>
            <input id="instance" maxlength="60" ?required="${(x) => !instanceOptional(x.kind)}"
              placeholder="${(x) => (instanceOptional(x.kind) ? 'Westfall, levels 10–20' : 'Barrow Deeps')}"
              :value="${(x) => x.instance}"
              @input="${(x, c) => x.set('instance', (c.event.target as HTMLInputElement).value)}" />
          </div>
        </div>
        <fieldset>
          <legend>Kind and comp</legend>
          <div class="grid comp">${kindFields}</div>
          ${countsNote}
          ${accessField}
        </fieldset>
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
    ${notesField('Members see these on the signup card and in Discord. A blank line starts a new paragraph.')}
    <p class="status error" role="alert">${(x) => x.problem}</p>
    <p class="actions">
      <button type="submit" class="primary">${(x) => (x.raid ? `Save the ${kindNoun(x.raid.kind)}` : `Add the ${kindNoun(x.kind)}`)}</button>
      <button type="button" @click="${(x) => x.$emit('form-cancel')}">Close</button>
    </p>
  </form>
`;

/**
 * Adds a one-off raid (`raid-create`) or edits one (`raid-reschedule` with its new time, notes,
 * or both: only what changed), reading the date and time in the chosen zone. Raises `form-submit` / `form-cancel` like the schedule form.
 *
 * @tagname vintage-raid-form
 */
export class VintageRaidForm extends KindedForm {
  /** The raid being edited; null adds a one-off. */
  @observable raid: CalendarRaid | null = null;
  @attr({ attribute: 'default-zone' }) defaultZone = '';
  /** The clock, so a time in the past is caught before the server says so (tests pin it). */
  @observable now = Date.now();
  @observable name = '';
  @observable instance = '';
  @observable date = '';
  @observable time = '20:00';
  @observable zone = '';
  @observable durationMinutes = 180;
  @observable notes = '';
  @observable problem = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.loadKind(null);
    this.raidChanged();
  }

  protected changed(): void {
    this.problem = '';
  }

  raidChanged(): void {
    this.zone = this.defaultZone || browserTimeZone();
    const r = this.raid;
    // A new one-off starts empty: the desk reuses this element between opens.
    if (!r) {
      this.name = '';
      this.instance = '';
      this.durationMinutes = 180;
      this.loadKind(null);
    }
    this.notes = r?.notes ?? '';
    this.date = r ? dayKey(r.startsAt, this.zone) : '';
    this.time = r ? timeOfDay(r.startsAt, this.zone) : '20:00';
    this.problem = '';
  }

  set(field: string, value: string | number): void {
    (this as unknown as Record<string, unknown>)[field] = value;
    this.problem = '';
  }

  /** What's wrong with the fields only a new one-off has (name, instance, kind, length), or empty. */
  oneOffProblem(): string {
    if (!this.name.trim()) return `Give the ${kindNoun(this.kind)} a name.`;
    if (!this.instance.trim() && !instanceOptional(this.kind)) return 'Say which instance it runs.';
    const kindProblem = this.kindProblem();
    if (kindProblem) return kindProblem;
    if (!okDuration(this.durationMinutes)) return `${AKind(this.kind)} runs 30 to 480 minutes.`;
    return '';
  }

  submit(event: Event): void {
    event.preventDefault();
    const zone = this.zone.trim();
    this.problem = this.raid ? '' : this.oneOffProblem();
    if (this.problem) return;
    if (!isTimeZone(zone)) {
      this.problem = 'Use a time zone from the list, like America/New_York.';
      return;
    }
    const startsAt = instantFromInputs(this.date, this.time, zone);
    if (startsAt === null) {
      this.problem = 'Pick a date and a start time.';
      return;
    }
    const moved = !this.raid || startsAt !== this.raid.startsAt;
    if (moved && startsAt <= this.now) {
      this.problem = 'That time has already passed. Pick a future one.';
      return;
    }
    const notes = cleanNotes(this.notes);
    if (this.raid) {
      const changed = {
        ...(moved ? { startsAt } : {}),
        ...(notes === this.raid.notes ? {} : { notes }),
      };
      if (Object.keys(changed).length === 0) {
        this.problem = 'Nothing changed.';
        return;
      }
      this.$emit('form-submit', {
        command: 'raid-reschedule',
        input: { eventId: this.raid.id, ...changed },
      });
      return;
    }
    this.$emit('form-submit', {
      command: 'raid-create',
      input: {
        name: this.name.trim(),
        instance: this.instance.trim(),
        kind: this.kind,
        access: this.access,
        size: this.size,
        roleTargets: this.roleTargets(),
        startsAt,
        durationMinutes: this.durationMinutes,
        notes,
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
