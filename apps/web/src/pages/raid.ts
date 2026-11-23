import { css, FASTElement, html, observable, volatile, when } from '@lushly-dev/fast-element';
import type { CommandResult } from '@vintage/guild-kit';
import type { Character } from '@vintage/identity/contract';
import {
  accessOf,
  type CompRole,
  type RaidEvent,
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
              queue-position="${(x) => x.myRow?.queuePosition ?? null}"
              character-id="${(x) => (x.signUpAllowed ? (x.guess?.characterId ?? x.main?.id ?? '') : '')}"
              character-label="${(x) => (x.main ? characterLabel(x.main) : '')}"
              spec="${(x) => x.guess?.spec ?? ''}"
              reason="${(x) => x.guess?.reason ?? ''}"
              play-role="${(x) => (x.mine?.rolePicked ? x.mine.role : '')}"
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
  @observable loaded = false;
  /** `raid-get` found no such raid. */
  @observable missing = false;
  @observable error = '';
  /** Bumped per read, so an older read that finishes last doesn't overwrite a newer one. */
  private reads = 0;
  /** Active live-query subscriptions for this raid, cleared on unmount or raid change. */
  private unsubscribers: Unsubscribe[] = [];
  /** Whether the latest `signup-list` read succeeded (so `needed` knows signups are readable). */
  private signupsReadable = false;

  /** Whether this session may answer this raid (`friend`+ for open raids, `recruit`+ for guild raids). */
  @volatile
  get signUpAllowed(): boolean {
    return canSignUp(currentSession(), this.event ? accessOf(this.event) : 'guild');
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

  private stopWatching(): void {
    for (const stop of this.unsubscribers) stop();
    this.unsubscribers = [];
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

    if (canSignUp(currentSession(), 'open')) {
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

    this.unsubscribers = subs;
  }

  /** One-shot read of the raid, its signups, the comp, and the member's likely character. */
  async load(): Promise<void> {
    const read = ++this.reads;
    const client = getCommandClient();
    const eventId = this.eventId;
    const [got, list, comp, guess] = await Promise.all([
      client.read<RaidGet>('raid-get', { eventId }),
      client.read<SignupRow[]>('signup-list', { eventId }),
      client.read<CompSuggest>('comp-suggest', { eventId }),
      canSignUp(currentSession(), 'open')
        ? client.read<SignupGuess | null>('signup-suggest', { eventId })
        : Promise.resolve(null),
    ]);
    if (read !== this.reads || this.eventId !== eventId) return;
    this.loaded = true;
    this.applyRaid(eventId, got);
    if (!got.success || !got.data) return;
    this.applySignups(list);
    this.applyComp(comp);
    this.guess = guess?.success ? (guess.data ?? null) : null;
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
