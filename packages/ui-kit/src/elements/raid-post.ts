import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { hasSplitDpsTargets, type RoleTargets } from '@vintage/comp-solver';
import { specIcon } from '@vintage/wow-data';
import { titleCase } from '../labels';

/** One signup as the raid post shows it: the slice of `signup-list` it needs. */
export interface RaidPostSignup {
  memberId: string;
  characterName: string;
  class: string;
  spec: string;
  role: string;
  status: string;
  /** `pending`, `rostered`, or `benched` (a leader's Standby). */
  roster: string;
  queued: boolean;
  lateMinutes: number | null;
}

/** A name as the post lists it, with whether it's the viewer's own. */
type Entry = { signup: RaidPostSignup; mine: boolean };
type Column = { role: string; label: string; target: number | null; rows: Entry[] };
type StatusPart = { key: string; label: string; count: number };
type NameLine = { key: string; label: string; rows: Entry[] };

const GOING = new Set(['accepted', 'late']);

/** Class first so the icons cluster, then character name: the Discord post's order. */
const byClassThenName = (a: RaidPostSignup, b: RaidPostSignup) =>
  a.class.localeCompare(b.class) || a.characterName.localeCompare(b.characterName);

const byName = (a: RaidPostSignup, b: RaidPostSignup) =>
  a.characterName.localeCompare(b.characterName);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const iconUrl = (s: RaidPostSignup) => {
  const icon = specIcon(s.class, s.spec);
  return icon ? `https://wow.zamimg.com/images/wow/icons/small/${icon}.jpg` : '';
};

const who = html<Entry>`
  <li class="${(e) => (e.mine ? 'who me' : 'who')}" title="${(e) => `${titleCase(e.signup.spec)} ${titleCase(e.signup.class)}`}">
    ${when(
      (e) => iconUrl(e.signup),
      html<Entry>`<img src="${(e) => iconUrl(e.signup)}" alt="" width="18" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`,
    )}
    <span class="name">${(e) => e.signup.characterName}</span>
    ${when(
      (e) => e.signup.status === 'late' && e.signup.lateMinutes,
      html<Entry>`<span class="late">${(e) => e.signup.lateMinutes}m late</span>`,
    )}
  </li>
`;

const template = html<VintageRaidPost>`
  <section class="post" part="post" aria-label="Signups">
    <p class="status" part="status">
      ${repeat(
        (x) => x.statusParts,
        html<StatusPart>`<span class="s ${(p) => p.key}"><i aria-hidden="true"></i><b>${(p) => p.count}</b> ${(p) => p.label}</span>`,
      )}
    </p>
    <div class="${(x) => (x.columns.length > 1 ? 'columns' : 'columns one')}" part="columns">
      ${repeat(
        (x) => x.columns,
        html<Column, VintageRaidPost>`
          <div class="col">
            <h4>${(c) => c.label} <span>${(c) => (c.target === null ? c.rows.length : `${c.rows.length}/${c.target}`)}</span></h4>
            ${when((c) => c.rows.length === 0, html`<p class="none">—</p>`)}
            <ul>${repeat((c) => c.rows, who)}</ul>
          </div>
        `,
      )}
    </div>
    <div class="foot" part="foot">
      ${repeat(
        (x) => x.nameLines,
        html<NameLine, VintageRaidPost>`
          <div class="line ${(l) => l.key}">
            <b>${(l) => l.label}</b>
            <ul>${repeat((l) => l.rows, who)}</ul>
          </div>
        `,
      )}
      <p class="line missing ${(x) => (x.missing ? '' : 'ok')}">
        <b>${(x) => (x.missing ? 'Missing' : 'Comp')}</b> ${(x) => x.missing || 'no gaps'}
      </p>
      ${when(
        (x) => x.absent.length > 0,
        html<VintageRaidPost>`
          <p class="line absent"><b>Absent</b> ${(x) => x.absent.map((s) => s.characterName).join(' · ')}</p>
        `,
      )}
    </div>
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
  }

  .post {
    display: grid;
    gap: var(--space-sm);
  }

  p,
  ul,
  h4 {
    margin: 0;
  }

  ul {
    padding: 0;
    list-style: none;
  }

  /* going · late · tentative · standby · absent, each with its signup color */
  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.1rem;
    color: var(--color-text-secondary);
  }

  .s {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .s b {
    color: var(--color-text-primary);
  }

  .s i {
    inline-size: 0.6rem;
    block-size: 0.6rem;
    border-radius: 50%;
    background: var(--_dot, var(--color-text-secondary));
  }

  .s.accepted {
    --_dot: var(--color-signup-accepted);
  }

  .s.late {
    --_dot: var(--color-signup-late);
  }

  .s.tentative {
    --_dot: var(--color-signup-tentative);
  }

  .s.bench {
    --_dot: var(--color-signup-bench);
  }

  .s.declined {
    --_dot: var(--color-signup-declined);
  }

  /* Tanks and Healers, then Melee and Ranged: the post's 2x2 */
  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-sm) var(--space-md);
    padding-block: var(--space-sm);
    border-block: var(--border-width-thin) solid var(--color-border-default);
  }

  .columns.one {
    grid-template-columns: 1fr;
  }

  .col {
    display: grid;
    gap: 0.3rem;
    align-content: start;
    min-inline-size: 0;
  }

  h4 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  h4 span {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .col ul {
    display: grid;
    gap: 0.2rem;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-inline-size: 0;
  }

  .who img {
    flex: none;
    inline-size: 1.125rem;
    block-size: 1.125rem;
    border-radius: 0.2rem;
  }

  .who .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .who.me .name {
    color: var(--color-text-accent);
    font-weight: var(--font-weight-bold);
  }

  .who .late {
    flex: none;
    color: var(--color-signup-late);
    font-size: var(--font-size-xs);
  }

  .none {
    color: var(--color-text-secondary);
  }

  .foot {
    display: grid;
    gap: 0.4rem;
    color: var(--color-text-secondary);
  }

  .line b {
    color: var(--color-text-primary);
    margin-inline-end: 0.35rem;
  }

  /* Standby and Tentative names run inline, separated by a dot, as in the post. */
  div.line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.2rem 0;
  }

  div.line ul {
    display: contents;
  }

  /* The dot trails each name, so a wrapped line never starts with one. */
  div.line .who:not(:last-child)::after {
    content: '·';
    margin-inline: 0.4rem;
    color: var(--color-text-secondary);
  }

  .missing:not(.ok) b {
    color: var(--color-text-accent);
  }
`;

