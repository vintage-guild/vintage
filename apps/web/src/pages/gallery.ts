import { css, FASTElement, html, repeat } from '@lushly-dev/fast-element';
import { LAUNCH_RAIDS, RAIDS_OPEN_ON } from '@vintage/progress/contract';
import {
  type CalendarRaid,
  type CalendarSchedule,
  type CoordinatorDeskConfig,
  type CoordinatorDeskEntry,
  type CoordinatorDeskRaid,
  type LedgerKill,
  type LedgerRaid,
  type ListedCharacter,
  type PollCardOption,
  type RosterDeskMember,
  type RosterMember,
  SIGNUP_STATUSES,
  type SignupStatus,
  type TonightSignup,
} from '@vintage/ui-kit';
import { CLASS_NAMES, CLASSES, ROLES, type Role, type WowClass } from '@vintage/wow-data';
import { ART } from '../content/art';
import { pageStyles } from './page-styles';

/**
 * The calendar's clock: Mon 26 Oct 2026, the week London has gone back to GMT and New York
 * hasn't, so the gallery shows the "hour off" note.
 */
const CALENDAR_NOW = Date.UTC(2026, 9, 26, 12);
const nyEvening = (month: number, day: number) =>
  Date.UTC(2026, month, day + 1, month === 9 ? 0 : 1);

const GALLERY_SCHEDULES: CalendarSchedule[] = [
  {
    id: 's1',
    name: 'Raid night',
    instance: "Onyxia's Lair",
    kind: 'raid',
    size: 40,
    recurrence: { weekdays: ['wed', 'thu'], time: '20:00', timeZone: 'America/New_York' },
    durationMinutes: 180,
    timings: { leadDays: 7, reminderHours: [72, 24], lockHours: 2 },
    roleTargets: null,
    notes: 'Fire resist and flasks. On at 7:45 for buffs.',
    active: true,
  },
  {
    id: 's2',
    name: 'Sunday tens',
    instance: 'Barrow Deeps',
    kind: 'raid',
    size: 10,
    recurrence: { weekdays: ['sun'], time: '18:00', timeZone: 'America/New_York' },
    durationMinutes: 120,
    timings: { leadDays: 5, reminderHours: [24], lockHours: 1 },
    roleTargets: null,
    notes: null,
    active: false,
  },
];

const calendarRaid = (
  over: Partial<CalendarRaid> & Pick<CalendarRaid, 'id' | 'startsAt'>,
): CalendarRaid => ({
  scheduleId: 's1',
  name: 'Raid night',
  instance: "Onyxia's Lair",
  kind: 'raid',
  size: 40,
  durationMinutes: 180,
  status: 'open',
  notes: null,
  counts: { accepted: 22, late: 2, tentative: 4, bench: 1 },
  ...over,
});

const GALLERY_RAIDS: CalendarRaid[] = [
  calendarRaid({ id: 'r-past', startsAt: nyEvening(9, 22), status: 'completed' }),
  calendarRaid({ id: 'r-cancel', startsAt: nyEvening(9, 21), status: 'cancelled', counts: null }),
  calendarRaid({ id: 'r1', startsAt: nyEvening(9, 28), status: 'locked' }),
  calendarRaid({ id: 'r2', startsAt: nyEvening(9, 29) }),
  calendarRaid({
    id: 'r-alt',
    scheduleId: null,
    name: 'Alt run',
    instance: 'Barrow Deeps',
    kind: 'raid',
    size: 10,
    durationMinutes: 120,
    startsAt: nyEvening(9, 29) + 3_600_000,
    counts: { accepted: 0, late: 0, tentative: 0, bench: 0 },
  }),
  calendarRaid({
    id: 'r-sm',
    scheduleId: null,
    name: 'Cathedral run',
    instance: 'Scarlet Monastery',
    kind: 'dungeon',
    size: 5,
    durationMinutes: 90,
    startsAt: nyEvening(9, 31),
    counts: { accepted: 3, late: 0, tentative: 1, bench: 0 },
  }),
  calendarRaid({
    id: 'r3',
    startsAt: nyEvening(10, 4),
    counts: { accepted: 9, late: 0, tentative: 2, bench: 0 },
  }),
  calendarRaid({ id: 'r4', startsAt: nyEvening(10, 5), counts: null }),
];

/** Random's settings in the gallery: both channels set, the four raiding ranks chased. */
const GALLERY_COORDINATOR: CoordinatorDeskConfig = {
  signupChannelId: '1300000000000000001',
  opsChannelId: '1300000000000000002',
  expectedRanks: ['officer', 'raid-leader', 'raider', 'flex-raider'],
  dmReminders: true,
  paused: false,
};

