import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { Character } from '@vintage/identity/contract';
import type { RaidEvent, Signup, SignupStatus } from '@vintage/raids/contract';
import { EMPTY_COUNTS, getCommandClient, type SignupCounts, titleCase } from '@vintage/ui-kit';
import { daysUntil, LAUNCH_AT, RAIDS_OPEN_AT } from '../dates';
import { sectionContext, setSiteContext, watchSections } from '../site-context';
import { pageStyles } from './page-styles';

/** Bosses across the three launch raids (8 + 13 + 1). A `progress` module will own this. */
const BOSSES_AT_LAUNCH = 22;
/** How far ahead the calendar looks. */
const CALENDAR_DAYS = 60;
const DAY_MS = 86_400_000;

/** One row of `member-list`. */
interface MemberRow {
  id: string;
  displayName: string;
}

/** One row of `raid-list`. */
interface RaidRow {
  event: RaidEvent;
  counts: Record<SignupStatus, number>;
  myStatus: SignupStatus | null;
}

const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
const monthDay = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

const template = html<Page>`
  <vintage-hero
    id="top"
    art-src="/art/forever-dragon.webp"
    data-section
    data-section-eyebrow="Vintage"
    data-section-title="A guild on WoW: Forever"
    data-section-action="Join the Discord"
    data-section-href="#discord"
  >
    <span slot="eyebrow" class="pill">Normal ruleset</span>
    <span slot="eyebrow" class="pill">Wed + Thu · 8 pm ET</span>
    <span slot="eyebrow" class="pill">10 · 20 · 40</span>
    <span slot="eyebrow" class="pill">Semi-hardcore</span>
    <h1>Forming for <em>Forever.</em></h1>
    <p slot="standfirst">
      A raiding guild for WoW: Forever. ${(x) => x.memberCountWords} on the rolls, two raid
      nights a week, and a bot that posts the signups so nobody has to chase a spreadsheet.
      Raids open December 9.
    </p>
    <div slot="actions">
      <a class="btn primary" href="/about">Apply to raid</a>
      <a class="btn" href="#discord">Join the Discord</a>
    </div>
    <div slot="figures">
      <vintage-figure value="${(x) => x.daysToLaunch}" unit="days" caption="to launch · Wed Nov 4"></vintage-figure>
      <vintage-figure value="${(x) => x.daysToRaids}" unit="days" caption="to raids · Wed Dec 9"></vintage-figure>
      <vintage-figure value="0" unit="/ ${BOSSES_AT_LAUNCH}" caption="bosses down"></vintage-figure>
      <vintage-figure value="${(x) => x.memberCountText}" caption="${(x) => x.memberCaption}" tone="good"></vintage-figure>
    </div>
  </vintage-hero>

  <section
    class="sec"
    id="raids"
    data-section
    data-section-eyebrow="Raids"
    data-section-title="Next on the calendar"
    data-section-action="Sign up"
    aria-labelledby="h-raids"
  >
    <div class="wrap">
      <header>
        <div class="lead"><span class="eyebrow">Raids</span><h2 id="h-raids">Next on the calendar</h2></div>
        <span class="mono">${(x) => x.raidsNote}</span>
      </header>
      <div class="two">
        ${when(
          (x) => x.next,
          html<Page>`
            <vintage-signup-card
              event-id="${(x) => x.next?.event.id}"
              event-title="${(x) => x.next?.event.name}"
              starts-at="${(x) => x.next?.event.startsAt}"
              lock-label="${(x) => x.lockLabel}"
              status="${(x) => x.next?.myStatus ?? 'none'}"
              character-id="${(x) => x.main?.id ?? ''}"
              character-label="${(x) => x.mainLabel}"
              :counts="${(x) => x.nextCounts}"
              @signup-changed="${(x) => x.loadRaids()}"
            >
              <p class="note">${(x) => x.next?.event.instance} · ${(x) => x.next?.event.size} players</p>
            </vintage-signup-card>
          `,
        )}
        ${when(
          (x) => !x.next,
          html<Page>`<div class="card empty"><span class="eyebrow">Next up</span><p>Nothing on the calendar yet. Raid nights are posted a week ahead.</p></div>`,
        )}
        <div class="card">
          <span class="eyebrow">Coming up</span>
          <div class="events">
            ${repeat(
              (x) => x.later,
              html<RaidRow>`
                <div class="ev">
                  <time datetime="${(r) => new Date(r.event.startsAt).toISOString()}">
                    ${(r) => weekday(r.event.startsAt)}<b>${(r) => monthDay(r.event.startsAt)}</b>
                  </time>
                  <div class="t">
                    <b>${(r) => r.event.name}</b>
                    <span>${(r) => timeOf(r.event.startsAt)} · ${(r) => r.event.size} players</span>
                  </div>
                  <span class="s ${(r) => (r.myStatus ? 'mine' : '')}">${(r) => summarize(r)}</span>
                </div>
              `,
            )}
            ${when(
              (x) => x.later.length === 0,
              html`<p class="muted">No other raids in the next two months.</p>`,
            )}
          </div>
        </div>
      </div>
    </div>
  </section>
`;

