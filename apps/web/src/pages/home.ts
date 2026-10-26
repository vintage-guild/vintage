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
import type { Character } from '@vintage/identity/contract';
import {
  LAUNCH_BOSS_COUNT,
  LAUNCH_RAIDS,
  type Progress,
  RAIDS_OPEN_AT,
  RAIDS_OPEN_ON,
} from '@vintage/progress/contract';
import {
  DEFAULT_TIMINGS,
  type RaidEvent,
  type Signup,
  type SignupStatus,
} from '@vintage/raids/contract';
import {
  type CoordinatorState,
  EMPTY_COUNTS,
  getCommandClient,
  type LedgerKill,
  type LedgerRaid,
  type RosterMember,
  type SignupCounts,
  titleCase,
} from '@vintage/ui-kit';
import { ART } from '../content/art';
import { type ClassNeed, DISCORD_INVITE_URL, RECRUITING } from '../content/recruiting';
import {
  daysUntil,
  formatMonthDay,
  formatTime,
  formatWeekday,
  LAUNCH_AT,
  preferredTimeZone,
  RAIDS_OPEN_AT as RAIDS_OPEN_ISO,
} from '../dates';
import { type PollCardModel, type PollGet, pollCardModel } from '../polls';
import { currentSession } from '../session';
import {
  consumePendingSection,
  scrollToSection,
  sectionContext,
  setSiteContext,
  watchSections,
} from '../site-context';
import { canSignUp, currentView, type HomeSection, sectionsFor, type View } from '../view';
import { pageStyles } from './page-styles';

/** How far ahead the calendar looks. */
const CALENDAR_DAYS = 60;
const DAY_MS = 86_400_000;

/** One row of `member-list`. */
type MemberRow = RosterMember;

/** One row of `raid-list`. */
interface RaidRow {
  event: RaidEvent;
  counts: Record<SignupStatus, number>;
  myStatus: SignupStatus | null;
}

const weekday = (ms: number) => formatWeekday(ms);
const monthDay = (ms: number) => formatMonthDay(ms);
const timeOf = (ms: number) => formatTime(ms);
/** Where "Join the Discord" goes: the invite, or the recruiting band that says how to get one. */
const DISCORD_HREF = DISCORD_INVITE_URL ?? '/#recruiting';
const DISCORD_SECTION_LINK = DISCORD_INVITE_URL ? '' : 'recruiting';

/** "Warrior, Priest, or Shaman": the classes the band marks high, for the members' one-liner. */
const HIGH_NEEDS = ((names: string[]) =>
  names.length <= 1
    ? (names[0] ?? 'raider')
    : `${names.slice(0, -1).join(', ')}, or ${names.at(-1)}`)(
  RECRUITING.needs.filter((n) => n.need === 'high').map((n) => n.wowClass),
);

/** How many classes the band marks high: the visitor's figure when the roster is members-only. */
const HIGH_NEED_COUNT = RECRUITING.needs.filter((n) => n.need === 'high').length;

/** What a member's answer for the next raid reads as in the hero's figure. */
const ANSWER_CAPTIONS: Record<SignupStatus, string> = {
  accepted: 'you’re going',
  late: 'you’re in, late',
  tentative: 'you’re tentative',
  declined: 'you’re out this time',
  bench: 'you’re on the bench',
};

