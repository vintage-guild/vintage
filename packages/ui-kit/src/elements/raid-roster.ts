import {
  attr,
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  when,
} from '@lushly-dev/fast-element';
import { ROLES, type Role } from '@vintage/wow-data';
import { roleLabel, titleCase } from '../labels';

/** The raid the roster is for: the slice of `raid-get`'s `event` it needs. */
export interface RaidRosterRaid {
  id: string;
  /** Null for an open event (kind `other` with no cap). */
  size: number | null;
  status: string;
}

/** One signup as members see it: the slice of `signup-list`. */
export interface RaidRosterSignup {
  id: string;
  memberId: string;
  characterName: string;
  class: string;
  spec: string;
  role: string;
  status: string;
  note: string | null;
  queued: boolean;
  /**
   * Place in line from `signup-list` (1 is next), null when not queued. Absent from a server
   * older than #192: then `queued` says who waits, in the list's order.
   */
  queuePosition?: number | null;
  roster: string;
  group: number | null;
}

/** The comp as `comp-suggest` answers it: its counts and the gaps' reasons. */
export interface RaidRosterComp {
  selected: number;
  raidSize: number;
  tank: number;
  healer: number;
  dps: number;
  gaps: string[];
}

/** `raid-get`'s counts by answer. */
export type RaidRosterCounts = Record<
  'accepted' | 'late' | 'tentative' | 'bench' | 'declined',
  number
>;

interface RoleGroup {
  key: Role | 'queue';
  label: string;
  rows: RaidRosterSignup[];
}

const ROLE_HEADINGS: Record<Role, string> = {
  tank: 'Tanks',
  healer: 'Healers',
  melee: 'Melee',
  ranged: 'Ranged',
};

const ANSWER_WORDS: Record<string, string> = {
  accepted: 'going',
  late: 'late',
  tentative: 'tentative',
  bench: 'bench',
  declined: 'declined',
};

/** Statuses after which the leaders' group and bench calls are the roster. */
const SETTLED = new Set(['locked', 'completed']);

/** Waiting for a spot: by `queuePosition` when the server sends it, else the `queued` flag. */
const inQueue = (s: RaidRosterSignup) =>
  s.queuePosition === undefined ? s.queued : s.queuePosition !== null;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** In a signup row (inside a group repeat), the element itself. */
const host = (c: ExecutionContext) => c.parentContext.parent as VintageRaidRoster;

const row = html<RaidRosterSignup, RoleGroup>`
  <li class="row ${(s) => s.status}" ?data-me="${(s, c) => s.memberId === host(c).me}">
    <span class="who">
      <b style="color: var(--color-class-${(s) => s.class})">${(s) => s.characterName}</b>
      <small>${(s) => titleCase(s.spec)}${(s, c) => (s.memberId === host(c).me ? ' · you' : '')}</small>
    </span>
    <span class="answer">${(s) => ANSWER_WORDS[s.status] ?? s.status}</span>
    <span class="place">${(s, c) => host(c).placement(s)}</span>
    <span class="note">${(s) => s.note ?? ''}</span>
  </li>
`;