/** Two raids this week: Wednesday's locked tonight, Thursday's still chasing answers. */
const GALLERY_COORDINATOR_RAIDS: CoordinatorDeskRaid[] = [
  {
    eventId: 'r1',
    name: 'Raid night',
    startsAt: nyEvening(9, 28),
    status: 'locked',
    done: ['post', 'remind-72h', 'digest', 'remind-24h', 'dm-24h', 'dm-24h', 'lock'].map(
      (rule, i) => ({ rule, status: 'sent', at: nyEvening(9, 25) + i * 3_600_000 }),
    ),
    dueNow: ['final-roster', 'import-string'],
    waiting: [],
  },
  {
    eventId: 'r2',
    name: 'Raid night',
    startsAt: nyEvening(9, 29),
    status: 'open',
    done: [{ rule: 'post', status: 'sent', at: nyEvening(9, 22) }],
    dueNow: ['remind-72h'],
    waiting: ['Elowen', 'Fenwick', 'Thistle'].map((displayName, i) => ({
      memberId: `m${i}`,
      displayName,
    })),
  },
];

/** Random's log for those raids: a skip and a failure among the sends, each with its reason. */
const GALLERY_COORDINATOR_LOG: CoordinatorDeskEntry[] = [
  ['post', 'sent', null, 22],
  ['remind-72h', 'sent', null, 25],
  ['digest', 'sent', null, 25],
  ['dm-24h', 'skipped', 'Thistle turned reminder DMs off', 27],
  ['dm-24h', 'failed', 'Discord refused the DM: Elowen doesn’t accept DMs from server members', 27],
  ['lock', 'sent', null, 28],
].map(([rule, status, detail, day], i) => ({
  id: `a${i}`,
  eventId: 'r1',
  raidName: 'Raid night',
  rule: rule as string,
  status: status as string,
  detail: detail as string | null,
  at: nyEvening(9, day as number) - 3 * 3_600_000,
}));

const firstSpec = (c: WowClass) => Object.keys(CLASSES[c])[0] ?? '';

/** The launch raids with no kills: what the ledger shows before Dec 9. */
const emptyLedger = (): LedgerRaid[] =>
  LAUNCH_RAIDS.map((raid) => ({
    ...raid,
    bosses: raid.bosses.map((boss) => ({ ...boss, firstKillAt: null, loot: [] })),
  }));

const killedOn = (day: number) =>
  Date.parse(`2026-12-${String(day).padStart(2, '0')}T22:10:00-05:00`);

/** A second raid week: the shape `progress-get` answers once kills exist. */
function raidingLedger(): { raids: LedgerRaid[]; latest: LedgerKill } {
  const raids = emptyLedger();
  const kills: [number, number, number][] = [
    [0, 0, 10],
    [0, 1, 10],
    [0, 2, 11],
    [0, 3, 17],
    [1, 0, 16],
    [1, 1, 17],
  ];
  for (const [r, b, day] of kills) raids[r]!.bosses[b]!.firstKillAt = killedOn(day);
  const latest = raids[1]!.bosses[1]!;
  latest.loot = [
    { name: 'Mantle of the Rotting Bough', quality: 'epic' },
    { name: 'Decaybark Band', quality: 'rare' },
    { name: 'Mossgrown Satchel', quality: 'uncommon' },
  ];
  return {
    raids,
    latest: {
      raidName: raids[1]!.name,
      bossName: latest.name,
      killedAt: latest.firstKillAt ?? 0,
      loot: latest.loot,
    },
  };
}

const LEDGER_LOCKED = emptyLedger();
const LEDGER_RAIDING = raidingLedger();

const GALLERY_ROSTER: RosterMember[] = [
  {
    id: 'm1',
    displayName: 'Stridulent',
    rank: 'officer',
    main: { name: 'Stridulent', class: 'warrior', spec: 'protection', role: 'tank' },
  },
  {
    id: 'm3',
    displayName: 'Aeryn',
    rank: 'officer',
    main: { name: 'Aeryn', class: 'priest', spec: 'holy', role: 'healer' },
  },
  {
    id: 'm4',
    displayName: 'Morwenna',
    rank: 'raider',
    main: { name: 'Morwenna', class: 'mage', spec: 'frost', role: 'ranged' },
  },
  {
    id: 'm5',
    displayName: 'Kaelthir',
    rank: 'raider',
    main: { name: 'Kaelthir', class: 'rogue', spec: 'combat', role: 'melee' },
  },
  {
    id: 'm2',
    displayName: 'Bloodfen',
    rank: 'flex-raider',
    main: { name: 'Bloodfen Il', class: 'warrior', spec: 'protection', role: 'tank' },
  },
  { id: 'm6', displayName: 'Wendeline', rank: 'recruit', main: null },
];

