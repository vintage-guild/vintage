import {
  attr,
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  Updates,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { EVENT_KINDS, type EventKind, KIND_LABELS, kindNoun } from '@vintage/comp-solver';
import { getCommandClient } from '../client';
import { describeError, type ElementResult, toElementResult } from '../result';
import { browserTimeZone, dayKey } from '../zoned';
import './calendar-forms';
import type { CalendarFormSubmit } from './calendar-forms';
import {
  type CalendarRaid,
  type CalendarSchedule,
  clockShift,
  describeCounts,
  describeRecurrence,
  describeScheduleTimings,
  describeWhat,
  formatClock,
  formatDay,
  formatDuration,
  formatWhen,
  isLive,
  overlapping,
  STATUS_LABEL,
} from './calendar-shared';
import { deskStyles } from './desk-styles';
import './raid-month';

/** One raid as an agenda row reads it, everything worded already. */
export interface AgendaRow {
  raid: CalendarRaid;
  time: string;
  /** The guild's clock when the viewer's differs: "8:00 PM EST for the guild". */
  guildTime: string;
  what: string;
  source: string;
  counts: string;
  warnings: string[];
  status: string;
  canMove: boolean;
  canCancel: boolean;
  canComplete: boolean;
}

/** A day heading in the agenda with its raids. */
export interface AgendaDay {
  key: string;
  label: string;
  rows: AgendaRow[];
}

/** The open form, if any. */
type Editing =
  | { kind: 'schedule'; schedule: CalendarSchedule | null }
  | { kind: 'raid'; raid: CalendarRaid | null };

/** `raid-cancel`'s preview, waiting for the officer to confirm or keep the raid. */
interface Pending {
  raid: CalendarRaid;
  token: string;
  summary: string;
}

/** In an agenda row (a repeat inside a day's repeat), the desk itself. */
const host = (c: ExecutionContext) => c.parentContext.parent as VintageCalendarDesk;

const agendaRow = html<AgendaRow, AgendaDay>`
  <li class="${(r) => `raid ${r.raid.status}`}" id="${(r) => `raid-${r.raid.id}`}" tabindex="-1">
    <div class="when">
      <time datetime="${(r) => new Date(r.raid.startsAt).toISOString()}">${(r) => r.time}</time>
      ${when((r) => r.guildTime, html<AgendaRow>`<small>${(r) => r.guildTime}</small>`)}
    </div>
    <div class="what">
      <strong>${(r) => r.raid.name}</strong>
      <span class="badge ${(r) => r.raid.status}">${(r) => r.status}</span>
      <p class="meta">${(r) => r.what} · ${(r) => r.source}</p>
      ${when((r) => r.counts, html<AgendaRow>`<p class="meta">${(r) => r.counts}</p>`)}
      ${repeat(
        (r) => r.warnings,
        html<string>`<p class="warning"><span aria-hidden="true">⚠ </span>${(w) => w}</p>`,
      )}
    </div>
    ${when(
      (r, c) => host(c).canEdit && (r.canMove || r.canCancel || r.canComplete),
      html<AgendaRow, AgendaDay>`
        <p class="actions">
          ${when(
            (r) => r.canComplete,
            html<
              AgendaRow,
              AgendaDay
            >`<button type="button" ?disabled="${(_, c) => host(c).busy}" @click="${(r, c) => host(c).complete(r.raid.id)}">Mark done</button>`,
          )}
          ${when(
            (r) => r.canMove,
            html<
              AgendaRow,
              AgendaDay
            >`<button type="button" ?disabled="${(_, c) => host(c).busy}" @click="${(r, c) => host(c).openRaid(r.raid)}">Move</button>`,
          )}
          ${when(
            (r) => r.canCancel,
            html<
              AgendaRow,
              AgendaDay
            >`<button type="button" class="danger-outline" ?disabled="${(_, c) => host(c).busy}" @click="${(r, c) => host(c).cancel(r.raid.id)}">Cancel</button>`,
          )}
        </p>
      `,
    )}
  </li>
`;

const agendaDays = (days: (x: VintageCalendarDesk) => AgendaDay[]) => html<VintageCalendarDesk>`
  ${repeat(
    days,
    html<AgendaDay, VintageCalendarDesk>`
      <section class="day" aria-labelledby="${(d) => `day-${d.key}`}">
        <h4 id="${(d) => `day-${d.key}`}"><time datetime="${(d) => d.key}">${(d) => d.label}</time></h4>
        <ul class="raids">
          ${repeat((d) => d.rows, agendaRow)}
        </ul>
      </section>
    `,
  )}
`;

const scheduleCard = html<CalendarSchedule, VintageCalendarDesk>`
  <li class="${(s) => `schedule ${s.active ? '' : 'paused'}`}">
    <div>
      <strong>${(s) => s.name}</strong>
      ${when((s) => !s.active, html`<span class="badge cancelled">Paused</span>`)}
      <p class="meta">${(s) => describeRecurrence(s)} · ${(s) => describeWhat(s)} · ${(s) => formatDuration(s.durationMinutes)}</p>
      <p class="meta">${(s) => describeScheduleTimings(s)}.</p>
    </div>
    ${when(
      (_, c) => c.parent.canEdit,
      html<CalendarSchedule, VintageCalendarDesk>`
        <p class="actions">
          <button type="button" ?disabled="${(_, c) => c.parent.busy}" @click="${(s, c) => c.parent.openSchedule(s)}">Edit</button>
          <button type="button" ?disabled="${(_, c) => c.parent.busy}" @click="${(s, c) => c.parent.setActive(s.id, !s.active)}">${(s) => (s.active ? 'Pause' : 'Resume')}</button>
        </p>
      `,
    )}
  </li>
`;

const template = html<VintageCalendarDesk>`
  <section class="desk wide" part="desk" aria-labelledby="cal-title">
    <header class="top">
      <div>
        <span class="eyebrow">Calendar</span>
        <h2 id="cal-title">${(x) => x.headline}</h2>
        <p class="meta">Times in ${(x) => x.viewerZoneName}. Random creates each schedule's raids as their signups come due${(x) => (x.canEdit ? '; Create raids now does it straight away' : '')}.</p>
      </div>
      ${when(
        (x) => x.canEdit,
        html<VintageCalendarDesk>`
          <p class="actions">
            <button type="button" class="primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.openRaid(null)}">Add a one-off event</button>
            <button type="button" ?disabled="${(x) => x.busy || !x.hasActiveSchedule}" @click="${(x) => x.materialize()}">Create raids now</button>
          </p>
        `,
      )}
    </header>

    ${when((x) => x.error, html<VintageCalendarDesk>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    <p class="${(x) => `status ${x.statusKind}`}" role="status">${(x) => x.statusText}</p>

    ${when(
      (x) => x.pending,
      html<VintageCalendarDesk>`
        <div class="confirm" role="alertdialog" aria-labelledby="cal-confirm" aria-describedby="cal-confirm-detail">
          <p id="cal-confirm"><strong>Cancel ${(x) => x.pending?.raid.name}?</strong></p>
          <p id="cal-confirm-detail">${(x) => x.pending?.summary}</p>
          <p class="actions">
            <button type="button" class="danger" ?disabled="${(x) => x.busy}" @click="${(x) => x.confirm()}">Cancel the ${(x) => kindNoun(x.pending?.raid.kind ?? 'raid')}</button>
            <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.keep()}">Keep it</button>
          </p>
        </div>
      `,
    )}

    ${when(
      (x) => x.editing?.kind === 'raid',
      html<VintageCalendarDesk>`
        <vintage-raid-form
          default-zone="${(x) => x.guildZone}"
          :now="${(x) => x.now}"
          :raid="${(x) => (x.editing?.kind === 'raid' ? x.editing.raid : null)}"
          @form-submit="${(x, c) => x.save((c.event as CustomEvent<CalendarFormSubmit>).detail)}"
          @form-cancel="${(x) => x.closeForm()}"
        ></vintage-raid-form>
      `,
    )}
    ${when(
      (x) => x.editing?.kind === 'schedule',
      html<VintageCalendarDesk>`
        <vintage-schedule-form
          default-zone="${(x) => x.guildZone}"
          :schedule="${(x) => (x.editing?.kind === 'schedule' ? x.editing.schedule : null)}"
          @form-submit="${(x, c) => x.save((c.event as CustomEvent<CalendarFormSubmit>).detail)}"
          @form-cancel="${(x) => x.closeForm()}"
        ></vintage-schedule-form>
      `,
    )}

    <div class="views" role="group" aria-label="Show raids as">
      <button type="button" aria-pressed="${(x) => String(x.view === 'agenda')}" @click="${(x) => x.show('agenda')}">Agenda</button>
      <button type="button" aria-pressed="${(x) => String(x.view === 'month')}" @click="${(x) => x.show('month')}">Month</button>
    </div>

    ${when(
      (x) => x.view === 'month',
      html<VintageCalendarDesk>`
        <vintage-raid-month
          time-zone="${(x) => x.viewerZone}"
          min="${(x) => x.minMonth}"
          max="${(x) => x.maxMonth}"
          :now="${(x) => x.now}"
          :raids="${(x) => x.raids}"
          @raid-selected="${(x, c) => x.reveal((c.event as CustomEvent<{ id: string }>).detail.id)}"
        ></vintage-raid-month>
      `,
    )}

    ${when(
      (x) => x.view === 'agenda',
      html<VintageCalendarDesk>`
        <div class="agenda">
          ${when((x) => x.upcoming.length === 0 && !x.loading, html<VintageCalendarDesk>`<p class="empty">${(x) => x.emptyLine}</p>`)}
          ${when((x) => x.loading, html`<p class="empty">Reading the calendar…</p>`)}
          ${agendaDays((x) => x.upcoming)}
          ${when(
            (x) => x.earlier.length > 0,
            html<VintageCalendarDesk>`
              <details class="earlier">
                <summary>Earlier (${(x) => x.earlierCount})</summary>
                ${agendaDays((x) => x.earlier)}
              </details>
            `,
          )}
        </div>
      `,
    )}

    <section class="schedules" aria-labelledby="sched-title">
      <header class="top">
        <h3 id="sched-title">Schedules</h3>
        ${when(
          (x) => x.canEdit,
          html<VintageCalendarDesk>`<button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.openSchedule(null)}">New schedule</button>`,
        )}
      </header>
      ${when(
        (x) => x.schedules.length === 0 && !x.loading,
        html`<p class="empty">No raid schedules yet. Add one and Random posts signups for each raid night.</p>`,
      )}
      <ul class="list">
        ${repeat((x) => x.schedules, scheduleCard)}
      </ul>
      ${when(
        (x) => !x.canEdit,
        html`<p class="note">Raid leaders and officers change the calendar.</p>`,
      )}
    </section>
  </section>