const template = html<Page>`
  ${when(
    (x) => x.view === 'officer',
    html<Page>`
      <vintage-officer-strip
        event-title="${(x) => x.next?.event.name ?? ''}"
        state="${(x) => x.coordinator.state}"
        state-detail="${(x) => x.coordinator.detail}"
        :waiting="${(x) => x.officerWaiting}"
        :gaps="${(x) => x.officerGaps}"
        ?loading="${(x) => !x.officerLoaded}"
        href="/officers"
      ></vintage-officer-strip>
    `,
  )}
  <vintage-hero
    id="top"
    art-src="${ART.hero}"
    art-phone-src="${ART.heroPhone}"
    ?compact="${(x) => x.view !== 'visitor'}"
    data-section
    data-section-eyebrow=""
    data-section-title=""
    data-section-action="${(x) => (x.view === 'visitor' ? 'Apply to raid' : 'Sign up')}"
    data-section-href="${(x) => (x.view === 'visitor' ? '/#recruiting' : '/#raids')}"
  >
    ${when(
      (x) => x.view === 'visitor',
      html<Page>`
        <span slot="eyebrow" class="pill">Normal ruleset</span>
        <span slot="eyebrow" class="pill">Wed + Thu · 8 pm ET</span>
        <span slot="eyebrow" class="pill">10 · 20 · 40</span>
        <span slot="eyebrow" class="pill">Semi-hardcore</span>
        <h1>Forming for <em>Forever.</em></h1>
      `,
    )}
    ${when(
      (x) => x.view !== 'visitor',
      html<Page>`
        <span slot="eyebrow" class="pill">${(x) => x.rankLabel}</span>
        ${when((x) => x.main, html<Page>`<span slot="eyebrow" class="pill">${(x) => x.mainLabel}</span>`)}
        <h1>Welcome back, <em>${(x) => x.greetingName}.</em></h1>
      `,
    )}
    <p slot="standfirst">
      We're building a raid team for Forever's first tier: people who show up prepared, on time,
      and good company. Signups, reminders, and loot rules are settled before the first pull, so
      raid night is just the raid. Raids open December 9.
    </p>
    <div slot="actions">
      <a class="btn primary" href="/#recruiting" data-section-link="recruiting">Apply to raid</a>
      <a class="btn" href="${DISCORD_HREF}" data-section-link="${DISCORD_SECTION_LINK}" rel="noopener">Join the Discord</a>
    </div>
    ${when(
      (x) => x.view === 'visitor',
      html<Page>`
        <div slot="figures">
          <vintage-figure value="${(x) => x.daysToLaunch}" unit="days" caption="to launch · Wed Nov 4"></vintage-figure>
          <vintage-figure value="${(x) => x.daysToRaids}" unit="days" caption="to raids · Wed Dec 9"></vintage-figure>
          <vintage-figure value="${(x) => x.bossesDown}" unit="/ ${(x) => x.bossTotal}" caption="bosses down"></vintage-figure>
          ${when(
            (x) => x.memberCount !== null,
            html<Page>`<vintage-figure value="${(x) => x.memberCountText}" caption="${(x) => x.memberCaption}" tone="good"></vintage-figure>`,
          )}
          ${when(
            (x) => x.memberCount === null,
            html<Page>`<vintage-figure value="${HIGH_NEED_COUNT}" unit="roles" caption="we need most · recruiting" tone="good"></vintage-figure>`,
          )}
        </div>
      `,
    )}
    ${when(
      (x) => x.view !== 'visitor',
      html<Page>`
        <div slot="figures">
          <vintage-figure value="${(x) => x.nextDays.value}" unit="${(x) => x.nextDays.unit}" caption="${(x) => x.nextDaysCaption}"></vintage-figure>
          <vintage-figure value="${(x) => x.nextGoing}" unit="going" caption="${(x) => x.myAnswer.caption}" tone="${(x) => x.myAnswer.tone}"></vintage-figure>
          <vintage-figure value="${(x) => x.bossesDown}" unit="/ ${(x) => x.bossTotal}" caption="bosses down"></vintage-figure>
          ${when(
            (x) => x.memberCount !== null,
            html<Page>`<vintage-figure value="${(x) => x.memberCountText}" caption="on the rolls"></vintage-figure>`,
          )}
          ${when(
            (x) => x.memberCount === null,
            html<Page>`<vintage-figure value="${HIGH_NEED_COUNT}" unit="roles" caption="we need most · know anyone?"></vintage-figure>`,
          )}
        </div>
      `,
    )}
  </vintage-hero>

  ${when(
    (x) => x.shows('raids'),
    html<Page>`
      <section
        class="sec"
        id="raids"
        data-section
        data-section-eyebrow="Raids"
        data-section-title="${(x) => x.raidsTitle}"
        data-section-action="Sign up"
        aria-labelledby="h-raids"
      >
        <div class="wrap">
          <header>
            <div class="lead"><span class="eyebrow">Raids</span><h2 id="h-raids">${(x) => x.raidsTitle}</h2></div>
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
                  character-id="${(x) => (x.signUpAllowed ? (x.main?.id ?? '') : '')}"
                  character-label="${(x) => x.mainLabel}"
                  time-zone="${() => preferredTimeZone() ?? ''}"
                  :counts="${(x) => x.nextCounts}"
                  @signup-changed="${(x) => x.loadRaids().then(() => (x.view === 'officer' ? x.loadOfficer() : undefined))}"
                >
                  <p class="note">${(x) => x.next?.event.instance} · ${(x) => x.next?.event.size} players</p>
                  ${when(
                    (x) => !x.signUpAllowed,
                    html`<p class="note">Signups open to recruits and up. Ask an officer about raiding with us.</p>`,
                  )}
                </vintage-signup-card>
              `,
            )}
            ${when(
              (x) => !x.next,
              html<Page>`<div class="card empty" aria-busy="${(x) => !x.raidsLoaded}"><span class="eyebrow">Next up</span><p>${(x) => x.nextEmptyText}</p></div>`,
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
                  html<Page>`<p class="muted">${(x) => (!x.raidsLoaded ? 'Loading…' : x.raidsFailed ? 'The calendar is for members.' : 'No other raids in the next two months.')}</p>`,
                )}
              </div>
              <p class="how">
                Raid nights are Wednesday and Thursday. Signups post ${DEFAULT_TIMINGS.leadDays} days
                ahead and lock ${DEFAULT_TIMINGS.lockHours} hours before the pull; anyone who hasn’t
                answered is reminded at ${DEFAULT_TIMINGS.reminderHours.join('h and ')}h. Times are
                shown in ${(x) => x.timeZoneLabel}.
              </p>
            </div>
          </div>
        </div>
      </section>
    `,
  )}

  ${when(
    (x) => x.shows('progress'),
    html<Page>`
      <section
        class="sec"
        id="progress"
        data-section
        data-section-eyebrow="Progress"
        data-section-title="Three raids, twenty-two bosses"
        data-section-action="See the ledger"
        aria-labelledby="h-progress"
      >
        <div class="wrap">
          <header>
            <div class="lead"><span class="eyebrow">Progress</span><h2 id="h-progress">Three raids, twenty-two bosses</h2></div>
            <span class="mono">${(x) => x.progressNote}</span>
          </header>
          ${when(
            (x) => !x.ledgerOpen,
            html<Page>`
              <div class="callout">
                <div>
                  <span class="eyebrow">Opens Wednesday, December 9</span>
                  <p class="big">${(x) => x.daysToRaids} days until the first pull.</p>
                </div>
                <p class="muted">
                  Barrow Deeps for ten, Hyjal Summit for twenty, Onyxia for forty. Each slot below
                  is a boss; first kills get dated here. Onyxia needs the Drakefire Amulet chain per
                  character and fire resistance, so the attunement runs start in November.
                </p>
              </div>
            `,
          )}
          <vintage-boss-ledger
            :raids="${(x) => x.ledgerRaids}"
            :latest="${(x) => x.latestKill}"
            :art="${() => ART.raids}"
            ?open="${(x) => x.ledgerOpen}"
            opens-on="${RAIDS_OPEN_ON}"
          ></vintage-boss-ledger>
        </div>
      </section>
    `,
  )}

  ${when(
    (x) => x.view === 'visitor',
    html<Page>`
      <section
        class="sec cream"
        id="recruiting"
        data-section
        data-section-eyebrow="Recruiting"
        data-section-title="Open roles"
        data-section-action="Apply to raid"
        aria-labelledby="h-recruiting"
      >
        <img class="arms" src="${ART.recruiting}" alt="" loading="lazy" decoding="async" />
        <div class="wrap">
          <div class="two recruit">
            <div class="lead">
              <span class="eyebrow">Recruiting · updated ${RECRUITING.updatedOn}</span>
              <h2 id="h-recruiting">${RECRUITING.headline}</h2>
              <p class="pitch">${RECRUITING.pitch}</p>
              <p class="actions">
                ${when(
                  () => DISCORD_INVITE_URL,
                  html`<a class="btn primary" href="${() => DISCORD_INVITE_URL ?? ''}" rel="noopener">Join the Discord</a>`,
                )}
                <a class="btn ${DISCORD_INVITE_URL ? '' : 'primary'}" href="/about">How we raid</a>
                <a class="btn" href="/#roster" data-section-link="roster">Who’s in</a>
              </p>
              ${when(
                () => !DISCORD_INVITE_URL,
                html`<p class="muted small">Discord invites come from an officer for now; the public link lands here once the GM sets it.</p>`,
              )}
            </div>
            <table class="needs">
              <thead><tr><th>Class</th><th>Specs</th><th class="end">Need</th></tr></thead>
              <tbody>
                ${repeat(
                  () => RECRUITING.needs,
                  html<ClassNeed>`
                    <tr>
                      <td class="cls">${(n) => n.wowClass}</td>
                      <td class="muted">${(n) => n.specs}</td>
                      <td class="end"><span class="need ${(n) => n.need}">${(n) => n.need}</span></td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    `,
  )}

  ${when(
    (x) => x.shows('roster'),
    html<Page>`
      <section
        class="sec"
        id="roster"
        data-section
        data-section-eyebrow="Roster"
        data-section-title="On the rolls"
        data-section-action="Find me"
        aria-labelledby="h-roster"
      >
        <div class="wrap">
          <header>
            <div class="lead"><span class="eyebrow">Roster</span><h2 id="h-roster">On the rolls</h2></div>
            <span class="mono">${(x) => x.rosterNote}</span>
          </header>
          ${when(
            (x) => !x.membersFailed,
            html<Page>`<vintage-roster-wall :members="${(x) => x.members}" me="${(x) => x.meId}"></vintage-roster-wall>`,
          )}
          ${when((x) => x.membersFailed, html<Page>`<p class="muted">${(x) => x.rosterRefused}</p>`)}
        </div>
      </section>
    `,
  )}

  ${when(
    (x) => x.shows('news'),
    html<Page>`
      <section
        class="sec"
        id="news"
        data-section
        data-section-eyebrow="News"
        data-section-title="From the coordinator"
        data-section-action="Open the log"
        aria-labelledby="h-news"
      >
        <div class="wrap">
          <header>
            <div class="lead byline">
              <img class="mascot" src="${ART.coordinator}" alt="" loading="lazy" decoding="async" />
              <span class="eyebrow">News</span>
              <h2 id="h-news">From the coordinator</h2>
            </div>
            <span class="mono">the bot's log · newest first</span>
          </header>
          <div class="two">
            <div class="card">
              <span class="eyebrow">What the bot did</span>
              <div class="feed">
                ${repeat(
                  (x) => x.feed,
                  html<FeedItem>`
                    <div class="item">
                      <time datetime="${(f) => new Date(f.at).toISOString()}">${(f) => monthDay(f.at)}</time>
                      <p><b>${(f) => f.title}</b><small>${(f) => f.detail}</small></p>
                    </div>
                  `,
                )}
                ${when(
                  (x) => x.feed.length === 0,
                  html<Page>`<p class="muted">${(x) => (!x.feedLoaded ? 'Loading the coordinator’s log…' : x.raidsFailed ? 'The coordinator’s log is for members. Sign in with Discord to see what it posted and why.' : 'Nothing yet. The coordinator posts signups a week ahead and logs every reminder here.')}</p>`,
                )}
              </div>
              ${when(
                (x) => x.feed.length > 0 && x.feed.length < 4,
                html`<p class="muted small">Early days: the log fills in as the coordinator posts, reminds, locks, and promotes. Every entry answers “why did the bot ping me?”.</p>`,
              )}
            </div>
            ${when(
              (x) => x.poll,
              html<Page>`
                <div class="poll">
                  <vintage-poll-card
                    poll-id="${(x) => x.poll?.id}"
                    question="${(x) => x.poll?.question}"
                    description="${(x) => x.poll?.description}"
                    note="${(x) => x.poll?.note}"
                    method="${(x) => x.poll?.method}"
                    :maxChoices="${(x) => x.poll?.maxChoices ?? null}"
                    ?readonly="${(x) => x.poll?.readonly}"
                    ?results-hidden="${(x) => x.poll?.resultsHidden}"
                    ballots="${(x) => x.poll?.ballots}"
                    :options="${(x) => x.poll?.options ?? []}"
                    :myChoices="${(x) => x.poll?.myChoices ?? []}"
                    :winners="${(x) => x.poll?.winners ?? []}"
                    @vote-cast="${(x) => x.loadPoll()}"
                    @vote-retract="${(x) => x.loadPoll()}"
                  ></vintage-poll-card>
                  <p class="muted small poll-links">
                    <a href="/polls">All polls</a>${when(
                      (x) => x.view === 'officer',
                      html` · <a href="/officers?tab=polls">Results and closing in the quarters</a>`,
                    )}
                  </p>
                </div>
              `,
            )}
            ${when(
              (x) => !x.poll,
              html<Page>`<div class="card"><span class="eyebrow">The question</span><p class="muted">${(x) => (x.pollFailed ? 'Polls are for members. Sign in with Discord to see the open question and vote.' : 'No open poll. Raid leaders open one with /vintage poll create in Discord.')}</p>${when((x) => !x.pollFailed, html`<p class="muted small"><a href="/polls">Closed polls and results</a></p>`)}</div>`,
            )}
          </div>
        </div>
      </section>
    `,
  )}
  ${when(
    (x) => x.view !== 'visitor',
    html<Page>`
      <section
        class="sec cream slim"
        id="recruiting"
        data-section
        data-section-eyebrow="Recruiting"
        data-section-title="Open roles"
        aria-labelledby="h-recruiting"
      >
        <div class="wrap">
          <div class="lead">
            <span class="eyebrow">Recruiting · updated ${RECRUITING.updatedOn}</span>
            <h2 id="h-recruiting">${RECRUITING.headline}</h2>
          </div>
          <p class="ask">Know a <b>${HIGH_NEEDS}</b> who wants a home for Forever? Send them this site: signed out, the front page has the open roles and how to join.</p>
        </div>
      </section>
    `,
  )}
`;

/** One line of the coordinator feed: an action, in words. */
interface FeedItem {
  at: number;
  title: string;
  detail: string;
}

/** The coordinator's rule kinds (modules/coordinator tick.ts), in words. */
const RULE_LABELS: [prefix: string, label: string][] = [
  ['post', 'Posted the signups'],
  ['refresh', 'Updated the signup post'],
  ['remind', 'Reminded the people who haven’t answered'],
  ['dm', 'Sent reminder DMs'],
  ['digest', 'Sent officers the comp digest'],
  ['lock', 'Locked the roster'],
  ['final', 'Posted the final roster'],
  ['promote', 'Told the next in line a spot opened'],
];

/** "Reminded the people who haven’t answered", or the rule's own name for one we don't know. */
function ruleWords(rule: string): string {
  return RULE_LABELS.find(([prefix]) => rule.startsWith(prefix))?.[1] ?? titleCase(rule);
}

/** The slice of `coordinator-status` the officer strip reads. */
interface CoordinatorStatusData {
  config: { paused: boolean; signupChannelId: string | null };
  upcoming: {
    eventId: string;
    done: { rule: string; status: string; at: number | null }[];
    dueNow: string[];
    waiting: { memberId: string; displayName: string }[];
  }[];
}

/** The slice of `comp-suggest` the officer strip reads. */
interface CompSuggestData {
  gaps: { reason: string }[];
}

function describeAction(action: CoordinatorAction, row: RaidRow): FeedItem {
  const match = RULE_LABELS.find(([prefix]) => action.rule.startsWith(prefix));
  const what = match ? match[1] : titleCase(action.rule);
  const status =
    action.status === 'sent'
      ? ''
      : action.status === 'skipped'
        ? ' · skipped'
        : ` · ${action.status}`;
  const going = row.counts.accepted + row.counts.late;
  const answered = going + row.counts.tentative + row.counts.declined + row.counts.bench;
  const isPost = action.rule.startsWith('post') || action.rule.startsWith('refresh');
  const detail =
    action.detail ?? (isPost ? `${answered} answered so far · ${going} going · #raid-signups` : '');
  return {
    at: action.finishedAt ?? action.claimedAt,
    title: `${what} for ${row.event.name}${status}`,
    detail,
  };
}

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

  /* Crisp, not glowing: a solid darker rim, a one-pixel highlight inside the top, and a
     one-pixel drop. No blur anywhere, so the edge stays sharp. */
  .btn.primary {
    border-color: color-mix(in srgb, var(--button-primary-bg) 55%, black);
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 30%),
      0 1px 0 rgb(0 0 0 / 45%);
  }

  .btn:hover {
    border-color: var(--color-text-secondary);
  }

  .btn.primary:hover {
    background: var(--color-verdigris-400);
    border-color: color-mix(in srgb, var(--color-verdigris-400) 55%, black);
  }

  [slot='actions'] {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  /* sections: one rhythm, a rule between them, no bands of empty space */
  .sec {
    padding-block: var(--space-xl) var(--space-2xl);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .small {
    font-size: var(--font-size-xs);
  }

  .how {
    margin: 0;
    padding-block-start: var(--space-sm);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .callout {
    display: grid;
    grid-template-columns: minmax(14rem, 1fr) 2fr;
    gap: var(--space-md);
    align-items: center;
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    border-inline-start: var(--border-width-thick) solid var(--color-accent-primary);
    background: var(--color-surface-raised);
    box-shadow:
      inset 0 1px 0 rgb(255 244 228 / 6%),
      0 14px 34px rgb(0 0 0 / 45%);
  }

  .callout .big {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: var(--font-size-xl);
    line-height: 1.1;
    letter-spacing: var(--font-tracking-tight);
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
    align-items: stretch;
  }

  .two > .card {
    grid-template-rows: auto 1fr auto;
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

  /* The list fills the card's middle row; keep its raids at the top however few there are. */
  .events {
    display: grid;
    align-content: start;
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

  /* Signed in, the hero is a band and its heading a greeting (vintage-hero compact). */
  vintage-hero[compact] > h1 {
    font-size: clamp(2rem, 4.2vw, 3.4rem);
    max-inline-size: none;
  }

  /* Members get recruiting as one line at the foot of the page: the ask, not the pitch. */
  .sec.cream.slim {
    padding-block: var(--space-lg);
  }

  .sec.cream.slim .wrap {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: var(--space-sm) var(--space-xl);
    align-items: end;
  }

  .sec.cream.slim h2 {
    font-size: clamp(1.4rem, 2.4vw, 2rem);
    line-height: 1.1;
  }

  .sec.cream.slim .ask {
    margin: 0;
    max-inline-size: 46ch;
    color: var(--color-leather-700);
  }

  .sec.cream.slim .ask b {
    color: var(--color-text-inverse);
  }

  /* the cream band: recruiting, on the inverse surface tokens */
  .sec.cream {
    position: relative;
    overflow: hidden;
    background: var(--color-surface-inverse);
    color: var(--color-text-inverse);
    border-block-start: 0;
    box-shadow:
      inset 0 12px 30px rgb(0 0 0 / 8%),
      inset 0 -12px 30px rgb(0 0 0 / 6%);
  }

  .sec.cream h2 {
    color: var(--color-text-inverse);
    font-size: clamp(2rem, 4vw, 3.4rem);
    line-height: 1.02;
  }

  .sec.cream .eyebrow,
  .sec.cream .muted,
  .sec.cream .pitch {
    color: var(--color-leather-700);
  }

  .sec.cream .lead .eyebrow {
    color: var(--color-rose-700);
  }

  .two.recruit {
    grid-template-columns: 1fr 1.1fr;
    align-items: start;
  }

  /* The shield and staff stand at the band's right edge: in the margin on wide screens, behind
     the needs table on narrower ones. Multiply keeps the ink in the paper. */
  .sec.cream .wrap {
    position: relative;
    z-index: 1;
  }

  .arms {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: max(0px, calc((100% - 80rem) / 2 - 9rem));
    block-size: 94%;
    inline-size: auto;
    opacity: 0.26;
    mix-blend-mode: multiply;
    pointer-events: none;
    user-select: none;
  }

  .two.recruit .lead {
    display: grid;
    gap: var(--space-sm);
  }

  .pitch {
    margin: 0;
    max-inline-size: 52ch;
  }

  .sec.cream .btn.primary {
    background: var(--color-verdigris-700);
    border-color: color-mix(in srgb, var(--color-verdigris-700) 60%, black);
    color: var(--color-parchment-50);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 22%),
      0 1px 0 rgb(0 0 0 / 25%);
  }

  .needs {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .needs th,
  .needs td {
    text-align: start;
    padding-block: 0.6rem;
    border-block-end: var(--border-width-thin) solid var(--color-border-inverse);
    vertical-align: top;
  }

  .needs th {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-leather-700);
  }

  .needs .end {
    text-align: end;
    white-space: nowrap;
  }

  .needs .cls {
    font-weight: var(--font-weight-bold);
  }

  .need {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 0.2rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
  }

  .need.high {
    background: var(--color-verdigris-700);
    color: var(--color-parchment-50);
  }

  .need.medium {
    background: var(--color-parchment-200);
    color: var(--color-text-inverse);
  }

  .need.closed {
    border: var(--border-width-thin) solid var(--color-border-inverse);
    color: var(--color-leather-700);
  }

  /* the coordinator feed, with the raven as its byline */
  .lead.byline {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--space-sm);
    align-items: center;
  }

  .lead.byline > :not(.mascot) {
    grid-column: 2;
  }

  .mascot {
    grid-row: 1 / span 2;
    inline-size: 5rem;
    block-size: auto;
    filter: drop-shadow(0 6px 10px rgb(0 0 0 / 45%));
  }

  .feed {
    display: grid;
  }

  .item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-sm);
    padding-block: var(--space-xs);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .item:first-child {
    border-block-start: 0;
  }

  .item time {
    padding-block-start: 0.2rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-accent);
    white-space: nowrap;
  }

  .item p {
    margin: 0;
    min-inline-size: 0;
  }

  .item small {
    display: block;
    color: var(--color-text-secondary);
  }

  code {
    font-family: var(--font-family-mono);
    font-size: 0.9em;
  }

  @media (max-width: 62rem) {
    .two,
    .two.recruit,
    .callout,
    .sec.cream.slim .wrap {
      grid-template-columns: 1fr;
    }

    /* Stacked, the lead comes first; the arms drop behind the table, fainter. */
    .arms {
      inset-block: auto 0;
      inset-inline-end: -2rem;
      block-size: 48%;
      opacity: 0.16;
    }

    .mascot {
      inline-size: 3.75rem;
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
 * The home page: the hero, the next-raid section, and the progression ledger; recruiting, the
 * roster, and the coordinator feed follow (docs/features/proposed/home-page). Everything shown
 * comes through the command client: `member-list`, `raid-list`, `signup-list`,
 * `character-list`, `progress-get`.
 */
export class Page extends FASTElement {
  @observable memberCount: number | null = null;
  @observable members: MemberRow[] = [];
  @observable feed: FeedItem[] = [];
  /** The open poll the member may vote on, as the card shows it. */
  @observable poll: PollCardModel | null = null;
  @observable raids: RaidRow[] = [];
  @observable nextCounts: SignupCounts = EMPTY_COUNTS;
  @observable main: Character | null = null;
  @observable progress: Progress | null = null;
  /** `progress-get` answered with an error (a public caller, say): show the empty ledger. */
  @observable progressFailed = false;
  /** `raid-list` was refused (visitors): the calendar, the counts, and the log say so. */
  @observable raidsFailed = false;
  /** `member-list` was refused (visitors and `member` tier): the roster says why. */
  @observable membersFailed = false;
  /** `poll-list` was refused (visitors): the poll card says polls are for members. */
  @observable pollFailed = false;
  /**
   * Whether each read has settled. Until then the sections say they are loading, so a slow
   * connection never reads as "nothing here" (empty) or "members only" (refused).
   */
  @observable raidsLoaded = false;
  @observable feedLoaded = false;
  @observable officerLoaded = false;
  /** For the officer strip: expected members with no answer for the next raid. */
  @observable officerWaiting: string[] = [];
  /** For the officer strip: the next raid's comp gaps, as reasons. */
  @observable officerGaps: string[] = [];
  /** For the officer strip: the coordinator's state and a short note. */
  @observable coordinator: { state: CoordinatorState; detail: string } = {
    state: 'unknown',
    detail: '',
  };
  /** Who the page is composed for, from the session (src/view.ts). Fixed for the page's life. */
  readonly view: View = currentView();
  /** Whether this member may answer signups (`signup-set` is recruit tier). */
  readonly signUpAllowed = canSignUp(currentSession());
  /** The sections this session sees; the rest aren't rendered (src/view.ts HOME_SECTIONS). */
  readonly sections = sectionsFor(currentSession());

  shows(section: HomeSection): boolean {
    return this.sections.has(section);
  }
  private stopWatching: (() => void) | null = null;

  get daysToLaunch(): string {
    return String(daysUntil(LAUNCH_AT));
  }

  get daysToRaids(): string {
    return String(daysUntil(RAIDS_OPEN_ISO));
  }

  get memberCountText(): string {
    return this.memberCount === null ? '—' : String(this.memberCount);
  }

  get memberCaption(): string {
    return this.memberCount === null ? 'on the rolls' : 'on the rolls · recruiting';
  }

  get next(): RaidRow | null {
    return this.raids[0] ?? null;
  }

  get raidsTitle(): string {
    return this.view === 'visitor' ? 'Next on the calendar' : 'Your next raid';
  }

  /** "Bloodfen", the session's name for the greeting. */
  get greetingName(): string {
    return currentSession()?.displayName ?? 'friend';
  }

  /** "Flex raider", from the session's rank. */
  get rankLabel(): string {
    const rank = (currentSession()?.rank ?? 'member').replace('-', ' ');
    return rank.charAt(0).toUpperCase() + rank.slice(1);
  }

  /** Days to the member's next raid, as the hero figure shows it: "2 days", "1 day", "Tonight". */
  get nextDays(): { value: string; unit: string } {
    const next = this.next;
    if (!next) return { value: '—', unit: '' };
    const days = daysUntil(new Date(next.event.startsAt).toISOString());
    if (days === 0) return { value: 'Tonight', unit: '' };
    return { value: String(days), unit: days === 1 ? 'day' : 'days' };
  }

  @volatile
  get nextDaysCaption(): string {
    const next = this.next;
    if (!next) return this.raidsFailed ? 'calendar is for members' : 'no raid posted yet';
    return `to ${next.event.name} · ${weekday(next.event.startsAt)}`;
  }

  /** Going for the next raid: accepted and late, from `raid-list`'s counts. */
  get nextGoing(): string {
    const counts = this.next?.counts;
    return counts ? String((counts.accepted ?? 0) + (counts.late ?? 0)) : '—';
  }

  /** The member's own answer for the next raid, said plainly, with a nudge when unanswered. */
  get myAnswer(): { caption: string; tone: 'default' | 'good' | 'accent' } {
    const next = this.next;
    if (!next) return { caption: 'for the next raid', tone: 'default' };
    const mine = next.myStatus;
    if (mine) {
      const good = mine === 'accepted' || mine === 'late';
      return { caption: ANSWER_CAPTIONS[mine], tone: good ? 'good' : 'default' };
    }
    return this.signUpAllowed
      ? { caption: 'you haven’t answered', tone: 'accent' }
      : { caption: 'recruits and up sign up', tone: 'default' };
  }

  get rosterRefused(): string {
    return this.view === 'visitor'
      ? 'The roster is for members. Sign in with Discord to see who’s in.'
      : 'The roster opens to recruits and up. Ask an officer about raiding with us.';
  }

  get later(): RaidRow[] {
    return this.raids.slice(1);
  }

  @volatile
  @volatile
  get nextEmptyText(): string {
    if (!this.raidsLoaded) return 'Loading the calendar…';
    return this.raidsFailed
      ? 'Raid nights are Wednesday and Thursday at 8 pm Eastern. Sign in with Discord to see the calendar and answer signups.'
      : 'Nothing on the calendar yet. Raid nights are posted a week ahead.';
  }

  get raidsNote(): string {
    if (!this.raidsLoaded) return 'loading';
    if (this.raidsFailed) return 'members only';
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

  /** The ledger rows: `progress-get`, or the launch raids with every slot empty. */
  get ledgerRaids(): LedgerRaid[] {
    if (this.progress) return this.progress.raids;
    return LAUNCH_RAIDS.map((raid) => ({
      ...raid,
      bosses: raid.bosses.map((boss) => ({ ...boss, firstKillAt: null, loot: [] })),
    }));
  }

  get latestKill(): LedgerKill | null {
    return this.progress?.latest ?? null;
  }

  get ledgerOpen(): boolean {
    return this.progress ? this.progress.open : Date.now() >= RAIDS_OPEN_AT;
  }

  get bossesDown(): string {
    return String(this.progress?.killed ?? 0);
  }

  get bossTotal(): number {
    return this.progress?.total ?? LAUNCH_BOSS_COUNT;
  }

  get meId(): string {
    return currentSession()?.memberId ?? '';
  }

  get rosterNote(): string {
    if (this.memberCount === null) return '';
    return `${this.memberCount} members · ranks from Discord`;
  }

  /** "Eastern Time (your profile)" or "your browser's time zone". */
  get timeZoneLabel(): string {
    const zone = preferredTimeZone();
    if (!zone) return 'your browser’s time zone';
    const name = new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'long' })
      .formatToParts(Date.now())
      .find((p) => p.type === 'timeZoneName')?.value;
    return `${name ?? zone} (your profile)`;
  }

  @volatile
  get progressNote(): string {
    if (!this.progress) return this.progressFailed ? 'sign in to see first kills' : '';
    if (!this.progress.open) return '';
    return `${this.progress.killed} of ${this.progress.total} down`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadMembers();
    void this.loadRaids().then(() =>
      Promise.all([this.loadFeed(), this.view === 'officer' ? this.loadOfficer() : null]),
    );
    void this.loadMain();
    void this.loadProgress();
    void this.loadPoll();
    const sections = this.shadowRoot?.querySelectorAll('[data-section]') ?? [];
    this.stopWatching = watchSections(sections, (section) =>
      setSiteContext(sectionContext(section)),
    );
    const pending = consumePendingSection();
    if (pending) {
      // The router resets scroll after it renders a page; land after that, and once the first
      // reads have changed the layout.
      const go = () => scrollToSection(pending, 'instant');
      requestAnimationFrame(() => requestAnimationFrame(go));
      setTimeout(go, 250);
    }
  }

  disconnectedCallback(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    super.disconnectedCallback();
  }

  /**
   * The officer strip for the next raid: who hasn't answered and the coordinator's state from
   * `coordinator-status` (the same non-responder rule as the reminders and the digest), and the
   * comp gaps from `comp-suggest`. Refreshed after the member answers too.
   */
  async loadOfficer(): Promise<void> {
    const client = getCommandClient();
    const next = this.next;
    const [status, comp] = await Promise.all([
      client.read<CoordinatorStatusData>('coordinator-status', {}),
      next
        ? client.read<CompSuggestData>('comp-suggest', { eventId: next.event.id })
        : Promise.resolve(null),
    ]);
    const mine = status.success
      ? status.data?.upcoming.find((u) => u.eventId === next?.event.id)
      : undefined;
    this.officerWaiting = (mine?.waiting ?? []).map((w) => w.displayName);
    this.officerGaps = comp?.success ? (comp.data?.gaps ?? []).map((g) => g.reason) : [];
    if (!status.success || !status.data) {
      this.coordinator = { state: 'unknown', detail: '' };
      this.officerLoaded = true;
      return;
    }
    const { config } = status.data;
    const state: CoordinatorState = config.paused
      ? 'paused'
      : config.signupChannelId
        ? 'running'
        : 'unconfigured';
    const due = mine?.dueNow[0];
    const last = mine?.done.filter((d) => d.status === 'sent').at(-1);
    const detail = due
      ? `due now: ${ruleWords(due).toLowerCase()}`
      : last
        ? `last: ${ruleWords(last.rule).toLowerCase()}`
        : '';
    this.coordinator = { state, detail };
    this.officerLoaded = true;
  }

  async loadMembers(): Promise<void> {
    const result = await getCommandClient().read<MemberRow[]>('member-list');
    this.members = result.success ? (result.data ?? []) : [];
    this.memberCount = result.success ? this.members.length : null;
    this.membersFailed = !result.success;
  }

  /** The coordinator's log across the upcoming raids, newest first. */
  async loadFeed(): Promise<void> {
    const client = getCommandClient();
    const logs = await Promise.all(
      this.raids.map(async (row) => {
        const result = await client.read<CoordinatorAction[]>('coordinator-log', {
          eventId: row.event.id,
          limit: 20,
        });
        return (result.success ? (result.data ?? []) : []).map((a) => describeAction(a, row));
      }),
    );
    this.feed = logs
      .flat()
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
    this.feedLoaded = true;
  }

  /**
   * The first open poll the member may vote on, with their ballot and the tally when the poll
   * shows it. Visitors don't ask: the role view already says polls are for members, and the
   * server would refuse `poll-list` anyway.
   */
  async loadPoll(): Promise<void> {
    if (this.view === 'visitor') {
      this.pollFailed = true;
      this.poll = null;
      return;
    }
    const client = getCommandClient();
    const list = await client.read<{ id: string }[]>('poll-list');
    this.pollFailed = !list.success;
    const first = list.success ? (list.data ?? [])[0] : undefined;
    if (!first) {
      this.poll = null;
      return;
    }
    const got = await client.read<PollGet>('poll-get', { pollId: first.id });
    this.poll = got.success && got.data ? pollCardModel(got.data) : null;
  }

  async loadMain(): Promise<void> {
    const result = await getCommandClient().read<Character[]>('character-list');
    const characters = result.success ? (result.data ?? []) : [];
    this.main = characters.find((c) => c.isMain) ?? characters[0] ?? null;
  }

  /** The ledger: first kills per boss and the latest one. */
  async loadProgress(): Promise<void> {
    const result = await getCommandClient().read<Progress>('progress-get');
    this.progress = result.success ? (result.data ?? null) : null;
    this.progressFailed = !result.success;
  }

  /** The calendar, soonest first, plus the role counts for the next raid. */
  async loadRaids(): Promise<void> {
    const client = getCommandClient();
    const list = await client.read<RaidRow[]>('raid-list', {
      to: Date.now() + CALENDAR_DAYS * DAY_MS,
    });
    this.raids = list.success ? (list.data ?? []) : [];
    this.raidsFailed = !list.success;
    this.raidsLoaded = true;
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
