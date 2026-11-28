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
import { featureOn } from '@vintage/features';
import type { Character } from '@vintage/identity/contract';
import {
  LAUNCH_BOSS_COUNT,
  LAUNCH_RAIDS,
  type Progress,
  RAIDS_OPEN_AT,
  RAIDS_OPEN_ON,
} from '@vintage/progress/contract';
import {
  type Absence,
  accessOf,
  type CompRole,
  hasRoleTargets,
  KIND_LABELS,
  kindOf,
  type RaidEvent,
  resolveAbsenceCoverage,
  rolesNeeded,
  type Schedule,
  type Signup,
  type SignupGuess,
  type SignupStatus,
  targetsOf,
} from '@vintage/raids/contract';
import {
  type AboutSection,
  type GuildProfile,
  type Recruiting,
  STARTER_PROFILE,
  STARTER_RECRUITING,
} from '@vintage/site/contract';
import {
  type CoordinatorState,
  EMPTY_COUNTS,
  getCommandClient,
  type LedgerKill,
  type LedgerRaid,
  ruleWords,
  type SignupCounts,
  type Unsubscribe,
  watchCommand,
} from '@vintage/ui-kit';
import { characterLabel } from '../characters';
import { ART } from '../content/art';
import { daysUntil, formatMonthDay, formatTime, formatWeekday, preferredTimeZone } from '../dates';
import { paragraphs, readGuildProfile } from '../guild-profile';
import { type PollCardModel, type PollGet, pollCardModel } from '../polls';

/** Polls are off for now (@vintage/features): no poll card, and no `poll-list` read. */
const POLLS_ON = featureOn('polls');

import { raidHref } from '../raids';
import { describeNights, describeTimings, lockLabel } from '../schedules';
import { currentSession } from '../session';
import {
  consumePendingSection,
  scrollToSection,
  sectionContext,
  setSiteContext,
  watchSections,
} from '../site-context';
import { canSignUp, currentView, type HomeSection, sectionsFor, type View } from '../view';
import { buttonStyles } from './button-styles';
import { pageStyles } from './page-styles';

/** How far ahead the calendar looks. */
const CALENDAR_DAYS = 60;
const DAY_MS = 86_400_000;

/** One row of `raid-list`. */
interface RaidRow {
  event: RaidEvent;
  counts: Record<SignupStatus, number>;
  myStatus: SignupStatus | null;
  /** When signups lock (absent from a server older than the field). */
  locksAt?: number;
}

/** A `signup-list` row: the signup and, while queued, its place in line. */
type SignupRow = Signup & { queuePosition?: number | null };

const weekday = (ms: number) => formatWeekday(ms);
const monthDay = (ms: number) => formatMonthDay(ms);
const timeOf = (ms: number) => formatTime(ms);
/** "40 players" for a raid; other kinds say what they are: "5 players · Dungeon" (#151). */
const players = (e: RaidEvent) => {
  const size = e.size === null ? 'Open' : `${e.size} players`;
  return kindOf(e) === 'raid' ? size : `${size} · ${KIND_LABELS[kindOf(e)]}`;
};