`;

const styles = css`
  .desk.wide {
    max-inline-size: 60rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-sm) var(--space-md);
  }

  .top > div {
    min-inline-size: 0;
    flex: 1 1 18rem;
  }

  .eyebrow {
    font: var(--font-weight-medium) var(--font-size-xs) var(--font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-secondary);
  }

  h2,
  h3 {
    margin: 0.2rem 0;
    font-family: var(--font-family-display);
    text-wrap: balance;
  }

  h4 {
    margin: 0 0 var(--space-xs);
    font: var(--font-weight-bold) var(--font-size-sm) var(--font-family-sans);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .views {
    display: inline-flex;
    justify-self: start;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .views button {
    border: 0;
    border-radius: 0;
  }

  .views button[aria-pressed='true'] {
    background: var(--color-accent-secondary);
    color: var(--color-surface-canvas);
  }

  .agenda,
  .day {
    display: grid;
    gap: var(--space-md);
  }

  ul.raids,
  ul.list {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .raid,
  .schedule {
    display: grid;
    grid-template-columns: 11rem 1fr auto;
    gap: var(--space-sm) var(--space-md);
    align-items: start;
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-inline-start: 3px solid var(--color-accent-secondary);
    border-radius: 0.4rem;
    background: var(--color-surface-raised);
  }

  .schedule {
    grid-template-columns: 1fr auto;
  }

  .raid:focus {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  .raid.locked {
    border-inline-start-color: var(--color-accent-primary);
  }

  .raid.cancelled,
  .raid.completed,
  .schedule.paused {
    border-inline-start-color: var(--color-border-strong);
  }

  .raid.cancelled strong {
    text-decoration: line-through;
  }

  .when {
    display: grid;
    gap: 0.1rem;
  }

  .when time {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-mono);
    white-space: nowrap;
  }

  .what {
    display: grid;
    gap: 0.2rem;
    min-inline-size: 0;
  }

  .what p {
    margin: 0;
  }

  .badge {
    justify-self: start;
    font: var(--font-weight-medium) var(--font-size-xs) var(--font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-secondary);
  }

  .badge.locked {
    color: var(--color-accent-primary);
  }

  .warning {
    color: var(--color-text-accent);
    font-size: var(--font-size-sm);
  }

  .empty {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .earlier summary {
    cursor: pointer;
    color: var(--color-text-secondary);
    margin-block-end: var(--space-sm);
  }

  .schedules {
    display: grid;
    gap: var(--space-sm);
    padding-block-start: var(--space-md);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .confirm {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-feedback-danger);
    border-radius: 0.5rem;
  }

  .confirm p {
    margin: 0;
  }

  button.danger {
    background: var(--color-feedback-danger);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  button.danger-outline {
    color: var(--color-feedback-danger);
  }

  @media (max-width: 40rem) {
    .raid {
      grid-template-columns: 1fr;
    }
  }
`;

const DAY_MS = 86_400_000;

/**
 * The officers' Calendar tab: the raids coming up as an agenda by day (or a month table), the
 * last two weeks folded away, and the schedules that create them. Leaders and officers add a
 * one-off raid, move or cancel one (cancel previews first, then confirms), mark one done once it
 * has started, add or edit a schedule, pause or resume one, and create its raids now. Each change
 * raises `calendar-changed` so the page reads the calendar again.
 *
 * Times show in the viewer's zone, with the guild's clock alongside when they differ, and a note
 * when a raid lands an hour off from usual because the two zones change clocks on different
 * dates. Overlapping live raids are flagged, not blocked.
 *
 * @tagname vintage-calendar-desk
 */
export class VintageCalendarDesk extends FASTElement {
  /** The viewer's IANA zone; the browser's when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Leaders and officers change the calendar; anyone else reads it. */
  @attr({ attribute: 'can-edit', mode: 'boolean' }) canEdit = false;
  @attr({ mode: 'boolean' }) loading = false;
  /** Why the calendar couldn't be read, from the page. */
  @attr error = '';
  @observable raids: CalendarRaid[] = [];
  @observable schedules: CalendarSchedule[] = [];
  /** The clock (tests pin it). */
  @observable now = Date.now();
  /** `agenda` (the default) or `month`. */
  @attr view: 'agenda' | 'month' = 'agenda';
  @observable editing: Editing | null = null;
  @observable pending: Pending | null = null;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  get viewerZone(): string {
    return this.timeZone || browserTimeZone();
  }

  get viewerZoneName(): string {
    return this.viewerZone.replaceAll('_', ' ');
  }

  /** The guild's clock: the first active schedule's zone, else the viewer's. */
  @volatile
  get guildZone(): string {
    const s = this.schedules.find((x) => x.active) ?? this.schedules[0];
    return s?.recurrence.timeZone ?? this.viewerZone;
  }

  @volatile
  get hasActiveSchedule(): boolean {
    return this.schedules.some((s) => s.active);
  }

  @volatile
  get minMonth(): string {
    return dayKey(this.now - 31 * DAY_MS, this.viewerZone).slice(0, 7);
  }

  @volatile
  get maxMonth(): string {
    return dayKey(this.now + 62 * DAY_MS, this.viewerZone).slice(0, 7);
  }

  /** Raids that haven't ended, by day, soonest first. */
  @volatile
  get upcoming(): AgendaDay[] {
    return this.days(this.raids.filter((r) => this.endOf(r) > this.now));
  }

  /** Raids that have ended, newest day first. */
  @volatile
  get earlier(): AgendaDay[] {
    return this.days(this.raids.filter((r) => this.endOf(r) <= this.now)).reverse();
  }

  @volatile
  get earlierCount(): number {
    return this.raids.filter((r) => this.endOf(r) <= this.now).length;
  }

  @volatile
  get headline(): string {
    const upcoming = this.raids.filter((r) => isLive(r) && this.endOf(r) > this.now);
    const live = upcoming.length;
    if (this.loading && this.raids.length === 0) return 'The calendar';
    // "raids" while what's coming up is all raids; "events" once a dungeon or other event is.
    const noun = upcoming.every((r) => r.kind === 'raid') ? 'raid' : 'event';
    return live === 0
      ? `No ${noun}s coming up`
      : `${live} ${noun}${live === 1 ? '' : 's'} coming up`;
  }

  @volatile
  get emptyLine(): string {
    if (this.schedules.length === 0) {
      return 'Nothing on the calendar. Add a schedule below, or a one-off raid.';
    }
    if (!this.hasActiveSchedule)
      return 'Every schedule is paused. Resume one, or add a one-off raid.';
    return 'No raids coming up yet. Random creates them as their signups come due, or use Create raids now.';
  }

  private endOf(r: CalendarRaid): number {
    return r.startsAt + r.durationMinutes * 60_000;
  }

  private days(raids: CalendarRaid[]): AgendaDay[] {
    const zone = this.viewerZone;
    const byDay = new Map<string, AgendaDay>();
    for (const raid of [...raids].sort((a, b) => a.startsAt - b.startsAt)) {
      const key = dayKey(raid.startsAt, zone);
      const day = byDay.get(key) ?? { key, label: formatDay(raid.startsAt, zone), rows: [] };
      day.rows.push(this.row(raid));
      byDay.set(key, day);
    }
    return [...byDay.values()];
  }

  private row(raid: CalendarRaid): AgendaRow {
    const zone = this.viewerZone;
    const guild = this.guildZone;
    const viewerClock = formatClock(raid.startsAt, zone);
    const guildClock = formatClock(raid.startsAt, guild);
    const guildDay = dayKey(raid.startsAt, guild) !== dayKey(raid.startsAt, zone);
    const schedule = this.schedules.find((s) => s.id === raid.scheduleId);
    const live = isLive(raid);
    const started = raid.startsAt <= this.now;
    const warnings = [
      ...overlapping(raid, this.raids).map(
        (o) => `Overlaps ${o.name} at ${formatClock(o.startsAt, zone)}`,
      ),
    ];
    const shift = live && !started ? clockShift(raid.startsAt, zone, guild) : null;
    if (shift) warnings.push(shift);
    return {
      raid,
      time: viewerClock,
      guildTime:
        guildClock === viewerClock
          ? ''
          : `${guildDay ? formatWhen(raid.startsAt, guild) : guildClock} for the guild`,
      what: `${describeWhat(raid)} · ${formatDuration(raid.durationMinutes)}`,
      source: raid.scheduleId ? (schedule?.name ?? 'Scheduled') : 'One-off',
      counts: describeCounts(raid),
      warnings,
      status: STATUS_LABEL[raid.status],
      canMove: live && !started,
      canCancel: live,
      canComplete: live && started,
    };
  }

  show(view: 'agenda' | 'month'): void {
    this.view = view;
  }

  /** From the month: switch to the agenda and put the raid in view with focus on it. */
  reveal(id: string): void {
    const ended = this.raids.find((r) => r.id === id);
    this.view = 'agenda';
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        if (ended && this.endOf(ended) <= this.now) {
          const details = this.shadowRoot?.querySelector('details.earlier') as HTMLDetailsElement;
          if (details) details.open = true;
        }
        const row = this.shadowRoot?.getElementById(`raid-${id}`);
        row?.scrollIntoView({ block: 'center' });
        row?.focus();
      });
    });
  }

  openRaid(raid: CalendarRaid | null): void {
    this.pending = null;
    this.editing = { kind: 'raid', raid };
  }

  openSchedule(schedule: CalendarSchedule | null): void {
    this.pending = null;
    this.editing = { kind: 'schedule', schedule };
  }

  closeForm(): void {
    this.editing = null;
  }

  /** Run what a form asked for; the form closes when the server agrees. */
  async save(submit: CalendarFormSubmit): Promise<ElementResult<unknown>> {
    const kind = (submit.input.kind as EventKind | undefined) ?? 'raid';
    const done: Record<CalendarFormSubmit['command'], string> = {
      'schedule-create': 'Schedule added. Random creates its raids as their signups come due',
      'schedule-update': 'Schedule saved. Raids already created keep their time',
      'raid-create': `${KIND_LABELS[kind]} added and open for signups`,
      'raid-reschedule': 'Raid moved. Signups and the roster came along',
    };
    const result = await this.change(submit.command, submit.input, done[submit.command]);
    if (result.success) this.editing = null;
    return result;
  }

  @command('vintage.raid-create', {
    label: 'Add a one-off event',
    description:
      'Create a one-off event, open for signups: a raid (10, 20 or 40), a dungeon (5), a ' +
      'battleground (10, 15 or 40), or another event (kind other: size 1 to 40 or null for open, ' +
      'instance optional). raid-create in the command manifest has the full rules.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        instance: { type: 'string', description: 'Required except for kind other' },
        kind: { type: 'string', enum: [...EVENT_KINDS] },
        size: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: 40,
          description: 'Required except for kind other, where null is open',
        },
        roleTargets: {
          type: ['object', 'null'],
          properties: {
            tank: { type: 'integer', minimum: 0 },
            healer: { type: 'integer', minimum: 0 },
            dps: { type: 'integer', minimum: 0 },
          },
          required: ['tank', 'healer', 'dps'],
          description: "Null uses the kind's usual comp",
        },
        startsAt: { type: 'number', description: 'Epoch ms' },
        durationMinutes: { type: 'number' },
      },
      required: ['name', 'startsAt'],
    },
  })
  async createRaid(input: unknown): Promise<ElementResult<unknown>> {
    const kind = (input as { kind?: EventKind } | null)?.kind ?? 'raid';
    return this.change(
      'raid-create',
      input,
      `${KIND_LABELS[kind] ?? 'Raid'} added and open for signups`,
    );
  }

  @command('vintage.raid-reschedule', {
    label: 'Move a raid',
    description: 'Move a raid to a new start time; signups and the roster are kept.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' }, startsAt: { type: 'number' } },
      required: ['eventId', 'startsAt'],
    },
  })
  async reschedule(eventId: unknown, startsAt: unknown): Promise<ElementResult<unknown>> {
    if (typeof eventId !== 'string' || typeof startsAt !== 'number') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a raid and a start time' });
    }
    return this.change('raid-reschedule', { eventId, startsAt }, 'Raid moved');
  }

  @command('vintage.raid-complete', {
    label: 'Mark a raid done',
    description: 'Mark a raid that has started as done; records attendance.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
    },
  })
  async complete(eventId: unknown): Promise<ElementResult<unknown>> {
    if (typeof eventId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a raid to mark done' });
    }
    const name = this.raids.find((r) => r.id === eventId)?.name ?? 'The raid';
    return this.change('raid-complete', { eventId }, `${name} is done; attendance recorded`);
  }

  @command('vintage.raid-cancel', {
    label: 'Cancel a raid',
    description: 'Preview cancelling a raid; confirm to cancel it. Signups stay for history.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
    },
  })
  async cancel(eventId: unknown): Promise<ElementResult<unknown>> {
    if (typeof eventId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a raid to cancel' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const raid = this.raids.find((r) => r.id === eventId);
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: { signups?: number };
        confirmToken?: string;
      }>('raid-cancel', { eventId });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (!token || !raid) {
        this.say('success', `${KIND_LABELS[raid?.kind ?? 'raid']} cancelled`);
        this.$emit('calendar-changed');
        return result;
      }
      const signups = (raw.success ? raw.data?.preview?.signups : undefined) ?? 0;
      this.editing = null;
      this.pending = {
        raid,
        token,
        summary:
          `${formatWhen(raid.startsAt, this.viewerZone)}. ` +
          (signups
            ? `${signups} ${signups === 1 ? 'person has' : 'people have'} signed up; their answers stay for history.`
            : 'Nobody has signed up yet.') +
          ` A cancelled ${kindNoun(raid.kind)} can’t be reopened.`,
      };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
      // The question takes focus once its buttons are enabled, so a keyboard or screen reader
      // user lands on it.
      if (this.pending) {
        Updates.enqueue(() =>
          this.shadowRoot?.querySelector<HTMLButtonElement>('.confirm button.danger')?.focus(),
        );
      }
    }
  }

  /** Run the confirmed cancel with the preview's token. */
  async confirm(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'Nothing waiting' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'raid-cancel',
          { eventId: pending.raid.id },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', `Cancelled ${pending.raid.name}`);
      this.$emit('calendar-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  keep(): void {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      this.say('idle', `Kept ${pending.raid.name}`);
      this.reveal(pending.raid.id);
    }
  }

  @command('vintage.schedule-materialize', {
    label: 'Create raids from schedules',
    description:
      "Create the raids each active schedule needs over its signup window now, instead of waiting for Random's next pass.",
    category: 'Officers',
  })
  async materialize(): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run<{ created: unknown[] }>('schedule-materialize', {}),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const created = (result.data as { created?: unknown[] } | undefined)?.created?.length ?? 0;
      this.say(
        'success',
        created
          ? `Created ${created} raid${created === 1 ? '' : 's'}`
          : 'Every raid inside the signup windows already exists',
      );
      this.$emit('calendar-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  @command('vintage.schedule-active', {
    label: 'Pause or resume a schedule',
    description: 'Pause a schedule (it creates no new raids) or resume it.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { scheduleId: { type: 'string' }, active: { type: 'boolean' } },
      required: ['scheduleId', 'active'],
    },
  })
  async setActive(scheduleId: unknown, active: unknown): Promise<ElementResult<unknown>> {
    if (typeof scheduleId !== 'string' || typeof active !== 'boolean') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a schedule and on or off' });
    }
    const name = this.schedules.find((s) => s.id === scheduleId)?.name ?? 'The schedule';
    return this.change(
      'schedule-update',
      { scheduleId, active },
      active ? `${name} resumed` : `${name} paused; raids already created stay`,
    );
  }

  private async change(name: string, input: unknown, done: string) {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', done);
      this.$emit('calendar-changed');
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

if (!customElements.get('vintage-calendar-desk')) {
  await VintageCalendarDesk.define({
    name: 'vintage-calendar-desk',
    template,
    styles: [deskStyles, styles],
  });
}
