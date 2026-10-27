import {
  attr,
  css,
  FASTElement,
  html,
  observable,
  repeat,
  Updates,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { roleLabel, titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import { browserTimeZone } from '../zoned';
import { formatWhen } from './calendar-shared';
import { deskStyles } from './desk-styles';
import type { RosterMember } from './roster-wall';

/** One row of `member-list`: the wall's fields plus tier and the two dates. */
export interface RosterDeskMember extends RosterMember {
  tier: string;
  /** When they got their rank; null when it changed before identity recorded it. */
  rankSince: number | null;
  /** When Discord last synced them. */
  syncedAt: number;
}

/** `guild-roles-get`: Discord role id → guild rank. */
export type RosterDeskRoles = Record<string, string>;

/** The guild ranks a Discord role can grant, in order (identity's `GUILD_RANKS`). */
export const ROSTER_RANKS: readonly { rank: string; label: string }[] = [
  { rank: 'officer', label: 'Officer' },
  { rank: 'raid-leader', label: 'Raid leader' },
  { rank: 'raider', label: 'Raider' },
  { rank: 'flex-raider', label: 'Flex raider' },
  { rank: 'recruit', label: 'Recruit' },
  { rank: 'member', label: 'Member' },
  { rank: 'friend', label: 'Friend (Discord only)' },
];

/** How often apps/api's role sync runs (`crons.ts`). */
export const ROLE_SYNC_MINUTES = 15;

/** A last sync older than this means the role sync has stopped. */
const STALE_SYNC_MS = 60 * 60_000;

const DAY_MS = 86_400_000;

/** A Discord role id, as `guild-roles-set` checks it. */
const SNOWFLAKE = /^\d{17,20}$/;

const rankLabel = (rank: string | null) =>
  ROSTER_RANKS.find((r) => r.rank === rank)?.label ?? (rank ? titleCase(rank) : 'No rank');

const rankOrder = (rank: string | null) => {
  const i = ROSTER_RANKS.findIndex((r) => r.rank === rank);
  return i < 0 ? ROSTER_RANKS.length : i;
};

/** One role-map row in the form, edited in place so typing doesn't re-render the list. */
interface RoleRow {
  id: string;
  rank: string;
}

/** `guild-roles-set`'s preview diff. */
interface RoleDiff {
  added: { discordRoleId: string; rank: string }[];
  removed: { discordRoleId: string; rank: string }[];
  changed: { discordRoleId: string; from: string; to: string }[];
  unchanged: number;
}

/** The preview, waiting for the officer to confirm. */
interface Pending {
  roles: RosterDeskRoles;
  token: string;
  lines: string[];
}

/** A member as the table reads them, worded already. */
interface MemberLine {
  member: RosterDeskMember;
  main: string;
  rank: string;
  since: string;
}

/** A recruit on trial, worded. */
interface TrialLine {
  member: RosterDeskMember;
  trial: string;
}

/** "today", "1 day", "12 days". */
function days(ms: number): string {
  const n = Math.max(0, Math.floor(ms / DAY_MS));
  return n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`;
}

/** What the confirm box lists: each added, changed, and removed role in words. */
export function describeRoleDiff(diff: RoleDiff): string[] {
  return [
    ...diff.added.map((r) => `Role ${r.discordRoleId} now grants ${rankLabel(r.rank)}`),
    ...diff.changed.map(
      (r) => `Role ${r.discordRoleId}: ${rankLabel(r.from)} → ${rankLabel(r.to)}`,
    ),
    ...diff.removed.map(
      (r) => `Role ${r.discordRoleId} no longer grants ${rankLabel(r.rank)}; its holders lose it`,
    ),
  ];
}

const roleRow = html<RoleRow, VintageRosterDesk>`
  <li class="role">
    <input
      aria-label="${(_r, c) => `Discord role ${c.index + 1} id`}"
      inputmode="numeric"
      autocomplete="off"
      placeholder="Discord role id"
      :value="${(r) => r.id}"
      @input="${(r, c) => c.parent.editRole(r, 'id', (c.event.target as HTMLInputElement).value)}"
    />
    <select
      aria-label="${(_r, c) => `Discord role ${c.index + 1} rank`}"
      @change="${(r, c) => c.parent.editRole(r, 'rank', (c.event.target as HTMLSelectElement).value)}"
    >
      ${repeat(
        () => ROSTER_RANKS,
        html<
          (typeof ROSTER_RANKS)[number],
          RoleRow
        >`<option value="${(o) => o.rank}" ?selected="${(o, c) => o.rank === c.parent.rank}">${(o) => o.label}</option>`,
      )}
    </select>
    ${when(
      (_r, c) => c.parent.canConfigure,
      html<
        RoleRow,
        VintageRosterDesk
      >`<button type="button" aria-label="${(_r, c) => `Remove Discord role ${c.index + 1}`}" @click="${(r, c) => c.parent.removeRole(r)}">Remove</button>`,
    )}
  </li>
`;

const template = html<VintageRosterDesk>`
  <div class="desk wide" part="desk">
    ${when((x) => x.error, html<VintageRosterDesk>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when((x) => x.loading && !x.members.length, html`<p class="meta">Reading the roster…</p>`)}

    ${when(
      (x) => !x.loading || x.members.length,
      html<VintageRosterDesk>`
        <header class="head" part="head">
          <h2 id="h-roster">${(x) => x.headline}</h2>
          <p class="${(x) => (x.syncStale ? 'meta stale' : 'meta')}">${(x) => x.syncLine}</p>
        </header>

        <section aria-labelledby="h-trial" part="trial">
          <h3 id="h-trial">Recruits on trial</h3>
          ${when((x) => !x.trials.length, html`<p class="note">No recruits right now.</p>`)}
          <ul class="list">
            ${repeat(
              (x) => x.trials,
              html<TrialLine>`
                <li>
                  <strong>${(t) => t.member.displayName}</strong>
                  <span>${(t) => t.trial}</span>
                  ${when((t) => !t.member.main, html`<small class="flag">no character yet</small>`)}
                </li>
              `,
            )}
          </ul>
          <p class="note">How long a trial lasts isn’t settled yet, so nobody is flagged as due for review.</p>
        </section>

        ${when(
          (x) => x.noCharacter.length,
          html<VintageRosterDesk>`
            <section aria-labelledby="h-nochar" part="no-character">
              <h3 id="h-nochar">No character yet</h3>
              <p>${(x) => x.noCharacter.map((m) => m.displayName).join(', ')}</p>
              <p class="note">They add one on their Characters page; the signup card and Random use it.</p>
            </section>
          `,
        )}

        <section aria-labelledby="h-everyone" part="members">
          <h3 id="h-everyone">Everyone</h3>
          <div class="scroll">
            <table>
              <thead>
                <tr><th scope="col">Member</th><th scope="col">Main</th><th scope="col">Rank</th><th scope="col">Rank since</th></tr>
              </thead>
              <tbody>
                ${repeat(
                  (x) => x.lines,
                  html<MemberLine>`
                    <tr>
                      <th scope="row">${(l) => l.member.displayName}</th>
                      <td><span style="${(l) => (l.member.main ? `color: var(--color-class-${l.member.main.class})` : '')}">${(l) => l.main}</span></td>
                      <td>${(l) => l.rank}</td>
                      <td>${(l) => l.since}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        </section>

        <form class="roles" part="roles" aria-labelledby="h-roles" @submit="${(x, c) => x.submit(c.event)}">
          <h3 id="h-roles">Discord roles → guild rank</h3>
          <p class="note">Each member gets the highest rank among their Discord roles, and their permissions follow it at the next sync. In Discord, turn on Developer Mode, then right-click a role and choose Copy Role ID.</p>
          ${when((x) => x.roles === null, html`<p class="meta">Reading the role map…</p>`)}
          <fieldset ?disabled="${(x) => !x.canConfigure || x.busy || !!x.pending}">
            <legend class="sr">Role map</legend>
            ${when(
              (x) => x.roles !== null && !x.rows.length,
              html`<p class="note">No roles mapped: everyone syncs as public.</p>`,
            )}
            <ol class="rows">${repeat((x) => x.rows, roleRow, { positioning: true })}</ol>
          </fieldset>
          ${when(
            (x) => x.canConfigure && !x.pending,
            html<VintageRosterDesk>`
              <p class="actions">
                <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.addRole()}">Add a role</button>
                <button type="submit" class="primary" ?disabled="${(x) => x.busy || !x.dirty}">Review changes</button>
                <button type="button" ?disabled="${(x) => x.busy || !x.dirty}" @click="${(x) => x.reset()}">Undo changes</button>
              </p>
            `,
          )}
          ${when(
            (x) => x.pending,
            html<VintageRosterDesk>`
              <div class="confirm" role="alertdialog" aria-labelledby="roles-confirm" aria-describedby="roles-confirm-detail">
                <p id="roles-confirm"><strong>Save the role map?</strong></p>
                <ul id="roles-confirm-detail">${repeat((x) => x.pending?.lines ?? [], html<string>`<li>${(l) => l}</li>`)}</ul>
                <p class="note">Ranks and permissions change at the next sync, within ${ROLE_SYNC_MINUTES} minutes.</p>
                <p class="actions">
                  <button type="button" class="danger" ?disabled="${(x) => x.busy}" @click="${(x) => x.confirm()}">Save the role map</button>
                  <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.keepEditing()}">Keep editing</button>
                </p>
              </div>
            `,
          )}
          ${when(
            (x) => !x.canConfigure,
            html`<p class="note">Officers change the role map. You can read it here.</p>`,
          )}
          <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
        </form>
      `,
    )}
  </div>
`;

const styles = css`
  .desk.wide {
    max-inline-size: 60rem;
  }

  h2,
  h3 {
    margin: 0;
    text-wrap: balance;
  }

  h2 {
    font-size: var(--font-size-lg);
  }

  h3 {
    font-size: var(--font-size-md);
  }

  .head,
  section,
  .roles {
    display: grid;
    gap: var(--space-xs);
    min-inline-size: 0;
  }

  .head p,
  section p {
    margin: 0;
  }

  .stale {
    color: var(--color-feedback-danger);
  }

  .list {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-xs) var(--space-sm);
  }

  .flag {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th,
  td {
    padding: var(--space-xs) var(--space-sm);
    text-align: start;
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    white-space: nowrap;
  }

  thead th {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }

  tbody th {
    font-weight: var(--font-weight-medium);
  }

  .rows {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .role {
    display: grid;
    grid-template-columns: minmax(0, 14rem) minmax(0, 12rem) max-content;
    gap: var(--space-xs);
  }

  @media (max-width: 30rem) {
    .role {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .confirm {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-feedback-danger);
    border-radius: 0.5rem;
  }

  .confirm p,
  .confirm ul {
    margin: 0;
  }

  button.danger {
    background: var(--color-feedback-danger);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }
`;

/**
 * The officers' Roster tab: who is in the guild by rank, recruits with how long they have been
 * on trial, who has no character yet, when Discord last synced, and the Discord role → rank map.
 * Feed it `member-list` (`members`) and `guild-roles-get` (`roles`). Saving the map needs
 * `can-configure` (officer tier, as `guild-roles-set` is) and goes through the server's preview
 * and confirm token. After it saves it emits `roster-changed` so the page reads again.
 *
 * @tagname vintage-roster-desk
 * @summary Members by rank, recruits on trial, the last sync, and the role → rank map.
 * @fires roster-changed - After the role map is saved.
 * @csspart desk - The whole desk.
 * @csspart head - The count and the last sync.
 * @csspart trial - Recruits on trial.
 * @csspart no-character - Members with no character yet.
 * @csspart members - Everyone, as a table.
 * @csspart roles - The role map form.
 * @csspart status - What just happened.
 */
export class VintageRosterDesk extends FASTElement {
  /** `member-list`. */
  @observable members: RosterDeskMember[] = [];
  /** `guild-roles-get`; null until it is read. */
  @observable roles: RosterDeskRoles | null = null;
  /** The clock for trial lengths and the sync's age; tests set it. */
  @observable now = Date.now();
  /** Optional IANA zone for dates; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Save the role map (officer tier). */
  @attr({ attribute: 'can-configure', mode: 'boolean' }) canConfigure = false;
  @attr({ mode: 'boolean' }) loading = false;
  /** Why the roster could not be read. */
  @attr error = '';
  @observable rows: RoleRow[] = [];
  @observable dirty = false;
  @observable busy = false;
  @observable pending: Pending | null = null;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  rolesChanged(): void {
    if (!this.dirty) this.reset();
  }

  private get zone(): string {
    return this.timeZone || browserTimeZone();
  }

  private day(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: this.zone,
    });
  }

  @volatile
  get headline(): string {
    const n = this.members.length;
    return `${n} member${n === 1 ? '' : 's'} on the rolls`;
  }

  /** The newest `syncedAt`: the role sync touches everyone, unchanged members too. */
  @volatile
  get lastSync(): number | null {
    return this.members.reduce<number | null>(
      (t, m) => (t === null || m.syncedAt > t ? m.syncedAt : t),
      null,
    );
  }

  @volatile
  get syncStale(): boolean {
    const last = this.lastSync;
    return last !== null && this.now - last > STALE_SYNC_MS;
  }

  @volatile
  get syncLine(): string {
    const last = this.lastSync;
    if (last === null)
      return `Discord syncs ranks every ${ROLE_SYNC_MINUTES} minutes. Nobody has synced yet.`;
    const when = `Last synced from Discord ${formatWhen(last, this.zone)}.`;
    return this.syncStale
      ? `${when} The sync runs every ${ROLE_SYNC_MINUTES} minutes, so it has stopped: check the bot’s token and server id in Convex.`
      : `${when} It runs every ${ROLE_SYNC_MINUTES} minutes.`;
  }

  /** Recruits, longest on trial first; those with no recorded start last. */
  @volatile
  get trials(): TrialLine[] {
    return this.members
      .filter((m) => m.rank === 'recruit')
      .sort(
        (a, b) =>
          (a.rankSince ?? Number.POSITIVE_INFINITY) - (b.rankSince ?? Number.POSITIVE_INFINITY) ||
          a.displayName.localeCompare(b.displayName),
      )
      .map((member) => ({
        member,
        trial:
          member.rankSince === null
            ? 'on trial since before tracking began'
            : `on trial ${days(this.now - member.rankSince)} (since ${this.day(member.rankSince)})`,
      }));
  }

  @volatile
  get noCharacter(): RosterDeskMember[] {
    return this.members.filter((m) => !m.main);
  }

  @volatile
  get lines(): MemberLine[] {
    return [...this.members]
      .sort(
        (a, b) =>
          rankOrder(a.rank) - rankOrder(b.rank) || a.displayName.localeCompare(b.displayName),
      )
      .map((member) => ({
        member,
        main: member.main
          ? `${member.main.name} · ${titleCase(member.main.class)} · ${roleLabel(member.main.role)}`
          : 'no character yet',
        rank: rankLabel(member.rank),
        since: member.rankSince === null ? 'before tracking' : this.day(member.rankSince),
      }));
  }

  /** Put the form back to the saved map. */
  reset(): void {
    this.rows = Object.entries(this.roles ?? {})
      .sort(([a, ra], [b, rb]) => rankOrder(ra) - rankOrder(rb) || a.localeCompare(b))
      .map(([id, rank]) => ({ id, rank }));
    this.dirty = false;
    this.pending = null;
  }

  addRole(): void {
    this.rows = [...this.rows, { id: '', rank: 'member' }];
    this.dirty = true;
  }

  removeRole(row: RoleRow): void {
    this.rows = this.rows.filter((r) => r !== row);
    this.dirty = true;
  }

  editRole(row: RoleRow, field: 'id' | 'rank', value: string): void {
    row[field] = field === 'id' ? value.trim() : value;
    this.dirty = true;
  }

  keepEditing(): void {
    this.pending = null;
    this.say('idle', '');
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.review();
  }

  /** The map the form holds, or why it can't be saved. */
  private formMap(): { roles: RosterDeskRoles } | { problem: string } {
    const roles: RosterDeskRoles = {};
    for (const row of this.rows) {
      if (!row.id) continue;
      if (!SNOWFLAKE.test(row.id)) {
        return {
          problem: `“${row.id}” isn’t a Discord role id: copy the 17 to 20 digits from Discord`,
        };
      }
      if (roles[row.id]) return { problem: `Role ${row.id} is listed twice` };
      roles[row.id] = row.rank;
    }
    if (!Object.values(roles).includes('officer')) {
      return {
        problem:
          'Keep at least one role mapped to Officer, or every officer drops to public at the next sync',
      };
    }
    return { roles };
  }

  @command('vintage.guild-roles-review', {
    label: 'Review the role map',
    description:
      'Ask the server what saving the Discord role → rank map in the form would change. Nothing is saved until it is confirmed.',
    category: 'Officers',
  })
  async review(): Promise<ElementResult<unknown>> {
    if (!this.canConfigure) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers change the role map' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const map = this.formMap();
    if ('problem' in map) {
      this.say('error', `${map.problem}.`);
      return failure({ code: 'VALIDATION_ERROR', message: map.problem });
    }
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: { diff?: RoleDiff };
        confirmToken?: string;
      }>('guild-roles-set', { roles: map.roles });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      const diff = raw.success ? raw.data?.preview?.diff : undefined;
      if (!token || !diff) {
        // Saved without a preview (a host that confirms on its own).
        this.dirty = false;
        this.say('success', 'Saved. Ranks follow at the next sync.');
        this.$emit('roster-changed');
        return result;
      }
      const lines = describeRoleDiff(diff);
      if (!lines.length) {
        this.dirty = false;
        this.say('idle', 'Nothing changed.');
        return result;
      }
      this.pending = { roles: map.roles, token, lines };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
      if (this.pending) {
        Updates.enqueue(() =>
          this.shadowRoot?.querySelector<HTMLButtonElement>('.confirm button.danger')?.focus(),
        );
      }
    }
  }

  /** Save the reviewed map with the preview's token. */
  async confirm(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'Nothing waiting' });
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'guild-roles-set',
          { roles: pending.roles },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.dirty = false;
      this.say(
        'success',
        `Saved. Ranks and permissions follow at the next sync, within ${ROLE_SYNC_MINUTES} minutes.`,
      );
      this.$emit('roster-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private say(kind: 'idle' | 'error' | 'success', text: string): void {
    this.statusKind = kind;
    this.statusText = text;
  }
}

if (!customElements.get('vintage-roster-desk')) {
  await VintageRosterDesk.define({
    name: 'vintage-roster-desk',
    template,
    styles: [deskStyles, styles],
  });
}
