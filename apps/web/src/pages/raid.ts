import { css, FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import type { Character } from '@vintage/identity/contract';
import {
  type CompRole,
  type RaidEvent,
  rolesNeeded,
  type Signup,
  type SignupGuess,
} from '@vintage/raids/contract';
import { getCommandClient, type RaidRosterComp, type RaidRosterCounts } from '@vintage/ui-kit';
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
  statusWords,
  takesAnswers,
} from '../raids';
import { canSignIn, currentSession } from '../session';
import { canSignUp, currentView } from '../view';
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
              lock-label="${(x) => (x.event ? statusWords(x.event.status) : '')}"
              status="${(x) => x.mine?.status ?? 'none'}"
              character-id="${(x) => (x.signUpAllowed ? (x.guess?.characterId ?? x.main?.id ?? '') : '')}"
              character-label="${(x) => (x.main ? characterLabel(x.main) : '')}"
              spec="${(x) => x.guess?.spec ?? ''}"
              reason="${(x) => x.guess?.reason ?? ''}"
              play-role="${(x) => (x.mine?.rolePicked ? x.mine.role : '')}"
              :characters="${(x) => (x.signUpAllowed ? x.characters : [])}"
              :needed="${(x) => x.needed}"
              time-zone="${() => preferredTimeZone() ?? ''}"
              @signup-changed="${(x) => x.load()}"
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
 * refusal becomes a note in its place. The member answers on the same `vintage-signup-card` as
 * the home page, and the page reads again after every answer. Not live yet: another member's
 * answer shows on the next read.
 */
export class Page extends FASTElement {
  readonly view = currentView();
  /** Members and up: visitors get the sign-in card. */
  readonly allowed = this.view !== 'visitor';
  /** Whether this member may answer (`signup-set` is recruit tier). */
  readonly signUpAllowed = canSignUp(currentSession());
  readonly meId = currentSession()?.memberId ?? '';
  @observable eventId = raidIdFromPath(location.pathname);
  @observable event: RaidEvent | null = null;
  @observable counts: RaidRosterCounts | null = null;
  @observable mine: Signup | null = null;
  @observable signups: Signup[] = [];
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

  get main(): Character | null {
    return this.characters.find((c) => c.isMain) ?? this.characters[0] ?? null;
  }

  get facts(): string {
    return this.event ? raidFacts(this.event, preferredTimeZone()) : '';
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.allowed) return;
    void this.load();
    if (this.signUpAllowed) void this.loadCharacters();
  }

  /** The raid, its signups, the comp, and the member's likely character, read together. */
  async load(): Promise<void> {
    const read = ++this.reads;
    const client = getCommandClient();
    const eventId = this.eventId;
    const [got, list, comp, guess] = await Promise.all([
      client.read<RaidGet>('raid-get', { eventId }),
      client.read<Signup[]>('signup-list', { eventId }),
      client.read<CompSuggest>('comp-suggest', { eventId }),
      this.signUpAllowed
        ? client.read<SignupGuess | null>('signup-suggest', { eventId })
        : Promise.resolve(null),
    ]);
    if (read !== this.reads) return;
    this.loaded = true;
    if (!got.success || !got.data) {
      this.missing = got.error?.code === 'RAID_NOT_FOUND' || !eventId;
      this.error = this.missing
        ? ''
        : `Couldn’t read the raid: ${got.error?.message ?? 'no answer'}.`;
      this.event = null;
      this.counts = null;
      return;
    }
    this.missing = false;
    this.error = '';
    this.event = got.data.event;
    this.counts = got.data.counts;
    this.mine = got.data.mine;
    this.signups = list.success ? (list.data ?? []) : [];
    this.signupsNote = refusedNote(list, SIGNUPS_NOTE, 'the signups');
    this.comp = comp.success && comp.data ? rosterComp(comp.data) : null;
    this.compNote = refusedNote(comp, COMP_NOTE, 'the comp');
    this.guess = guess?.success ? (guess.data ?? null) : null;
    // Members below recruit can't read the signups or answer, so nothing is marked for them.
    this.needed = list.success
      ? rolesNeeded(
          got.data.event,
          this.signups.filter((s) => s.memberId !== this.meId),
        )
      : [];
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
