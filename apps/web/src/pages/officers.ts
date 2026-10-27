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
import type { Progress } from '@vintage/progress/contract';
import type { RaidEvent, Schedule, Signup } from '@vintage/raids/contract';
import type { GuildProfile, Recruiting } from '@vintage/site/contract';
import {
  type AgentPanelContext,
  type ApplicationsDeskRow,
  type CalendarRaid,
  type CalendarSchedule,
  type CoordinatorDeskConfig,
  type CoordinatorDeskEntry,
  type CoordinatorDeskRaid,
  getCommandClient,
  type PollsDeskPoll,
  type PollsDeskResults,
  type RosterDeskMember,
  type RosterDeskRoles,
  STARTER_PROMPTS,
  type TonightRaid,
  type TonightSignup,
} from '@vintage/ui-kit';
import { formatMonthDay, formatWeekday, preferredTimeZone } from '../dates';
import { raidHref } from '../raids';
import { canSignIn, currentSession } from '../session';
import { currentView } from '../view';
import { pageStyles } from './page-styles';

/** Whether Random's side panel is open, for this browser tab. */
const ASSISTANT_KEY = 'vintage:agent-open';

function readAssistantOpen(): boolean {
  try {
    return sessionStorage.getItem(ASSISTANT_KEY) === '1';
  } catch {
    return false;
  }
}

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
  { id: 'roster', label: 'Roster', ready: true, hint: '' },
  { id: 'guild', label: 'Guild', ready: true, hint: '' },
  { id: 'recruiting', label: 'Recruiting', ready: true, hint: '' },
  { id: 'applications', label: 'Applications', ready: true, hint: '' },
  { id: 'polls', label: 'Polls', ready: true, hint: '' },
  { id: 'progress', label: 'Progress', ready: true, hint: '' },
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
      <div class="title">
        <span class="eyebrow">Backstage</span>
        <h1>Officers’ quarters</h1>
      </div>
      ${when(
        (x) => x.allowed,
        html<Page>`
          <button
            type="button"
            class="ask"
            aria-expanded="${(x) => String(x.assistantOpen)}"
            aria-keyshortcuts="Alt+A"
            title="Alt+A"
            @click="${(x) => x.toggleAssistant()}"
          >${(x) => (x.assistantOpen ? 'Hide Random' : 'Ask Random')}</button>
        `,
      )}
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
        <div class="room ${(x) => (x.assistantOpen ? 'with-panel' : '')}">
        <div class="work">
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
          (x) => x.tab === 'roster',
          html<Page>`
            <vintage-roster-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-configure="${(x) => x.canEditRecruiting}"
              ?loading="${(x) => !x.rosterLoaded}"
              error="${(x) => x.rosterError}"
              :members="${(x) => x.rosterMembers}"
              :roles="${(x) => x.rosterRoles}"
              @roster-changed="${(x) => x.loadRoster()}"
            ></vintage-roster-desk>
          `,
        )}

        ${when(
          (x) => x.tab === 'progress',
          html<Page>`
            <vintage-progress-desk
              time-zone="${() => preferredTimeZone() ?? ''}"
              ?can-record="${(x) => x.canLead}"
              ?loading="${(x) => !x.progressLoaded}"
              error="${(x) => x.progressError}"
              :raids="${(x) => x.progress?.raids ?? []}"
              :latest="${(x) => x.progress?.latest ?? null}"
              ?open="${(x) => x.progress?.open ?? false}"
              opens-on="${(x) => x.progress?.opensOn ?? ''}"
              @progress-changed="${(x) => x.loadProgress()}"
            ></vintage-progress-desk>
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
          (x) => x.tab === 'applications',
          html<Page>`
            <vintage-applications-desk
              :applications="${(x) => x.applications}"
              error="${(x) => x.applicationsError}"
              @applications-changed="${(x) => x.loadApplications()}"
            ></vintage-applications-desk>
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
              (x) => x.raid,
              html<Page>`<p><a href="${(x) => raidHref(x.raid?.id ?? '')}">See this raid as members do</a></p>`,
            )}
            ${when(
              (x) => x.loadError,
              html<Page>`<p class="error" role="alert">${(x) => x.loadError}</p>`,
            )}
          `,
        )}
        </div>
        ${when(
          (x) => x.assistantOpen,
          html<Page>`
            <aside class="assist" aria-label="Random, the guild assistant">
              <vintage-agent-panel
                :context="${(x) => x.assistantContext}"
                :prompts="${(x) => STARTER_PROMPTS[x.tab] ?? []}"
                :showUsage="${(x) => x.canEditRecruiting}"
                @agent-changed="${(x) => x.reloadTab()}"
                @agent-close="${(x) => x.toggleAssistant(false)}"
              ></vintage-agent-panel>
            </aside>
          `,
        )}
        </div>
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
  `${formatWeekday(e.startsAt)} ${formatMonthDay(e.startsAt)} · ${e.name} (${e.size ?? 'open'})`;

const styles = css`
  /* A working room, not a landing page: a modest title and tight sections, so a desk's form and
     its list fit on one screen. The desks inside use the desk scale (desk-styles.ts). */
  .page.wide {
    max-inline-size: 80rem;
    gap: var(--desk-space-lg);
  }

  .head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .title {
    display: grid;
    gap: 0.2rem;
  }

  .ask {
    min-block-size: var(--desk-control-height);
    font: var(--font-weight-medium) var(--desk-font-size) var(--font-family-sans);
    padding: 0 var(--desk-space-md);
    border-radius: var(--desk-control-radius);
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .ask[aria-expanded='true'] {
    box-shadow: inset 0 -2px 0 var(--color-accent-secondary);
  }

  /* The panel sits beside the work on a wide screen and below it on a narrow one. */
  .room {
    display: grid;
    gap: var(--desk-space-lg);
  }

  .work {
    display: grid;
    gap: var(--desk-space-lg);
    min-inline-size: 0;
    align-content: start;
  }

  /* Narrow: the panel follows the tabs in the page. */
  .assist {
    block-size: 36rem;
  }

  /* Wide: docked to the window's right edge, top to bottom; the site makes room for it
     (styles.css, html[data-assistant-open]). */
  @media (min-width: 72rem) {
    .assist {
      position: fixed;
      inset-block: 0;
      inset-inline-end: 0;
      inline-size: var(--assistant-panel-width);
      block-size: auto;
      z-index: 20;
    }

    .assist vintage-agent-panel::part(panel) {
      border-radius: 0;
      border-block: 0;
      border-inline-end: 0;
      min-block-size: 0;
    }
  }

  .head h1 {
    font-size: var(--font-size-xl);
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
    gap: var(--desk-space-xs);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    padding-block-end: var(--desk-space-xs);
  }

  .tab {
    min-block-size: var(--desk-control-height);
    font: var(--font-weight-medium) var(--desk-font-size) var(--font-family-sans);
    padding: 0 var(--desk-space-sm);
    border: 0;
    border-radius: var(--desk-control-radius);
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
    block-size: var(--desk-control-height);
    font: var(--desk-font-size) var(--font-family-sans);
    padding: 0 var(--desk-control-pad-inline);
    border-radius: var(--desk-control-radius);
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
 * `guild-profile-get` and saves with `guild-profile-set` (both officers only to save); Progress
 * reads `progress-get` and records with `kill-record`; Roster reads `member-list` and
 * `guild-roles-get` and saves the role map with `guild-roles-set` (officers, preview then confirm).
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
  @observable applications: ApplicationsDeskRow[] = [];
  @observable applicationsError = '';
  /** The open tab, from `?tab=` (Tonight by default). */
  @observable tab: TabId = tabFromUrl(location.search);
  /** Random's side panel (#168): open or closed is kept for the browser tab. */
  @observable assistantOpen = readAssistantOpen();
  private onAssistantKey = (event: KeyboardEvent) => {
    // The physical A key: on a Mac, Option+A types å, so event.key would miss it.
    // A held key repeats; one press toggles once.
    if (event.repeat) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyA') {
      event.preventDefault();
      this.toggleAssistant();
    }
  };
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
  @observable progress: Progress | null = null;
  @observable progressError = '';
  @observable progressLoaded = false;
  /** Bumped per ledger read, as the calendar's is. */
  private progressRead = 0;
  @observable rosterMembers: RosterDeskMember[] = [];
  @observable rosterRoles: RosterDeskRoles | null = null;
  @observable rosterError = '';
  @observable rosterLoaded = false;
  /** Bumped per roster read, as the calendar's is. */
  private rosterRead = 0;
  /**
   * Every calendar command is leader tier, as are Random's pause, resume, run, and repost, and
   * `kill-record`; a preview below that reads them without the buttons.
   */
  readonly canLead = tierAllows((currentSession()?.tier ?? 'public') as Tier, 'leader');
  /**
   * `recruiting-set`, `guild-profile-set`, `coordinator-config-set`, and `guild-roles-set` are
   * officer tier; raid leaders read the band, the profile, Random's settings, and the role map
   * here but can't save them.
   */
  readonly canEditRecruiting = tierAllows((currentSession()?.tier ?? 'public') as Tier, 'officer');

  @volatile
  get raid(): TonightRaid | null {
    const e = this.raids.find((r) => r.event.id === this.selectedId)?.event;
    return e
      ? { id: e.id, name: e.name, startsAt: e.startsAt, size: e.size, status: e.status }
      : null;
  }

  /** What the panel sends with a question: this tab, and the raid picked on Tonight. */
  @volatile
  get assistantContext(): AgentPanelContext {
    const label = TABS.find((t) => t.id === this.tab)?.label ?? 'Tonight';
    const page = `Officers’ quarters · ${label}`;
    const e = this.raids.find((r) => r.event.id === this.selectedId)?.event;
    return this.tab === 'tonight' && e
      ? { page, selection: { kind: 'raid', id: e.id, label: raidOption(e) } }
      : { page };
  }

  toggleAssistant(open = !this.assistantOpen): void {
    this.assistantOpen = open;
    document.documentElement.toggleAttribute('data-assistant-open', open);
    try {
      sessionStorage.setItem(ASSISTANT_KEY, open ? '1' : '0');
    } catch {
      // Private mode: the choice lasts as long as the page.
    }
  }

  /** After Random ran a confirmed change: read the open tab again so it shows the change. */
  reloadTab(): void {
    void this.load();
    if (this.tab === 'polls') void this.loadPolls();
    if (this.tab === 'recruiting') void this.loadRecruiting();
    if (this.tab === 'applications') void this.loadApplications();
    if (this.tab === 'guild') void this.loadProfile();
    if (this.tab === 'calendar') void this.loadCalendar();
    if (this.tab === 'coordinator') void this.loadCoordinator();
    if (this.tab === 'progress') void this.loadProgress();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onAssistantKey);
    // Leaving the quarters gives the site its full width back.
    document.documentElement.removeAttribute('data-assistant-open');
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.allowed) return;
    document.addEventListener('keydown', this.onAssistantKey);
    document.documentElement.toggleAttribute('data-assistant-open', this.assistantOpen);
    void this.load();
    if (this.tab === 'polls') void this.loadPolls();
    if (this.tab === 'recruiting') void this.loadRecruiting();
    if (this.tab === 'applications') void this.loadApplications();
    if (this.tab === 'guild') void this.loadProfile();
    if (this.tab === 'calendar') void this.loadCalendar();
    if (this.tab === 'coordinator') void this.loadCoordinator();
    if (this.tab === 'progress') void this.loadProgress();
    if (this.tab === 'roster') void this.loadRoster();
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
    if (id === 'applications') void this.loadApplications();
    if (id === 'guild') void this.loadProfile();
    if (id === 'calendar') void this.loadCalendar();
    if (id === 'coordinator') void this.loadCoordinator();
    if (id === 'progress') void this.loadProgress();
    if (id === 'roster') void this.loadRoster();
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
   * Everyone on the rolls from `member-list` and the role map from `guild-roles-get`. Only the
   * latest read is kept. A failed role-map read leaves the members showing.
   */
  async loadRoster(): Promise<void> {
    const client = getCommandClient();
    const read = ++this.rosterRead;
    try {
      const [members, roles] = await Promise.all([
        client.read<RosterDeskMember[]>('member-list', {}),
        client.read<RosterDeskRoles>('guild-roles-get', {}),
      ]);
      if (read !== this.rosterRead) return;
      const failed = [members, roles].find((r) => !r.success);
      this.rosterError = failed
        ? `Couldn’t read the roster: ${failed.error?.message ?? 'the server didn’t answer'}.`
        : '';
      if (members.success) this.rosterMembers = members.data ?? [];
      if (roles.success) this.rosterRoles = roles.data ?? {};
    } finally {
      if (read === this.rosterRead) this.rosterLoaded = true;
    }
  }

  /** The ledger from `progress-get`. Only the latest read is kept. */
  async loadProgress(): Promise<void> {
    const read = ++this.progressRead;
    try {
      const result = await getCommandClient().read<Progress>('progress-get', {});
      if (read !== this.progressRead) return;
      if (!result.success || !result.data) {
        this.progressError = `Couldn’t read the ledger: ${result.error?.message ?? 'the server didn’t answer'}.`;
        return;
      }
      this.progressError = '';
      this.progress = result.data;
    } finally {
      if (read === this.progressRead) this.progressLoaded = true;
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
  /** Officers' applications; raid leaders see why the desk is empty. */
  async loadApplications(): Promise<void> {
    const result = await getCommandClient().read<ApplicationsDeskRow[]>('application-list', {
      limit: 100,
    });
    if (result.success) {
      this.applications = result.data ?? [];
      this.applicationsError = '';
    } else {
      this.applications = [];
      this.applicationsError =
        result.error?.code === 'COMMAND_NOT_FOUND'
          ? 'Officers review applications. Raid leaders see them in the recruitment channel if an officer shares it.'
          : (result.error?.message ?? 'Could not read the applications');
    }
  }

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
