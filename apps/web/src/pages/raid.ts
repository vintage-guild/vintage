import {
  css,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import type { CommandResult } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import type { LootDrop } from '@vintage/loot/contract';
import {
  type Absence,
  accessOf,
  type CompRole,
  kindOf,
  type RaidAttendance,
  type RaidEvent,
  type RaidRecord,
  type RecordBosses,
  resolveAbsenceCoverage,
  rolesNeeded,
  type Signup,
  type SignupGuess,
} from '@vintage/raids/contract';
import {
  getCommandClient,
  type RaidRosterComp,
  type RaidRosterCounts,
  type Unsubscribe,
  watchCommand,
} from '@vintage/ui-kit';
import { characterLabel } from '../characters';
import { preferredTimeZone } from '../dates';
import {
  type CompSuggest,
  kindLabel,
  type RaidGet,
  raidFacts,
  raidIdFromPath,
  refusedNote,
  rosterComp,
  type SignupRow,
  statusWords,
  takesAnswers,
} from '../raids';
import { lockLabel } from '../schedules';
import { canSignIn, currentSession } from '../session';
import { canSignUp, canViewRaids, currentView } from '../view';
import { pageStyles } from './page-styles';

/** Said in place of the signups for `member` tier (`signup-list` is recruit tier). */
export const SIGNUPS_NOTE =
  'Who’s signed up opens to recruits and up. Ask an officer about raiding with us.';
/** Said in place of the comp below `raider` tier (`comp-suggest` is raider tier). */
export const COMP_NOTE = 'The comp and its gaps are for raiders and up.';

/** "Bosses: 6/8, 14 wipes, 2h 41m" or "Bosses: 3 killed, 1 wipe, 45m". */
function bossesSummary(bosses: RecordBosses): string {
  const killed =
    bosses.total === null ? `${bosses.killed} killed` : `${bosses.killed}/${bosses.total}`;
  const wipes = `${bosses.wipes} wipe${bosses.wipes === 1 ? '' : 's'}`;
  const minutes = Math.round(Math.max(0, bosses.lastEndAt - bosses.firstPullAt) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return `Bosses: ${killed}, ${wipes}, ${duration}`;
}

const template = html<Page>`
  <div class="page">
    ${when(
      (x) => !x.allowed,
      html<Page>`
        <vintage-sign-in-card heading="Raids are for members" ?available="${() => canSignIn()}">
          Sign in with Discord to see who’s coming and answer the signup. Signups are posted in Discord too.
        </vintage-sign-in-card>
      `,
    )}

    ${when(
      (x) => x.allowed,
      html<Page>`
        <header class="head">
          <span class="eyebrow">${(x) => (x.event ? kindLabel(x.event) : 'Raid')}</span>
          <h1>${(x) => x.event?.name ?? (x.missing ? 'Raid not found' : 'Loading the raid…')}</h1>
          ${when((x) => x.event, html<Page>`<p class="facts">${(x) => x.facts}</p>`)}
          <p class="links">
            <a href="/#raids">All raids</a>
            ${when(
              (x) => x.view === 'officer',
              html`<a href="/officers">Run it in the quarters</a>`,
            )}
          </p>
        </header>

        ${when(
          (x) => x.missing,
          html`<p class="lead">That raid isn’t on the calendar: it may have been removed, or the link is wrong.</p>`,
        )}

        ${when(
          (x) => x.event && takesAnswers(x.event),
          html<Page>`
            <vintage-signup-card
              eyebrow="Your signup"
              event-id="${(x) => x.event?.id}"
              event-title="${(x) => x.event?.name}"
              starts-at="${(x) => x.event?.startsAt}"
              lock-label="${(x) => x.lockLine || (x.event ? statusWords(x.event.status) : '')}"
              status="${(x) => x.mine?.status ?? 'none'}"
              late-minutes="${(x) => x.mine?.lateMinutes ?? null}"
              note="${(x) => x.mine?.note ?? ''}"
              roster-state="${(x) => x.mine?.roster ?? ''}"
              ?flex-standby-only="${(x) => x.flexStandbyOnly}"
              ?roster-approved="${(x) => x.event?.rosterApprovedAt != null}"
              absence-coverage="${(x) => x.absenceCoverage}"
              absence-reason="${(x) => x.absenceReason}"
              weekly-late-minutes="${(x) => x.weeklyLateMinutes}"
              queue-position="${(x) => x.myRow?.queuePosition ?? null}"
              character-id="${(x) => (x.signUpAllowed ? (x.guess?.characterId ?? x.main?.id ?? '') : '')}"
              character-label="${(x) => (x.main ? characterLabel(x.main) : '')}"
              spec="${(x) => x.guess?.spec ?? ''}"
              reason="${(x) => x.guess?.reason ?? ''}"
              play-role="${(x) => (x.mine?.rolePicked ? x.mine.role : '')}"
              :alsoRoles="${(x) => x.mine?.alsoRoles ?? []}"
              :characters="${(x) => (x.signUpAllowed ? x.characters : [])}"
              :needed="${(x) => x.needed}"
              time-zone="${() => preferredTimeZone() ?? ''}"
              @signup-changed="${(x) => x.onSignupChanged()}"
            >
              ${when(
                (x) => !x.signUpAllowed,
                html`<p class="note">Signups open to recruits and up. Ask an officer about raiding with us.</p>`,
              )}
            </vintage-signup-card>
          `,
        )}

        ${when(
          (x) => !x.missing && x.hasReport,
          html<Page>`
            <section class="report" aria-labelledby="report-title">
              <div class="report-head">
                <h2 id="report-title">Raid report</h2>
                ${when(
                  (x) => x.reportMeta,
                  html<Page>`<p class="report-meta">${(x) => x.reportMeta}</p>`,
                )}
              </div>
              <div class="report-grid">
                ${when(
                  (x) => x.record,
                  html<Page>`
                    <div class="report-card">
                      <span class="eyebrow">Attended · ${(x) => x.attended.length}</span>
                      ${when(
                        (x) => x.attended.length === 0,
                        html`<p class="note">No one recorded.</p>`,
                      )}
                      ${when(
                        (x) => x.attended.length > 0,
                        html<Page>`<p class="report-names">${(x) => x.attendedLine}</p>`,
                      )}
                      ${when(
                        (x) => x.stoodBy.length > 0,
                        html<Page>`
                          <span class="eyebrow sub">Stood by · ${(x) => x.stoodBy.length}</span>
                          <p class="report-names">${(x) => x.stoodByLine}</p>
                        `,
                      )}
                    </div>
                  `,
                )}
                <div class="report-card">
                  <span class="eyebrow">Loot · ${(x) => x.drops.length}</span>
                  ${when((x) => x.drops.length === 0, html`<p class="note">No drops recorded.</p>`)}
                  ${when(
                    (x) => x.drops.length > 0,
                    html<Page>`
                      <ul class="drops">
                        ${repeat(
                          (x) => x.drops,
                          html<LootDrop>`
                            <li>
                              <b>${(d) => d.itemName ?? `Item #${d.itemId}`}</b>${(d) => (d.count > 1 ? ` ×${d.count}` : '')}
                              <span class="arrow">→</span> ${(d) => d.looter}${(d) => (d.source ? ` (${d.source})` : '')}
                            </li>
                          `,
                        )}
                      </ul>
                    `,
                  )}
                </div>
              </div>
            </section>
          `,
        )}

        ${when(
          (x) => !x.missing,
          html<Page>`
            <section class="who" aria-labelledby="who-title">
              <h2 id="who-title">Who’s coming</h2>
              <vintage-raid-roster
                me="${(x) => x.meId}"
                ?loading="${(x) => !x.loaded}"
                signups-note="${(x) => x.signupsNote}"
                comp-note="${(x) => x.compNote}"
                :raid="${(x) => x.event}"
                :counts="${(x) => x.counts}"
                :signups="${(x) => x.signups}"
                :comp="${(x) => x.comp}"
              ></vintage-raid-roster>
            </section>
          `,
        )}
      `,
    )}

    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
  </div>
`;

const styles = css`
  .head {
    display: grid;
    gap: 0.2rem;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .facts {
    color: var(--color-text-secondary);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .who {
    display: grid;
    gap: var(--space-sm);
  }

  .report {
    display: grid;
    gap: var(--space-sm);
  }

  .report-head {
    display: grid;
    gap: 0.2rem;
  }

  .report-meta {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .report-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-md);
  }

  .report-card {
    display: grid;
    align-content: start;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
  }

  .report-card .sub {
    margin-block-start: var(--space-xs);
  }

  .report-names {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .drops {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
    font-size: var(--font-size-sm);
  }

  .drops .arrow {
    color: var(--color-text-secondary);
  }

  /* The roster below shows the counts, so the card keeps to the member's own answer. */
  vintage-signup-card::part(counts) {
    display: none;
  }

  .note {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .error {
    color: var(--color-text-accent);
  }
`;

/**
 * `/raids/<eventId>`: one raid for members and up. The raid and its counts from `raid-get`; who
 * is coming from `signup-list` (recruits and up) and the comp from `comp-suggest` (raiders and
 * up), each in a `vintage-raid-roster`; where the member's rank can't read one, the server's
 * refusal becomes a note in its place. Subscribed live through `watchCommand` (`commands:read`
 * via Convex `onUpdate` in production), so another member's signup or a roster lock appears
 * without reloading; falls back to one-shot reads when the client doesn't support `watch`.
 */
export class Page extends FASTElement {
  readonly view = currentView();
  /** Signed-in Friends and up: visitors get the sign-in card; guild raids return not-found to Friends. */
  readonly allowed = canViewRaids(currentSession());
  readonly meId = currentSession()?.memberId ?? '';
  @observable eventId = raidIdFromPath(location.pathname);
  @observable event: RaidEvent | null = null;
  @observable counts: RaidRosterCounts | null = null;
  @observable mine: Signup | null = null;
  /** `raid-get`'s lock time; undefined from a server older than #192. */
  @observable locksAt: number | undefined = undefined;
  @observable signups: SignupRow[] = [];
  @observable signupsNote = '';
  @observable comp: RaidRosterComp | null = null;
  @observable compNote = '';
  /** The member's characters (`character-list`), for the card's Switch character. */
  @observable characters: Character[] = [];
  /** `signup-suggest`: who they're likely bringing, and why. */
  @observable guess: SignupGuess | null = null;
  /** Roles the raid is short of, not counting the member (the card marks them). */
  @observable needed: CompRole[] = [];
  /** Active absences for the signed-in member, to show coverage / weekly-late controls. */
  @observable absences: Absence[] = [];
  @observable loaded = false;
  /** `raid-get` found no such raid. */
  @observable missing = false;
  @observable error = '';
  /** Recorded addon export summary (`attendance-list`), when completed and recorded. */
  @observable record: RaidRecord | null = null;
  @observable attendance: RaidAttendance[] = [];
  /** Recorded loot drops (`loot-list`), when completed and recorded. */
  @observable drops: LootDrop[] = [];
  /** Bumped per read, so an older read that finishes last doesn't overwrite a newer one. */
  private reads = 0;
  /** Active live-query subscriptions for this raid, cleared on unmount or raid change. */
  private unsubscribers: Unsubscribe[] = [];
  /** Active live-query subscriptions for a completed raid's attendance and loot report. */
  private reportSubs: Unsubscribe[] = [];
  private watchedReportId = '';
  /** Whether the latest `signup-list` read succeeded (so `needed` knows signups are readable). */
  private signupsReadable = false;

  /** Whether this session may answer this raid (`friend`+ for open raids, `recruit`+ for guild raids). */
  @volatile
  get signUpAllowed(): boolean {
    return canSignUp(currentSession(), this.event ? accessOf(this.event) : 'guild');
  }

  /** Flex Raiders start on Standby for guild raids. */
  @volatile
  get flexStandbyOnly(): boolean {
    const e = this.event;
    return (
      Boolean(e) &&
      kindOf(e!) === 'raid' &&
      accessOf(e!) === 'guild' &&
      currentSession()?.rank === 'flex-raider'
    );
  }

  private get myCoverage() {
    return this.event ? resolveAbsenceCoverage(this.absences, this.event.startsAt) : null;
  }

  @volatile
  get absenceCoverage(): '' | 'away' | 'late' {
    const cov = this.myCoverage?.coverage;
    if (cov === 'away') return 'away';
    return cov ? 'late' : '';
  }

  @volatile
  get absenceReason(): string {
    return this.myCoverage?.coverage === 'away' ? (this.myCoverage.absence?.reason ?? '') : '';
  }

  @volatile
  get weeklyLateMinutes(): number | null {
    const cov = this.myCoverage?.coverage;
    return cov && cov !== 'away' ? cov.lateMinutes : null;
  }

  get main(): Character | null {
    return this.characters.find((c) => c.isMain) ?? this.characters[0] ?? null;
  }

  /** The member's own `signup-list` row, for their place in line. */
  get myRow(): SignupRow | null {
    return this.signups.find((s) => s.memberId === this.meId) ?? null;
  }

  /** "signups lock Sat 6:00 PM EST", as the home card says it; empty without `locksAt`. */
  @volatile
  get lockLine(): string {
    const event = this.event;
    return event ? lockLabel(event.status, this.locksAt, Date.now(), preferredTimeZone()) : '';
  }

  @volatile
  get facts(): string {
    return this.event ? raidFacts(this.event, preferredTimeZone(), this.lockLine) : '';
  }

  @volatile
  get hasReport(): boolean {
    return this.record !== null || this.drops.length > 0;
  }

  @volatile
  get attended(): RaidAttendance[] {
    return this.attendance.filter((a) => !a.stoodBy).sort((a, b) => a.name.localeCompare(b.name));
  }

  @volatile
  get stoodBy(): RaidAttendance[] {
    return this.attendance
      .filter((a) => Boolean(a.stoodBy))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  @volatile
  get attendedLine(): string {
    const total = this.record?.snapshots ?? 0;
    return this.attended
      .map((a) => (total > 0 ? `${a.name} (${a.snapshots}/${total})` : a.name))
      .join(', ');
  }

  @volatile
  get stoodByLine(): string {
    return this.stoodBy.map((a) => a.name).join(', ');
  }

  @volatile
  get reportMeta(): string {
    const rec = this.record;
    if (!rec) return '';
    const parts: string[] = [];
    if (rec.bosses) parts.push(bossesSummary(rec.bosses));
    parts.push(`${rec.snapshots} snapshot${rec.snapshots === 1 ? '' : 's'}`);
    parts.push(`from ${rec.exporter}’s export`);
    return parts.join(' · ');
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.allowed) return;
    this.subscribe();
  }

  disconnectedCallback(): void {
    this.stopWatching();
    super.disconnectedCallback();
  }

  eventIdChanged(): void {
    if (this.$fastController.isConnected && this.allowed) this.subscribe();
  }

  /** Live clients push updates automatically; one-shot clients re-read after the member answers. */
  onSignupChanged(): void {
    if (!getCommandClient().watch) void this.load();
  }

  private stopWatchingReport(): void {
    for (const stop of this.reportSubs) stop();
    this.reportSubs = [];
    this.watchedReportId = '';
  }

  private stopWatching(): void {
    for (const stop of this.unsubscribers) stop();
    this.unsubscribers = [];
    this.stopWatchingReport();
  }

  private watchReport(eventId: string): void {
    if (this.watchedReportId === eventId) return;
    this.stopWatchingReport();
    this.watchedReportId = eventId;
    const client = getCommandClient();
    this.reportSubs = [
      watchCommand<{ record: RaidRecord | null; attendance: RaidAttendance[] }>(
        client,
        'attendance-list',
        { eventId },
        (att) => {
          if (this.watchedReportId !== eventId) return;
          this.record = att.success ? (att.data?.record ?? null) : null;
          this.attendance = att.success ? (att.data?.attendance ?? []) : [];
        },
        () => {
          if (this.watchedReportId !== eventId) return;
          this.record = null;
          this.attendance = [];
        },
      ),
      watchCommand<LootDrop[]>(
        client,
        'loot-list',
        { eventId },
        (loot) => {
          if (this.watchedReportId !== eventId) return;
          this.drops = loot.success ? (loot.data ?? []) : [];
        },
        () => {
          if (this.watchedReportId !== eventId) return;
          this.drops = [];
        },
      ),
    ];
  }

  private updateNeeded(): void {
    this.needed =
      this.event && this.signupsReadable
        ? rolesNeeded(
            this.event,
            this.signups.filter((s) => s.memberId !== this.meId),
          )
        : [];
  }

  private applyRaid(eventId: string, got: CommandResult<RaidGet>): void {
    if (!got.success || !got.data) {
      this.missing = got.error?.code === 'RAID_NOT_FOUND' || !eventId;
      this.error = this.missing
        ? ''
        : `Couldn’t read the raid: ${got.error?.message ?? 'no answer'}.`;
      this.event = null;
      this.counts = null;
      this.locksAt = undefined;
      this.mine = null;
      this.needed = [];
      this.clearReport();
      return;
    }
    this.missing = false;
    this.error = '';
    this.event = got.data.event;
    this.counts = got.data.counts;
    this.locksAt = got.data.locksAt;
    this.mine = got.data.mine;
    this.updateNeeded();
  }

  private applySignups(list: CommandResult<SignupRow[]>): void {
    this.signupsReadable = list.success;
    this.signups = list.success ? (list.data ?? []) : [];
    this.signupsNote = refusedNote(list, SIGNUPS_NOTE, 'the signups');
    this.updateNeeded();
  }

  private applyComp(comp: CommandResult<CompSuggest>): void {
    this.comp = comp.success && comp.data ? rosterComp(comp.data) : null;
    this.compNote = refusedNote(comp, COMP_NOTE, 'the comp');
  }

  /** Subscribe live to the raid, its signups, the comp, and the member's character guess. */
  private subscribe(): void {
    this.stopWatching();
    const client = getCommandClient();
    const eventId = this.eventId;
    this.loaded = false;
    let gotRaid = false;
    let gotSignups = false;
    let gotComp = false;
    const markLoaded = () => {
      if (gotRaid && (this.missing || Boolean(this.error) || (gotSignups && gotComp))) {
        this.loaded = true;
      }
    };

    const subs: Unsubscribe[] = [
      watchCommand<RaidGet>(
        client,
        'raid-get',
        { eventId },
        (got) => {
          if (this.eventId !== eventId) return;
          this.applyRaid(eventId, got);
          if (this.event?.status === 'completed') {
            this.watchReport(eventId);
          } else {
            this.stopWatchingReport();
            this.clearReport();
          }
          gotRaid = true;
          markLoaded();
        },
        (err) => {
          if (this.eventId !== eventId) return;
          this.missing = false;
          this.error = `Couldn’t read the raid: ${err.message}.`;
          this.event = null;
          this.counts = null;
          this.locksAt = undefined;
          this.mine = null;
          this.needed = [];
          this.stopWatchingReport();
          this.clearReport();
          gotRaid = true;
          markLoaded();
        },
      ),
      watchCommand<SignupRow[]>(
        client,
        'signup-list',
        { eventId },
        (list) => {
          if (this.eventId !== eventId) return;
          this.applySignups(list);
          gotSignups = true;
          markLoaded();
        },
        (err) => {
          if (this.eventId !== eventId) return;
          this.signupsReadable = false;
          this.signups = [];
          this.signupsNote = `Couldn’t read the signups: ${err.message}.`;
          this.updateNeeded();
          gotSignups = true;
          markLoaded();
        },
      ),
      watchCommand<CompSuggest>(
        client,
        'comp-suggest',
        { eventId },
        (comp) => {
          if (this.eventId !== eventId) return;
          this.applyComp(comp);
          gotComp = true;
          markLoaded();
        },
        (err) => {
          if (this.eventId !== eventId) return;
          this.comp = null;
          this.compNote = `Couldn’t read the comp: ${err.message}.`;
          gotComp = true;
          markLoaded();
        },
      ),
    ];

    const session = currentSession();
    if (canSignUp(session, 'open')) {
      subs.push(
        watchCommand<SignupGuess | null>(
          client,
          'signup-suggest',
          { eventId },
          (guess) => {
            if (this.eventId !== eventId) return;
            this.guess = guess.success ? (guess.data ?? null) : null;
          },
          () => {
            if (this.eventId !== eventId) return;
            this.guess = null;
          },
        ),
        watchCommand<Character[]>(
          client,
          'character-list',
          {},
          (result) => {
            this.characters = result.success ? (result.data ?? []) : [];
          },
          () => {
            this.characters = [];
          },
        ),
      );
    }

    if (canSignUp(session, 'guild')) {
      subs.push(
        watchCommand<{ absences: Absence[] }>(
          client,
          'absence-list',
          {},
          (result) => {
            this.absences = result.success ? (result.data?.absences ?? []) : [];
          },
          () => {
            this.absences = [];
          },
        ),
      );
    }

    this.unsubscribers = subs;
  }

  /** One-shot read of the raid, its signups, the comp, and the member's likely character. */
  async load(): Promise<void> {
    const read = ++this.reads;
    const client = getCommandClient();
    const eventId = this.eventId;
    const session = currentSession();
    const [got, list, comp, guess, absences] = await Promise.all([
      client.read<RaidGet>('raid-get', { eventId }),
      client.read<SignupRow[]>('signup-list', { eventId }),
      client.read<CompSuggest>('comp-suggest', { eventId }),
      canSignUp(session, 'open')
        ? client.read<SignupGuess | null>('signup-suggest', { eventId })
        : Promise.resolve(null),
      canSignUp(session, 'guild')
        ? client.read<{ absences: Absence[] }>('absence-list')
        : Promise.resolve(null),
    ]);
    if (read !== this.reads || this.eventId !== eventId) return;
    this.loaded = true;
    this.applyRaid(eventId, got);
    if (!got.success || !got.data) return;
    this.applySignups(list);
    this.applyComp(comp);
    this.guess = guess?.success ? (guess.data ?? null) : null;
    this.absences = absences?.success ? (absences.data?.absences ?? []) : [];
    if (got.data.event.status === 'completed') {
      await this.loadReport(eventId, read);
    } else {
      this.clearReport();
    }
  }

  private clearReport(): void {
    this.record = null;
    this.attendance = [];
    this.drops = [];
  }

  private async loadReport(eventId: string, read: number): Promise<void> {
    const client = getCommandClient();
    const [att, loot] = await Promise.all([
      client.read<{ record: RaidRecord | null; attendance: RaidAttendance[] }>('attendance-list', {
        eventId,
      }),
      client.read<LootDrop[]>('loot-list', { eventId }),
    ]);
    if (read !== this.reads) return;
    this.record = att.success ? (att.data?.record ?? null) : null;
    this.attendance = att.success ? (att.data?.attendance ?? []) : [];
    this.drops = loot.success ? (loot.data ?? []) : [];
  }

  async loadCharacters(): Promise<void> {
    const result = await getCommandClient().read<Character[]>('character-list');
    this.characters = result.success ? (result.data ?? []) : [];
  }
}

await Page.define({
  name: 'vintage-raid-page',
  template,
  styles: [pageStyles, styles],
});
