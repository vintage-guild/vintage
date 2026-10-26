import {
  css,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import type { RaidEvent, Signup } from '@vintage/raids/contract';
import {
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
 * Tonight is built; the rest list what they will hold and stay disabled until they are.
 */
const TABS = [
  { id: 'tonight', label: 'Tonight', ready: true, hint: '' },
  { id: 'calendar', label: 'Calendar', ready: false, hint: 'schedules and one-off raids' },
  { id: 'coordinator', label: 'Coordinator', ready: false, hint: 'status, settings, the log' },
  { id: 'roster', label: 'Roster', ready: false, hint: 'ranks, sync, recruits on trial' },
  { id: 'recruiting', label: 'Recruiting', ready: false, hint: 'the open roles and pitch' },
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
 * `comp-suggest`, and `coordinator-status`; Polls reads `poll-list` and `poll-results`.
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
