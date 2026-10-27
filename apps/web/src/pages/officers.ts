import {
  css,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import type { CoordinatorAction } from '@vintage/coordinator/contract';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import type { RaidEvent, Schedule, Signup } from '@vintage/raids/contract';
import type { GuildProfile, Recruiting } from '@vintage/site/contract';
import {
  type CalendarRaid,
  type CalendarSchedule,
  type CoordinatorDeskConfig,
  type CoordinatorDeskEntry,
  type CoordinatorDeskRaid,
  getCommandClient,
  type PollsDeskPoll,
  type PollsDeskResults,
  type TonightRaid,
  type TonightSignup,
} from '@vintage/ui-kit';
import { formatMonthDay, formatWeekday, preferredTimeZone } from '../dates';
import { canSignIn, currentSession } from '../session';
import { currentView } from '../view';
import { pageStyles } from './page-styles';

/** How far ahead the raid picker looks. */
const AHEAD_MS = 30 * 86_400_000;

/**
 * The quarters' tabs, by job rather than by module (docs/features/active/role-aware-views).
 * A tab not built yet lists what it will hold and stays disabled until it is.
 */
const TABS = [
  { id: 'tonight', label: 'Tonight', ready: true, hint: '' },
  { id: 'calendar', label: 'Calendar', ready: true, hint: '' },
  { id: 'coordinator', label: 'Random', ready: true, hint: '' },
  { id: 'roster', label: 'Roster', ready: false, hint: 'ranks, sync, recruits on trial' },
  { id: 'guild', label: 'Guild', ready: true, hint: '' },
  { id: 'recruiting', label: 'Recruiting', ready: true, hint: '' },
  { id: 'polls', label: 'Polls', ready: true, hint: '' },
  { id: 'progress', label: 'Progress', ready: false, hint: 'record a kill and its loot' },
] as const;

type Tab = (typeof TABS)[number];
type TabId = Tab['id'];

/** The tab named in `?tab=`, if it is built; Tonight otherwise. */
export function tabFromUrl(search: string): TabId {
  const wanted = new URLSearchParams(search).get('tab');
  return TABS.find((t) => t.id === wanted && t.ready)?.id ?? 'tonight';
}

/** One row of `poll-list`: the poll, its frozen result once closed, and the ballot count. */
type PollRow = Omit<PollsDeskPoll, 'results'> & { results: PollsDeskResults | null };

/** One row of `raid-list`. */
interface RaidRow {
  event: RaidEvent;
  counts?: Record<'accepted' | 'late' | 'tentative' | 'bench' | 'declined', number>;
}

/** How far back and ahead the Calendar tab reads: last month, and the two months after. */
const CALENDAR_BEHIND_MS = 31 * 86_400_000;
const CALENDAR_AHEAD_MS = 62 * 86_400_000;

/** A `raid-list` row as the calendar desk reads it. */
export function calendarRaid({ event, counts }: RaidRow): CalendarRaid {
  return {
    id: event.id,
    scheduleId: event.scheduleId,
    name: event.name,
    instance: event.instance,
    kind: event.kind,
    size: event.size,
    startsAt: event.startsAt,
    durationMinutes: event.durationMinutes,
    status: event.status,
    counts: counts
      ? {
          accepted: counts.accepted,
          late: counts.late,
          tentative: counts.tentative,
          bench: counts.bench,
        }
      : null,
  };
}

/** A `schedule-list` row as the calendar desk reads it. */
export function calendarSchedule(s: Schedule): CalendarSchedule {
  return {
    id: s.id,
    name: s.name,
    instance: s.instance,
    kind: s.kind,
    size: s.size,
    roleTargets: s.roleTargets,
    recurrence: { ...s.recurrence, weekdays: [...s.recurrence.weekdays] },
    durationMinutes: s.durationMinutes,
    timings: { ...s.timings, reminderHours: [...s.timings.reminderHours] },
    active: s.active,
  };
}

/** How far back the Random tab reads its log: the raids of the last week, after they started. */
const LOG_BEHIND_MS = 7 * 86_400_000;

/** `coordinator-status` as the Random tab reads it. */
interface CoordinatorStatus {
  config: CoordinatorDeskConfig;
  upcoming: CoordinatorDeskRaid[];
}

/** A `coordinator-log` row as the Random tab's log reads it. */
export function coordinatorEntry(
  action: CoordinatorAction,
  raidName: string,
): CoordinatorDeskEntry {
  return {
    id: action.id,
    eventId: action.eventId,
    raidName,
    rule: action.rule,
    status: action.status,
    detail: action.detail,
    at: action.finishedAt ?? action.claimedAt,
  };
}

/** The slices of `coordinator-status` and `comp-suggest` Tonight reads. */
interface StatusData {
  upcoming: { eventId: string; waiting: { displayName: string }[] }[];
}
interface CompData {
  gaps: { reason: string }[];
}

const template = html<Page>`
  <div class="page wide">
    <header class="head">
      <span class="eyebrow">Backstage</span>
      <h1>Officers’ quarters</h1>
    </header>

    ${when(
      (x) => !x.allowed,
      html<Page>`
        ${when(
          () => !currentSession(),
          html`
            <vintage-sign-in-card heading="Officers only" ?available="${() => canSignIn()}">
              Sign in with Discord. The quarters open to raid leaders and officers.
            </vintage-sign-in-card>
          `,
        )}
        ${when(
          () => currentSession(),
          html`<p class="lead">This room is for raid leaders and officers. Your rank doesn’t open it; ask an officer if that’s wrong.</p>`,
        )}
      `,
    )}

    ${when(
      (x) => x.allowed,
      html<Page>`
        <nav class="tabs" aria-label="Officers’ quarters">
          ${repeat(
            () => TABS,
            html<Tab>`
              <button
                type="button"
                class="tab"
                aria-current="${(t, c) => (t.id === (c.parent as Page).tab ? 'page' : 'false')}"
                ?disabled="${(t) => !t.ready}"
                title="${(t) => (t.ready ? '' : `Coming: ${t.hint}`)}"
                @click="${(t, c) => (c.parent as Page).select(t.id)}"
              >${(t) => t.label}${(t) => (t.ready ? '' : ' · soon')}</button>
            `,
          )}
        </nav>

        ${when(
          (x) => x.tab === 'polls',
          html<Page>`
            <vintage-polls-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              :polls="${(x) => x.polls}"
              @polls-changed="${(x) => x.loadPolls()}"
            ></vintage-polls-desk>
            ${when(
              (x) => x.pollsError,
              html<Page>`<p class="error" role="alert">${(x) => x.pollsError}</p>`,
            )}
          `,
        )}

        ${when(
          (x) => x.tab === 'calendar',
          html<Page>`
            <vintage-calendar-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-edit="${(x) => x.canLead}"
              ?loading="${(x) => !x.calendarLoaded}"
              error="${(x) => x.calendarError}"
              :raids="${(x) => x.calendarRaids}"
              :schedules="${(x) => x.calendarSchedules}"
              @calendar-changed="${(x) => x.loadCalendar()}"
            ></vintage-calendar-desk>
          `,
        )}

        ${when(
          (x) => x.tab === 'coordinator',
          html<Page>`
            <vintage-coordinator-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-act="${(x) => x.canLead}"
              ?can-configure="${(x) => x.canEditRecruiting}"
              ?loading="${(x) => !x.coordinatorLoaded}"
              error="${(x) => x.coordinatorError}"
              :config="${(x) => x.coordinatorConfig}"
              :upcoming="${(x) => x.coordinatorUpcoming}"
              :entries="${(x) => x.coordinatorEntries}"
              @coordinator-changed="${(x) => x.loadCoordinator()}"
            ></vintage-coordinator-desk>
          `,
        )}

        ${when(
          (x) => x.tab === 'recruiting',
          html<Page>`
            <vintage-recruiting-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-edit="${(x) => x.canEditRecruiting}"
              :recruiting="${(x) => x.recruiting}"
              :error="${(x) => x.recruitingError}"
              @recruiting-changed="${(x) => x.loadRecruiting()}"
            ></vintage-recruiting-desk>
          `,
        )}

        ${when(
          (x) => x.tab === 'guild',
          html<Page>`
            <vintage-guild-profile-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-edit="${(x) => x.canEditRecruiting}"
              :profile="${(x) => x.profile}"
              :error="${(x) => x.profileError}"
              @profile-changed="${(x) => x.loadProfile()}"
            ></vintage-guild-profile-desk>
          `,
        )}

        ${when(
          (x) => x.tab === 'tonight' && x.raids.length > 1,
          html<Page>`
            <label class="picker">
              <span>Raid</span>
              <select @change="${(x, c) => x.pick((c.event.target as HTMLSelectElement).value)}">
                ${repeat(
                  (x) => x.raids,
                  html<
                    RaidRow,
                    Page
                  >`<option value="${(r) => r.event.id}" ?selected="${(r, c) => r.event.id === c.parent.selectedId}">${(r) => raidOption(r.event)}</option>`,
                )}
              </select>
            </label>
          `,
        )}

        ${when(
          (x) => x.tab === 'tonight',
          html<Page>`
            <vintage-tonight
              time-zone="${() => preferredTimeZone() ?? ''}"
              :raid="${(x) => x.raid}"
              :signups="${(x) => x.signups}"
              :gaps="${(x) => x.gaps}"
              :waiting="${(x) => x.waiting}"
              ?loading="${(x) => !x.loaded}"
              @tonight-changed="${(x) => x.load()}"
            ></vintage-tonight>
            ${when(
              (x) => x.loadError,
              html<Page>`<p class="error" role="alert">${(x) => x.loadError}</p>`,
            )}
          `,
        )}
      `,
    )}
  </div>
`;

/**
 * Why a site-module tab (Recruiting, Guild) has nothing to edit. Its read is public, so "not
 * found" can only mean the guild server predates that command: it needs a deploy, not a higher
 * rank.
 */
export function siteReadError(what: string, error?: { code?: string; message?: string }): string {
  if (error?.code === 'COMMAND_NOT_FOUND') {
    return `The guild server doesn’t have the ${what} yet. It needs the latest deploy; until then the site shows the starter text.`;
  }
  return `Couldn’t read the ${what}: ${error?.message ?? 'the server didn’t answer'}. Try again in a moment.`;
}

const raidOption = (e: RaidEvent) =>
  `${formatWeekday(e.startsAt)} ${formatMonthDay(e.startsAt)} · ${e.name} (${e.size})`;

const styles = css`
  .page.wide {
    max-inline-size: 80rem;
  }

  .head {
    display: grid;
    gap: 0.2rem;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-accent-secondary);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    padding-block-end: var(--space-xs);
  }

  .tab {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.45rem 0.8rem;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--color-text-secondary);
  }

  .tab[aria-current='page'] {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    box-shadow: inset 0 -2px 0 var(--color-accent-secondary);
  }

  .tab:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .picker {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .picker select {
    font: var(--font-size-sm) var(--font-family-sans);
    padding: 0.35rem 0.5rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    max-inline-size: 100%;
  }

  .error {
    color: var(--color-text-accent);
  }
`;

/**
 * `/officers`: the officers' quarters, for raid leaders and officers. The view decides whether
 * to show the room; every action inside is a command that checks its own tier, so an under-tier
 * caller who got here would be refused anyway. Tonight reads `raid-list`, `signup-list`,
 * `comp-suggest`, and `coordinator-status`; Polls reads `poll-list` and `poll-results`;
 * Random reads `coordinator-status` and `coordinator-log` and runs the coordinator's leader
 * commands; Recruiting reads `recruiting-get` and saves with `recruiting-set`; Guild reads
 * `guild-profile-get` and saves with `guild-profile-set` (both officers only to save).
 */
export class Page extends FASTElement {
  /** Leaders and officers see the room; everyone else gets the sign-in card or a note. */
  readonly allowed = currentView() === 'officer';
  @observable raids: RaidRow[] = [];
  @observable selectedId = '';
  @observable signups: TonightSignup[] = [];
  @observable gaps: string[] = [];
  @observable waiting: string[] = [];
  @observable loadError = '';
  /** The first load has settled; later re-reads keep showing the last answer. */
  @observable loaded = false;
  /** The open tab, from `?tab=` (Tonight by default). */
  @observable tab: TabId = tabFromUrl(location.search);
  @observable polls: PollsDeskPoll[] = [];
  @observable pollsError = '';
  @observable recruiting: Recruiting | null = null;
  @observable recruitingError = '';
  @observable profile: GuildProfile | null = null;
  @observable profileError = '';
  @observable calendarRaids: CalendarRaid[] = [];
  @observable calendarSchedules: CalendarSchedule[] = [];
  @observable calendarError = '';
  @observable calendarLoaded = false;
  /** Bumped per calendar read, so a slow earlier read never lands over a newer one. */
  private calendarRead = 0;
  @observable coordinatorConfig: CoordinatorDeskConfig | null = null;
  @observable coordinatorUpcoming: CoordinatorDeskRaid[] = [];
  @observable coordinatorEntries: CoordinatorDeskEntry[] = [];
  @observable coordinatorError = '';
  @observable coordinatorLoaded = false;
  /** Bumped per Random read, as the calendar's is. */
  private coordinatorRead = 0;
  /**
   * Every calendar command is leader tier, as are Random's pause, resume, run, and repost; a
   * preview below that reads them without the buttons.
   */
  readonly canLead = tierAllows((currentSession()?.tier ?? 'public') as Tier, 'leader');
  /**
   * `recruiting-set`, `guild-profile-set`, and `coordinator-config-set` are officer tier; raid
   * leaders read the band, the profile, and Random's settings here but can't save them.
   */
  readonly canEditRecruiting = tierAllows((currentSession()?.tier ?? 'public') as Tier, 'officer');

  @volatile
  get raid(): TonightRaid | null {
    const e = this.raids.find((r) => r.event.id === this.selectedId)?.event;
    return e
      ? { id: e.id, name: e.name, startsAt: e.startsAt, size: e.size, status: e.status }
      : null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.allowed) return;
    void this.load();
    if (this.tab === 'polls') void this.loadPolls();
    if (this.tab === 'recruiting') void this.loadRecruiting();
    if (this.tab === 'guild') void this.loadProfile();
    if (this.tab === 'calendar') void this.loadCalendar();
    if (this.tab === 'coordinator') void this.loadCoordinator();
  }

  /** Switch tabs and keep the choice in the address, so `/officers?tab=polls` links work. */
  select(id: TabId): void {
    if (!TABS.some((t) => t.id === id && t.ready) || id === this.tab) return;
    this.tab = id;
    const url = new URL(location.href);
    if (id === 'tonight') url.searchParams.delete('tab');
    else url.searchParams.set('tab', id);
    history.replaceState(history.state, '', url);
    if (id === 'polls') void this.loadPolls();
    if (id === 'recruiting') void this.loadRecruiting();
    if (id === 'guild') void this.loadProfile();
    if (id === 'calendar') void this.loadCalendar();
    if (id === 'coordinator') void this.loadCoordinator();
  }

  /**
   * Every raid from a month back to two months ahead, whatever its status, with signup counts,
   * and every schedule, paused ones included. Each change on the desk reads again; only the
   * latest read is kept.
   */
  async loadCalendar(): Promise<void> {
    const client = getCommandClient();
    const now = Date.now();
    const read = ++this.calendarRead;
    try {
      const [raids, schedules] = await Promise.all([
        client.read<RaidRow[]>('raid-list', {
          from: now - CALENDAR_BEHIND_MS,
          to: now + CALENDAR_AHEAD_MS,
          statuses: ['open', 'locked', 'cancelled', 'completed'],
        }),
        client.read<Schedule[]>('schedule-list', { includeInactive: true }),
      ]);
      if (read !== this.calendarRead) return;
      const failed = !raids.success ? raids : !schedules.success ? schedules : null;
      this.calendarError = failed ? (failed.error?.message ?? 'Could not read the calendar') : '';
      if (raids.success) this.calendarRaids = (raids.data ?? []).map(calendarRaid);
      if (schedules.success) this.calendarSchedules = (schedules.data ?? []).map(calendarSchedule);
    } finally {
      this.calendarLoaded = true;
    }
  }

  /**
   * Random's status and settings from `coordinator-status`, and its log for the upcoming raids
   * and the last week's (a raid leaves `upcoming` once it starts, but its final roster is
   * worth reading after). Only the latest read is kept.
   */
  async loadCoordinator(): Promise<void> {
    const client = getCommandClient();
    const now = Date.now();
    const read = ++this.coordinatorRead;
    try {
      const [status, recent] = await Promise.all([
        client.read<CoordinatorStatus>('coordinator-status', {}),
        client.read<RaidRow[]>('raid-list', {
          from: now - LOG_BEHIND_MS,
          to: now,
          statuses: ['open', 'locked', 'cancelled', 'completed'],
        }),
      ]);
      if (read !== this.coordinatorRead) return;
      if (!status.success || !status.data) {
        this.coordinatorError = `Couldn’t ask Random how it’s doing: ${status.error?.message ?? 'the server didn’t answer'}.`;
        return;
      }
      const raids = new Map<string, string>(status.data.upcoming.map((u) => [u.eventId, u.name]));
      for (const r of recent.success ? (recent.data ?? []) : [])
        raids.set(r.event.id, r.event.name);
      const logs = await Promise.all(
        [...raids].map(async ([eventId, name]) => {
          const log = await client.read<CoordinatorAction[]>('coordinator-log', {
            eventId,
            limit: 50,
          });
          return (log.success ? (log.data ?? []) : []).map((a) => coordinatorEntry(a, name));
        }),
      );
      if (read !== this.coordinatorRead) return;
      this.coordinatorError = '';
      this.coordinatorConfig = status.data.config;
      this.coordinatorUpcoming = status.data.upcoming;
      this.coordinatorEntries = logs.flat();
    } finally {
      if (read === this.coordinatorRead) this.coordinatorLoaded = true;
    }
  }

  /**
   * Every draft, open, and closed poll the caller may see. Closed polls carry their frozen
   * result; open ones get their live tally from `poll-results`, which officers always see and
   * which answers `RESULTS_HIDDEN` to a leader when the poll keeps it back.
   */
  async loadPolls(): Promise<void> {
    const client = getCommandClient();
    const list = await client.read<PollRow[]>('poll-list', {
      statuses: ['draft', 'open', 'closed'],
    });
    if (!list.success) {
      this.pollsError = list.error?.message ?? 'Could not read the polls';
      return;
    }
    this.pollsError = '';
    const rows = list.data ?? [];
    this.polls = await Promise.all(
      rows.map(async (p): Promise<PollsDeskPoll> => {
        if (p.status !== 'open') return p;
        const tally = await client.read<{ results: PollsDeskResults }>('poll-results', {
          pollId: p.id,
        });
        return { ...p, results: tally.success ? (tally.data?.results ?? null) : null };
      }),
    );
  }

  /** The band as it reads now, for the editor. */
  async loadRecruiting(): Promise<void> {
    const result = await getCommandClient().read<Recruiting>('recruiting-get');
    this.recruitingError = result.success ? '' : siteReadError('recruiting band', result.error);
    if (result.success && result.data) this.recruiting = result.data;
  }

  /** The guild profile as it reads now, for the editor. */
  async loadProfile(): Promise<void> {
    const result = await getCommandClient().read<GuildProfile>('guild-profile-get');
    this.profileError = result.success ? '' : siteReadError('guild profile', result.error);
    if (result.success && result.data) this.profile = result.data;
  }

  pick(eventId: string): void {
    this.selectedId = eventId;
    void this.load();
  }

  /** Read the calendar, then tonight's signups, gaps, and non-responders for the picked raid. */
  async load(): Promise<void> {
    try {
      await this.read();
    } finally {
      this.loaded = true;
    }
  }

  private async read(): Promise<void> {
    const client = getCommandClient();
    const list = await client.read<RaidRow[]>('raid-list', { to: Date.now() + AHEAD_MS });
    if (!list.success) {
      this.loadError = list.error?.message ?? 'Could not read the calendar';
      return;
    }
    this.loadError = '';
    this.raids = (list.data ?? []).filter(
      (r) => r.event.status === 'open' || r.event.status === 'locked',
    );
    if (!this.raids.some((r) => r.event.id === this.selectedId)) {
      this.selectedId = this.raids[0]?.event.id ?? '';
    }
    const eventId = this.selectedId;
    if (!eventId) {
      this.signups = [];
      this.gaps = [];
      this.waiting = [];
      return;
    }
    const [signups, comp, status] = await Promise.all([
      client.read<Signup[]>('signup-list', { eventId }),
      client.read<CompData>('comp-suggest', { eventId }),
      client.read<StatusData>('coordinator-status', {}),
    ]);
    this.signups = signups.success ? (signups.data ?? []) : [];
    this.gaps = comp.success ? (comp.data?.gaps ?? []).map((g) => g.reason) : [];
    this.waiting = status.success
      ? (status.data?.upcoming.find((u) => u.eventId === eventId)?.waiting ?? []).map(
          (w) => w.displayName,
        )
      : [];
  }
}

await Page.define({
  name: 'vintage-officers-page',
  template,
  styles: [pageStyles, styles],
});
