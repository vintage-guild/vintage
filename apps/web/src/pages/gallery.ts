import { css, FASTElement, html, repeat } from '@lushly-dev/fast-element';
import { LAUNCH_RAIDS, RAIDS_OPEN_ON } from '@vintage/progress/contract';
import {
  type LedgerKill,
  type LedgerRaid,
  type PollCardOption,
  type RosterMember,
  SIGNUP_STATUSES,
  type SignupStatus,
} from '@vintage/ui-kit';
import { CLASS_NAMES, CLASSES, ROLES, type Role, type WowClass } from '@vintage/wow-data';
import { ART } from '../content/art';
import { pageStyles } from './page-styles';

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