/**
 * The raid's signups laid out like the Discord signup post, so the site feels familiar: the
 * status counts (going, late, tentative, standby, absent), who is going in Tanks / Healers /
 * Melee / Ranged columns with their spec icons, then Standby and Tentative names, what the comp
 * is missing against the raid's role targets, and who is absent. Names only: tentative reasons
 * stay with the leaders, as on Discord.
 *
 * @tagname vintage-raid-post
 * @summary A raid's signups in the Discord post's layout.
 * @csspart post - The whole block.
 * @csspart status - The status counts line.
 * @csspart columns - The role columns.
 * @csspart foot - Standby, Tentative, Missing, and Absent.
 */
export class VintageRaidPost extends FASTElement {
  /** The raid's signups (`signup-list`). */
  @observable signups: RaidPostSignup[] = [];
  /** The raid's role targets; null for an event without them (one Going list, no Missing). */
  @observable targets: RoleTargets | null = null;
  /** The viewer's member id, to mark their own name. */
  @attr me = '';

  /** Going and seated: Going or Late, not on a leader's Standby, not waiting in the queue. */
  get going(): RaidPostSignup[] {
    return this.signups.filter((s) => GOING.has(s.status) && s.roster !== 'benched' && !s.queued);
  }

  /** Standby: answered Standby, put there by a leader, or Going but queued behind a full raid. */
  get standby(): RaidPostSignup[] {
    return this.signups
      .filter(
        (s) =>
          s.status === 'bench' || (GOING.has(s.status) && (s.roster === 'benched' || s.queued)),
      )
      .sort(byName);
  }

  get tentative(): RaidPostSignup[] {
    return this.signups.filter((s) => s.status === 'tentative').sort(byName);
  }

  get absent(): RaidPostSignup[] {
    return this.signups.filter((s) => s.status === 'declined').sort(byName);
  }

  get statusParts(): StatusPart[] {
    const going = this.going;
    return [
      { key: 'accepted', label: 'going', count: going.filter((s) => s.status !== 'late').length },
      { key: 'late', label: 'late', count: going.filter((s) => s.status === 'late').length },
      { key: 'tentative', label: 'tentative', count: this.tentative.length },
      { key: 'bench', label: 'standby', count: this.standby.length },
      { key: 'declined', label: 'absent', count: this.absent.length },
    ];
  }

  private entries(rows: readonly RaidPostSignup[]): Entry[] {
    const me = this.me;
    return rows.map((signup) => ({ signup, mine: me !== '' && signup.memberId === me }));
  }

  get columns(): Column[] {
    const going = this.going;
    const t = this.targets;
    if (!t)
      return [
        {
          role: 'going',
          label: 'Going',
          target: null,
          rows: this.entries([...going].sort(byClassThenName)),
        },
      ];
    const split = hasSplitDpsTargets(t);
    const col = (role: string, label: string, target: number | null): Column => ({
      role,
      label,
      target,
      rows: this.entries(going.filter((s) => s.role === role).sort(byClassThenName)),
    });
    return [
      col('tank', 'Tanks', t.tank),
      col('healer', 'Healers', t.healer),
      col('melee', 'Melee', split ? t.melee : null),
      col('ranged', 'Ranged', split ? t.ranged : null),
    ];
  }

  get nameLines(): NameLine[] {
    return [
      { key: 'bench', label: 'Standby', rows: this.entries(this.standby) },
      { key: 'tentative', label: 'Tentative', rows: this.entries(this.tentative) },
    ].filter((l) => l.rows.length > 0);
  }

  /** "1 healer · 3 DPS" short of the targets, counting who is going; '' when nothing is short. */
  get missing(): string {
    const t = this.targets;
    if (!t) return '';
    const going = this.going;
    const n = (role: string) => going.filter((s) => s.role === role).length;
    const short = (target: number, have: number) => Math.max(0, target - have);
    const parts: string[] = [];
    const tanks = short(t.tank, n('tank'));
    if (tanks) parts.push(plural(tanks, 'tank', 'tanks'));
    const healers = short(t.healer, n('healer'));
    if (healers) parts.push(plural(healers, 'healer', 'healers'));
    if (hasSplitDpsTargets(t)) {
      const melee = short(t.melee, n('melee'));
      if (melee) parts.push(`${melee} melee`);
      const ranged = short(t.ranged, n('ranged'));
      if (ranged) parts.push(`${ranged} ranged`);
    } else {
      const dps = short(t.dps, n('melee') + n('ranged'));
      if (dps) parts.push(`${dps} DPS`);
    }
    return parts.join(' · ');
  }
}

if (!customElements.get('vintage-raid-post')) {
  await VintageRaidPost.define({ name: 'vintage-raid-post', template, styles });
}
