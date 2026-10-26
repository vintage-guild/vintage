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
import { browserTimeZone, dayKey } from '../zoned';
import { type CalendarRaid, formatClock, isLive, STATUS_LABEL, WEEK } from './calendar-shared';

/** One day of the grid; `key` is empty for the blanks before the 1st and after the last day. */
interface Cell {
  key: string;
  day: number;
  today: boolean;
  raids: Chip[];
  label: string;
}

/** A raid as its day cell shows it. */
interface Chip {
  id: string;
  status: CalendarRaid['status'];
  time: string;
  name: string;
  /** "Cancelled" or "Done" for raids that are history; empty while live. */
  state: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11` → year and 0-based month, or null. */
function parseMonth(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  return month >= 0 && month < 12 ? { year: Number(m[1]), month } : null;
}

/** The month `delta` months from `value`, as `YYYY-MM`. */
export function shiftMonth(value: string, delta: number): string {
  const p = parseMonth(value);
  if (!p) return value;
  const d = new Date(Date.UTC(p.year, p.month + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * Weeks of a month, Sunday first, each raid on the day the viewer's zone puts it. Calendar math
 * is on UTC dates (a date has no zone); only the raids are placed by zone.
 */
export function monthWeeks(
  value: string,
  raids: readonly CalendarRaid[],
  timeZone: string,
  today: string,
): Cell[][] {
  const p = parseMonth(value);
  if (!p) return [];
  const byDay = new Map<string, CalendarRaid[]>();
  for (const r of [...raids].sort((a, b) => a.startsAt - b.startsAt)) {
    const key = dayKey(r.startsAt, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const first = new Date(Date.UTC(p.year, p.month, 1)).getUTCDay();
  const days = new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate();
  const blank = (): Cell => ({ key: '', day: 0, today: false, raids: [], label: '' });
  const cells: Cell[] = Array.from({ length: first }, blank);
  for (let day = 1; day <= days; day++) {
    const key = `${p.year}-${pad(p.month + 1)}-${pad(day)}`;
    const dayRaids = (byDay.get(key) ?? []).map(
      (r): Chip => ({
        id: r.id,
        status: r.status,
        time: formatClock(r.startsAt, timeZone),
        name: r.name,
        state: isLive(r) ? '' : STATUS_LABEL[r.status],
      }),
    );
    const name = new Date(Date.UTC(p.year, p.month, day)).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const count = dayRaids.length;
    cells.push({
      key,
      day,
      today: key === today,
      raids: dayRaids,
      label: `${name}${key === today ? ', today' : ''}, ${count ? `${count} raid${count === 1 ? '' : 's'}` : 'no raids'}`,
    });
  }
  while (cells.length % 7) cells.push(blank());
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

const template = html<VintageRaidMonth>`
  <section class="month" part="month">
    <header class="nav">
      <button
        type="button"
        class="step"
        aria-label="Previous month"
        ?disabled="${(x) => !x.canGo(-1)}"
        @click="${(x) => x.go(-1)}"
      >‹</button>
      <h3 class="title" aria-live="polite">${(x) => x.title}</h3>
      <button
        type="button"
        class="step"
        aria-label="Next month"
        ?disabled="${(x) => !x.canGo(1)}"
        @click="${(x) => x.go(1)}"
      >›</button>
    </header>
    <table @click="${(x, c) => x.pick(c.event)}">
      <caption class="sr">${(x) => `Raids in ${x.title}, times in ${x.zoneName}`}</caption>
      <thead>
        <tr>
          ${repeat(
            () => WEEK,
            html<
              (typeof WEEK)[number]
            >`<th scope="col" abbr="${(w) => w.long}">${(w) => w.short}</th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${repeat(
          (x) => x.weeks,
          html<Cell[], VintageRaidMonth>`
            <tr>
              ${repeat(
                (w) => w,
                html<Cell, Cell[]>`
                  <td
                    class="${(c) => ['day', c.key ? '' : 'blank', c.today ? 'today' : ''].filter(Boolean).join(' ')}"
                    aria-current="${(c) => (c.today ? 'date' : null)}"
                  >
                    ${when(
                      (c) => c.key,
                      html<Cell>`
                        <span class="num" aria-hidden="true">${(c) => c.day}</span>
                        <span class="sr">${(c) => c.label}</span>
                        ${repeat(
                          (c) => c.raids,
                          html<Chip>`
                            <button type="button" class="${(r) => `chip ${r.status}`}" data-raid="${(r) => r.id}">
                              <span class="time">${(r) => r.time}</span>
                              <span class="name">${(r) => r.name}</span>
                              ${when((r) => r.state, html<Chip>`<span class="state">${(r) => r.state}</span>`)}
                            </button>
                          `,
                        )}
                      `,
                    )}
                  </td>
                `,
              )}
            </tr>
          `,
        )}
      </tbody>
    </table>
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    container-type: inline-size;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-block-end: var(--space-sm);
  }

  .title {
    margin: 0;
    flex: 1;
    font: var(--font-weight-bold) var(--font-size-lg) var(--font-family-display);
    text-align: center;
  }

  .step {
    font: var(--font-size-lg) var(--font-family-sans);
    inline-size: 2.25rem;
    block-size: 2.25rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .step:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  table {
    inline-size: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th {
    font: var(--font-weight-medium) var(--font-size-xs) var(--font-family-sans);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding-block: 0.3rem;
  }

  td {
    vertical-align: top;
    block-size: 5.5rem;
    padding: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-default);
  }

  td.blank {
    background: var(--color-surface-sunken);
    opacity: 0.5;
  }

  td.today {
    box-shadow: inset 0 0 0 2px var(--color-accent-secondary);
  }

  .num {
    display: block;
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-mono);
    color: var(--color-text-secondary);
    margin-block-end: 0.2rem;
  }

  td.today .num {
    color: var(--color-accent-secondary);
  }

  .chip {
    display: grid;
    inline-size: 100%;
    gap: 0.05rem;
    margin-block-end: 0.2rem;
    padding: 0.2rem 0.35rem;
    border: 0;
    border-inline-start: 3px solid var(--color-accent-secondary);
    border-radius: 0.25rem;
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    font: var(--font-size-xs) var(--font-family-sans);
    text-align: start;
    cursor: pointer;
    min-inline-size: 0;
  }

  .chip:focus-visible,
  .step:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .chip .time {
    font-family: var(--font-family-mono);
    color: var(--color-text-secondary);
  }

  .chip .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip.locked {
    border-inline-start-color: var(--color-accent-primary);
  }

  .chip.cancelled .name {
    text-decoration: line-through;
  }

  .chip.cancelled,
  .chip.completed {
    border-inline-start-color: var(--color-border-strong);
    opacity: 0.75;
  }

  .state {
    font-weight: var(--font-weight-medium);
  }

  /* Phone width: the day cells keep a dot per raid; the agenda carries the detail. */
  @container (max-width: 32rem) {
    td {
      block-size: 3rem;
      padding: 0.2rem;
    }

    .chip {
      display: inline-block;
      inline-size: 0.6rem;
      block-size: 0.6rem;
      margin: 0.1rem;
      padding: 0;
      border-radius: 50%;
      border: 0;
      background: var(--color-accent-secondary);
    }

    .chip.locked {
      background: var(--color-accent-primary);
    }

    .chip.cancelled,
    .chip.completed {
      background: var(--color-border-strong);
    }

    .chip > span {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

/**
 * A month of raids as a plain table (not an ARIA grid: the raids are ordinary buttons in the tab
 * order, and empty days aren't stops). Each day has a spoken label ("Wednesday, November 4, 2
 * raids"); today is `aria-current="date"`. Choosing a raid raises `raid-selected` with its id.
 * Under 32rem the raids shrink to dots that still name the raid to assistive tech.
 *
 * @tagname vintage-raid-month
 */
export class VintageRaidMonth extends FASTElement {
  /** `YYYY-MM`; the current month in the viewer's zone when empty. */
  @attr month = '';
  /** IANA zone raids are placed and timed in; the browser's when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Earliest and latest months the arrows reach (`YYYY-MM`), so it never shows unloaded months. */
  @attr min = '';
  @attr max = '';
  @observable raids: CalendarRaid[] = [];
  /** The clock, for "today" (tests pin it). */
  @observable now = Date.now();

  get zone(): string {
    return this.timeZone || browserTimeZone();
  }

  @volatile
  get shown(): string {
    return this.month || dayKey(this.now, this.zone).slice(0, 7);
  }

  @volatile
  get title(): string {
    const p = parseMonth(this.shown);
    if (!p) return '';
    return new Date(Date.UTC(p.year, p.month, 1)).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  get zoneName(): string {
    return this.zone.split('/').at(-1)?.replaceAll('_', ' ') ?? this.zone;
  }

  @volatile
  get weeks(): Cell[][] {
    return monthWeeks(this.shown, this.raids, this.zone, dayKey(this.now, this.zone));
  }

  /** A click on a raid's chip raises `raid-selected` with its id. */
  pick(event: Event): void {
    const chip = (event.target as Element | null)?.closest?.('[data-raid]');
    const id = chip?.getAttribute('data-raid');
    if (id) this.$emit('raid-selected', { id });
  }

  canGo(delta: number): boolean {
    const next = shiftMonth(this.shown, delta);
    if (delta < 0 && this.min) return next >= this.min;
    if (delta > 0 && this.max) return next <= this.max;
    return true;
  }

  go(delta: number): void {
    if (!this.canGo(delta)) return;
    this.month = shiftMonth(this.shown, delta);
    this.$emit('month-changed', { month: this.month });
  }
}

if (!customElements.get('vintage-raid-month')) {
  await VintageRaidMonth.define({ name: 'vintage-raid-month', template, styles });
}