/** "27 going · 4 tentative", or the member's own answer when they have one. */
function summarize(row: RaidRow): string {
  if (row.myStatus === 'accepted') return 'you’re going';
  if (row.myStatus === 'late') return 'you’re late';
  if (row.myStatus === 'tentative') return 'you’re tentative';
  if (row.myStatus === 'declined') return 'you declined';
  const going = row.counts.accepted + row.counts.late;
  return going ? `${going} going` : 'open';
}

const styles = css`
  ${pageStyles}

  :host {
    padding: 0;
  }

  /* The hero's slotted heading at the concept's scale (outranks the shared h1 rule). */
  vintage-hero > h1 {
    font-size: clamp(3rem, 7.4vw, 6.6rem);
    font-weight: var(--font-weight-heavy);
    line-height: 0.98;
    letter-spacing: var(--font-tracking-tight);
    max-inline-size: 13ch;
  }

  h1 em {
    font-style: normal;
    color: var(--color-text-accent);
  }

  .pill {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-primary);
    padding: 0.35rem 0.6rem;
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-text-primary) 25%, transparent);
    border-radius: 0.2rem;
    background: color-mix(in srgb, var(--color-surface-canvas) 55%, transparent);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0.7rem 1.1rem;
    border-radius: 0.2rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: color-mix(in srgb, var(--color-surface-canvas) 55%, transparent);
    color: var(--color-text-primary);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
    text-decoration: none;
    box-shadow: inset 0 1px 0 rgb(255 244 228 / 6%);
  }

  .btn.primary {
    border-color: transparent;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 28%),
      0 6px 18px color-mix(in srgb, var(--button-primary-bg) 35%, transparent);
  }

  .btn:hover {
    border-color: var(--color-text-secondary);
  }

  .btn.primary:hover {
    background: var(--color-verdigris-400);
    border-color: transparent;
  }

  [slot='actions'] {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  /* sections */
  .sec {
    padding-block: var(--space-2xl);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-surface-raised) 40%, var(--color-surface-canvas)),
      var(--color-surface-canvas) 30%
    );
  }

  .wrap {
    display: grid;
    gap: var(--space-lg);
    max-inline-size: 80rem;
    margin-inline: auto;
    padding-inline: var(--space-inset);
  }

  .sec header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .sec header .lead {
    display: grid;
    gap: var(--space-xs);
  }

  .sec h2 {
    font-size: clamp(1.8rem, 3.4vw, 2.8rem);
    font-weight: var(--font-weight-heavy);
    line-height: 1.05;
  }

  .eyebrow,
  .mono {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .sec header .lead .eyebrow {
    color: var(--color-text-accent);
  }

  .sec header .mono {
    padding-block-end: var(--space-xs);
  }

  .two {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: var(--space-md);
    align-items: start;
  }

  .card {
    display: grid;
    gap: var(--space-sm);
    align-content: start;
    min-inline-size: 0;
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
    box-shadow:
      inset 0 1px 0 rgb(255 244 228 / 6%),
      0 14px 34px rgb(0 0 0 / 45%);
  }

  .note,
  .muted {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .events {
    display: grid;
  }

  .ev {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-sm);
    align-items: center;
    padding-block: var(--space-xs);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .ev:first-child {
    border-block-start: 0;
  }

  .ev time {
    inline-size: 4.5rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .ev time b {
    display: block;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-md);
    letter-spacing: 0;
    color: var(--color-text-primary);
  }

  .ev .t {
    display: grid;
    gap: 0.1rem;
    min-inline-size: 0;
  }

  .ev .t b {
    font-weight: var(--font-weight-bold);
  }

  .ev .t span {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .ev .s {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    color: var(--color-verdigris-200);
    text-align: end;
    white-space: nowrap;
  }

  .ev .s.mine {
    color: var(--color-text-accent);
  }

  @media (max-width: 62rem) {
    .two {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 40rem) {
    .ev {
      grid-template-columns: auto 1fr;
    }

    .ev .s {
      grid-column: 2;
      text-align: start;
    }
  }
`;