const GALLERY_DAY = 86_400_000;

/** The wall's members as `member-list` answers them, with a second recruit and the two dates. */
const GALLERY_ROSTER_DESK: RosterDeskMember[] = [
  ...GALLERY_ROSTER,
  {
    id: 'm7',
    displayName: 'Ysolde',
    rank: 'recruit',
    main: { name: 'Ysolde', class: 'warlock', spec: 'affliction', role: 'ranged' },
  },
].map((m, i) => ({
  ...m,
  tier:
    m.rank === 'raid-leader'
      ? 'leader'
      : m.rank === 'flex-raider'
        ? 'raider'
        : (m.rank ?? 'public'),
  rankSince:
    m.rank === 'recruit'
      ? CALENDAR_NOW - (m.main ? 9 : 2) * GALLERY_DAY
      : i % 2
        ? CALENDAR_NOW - 60 * GALLERY_DAY
        : null,
  syncedAt: CALENDAR_NOW - 6 * 60_000,
}));

const GALLERY_ROLES = {
  '300000000000000001': 'officer',
  '300000000000000002': 'raid-leader',
  '300000000000000003': 'raider',
  '300000000000000004': 'flex-raider',
  '300000000000000005': 'recruit',
};

const GALLERY_TONIGHT_SIGNUPS: TonightSignup[] = [
  ['Stridulent', 'warrior', 'protection', 'tank', 'accepted', null, 1],
  ['Bloodfen Il', 'warrior', 'protection', 'tank', 'late', 'by 8:30', null],
  ['Aeryn', 'priest', 'holy', 'healer', 'accepted', null, 2],
  ['Garrick', 'paladin', 'holy', 'healer', 'tentative', 'depends on work', null],
  ['Brannoch', 'warrior', 'fury', 'melee', 'accepted', null, 1],
  ['Morwenna', 'mage', 'frost', 'ranged', 'accepted', null, 2],
  ['Nimue', 'mage', 'fire', 'ranged', 'declined', null, null],
].map(([name, cls, spec, role, status, note, group], i) => ({
  id: `s${i}`,
  characterName: name as string,
  class: cls as string,
  spec: spec as string,
  role: role as string,
  status: status as string,
  queued: false,
  note: note as string | null,
  roster: group ? 'rostered' : 'pending',
  group: group as number | null,
}));

const GALLERY_CHARACTERS: ListedCharacter[] = [
  {
    id: 'g1',
    name: 'Bloodfen Il',
    class: 'warrior',
    spec: 'protection',
    role: 'tank',
    isMain: true,
  },
  { id: 'g2', name: 'Bloodfen Ii', class: 'warrior', spec: 'fury', role: 'melee', isMain: false },
];

const GALLERY_POLL: PollCardOption[] = [
  { id: 'o1', label: 'Sunday', votes: 14 },
  { id: 'o2', label: 'Monday', votes: 9 },
  { id: 'o3', label: 'Either', votes: 3 },
];