const template = html<VintageRaidRoster>`
  <section class="roster" part="roster" aria-label="Who’s coming">
    ${when(
      (x) => x.counts,
      html<VintageRaidRoster>`
        <div class="counts" part="counts">
          ${repeat(
            (x) => x.countRows,
            html<
              [string, string]
            >`<div><b class="num">${(r) => r[1]}</b> <span>${(r) => r[0]}</span></div>`,
          )}
        </div>
      `,
    )}

    <div class="card" part="comp">
      <span class="eyebrow">Comp</span>
      ${when((x) => x.loading && !x.comp && !x.compNote, html`<p class="muted">Checking…</p>`)}
      ${when((x) => x.compNote, html<VintageRaidRoster>`<p class="muted">${(x) => x.compNote}</p>`)}
      ${when(
        (x) => x.comp,
        html<VintageRaidRoster>`
          <p class="line">${(x) => x.compLine}</p>
          ${when((x) => x.comp?.gaps.length === 0, html`<p class="ok">No gaps.</p>`)}
          <ul class="gaps">
            ${repeat((x) => x.comp?.gaps ?? [], html<string>`<li>${(g) => g}</li>`)}
          </ul>
        `,
      )}
    </div>

    ${when(
      (x) => x.signupsNote,
      html<VintageRaidRoster>`<p class="muted refused" part="signups-note">${(x) => x.signupsNote}</p>`,
    )}
    ${when(
      (x) => !x.signupsNote,
      html<VintageRaidRoster>`
        ${when(
          (x) => !x.loading && x.signups.length === 0,
          html`<p class="muted">Nobody has answered yet.</p>`,
        )}
        <div class="roles" part="signups">
          ${repeat(
            (x) => x.roleGroups,
            html<RoleGroup, VintageRaidRoster>`
              <div class="role">
                <h3>${(g) => g.label} <span>${(g) => g.rows.length}</span></h3>
                <ul>${repeat((g) => g.rows, row)}</ul>
              </div>
            `,
          )}
        </div>
        ${repeat(
          (x) => x.queueGroups,
          html<RoleGroup, VintageRaidRoster>`
            <div class="role queue" part="queue">
              <h3>${(g) => g.label} <span>${(g) => g.rows.length}</span></h3>
              <p class="muted">Going, but the raid is full. If someone drops, the next in line moves up.</p>
              <ul>${repeat((g) => g.rows, row)}</ul>
            </div>
          `,
        )}
        ${when(
          (x) => x.declined.length > 0,
          html<VintageRaidRoster>`<p class="declined" part="declined">Can’t make it: ${(x) => x.declined.map((s) => s.characterName).join(', ')}</p>`,
        )}
      `,
    )}
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .roster {
    display: grid;
    gap: var(--space-md);
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-lg);
  }

  .counts div {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }

  .num {
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    font-variant-numeric: tabular-nums;
  }

  .counts span {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--color-text-secondary);
  }

  .ok {
    color: var(--color-accent-secondary);
  }

  .gaps {
    margin: 0;
    padding-inline-start: 1.1rem;
  }

  .gaps:empty {
    display: none;
  }

  .roles {
    display: grid;
    gap: var(--space-md);
  }

  h3 {
    margin: 0 0 var(--space-xs);
    font-family: var(--font-family-display);
    font-size: var(--font-size-md);
  }

  h3 span {
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
  }

  .queue p {
    margin-block-end: var(--space-xs);
    font-size: var(--font-size-sm);
  }

  .role ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(10rem, 1.3fr) 6rem 6rem minmax(0, 1.6fr);
    align-items: center;
    gap: var(--space-sm);
    padding-block: 0.4rem;
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .row[data-me] {
    box-shadow: inset 2px 0 0 var(--color-accent-secondary);
    padding-inline-start: var(--space-xs);
  }

  .row.tentative .answer {
    opacity: 0.65;
  }

  .row.late .answer,
  .row.tentative .answer {
    color: var(--color-signup-late);
  }

  .who {
    display: grid;
    min-inline-size: 0;
  }

  .who small,
  .place,
  .note {
    color: var(--color-text-secondary);
  }

  .note {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .declined {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  @media (max-width: 40rem) {
    .row {
      grid-template-columns: 1fr auto;
    }

    .answer,
    .place {
      grid-column: 2;
      text-align: end;
    }

    .note {
      grid-column: 1 / -1;
    }

    .note:empty,
    .place:empty {
      display: none;
    }
  }
`;