/** One raid in the visitor hero: bosses down of its total. */
interface RaidFigure {
  name: string;
  down: number;
  total: number;
}

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
    data-section-href="${(x) => (x.view === 'visitor' ? '/recruitment' : '/#raids')}"
  >
    ${when(
      (x) => x.view === 'visitor',
      html<Page>`
        ${repeat(
          (x) => (x.guild ? x.guild.pills : []),
          html<string>`<span slot="eyebrow" class="pill">${(p) => p}</span>`,
        )}
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
    <p slot="standfirst" ?data-pending="${(x) => !x.guild}">${(x) => x.profile.intro}</p>
    <div slot="actions">
      <a class="btn primary" href="/recruitment">Apply to raid</a>
      <a class="btn" href="${(x) => x.discordHref}" rel="noopener">Join the Discord</a>
    </div>
    ${when(
      (x) => x.view === 'visitor',
      html<Page>`
        <div slot="figures">
          ${repeat(
            (x) => x.raidFigures,
            html<RaidFigure>`<vintage-figure value="${(r) => r.down}" unit="/ ${(r) => r.total}" caption="${(r) => r.name}"></vintage-figure>`,
          )}
          <vintage-figure value="${(x) => x.highNeedCount}" unit="roles" caption="we need most · recruiting" tone="good" href="/recruitment"></vintage-figure>
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
          <vintage-figure value="${(x) => x.highNeedCount}" unit="roles" caption="we need most · know anyone?" href="/recruitment"></vintage-figure>
        </div>
      `,
    )}
    <!-- Raids is for members only, and sits on the hero's art with the greeting (TJ). -->
    ${when(
      (x) => x.shows('raids'),
      html<Page>`
        <section
          slot="after"
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
                    class="${(x) => (x.nextRosterOk ? 'posted' : '')}"
                    event-id="${(x) => x.next?.event.id}"
                    event-title="${(x) => x.next?.event.name}"
                    starts-at="${(x) => x.next?.event.startsAt}"
                    lock-label="${(x) => x.lockLabel}"
                    queue-position="${(x) => x.mySignup?.queuePosition ?? null}"
                    status="${(x) => x.next?.myStatus ?? 'none'}"
                    late-minutes="${(x) => x.mySignup?.lateMinutes ?? null}"
                    note="${(x) => x.mySignup?.note ?? ''}"
                    roster-state="${(x) => x.mySignup?.roster ?? ''}"
                    ?roster-approved="${(x) => x.next?.event.rosterApprovedAt != null}"
                    absence-coverage="${(x) => x.absenceCoverage}"
                    absence-reason="${(x) => x.absenceReason}"
                    weekly-late-minutes="${(x) => x.weeklyLateMinutes}"
                    character-id="${(x) => (x.signUpAllowed ? (x.guess?.characterId ?? x.main?.id ?? '') : '')}"
                    character-label="${(x) => x.mainLabel}"
                    spec="${(x) => x.guess?.spec ?? ''}"
                    reason="${(x) => x.guess?.reason ?? ''}"
                    play-role="${(x) => (x.mySignup?.rolePicked ? x.mySignup.role : '')}"
                    :alsoRoles="${(x) => x.mySignup?.alsoRoles ?? []}"
                    :characters="${(x) => (x.signUpAllowed ? x.characters : [])}"
                    :needed="${(x) => x.nextNeeded}"
                    time-zone="${() => preferredTimeZone() ?? ''}"
                    :counts="${(x) => x.nextCounts}"
                    @signup-changed="${(x) => x.onSignupChanged()}"
                  >
                    <p class="note">${(x) => (x.next ? [x.next.event.instance, players(x.next.event)].filter(Boolean).join(' · ') : '')} · <a href="${(x) => raidHref(x.next?.event.id ?? '')}">Raid page</a></p>
                    ${when(
                      (x) => x.next?.event.notes,
                      html<Page>`<blockquote class="raid-notes" aria-label="Raid notes">${repeat((x) => paragraphs(x.next?.event.notes ?? ''), html<string>`<p>${(p) => p}</p>`)}</blockquote>`,
                    )}
                    ${when(
                      (x) => x.nextRosterOk,
                      html<Page>`
                        <vintage-raid-post
                          slot="roster"
                          me="${(x) => x.meId}"
                          :signups="${(x) => x.nextRows}"
                          :targets="${(x) => x.nextTargets}"
                        ></vintage-raid-post>
                      `,
                    )}
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
                          <b><a href="${(r) => raidHref(r.event.id)}">${(r) => r.event.name}</a></b>
                          <span>${(r) => timeOf(r.event.startsAt)} · ${(r) => players(r.event)}</span>
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
                <p class="how" ?data-pending="${(x) => !x.schedulesLoaded}">
                  ${(x) => x.nightsText} ${(x) => x.timingsText} Times are shown in
                  ${(x) => x.timeZoneLabel}.
                </p>
              </div>
            </div>
          </div>
        </section>
      `,
    )}
  </vintage-hero>

  ${when(
    (x) => x.shows('progress'),
    html<Page>`
      <section
        class="sec"
        id="progress"
        data-section
        data-section-eyebrow=""
        data-section-title="Raid progress"
        data-section-action="See the ledger"
        aria-label="Raid progress"
      >
        <div class="wrap">
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
    (x) => x.shows('about'),
    html<Page>`
      <section
        class="sec about"
        id="about"
        data-section
        data-section-eyebrow="About"
        data-section-title="About the guild"
        data-section-action="More about us"
        data-section-href="/about"
        aria-labelledby="h-about"
      >
        <div class="wrap" ?data-pending="${(x) => !x.guild}">
          <header>
            <div class="lead"><span class="eyebrow">About</span><h2 id="h-about">About the guild</h2></div>
          </header>
          <p class="about-lead">${(x) => x.profile.aboutLead}</p>
          <div class="about-grid">
            ${repeat(
              (x) => x.profile.aboutSections,
              html<AboutSection>`
                <article class="card">
                  <h3>${(s) => s.heading}</h3>
                  <vintage-markdown :text="${(s) => s.body}"></vintage-markdown>
                </article>
              `,
            )}
          </div>
          <p class="actions"><a class="btn" href="/about">More about the guild</a></p>
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
        data-section-title="From Vintage"
        data-section-action="Open the log"
        aria-labelledby="h-news"
      >
        <div class="wrap">
          <header>
            <div class="lead byline">
              <img class="mascot" src="${ART.coordinator}" alt="" loading="lazy" decoding="async" />
              <span class="eyebrow">News</span>
              <h2 id="h-news">From Vintage</h2>
            </div>
            <span class="mono">bot activity · raid notices</span>
          </header>
          <div class="${() => (POLLS_ON ? 'two' : 'two solo')}">
            <div class="card">
              <span class="eyebrow">What Vintage did · newest first</span>
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
                  html<Page>`<p class="muted">${(x) => (!x.feedLoaded ? 'Loading Vintage’s log…' : x.raidsFailed ? 'Vintage’s log is for members. Sign in with Discord to see what it posted and why.' : 'Nothing yet. Vintage posts signups a week ahead and logs every reminder here.')}</p>`,
                )}
              </div>
              ${when(
                (x) => x.feed.length > 0 && x.feed.length < 4,
                html`<p class="muted small">Early days: the log fills in as Vintage posts, reminds, locks, and promotes. Every entry answers “why did Vintage ping me?”.</p>`,
              )}
            </div>
            ${when(
              (x) => POLLS_ON && x.poll,
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
              (x) => POLLS_ON && !x.poll,
              html<Page>`<div class="card"><span class="eyebrow">The question</span><p class="muted">${(x) => (x.pollFailed ? 'Polls are for members. Sign in with Discord to see the open question and vote.' : 'No open poll. Raid leaders open one with /vintage poll create in Discord.')}</p>${when((x) => !x.pollFailed, html`<p class="muted small"><a href="/polls">Closed polls and results</a></p>`)}</div>`,
            )}
          </div>
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
  const what = ruleWords(action.rule);
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
  ${buttonStyles}

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

  [slot='actions'] {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  /* sections: one rhythm, a rule between them, no bands of empty space */
  /* Block, not the shared page styles' grid: in a grid the centered .wrap shrinks to its
     content, so a short section would sit narrow and centered. */
  .sec {
    display: block;
    padding-block: var(--space-xl) var(--space-2xl);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  /* Raids, on the hero's art for members: no rule between it and the greeting. */
  .sec[slot='after'] {
    border-block-start: 0;
    padding-block-start: var(--space-lg);
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

  /* Polls off: the log has the row to itself. */
  .two.solo {
    grid-template-columns: 1fr;
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
    box-shadow: var(--shadow-raised);
  }

  .note,
  .muted {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* An officer's notes for the raid (what to bring, when to be on): their line breaks kept,
     set off as a quote the way the Discord post shows them. */
  .raid-notes {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding-inline-start: var(--space-sm);
    border-inline-start: var(--border-width-thick) solid var(--color-border-strong);
  }

  /* With the signups laid out like the Discord post, its status line replaces the card's counts. */
  vintage-signup-card.posted::part(counts) {
    display: none;
  }

  .raid-notes p {
    margin: 0;
    font-size: var(--font-size-sm);
    white-space: pre-line;
    overflow-wrap: anywhere;
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

  /* Until guild-profile-get answers, the text keeps its place but shows nothing. */
  .wrap[data-pending],
  [slot='standfirst'][data-pending],
  .how[data-pending] {
    visibility: hidden;
  }

  .about-lead {
    margin: 0;
    max-inline-size: 60ch;
    font-size: var(--font-size-lg);
    text-wrap: pretty;
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: var(--space-md);
  }

  .about-grid h3 {
    margin: 0;
    font-size: var(--font-size-md);
  }

  .about-grid p {
    margin: 0;
    max-inline-size: 60ch;
    text-wrap: pretty;
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
    filter: drop-shadow(0 6px 10px var(--color-shadow-strong));
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
    .two {
      grid-template-columns: 1fr;
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
 * The home page: the hero, the next-raid section, and the progression ledger; the coordinator
 * feed follows (docs/features/proposed/home-page). The full roster lives at `/roster` and the
 * open roles at `/recruitment`.
 * Everything shown comes through the command client: `member-list`, `raid-list`, `signup-list`,
 * `character-list`, `progress-get`.
 */
export class Page extends FASTElement {
  @observable feed: FeedItem[] = [];
  /** The open poll the member may vote on, as the card shows it. */
  @observable poll: PollCardModel | null = null;
  @observable raids: RaidRow[] = [];
  @observable nextCounts: SignupCounts = EMPTY_COUNTS;
  @observable main: Character | null = null;
  /** The member's characters (`character-list`), for the signup card's Switch character. */
  @observable characters: Character[] = [];
  /** `signup-suggest` for the next raid: who they're likely bringing, and why. */
  @observable guess: SignupGuess | null = null;
  /** The member's own signup for the next raid, so the card shows a role picked for it. */
  @observable mySignup: SignupRow | null = null;
  /** Roles the next raid is short of, not counting the member (the card marks them). */
  @observable nextNeeded: CompRole[] = [];
  /** The next raid's signups, for the Discord-style post in the card. */
  @observable nextRows: SignupRow[] = [];
  /** `signup-list` answered for the next raid (recruits and up); otherwise the card keeps its counts. */
  @observable nextRosterOk = false;
  @observable progress: Progress | null = null;
  /** `recruiting-get`; null until it answers, so the band never shows text it then replaces. */
  @observable recruiting: Recruiting | null = null;
  /** `guild-profile-get`; null until it answers, like the band. */
  @observable guild: GuildProfile | null = null;
  /** `schedule-list`: the raid nights and their signup timings. */
  @observable schedules: Schedule[] = [];
  @observable schedulesLoaded = false;
  /** `raid-list` was refused (visitors): the calendar, the counts, and the log say so. */
  @observable raidsFailed = false;
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
  /** Active absences for the signed-in member, to show coverage / weekly-late controls. */
  @observable absences: Absence[] = [];
  /** Who the page is composed for, from the session (src/view.ts). Fixed for the page's life. */
  readonly view: View = currentView();
  /** The sections this session sees; the rest aren't rendered (src/view.ts HOME_SECTIONS). */
  readonly sections = sectionsFor(currentSession());

  /** Whether this session may answer the next raid (`friend`+ on open raids, `recruit`+ on guild). */
  @volatile
  get signUpAllowed(): boolean {
    const next = this.next;
    return canSignUp(currentSession(), next ? accessOf(next.event) : 'guild');
  }

  private get nextCoverage() {
    const e = this.next?.event;
    return e ? resolveAbsenceCoverage(this.absences, e.startsAt) : null;
  }

  @volatile
  get absenceCoverage(): '' | 'away' | 'late' {
    const cov = this.nextCoverage?.coverage;
    if (cov === 'away') return 'away';
    return cov ? 'late' : '';
  }

  @volatile
  get absenceReason(): string {
    return this.nextCoverage?.coverage === 'away' ? (this.nextCoverage.absence?.reason ?? '') : '';
  }

  @volatile
  get weeklyLateMinutes(): number | null {
    const cov = this.nextCoverage?.coverage;
    return cov && cov !== 'away' ? cov.lateMinutes : null;
  }

  shows(section: HomeSection): boolean {
    return this.sections.has(section);
  }
  private stopWatching: (() => void) | null = null;
  private raidListSub: Unsubscribe | null = null;
  private absenceSub: Unsubscribe | null = null;
  private nextRaidSubs: Unsubscribe[] = [];
  private watchedNextId: string | null = null;
  private nextSignups: SignupRow[] = [];

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

  /** The next raid's role targets for the post's columns, or null for an event without them. */
  get nextTargets(): ReturnType<typeof targetsOf> | null {
    const event = this.next?.event;
    if (!event) return null;
    const targets = targetsOf(event);
    return hasRoleTargets(targets) ? targets : null;
  }

  get later(): RaidRow[] {
    return this.raids.slice(1);
  }

  @volatile
  @volatile
  get nextEmptyText(): string {
    if (!this.raidsLoaded) return 'Loading the calendar…';
    return this.raidsFailed
      ? 'Sign in with Discord to see the calendar and answer signups.'
      : 'Nothing on the calendar yet. Raid nights are posted a week ahead.';
  }

  get raidsNote(): string {
    if (!this.raidsLoaded) return 'loading';
    if (this.raidsFailed) return 'members only';
    const n = this.raids.length;
    return n === 0 ? 'nothing posted yet' : `${n} raid${n === 1 ? '' : 's'} in the next two months`;
  }

  @volatile
  get lockLabel(): string {
    const next = this.next;
    if (!next) return '';
    return lockLabel(next.event.status, next.locksAt, Date.now(), preferredTimeZone());
  }

  get mainLabel(): string {
    return this.main ? characterLabel(this.main) : '';
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

  /** The visitor hero's figures: bosses down in each raid. */
  get raidFigures(): RaidFigure[] {
    return this.ledgerRaids.map((raid) => ({
      name: raid.name,
      down: raid.bosses.filter((boss) => boss.firstKillAt !== null).length,
      total: raid.bosses.length,
    }));
  }

  get meId(): string {
    return currentSession()?.memberId ?? '';
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

  /** The recruiting band as officers last saved it, or the starter text. */
  @volatile
  get band(): Recruiting {
    return this.recruiting ?? STARTER_RECRUITING;
  }

  /** How many classes the band marks high: a hero figure. */
  @volatile
  get highNeedCount(): number {
    return this.band.needs.filter((n) => n.need === 'high').length;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadRecruiting();
    void this.loadGuild();
    if (this.shows('raids')) void this.loadSchedules();
    this.watchRaids();
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
    this.stopWatchingRaids();
    super.disconnectedCallback();
  }

  /** Live clients push raid and signup updates automatically; one-shot clients re-read. */
  onSignupChanged(): void {
    if (getCommandClient().watch) {
      if (this.view === 'officer') void this.loadOfficer();
      return;
    }
    void this.loadRaids().then(() => (this.view === 'officer' ? this.loadOfficer() : undefined));
  }

  private stopWatchingNextRaid(): void {
    for (const stop of this.nextRaidSubs) stop();
    this.nextRaidSubs = [];
    this.watchedNextId = null;
    this.nextSignups = [];
  }

  private stopWatchingRaids(): void {
    this.raidListSub?.();
    this.raidListSub = null;
    this.absenceSub?.();
    this.absenceSub = null;
    this.stopWatchingNextRaid();
  }

  private applyNextSignups(next: RaidRow, rows: SignupRow[]): void {
    this.nextSignups = rows;
    this.nextRows = rows;
    this.mySignup = rows.find((s) => s.memberId === this.meId) ?? null;
    this.nextNeeded = rolesNeeded(
      next.event,
      rows.filter((s) => s.memberId !== this.meId),
    );
    const going = rows.filter((s) => (s.status === 'accepted' || s.status === 'late') && !s.queued);
    this.nextCounts = {
      ...next.counts,
      tank: going.filter((s) => s.role === 'tank').length,
      healer: going.filter((s) => s.role === 'healer').length,
      dps: going.filter((s) => s.role === 'melee' || s.role === 'ranged').length,
      queued: rows.filter((s) => s.queued).length,
    };
  }

  /** Subscribe live to upcoming raids and the next raid's signups, falling back to one-shot read. */
  private watchRaids(): void {
    this.stopWatchingRaids();
    if (this.view === 'visitor') {
      void this.loadRaids().then(() => this.loadFeed());
      return;
    }
    const client = getCommandClient();
    const to = Date.now() + CALENDAR_DAYS * DAY_MS;
    let firstList = true;
    if (canSignUp(currentSession(), 'guild')) {
      this.absenceSub = watchCommand<{ absences: Absence[] }>(
        client,
        'absence-list',
        {},
        (result) => {
          this.absences = result.success ? (result.data?.absences ?? []) : [];
        },
        () => {
          this.absences = [];
        },
      );
    }
    this.raidListSub = watchCommand<RaidRow[]>(
      client,
      'raid-list',
      { to },
      (list) => {
        this.raids = list.success ? (list.data ?? []) : [];
        this.raidsFailed = !list.success;
        this.raidsLoaded = true;
        if (firstList) {
          firstList = false;
          void Promise.all([this.loadFeed(), this.view === 'officer' ? this.loadOfficer() : null]);
        }
        const next = this.next;
        if (!next) {
          this.stopWatchingNextRaid();
          this.nextCounts = EMPTY_COUNTS;
          this.guess = null;
          this.mySignup = null;
          this.nextNeeded = [];
          return;
        }
        if (this.watchedNextId === next.event.id) {
          this.applyNextSignups(next, this.nextSignups);
          return;
        }
        this.stopWatchingNextRaid();
        this.watchedNextId = next.event.id;
        this.nextRosterOk = false;
        this.applyNextSignups(next, []);
        const eventId = next.event.id;
        const subs: Unsubscribe[] = [
          watchCommand<SignupRow[]>(
            client,
            'signup-list',
            { eventId },
            (signups) => {
              const current = this.next;
              if (!current || current.event.id !== eventId) return;
              this.nextRosterOk = signups.success;
              this.applyNextSignups(current, signups.success ? (signups.data ?? []) : []);
            },
            () => {
              const current = this.next;
              if (!current || current.event.id !== eventId) return;
              this.nextRosterOk = false;
              this.applyNextSignups(current, []);
            },
          ),
        ];
        if (this.signUpAllowed) {
          subs.push(
            watchCommand<SignupGuess | null>(
              client,
              'signup-suggest',
              { eventId },
              (guess) => {
                if (this.watchedNextId !== eventId) return;
                this.guess = guess.success ? (guess.data ?? null) : null;
              },
              () => {
                if (this.watchedNextId !== eventId) return;
                this.guess = null;
              },
            ),
          );
        }
        this.nextRaidSubs = subs;
      },
      () => {
        this.raids = [];
        this.raidsFailed = true;
        this.raidsLoaded = true;
        this.stopWatchingNextRaid();
        this.nextCounts = EMPTY_COUNTS;
        this.guess = null;
        this.mySignup = null;
        this.nextNeeded = [];
        if (firstList) {
          firstList = false;
          void Promise.all([this.loadFeed(), this.view === 'officer' ? this.loadOfficer() : null]);
        }
      },
    );
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
      ? `due now: ${ruleWords(due, 'todo').toLowerCase()}`
      : last
        ? `last: ${ruleWords(last.rule).toLowerCase()}`
        : '';
    this.coordinator = { state, detail };
    this.officerLoaded = true;
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
    if (!POLLS_ON) return;
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
    this.characters = characters;
    this.main = characters.find((c) => c.isMain) ?? characters[0] ?? null;
  }

  /** The guild's schedules, for the raid nights and signup timings under the calendar. */
  async loadSchedules(): Promise<void> {
    const result = await getCommandClient().read<Schedule[]>('schedule-list');
    this.schedules = result.success ? (result.data ?? []) : [];
    this.schedulesLoaded = true;
  }

  /** "Raid nights are Monday and Wednesday at 8:00 PM CST.", or how one-off raids appear. */
  @volatile
  get nightsText(): string {
    return (
      describeNights(this.schedules, Date.now(), preferredTimeZone()) ??
      'Raids go on the calendar as leaders schedule them.'
    );
  }

  get timingsText(): string {
    return describeTimings(this.schedules);
  }

  /** The hero's facts and intro and the Discord invite. */
  async loadGuild(): Promise<void> {
    this.guild = await readGuildProfile();
  }

  /** The guild profile, or the starter text while it loads. */
  @volatile
  get profile(): GuildProfile {
    return this.guild ?? STARTER_PROFILE;
  }

  /** Where "Join the Discord" goes: the invite, or the Recruitment page that says how to get one. */
  @volatile
  get discordHref(): string {
    return this.profile.discordInvite ?? '/recruitment';
  }

  /** The recruiting band, for the hero's "roles we need most". A failed read shows the starter. */
  async loadRecruiting(): Promise<void> {
    const result = await getCommandClient().read<Recruiting>('recruiting-get');
    this.recruiting = result.success && result.data ? result.data : STARTER_RECRUITING;
  }

  /** The ledger: first kills per boss and the latest one. */
  async loadProgress(): Promise<void> {
    const result = await getCommandClient().read<Progress>('progress-get');
    this.progress = result.success ? (result.data ?? null) : null;
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
      this.guess = null;
      this.mySignup = null;
      this.nextNeeded = [];
      return;
    }
    const [signups, guess, absences] = await Promise.all([
      client.read<SignupRow[]>('signup-list', { eventId: next.event.id }),
      this.signUpAllowed
        ? client.read<SignupGuess | null>('signup-suggest', { eventId: next.event.id })
        : null,
      canSignUp(currentSession(), 'guild')
        ? client.read<{ absences: Absence[] }>('absence-list')
        : null,
    ]);
    this.guess = guess?.success ? (guess.data ?? null) : null;
    this.absences = absences?.success ? (absences.data?.absences ?? []) : [];
    const rows = signups.success ? (signups.data ?? []) : [];
    this.nextRows = rows;
    this.nextRosterOk = signups.success;
    this.mySignup = rows.find((s) => s.memberId === this.meId) ?? null;
    this.nextNeeded = rolesNeeded(
      next.event,
      rows.filter((s) => s.memberId !== this.meId),
    );
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