// Dev only (see routes.ts): every ui-kit element with sample data.
const template = html<Page>`
  <div class="page">
    <h1>Components</h1>
    <p class="lead">Every @vintage/ui-kit element. Switch the theme to check both: <vintage-theme-switch></vintage-theme-switch></p>
    <section>
      <h2>Officer strip</h2>
      <p>Leaders and officers see it above the hero: who hasn't answered, comp gaps, the coordinator.</p>
      <vintage-officer-strip
        event-title="Launch night"
        state="running"
        state-detail="last: reminded the people who haven’t answered"
        :waiting="${() => ['Brannoch', 'Cadric', 'Elowen', 'Fenwick', 'Garrick', 'Isolde']}"
        :gaps="${() => ['need 1 more healer', 'no Mark of the Wild']}"
      ></vintage-officer-strip>
      <vintage-officer-strip state="paused" href="/officers"></vintage-officer-strip>
    </section>
    <section>
      <h2>Tonight</h2>
      <p>The officers' quarters' first tab. Actions here run against the gallery's client, so they report a refusal.</p>
      <vintage-tonight
        time-zone="America/New_York"
        :raid="${() => ({ id: 'demo', name: 'Launch night', startsAt: Date.UTC(2026, 10, 5, 1), size: 10, status: 'open' })}"
        :signups="${() => GALLERY_TONIGHT_SIGNUPS}"
        :gaps="${() => ['need 1 more healer']}"
        :waiting="${() => ['Elowen', 'Fenwick']}"
      ></vintage-tonight>
    </section>
    <section>
      <h2>Calendar</h2>
      <p>The quarters' Calendar tab, in London on Oct 26: the guild's clock beside the viewer's, the week the clocks disagree, an overlap, a paused schedule, and history folded under Earlier. Actions report the gallery client's refusal.</p>
      <vintage-calendar-desk
        can-edit
        time-zone="Europe/London"
        :now="${() => CALENDAR_NOW}"
        :raids="${() => GALLERY_RAIDS}"
        :schedules="${() => GALLERY_SCHEDULES}"
      ></vintage-calendar-desk>
      <h3>Month</h3>
      <vintage-calendar-desk
        can-edit
        view="month"
        time-zone="America/New_York"
        :now="${() => CALENDAR_NOW}"
        :raids="${() => GALLERY_RAIDS}"
        :schedules="${() => GALLERY_SCHEDULES}"
      ></vintage-calendar-desk>
      <h3>Before any schedule, read-only</h3>
      <vintage-calendar-desk time-zone="America/New_York" :now="${() => CALENDAR_NOW}"></vintage-calendar-desk>
      <h3>Month at phone width</h3>
      <div class="phone">
        <vintage-raid-month
          time-zone="America/New_York"
          :now="${() => CALENDAR_NOW}"
          :raids="${() => GALLERY_RAIDS}"
        ></vintage-raid-month>
      </div>
    </section>
    <section>
      <h2>Random</h2>
      <p>The quarters' Random tab: what the coordinator did and will do for each raid, who it's chasing, its log with the reason for each entry, and its settings. Actions report the gallery client's refusal.</p>
      <vintage-coordinator-desk
        can-act
        can-configure
        time-zone="America/New_York"
        :config="${() => GALLERY_COORDINATOR}"
        :upcoming="${() => GALLERY_COORDINATOR_RAIDS}"
        :entries="${() => GALLERY_COORDINATOR_LOG}"
      ></vintage-coordinator-desk>
      <h3>Paused, as a raid leader sees it</h3>
      <vintage-coordinator-desk
        can-act
        time-zone="America/New_York"
        :config="${() => ({ ...GALLERY_COORDINATOR, paused: true })}"
      ></vintage-coordinator-desk>
      <h3>Not set up</h3>
      <vintage-coordinator-desk
        can-act
        can-configure
        time-zone="America/New_York"
        :config="${() => ({ ...GALLERY_COORDINATOR, signupChannelId: null, opsChannelId: null })}"
      ></vintage-coordinator-desk>
    </section>
    <section>
      <h2>Roster</h2>
      <p>The quarters' Roster tab: recruits with how long they've been on trial, who has no character, everyone by rank with the date they got it, the last sync, and the role map. Saving the map previews the change first; here it reports the gallery client's answer.</p>
      <vintage-roster-desk
        can-configure
        time-zone="America/New_York"
        :now="${() => CALENDAR_NOW}"
        :members="${() => GALLERY_ROSTER_DESK}"
        :roles="${() => GALLERY_ROLES}"
      ></vintage-roster-desk>
    </section>
    <section>
      <h2>Progress</h2>
      <p>The quarters' Progress tab: the ledger with a form to record a kill and what dropped. The summary says whether it becomes the ledger entry. Recording reports the gallery client's refusal.</p>
      <vintage-progress-desk
        open
        can-record
        time-zone="America/New_York"
        opens-on="${RAIDS_OPEN_ON}"
        :raids="${() => LEDGER_RAIDING.raids}"
        :latest="${() => LEDGER_RAIDING.latest}"
      ></vintage-progress-desk>
      <h3>Before the raids unlock</h3>
      <vintage-progress-desk
        can-record
        time-zone="America/New_York"
        opens-on="${RAIDS_OPEN_ON}"
        :raids="${() => LEDGER_LOCKED}"
      ></vintage-progress-desk>
    </section>
    <section>
      <h2>Characters and profile</h2>
      <p>The member's characters (Characters page) and their raid settings (Profile).</p>
      <vintage-character-list :characters="${() => GALLERY_CHARACTERS}"></vintage-character-list>
      <vintage-member-prefs timezone="America/New_York" :characters="${() => GALLERY_CHARACTERS}"></vintage-member-prefs>
    </section>
    <section>
      <h2>Member menu</h2>
      <p>The signed-in member in the header: avatar (or initial), name, rank, and a menu.</p>
      <div class="row">
        <vintage-member-menu name="Bloodfen" detail="Flex raider"></vintage-member-menu>
        <vintage-member-menu name="Aeryn" detail="Officer" avatar-src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%234aa5ad'/%3E%3C/svg%3E"></vintage-member-menu>
      </div>
    </section>
    <section>
      <h2>Roster wall</h2>
      <vintage-roster-wall me="m2" :members="${() => GALLERY_ROSTER}"></vintage-roster-wall>
    </section>
    <section>
      <h2>Poll card</h2>
      <p>Voting runs <code>vote-cast</code> through the command client.</p>
      <div class="cards">
        <vintage-poll-card poll-id="demo" question="Off-night dungeons: Sunday or Monday?" description="For attunement runs." note="26 ballots · raiders and up · closes Friday" :options="${() => GALLERY_POLL}" myVote="o2"></vintage-poll-card>
        <vintage-poll-card poll-id="demo" question="A closed poll" note="closed" readonly :options="${() => GALLERY_POLL}"></vintage-poll-card>
      </div>
    </section>
    <section>
      <h2>Class badges</h2>
      <p class="row">
        ${repeat(
          () => CLASS_NAMES,
          html<WowClass>`<vintage-class-badge wow-class="${(c) => c}" spec="${firstSpec}"></vintage-class-badge>`,
        )}
      </p>
    </section>
    <section>
      <h2>Role badges</h2>
      <p class="row">
        ${repeat(() => ROLES, html<Role>`<vintage-role-badge raid-role="${(r) => r}"></vintage-role-badge>`)}
      </p>
    </section>
    <section>
      <h2>Character form</h2>
      <p>Runs <code>character-add</code> through the stub client, which answers NOT_CONNECTED.</p>
      <vintage-character-form></vintage-character-form>
    </section>
    <section>
      <h2>Signup card</h2>
      <p>One per status. Answering runs <code>signup-set</code> through the command client.</p>
      <div class="cards">
        ${repeat(
          () => SIGNUP_STATUSES,
          html<SignupStatus>`
            <vintage-signup-card event-id="demo" event-title="Onyxia's Lair" starts-at="2026-12-10T03:00:00Z" lock-label="signups lock 6:00 pm" status="${(s) => s}" character-id="demo" character-label="Bloodfen · Protection"></vintage-signup-card>
          `,
        )}
      </div>
    </section>
    <section>
      <h2>Boss ledger · before Dec 9</h2>
      <p>Every slot empty and each row says when it unlocks. Hover or focus a slot for the boss name.</p>
      <vintage-boss-ledger :raids="${() => LEDGER_LOCKED}" :art="${() => ART.raids}" opens-on="${RAIDS_OPEN_ON}"></vintage-boss-ledger>
    </section>
    <section>
      <h2>Boss ledger · raiding</h2>
      <p>What <code>progress-get</code> answers once kills exist: gold slots with the first-kill date, the next target dashed, and the latest kill's loot in quality colors.</p>
      <vintage-boss-ledger open :raids="${() => LEDGER_RAIDING.raids}" :latest="${() => LEDGER_RAIDING.latest}" :art="${() => ART.raids}" opens-on="${RAIDS_OPEN_ON}"></vintage-boss-ledger>
    </section>
    <section><h2>Sign-in card</h2><vintage-sign-in-card></vintage-sign-in-card></section>
    <section>
      <h2>Figures</h2>
      <div class="figures">
        <vintage-figure value="10" unit="days" caption="to launch"></vintage-figure>
        <vintage-figure value="0" unit="/ 22" caption="bosses down"></vintage-figure>
        <vintage-figure value="33" caption="on the rolls" tone="good"></vintage-figure>
        <vintage-figure value="7" unit="/ 22" caption="accent tone" tone="accent"></vintage-figure>
      </div>
    </section>
    <section>
      <h2>Hero</h2>
      <p>The home page uses it with art; here it is plain, with every slot filled.</p>
      <vintage-hero>
        <span slot="eyebrow">Normal ruleset</span>
        <h1>Forming for <em>Forever.</em></h1>
        <p slot="standfirst">A raiding guild for WoW: Forever.</p>
        <div slot="actions"><violet-button appearance="primary">Apply to raid</violet-button></div>
        <div slot="figures">
          <vintage-figure value="45" unit="days" caption="to raids"></vintage-figure>
          <vintage-figure value="33" caption="on the rolls" tone="good"></vintage-figure>
        </div>
      </vintage-hero>
    </section>
  </div>
`;

const styles = css`
  ${pageStyles}

  .figures {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }

  .phone {
    max-inline-size: 22rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
    gap: var(--space-md);
  }

  vintage-hero h1 em {
    font-style: normal;
    color: var(--color-text-accent);
  }
`;

export class Page extends FASTElement {}
await Page.define({ name: 'vintage-ui-gallery', template, styles });