/**
 * One raid's signups as members see them: the counts by answer, the comp and its gaps, who is
 * coming by role with their answer and note (and their group or bench once the roster is
 * locked), who is waiting in the queue, and who can't make it. Read-only: the officers'
 * `vintage-tonight` has the actions. Feed it `raid-get` (`raid`, `counts`), `signup-list`
 * (`signups`), and `comp-suggest` (`comp`); where the member's rank can't read one, set
 * `signups-note` or `comp-note` and that says so in its place.
 *
 * @tagname vintage-raid-roster
 * @summary A raid's signups, queue, and comp for members.
 * @csspart roster - The whole view.
 * @csspart counts - The counts by answer.
 * @csspart comp - The comp card.
 * @csspart signups - The signups by role.
 * @csspart signups-note - Said in place of the signups when the member can't read them.
 * @csspart queue - Who is waiting for a spot.
 * @csspart declined - Who can't make it.
 */
export class VintageRaidRoster extends FASTElement {
  @observable raid: RaidRosterRaid | null = null;
  /** `raid-get`'s counts by answer; null hides the strip. */
  @observable counts: RaidRosterCounts | null = null;
  /** `signup-list`, in its order (best answer first, then first to answer). */
  @observable signups: RaidRosterSignup[] = [];
  @observable comp: RaidRosterComp | null = null;
  /** Shown in place of the signups, e.g. when the member's rank can't read them. */
  @attr({ attribute: 'signups-note' }) signupsNote = '';
  /** Shown in place of the comp, e.g. when the member's rank can't read it. */
  @attr({ attribute: 'comp-note' }) compNote = '';
  /** The signed-in member's id: their row is marked. */
  @attr me = '';
  /** Still reading: nothing says "nobody" yet. */
  @attr({ mode: 'boolean' }) loading = false;

  get countRows(): [string, string][] {
    const c = this.counts;
    if (!c) return [];
    const going = c.accepted + c.late;
    const size = this.raid?.size;
    const rows: [string, string][] = [['going', size ? `${going}/${size}` : String(going)]];
    if (c.late) rows.push(['late', String(c.late)]);
    if (c.tentative) rows.push(['tentative', String(c.tentative)]);
    if (c.bench) rows.push(['bench', String(c.bench)]);
    if (c.declined) rows.push(['can’t make it', String(c.declined)]);
    return rows;
  }

  get compLine(): string {
    const c = this.comp;
    if (!c) return '';
    return [
      `${c.selected} of ${c.raidSize} picked`,
      plural(c.tank, 'tank'),
      plural(c.healer, 'healer'),
      `${c.dps} dps`,
    ].join(' · ');
  }

  get roleGroups(): RoleGroup[] {
    const playing = this.signups.filter((s) => s.status !== 'declined' && !inQueue(s));
    return ROLES.map((role) => ({
      key: role,
      label: ROLE_HEADINGS[role],
      rows: playing.filter((s) => s.role === role),
    })).filter((g) => g.rows.length > 0);
  }

  /** Who waits, next in line first (else in `signup-list`'s order), as one group or none. */
  get queueGroups(): RoleGroup[] {
    const rows = this.signups
      .filter(inQueue)
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
    return rows.length ? [{ key: 'queue', label: 'Waiting for a spot', rows }] : [];
  }

  get declined(): RaidRosterSignup[] {
    return this.signups.filter((s) => s.status === 'declined');
  }

  /** "group 2" or "benched" once the roster is locked; queued rows say their place in line. */
  placement(s: RaidRosterSignup): string {
    if (inQueue(s)) {
      const role = roleLabel(s.role).toLowerCase();
      return s.queuePosition ? `#${s.queuePosition} in line · ${role}` : `queued · ${role}`;
    }
    if (!SETTLED.has(this.raid?.status ?? '')) return '';
    if (s.roster === 'benched') return 'benched';
    return s.group === null ? '' : `group ${s.group}`;
  }
}

if (!customElements.get('vintage-raid-roster')) {
  await VintageRaidRoster.define({ name: 'vintage-raid-roster', template, styles });
}