/**
 * The home page: the hero and the next-raid section; progression, recruiting, roster, and the
 * coordinator feed follow (docs/features/proposed/home-page). Everything shown comes through
 * the command client: `member-list`, `raid-list`, `signup-list`, `character-list`.
 */
export class Page extends FASTElement {
  @observable memberCount: number | null = null;
  @observable raids: RaidRow[] = [];
  @observable nextCounts: SignupCounts = EMPTY_COUNTS;
  @observable main: Character | null = null;
  private stopWatching: (() => void) | null = null;

  get daysToLaunch(): string {
    return String(daysUntil(LAUNCH_AT));
  }

  get daysToRaids(): string {
    return String(daysUntil(RAIDS_OPEN_AT));
  }

  get memberCountText(): string {
    return this.memberCount === null ? '—' : String(this.memberCount);
  }

  get memberCountWords(): string {
    return this.memberCount === null ? 'Names' : `${this.memberCount} names`;
  }

  get memberCaption(): string {
    return this.memberCount === null ? 'on the rolls' : 'on the rolls · recruiting';
  }

  get next(): RaidRow | null {
    return this.raids[0] ?? null;
  }

  get later(): RaidRow[] {
    return this.raids.slice(1);
  }

  get raidsNote(): string {
    const n = this.raids.length;
    return n === 0 ? 'nothing posted yet' : `${n} raid${n === 1 ? '' : 's'} in the next two months`;
  }

  get lockLabel(): string {
    const event = this.next?.event;
    if (!event) return '';
    if (event.status === 'locked') return 'locked · roster posted';
    return 'signups open';
  }

  get mainLabel(): string {
    return this.main ? `${this.main.name} · ${titleCase(this.main.spec)}` : '';
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadMembers();
    void this.loadRaids();
    void this.loadMain();
    const sections = this.shadowRoot?.querySelectorAll('[data-section]') ?? [];
    this.stopWatching = watchSections(sections, (section) =>
      setSiteContext(sectionContext(section)),
    );
  }

  disconnectedCallback(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    super.disconnectedCallback();
  }

  async loadMembers(): Promise<void> {
    const result = await getCommandClient().read<MemberRow[]>('member-list');
    this.memberCount = result.success ? (result.data ?? []).length : null;
  }

  async loadMain(): Promise<void> {
    const result = await getCommandClient().read<Character[]>('character-list');
    const characters = result.success ? (result.data ?? []) : [];
    this.main = characters.find((c) => c.isMain) ?? characters[0] ?? null;
  }

  /** The calendar, soonest first, plus the role counts for the next raid. */
  async loadRaids(): Promise<void> {
    const client = getCommandClient();
    const list = await client.read<RaidRow[]>('raid-list', {
      to: Date.now() + CALENDAR_DAYS * DAY_MS,
    });
    this.raids = list.success ? (list.data ?? []) : [];
    const next = this.next;
    if (!next) {
      this.nextCounts = EMPTY_COUNTS;
      return;
    }
    const signups = await client.read<Signup[]>('signup-list', { eventId: next.event.id });
    const rows = signups.success ? (signups.data ?? []) : [];
    const going = rows.filter((s) => (s.status === 'accepted' || s.status === 'late') && !s.queued);
    this.nextCounts = {
      ...next.counts,
      tank: going.filter((s) => s.role === 'tank').length,
      healer: going.filter((s) => s.role === 'healer').length,
      dps: going.filter((s) => s.role === 'melee' || s.role === 'ranged').length,
      queued: rows.filter((s) => s.queued).length,
    };
  }
}

await Page.define({ name: 'vintage-home-page', template, styles });
