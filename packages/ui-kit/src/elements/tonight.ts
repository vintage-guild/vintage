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
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { ROLES, type Role } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';

/** The raid the Tonight view is about: the slice of `raid-get` / `raid-list` it shows. */
export interface TonightRaid {
  id: string;
  name: string;
  /** Epoch ms. */
  startsAt: number;
  size: number;
  status: string;
}

/** One signup as the Tonight view shows it: the slice of `signup-list`. */
export interface TonightSignup {
  id: string;
  characterName: string;
  class: string;
  spec: string;
  role: string;
  status: string;
  queued: boolean;
  note: string | null;
  roster: string;
  group: number | null;
}

interface RoleGroup {
  role: Role;
  label: string;
  rows: TonightSignup[];
}

/** A destructive command's preview, waiting for the officer to confirm or keep. */
interface PendingRemoval {
  signupId: string;
  name: string;
  token: string;
  summary: string;
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

/** The confirm line for a removal, from the server's preview of the signup it would delete. */
function removalSummary(s: Partial<TonightSignup> | undefined): string {
  const answer = s?.status ? (ANSWER_WORDS[s.status] ?? s.status) : '';
  const was = answer ? `Their ${answer}${s?.queued ? ', queued' : ''} signup` : 'The signup';
  return `${was} is deleted, not benched; they would have to sign up again. If they held a spot, the next in line moves up.`;
}

/** Signups that count toward tonight: everyone who hasn't declined. */
const playing = (s: TonightSignup) => s.status !== 'declined';

const rosterLabel = (s: TonightSignup) =>
  s.roster === 'benched'
    ? 'benched'
    : s.group !== null
      ? `group ${s.group}`
      : s.queued
        ? 'queued'
        : 'unplaced';

/** In a signup row (inside the role repeat), the element itself. */
const host = (c: ExecutionContext) => c.parentContext.parent as VintageTonight;

const template = html<VintageTonight>`
  <section class="tonight" part="tonight" aria-labelledby="tonight-title">
    <header class="top" part="header">
      <div class="title">
        <span class="eyebrow">Tonight · ${(x) => x.startsLabel}</span>
        <h2 id="tonight-title">${(x) => x.raid?.name ?? 'No raid on the calendar'}</h2>
        <span class="counts">${(x) => x.countsLine}</span>
      </div>
      <div class="actions" part="actions">
        <span class="pill ${(x) => (x.locked ? 'locked' : 'open')}">${(x) => (x.locked ? 'locked' : 'signups open')}</span>
        <button
          class="btn primary"
          ?disabled="${(x) => !x.canAct}"
          @click="${(x) => (x.locked ? x.unlock() : x.lock())}"
        >${(x) => (x.locked ? 'Unlock signups' : 'Lock the roster')}</button>
        <button class="btn" ?disabled="${(x) => !x.canAct}" @click="${(x) => x.copyImport()}">
          Copy addon import
        </button>
      </div>
    </header>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>

    ${when(
      (x) => x.pending,
      html<VintageTonight>`
        <div class="confirm" part="confirm" role="alertdialog" aria-labelledby="confirm-text">
          <p id="confirm-text">
            Remove <b>${(x) => x.pending?.name}</b> from ${(x) => x.raid?.name}?
            <span>${(x) => x.pending?.summary}</span>
          </p>
          <button class="btn danger" @click="${(x) => x.confirmRemove()}">Remove</button>
          <button class="btn" @click="${(x) => x.cancelRemove()}">Keep</button>
        </div>
      `,
    )}

    ${when(
      (x) => x.importString,
      html<VintageTonight>`
        <label class="import" part="import">
          <span>Addon import · ${(x) => x.importNote}</span>
          <textarea readonly rows="3" @focus="${(_, c) => (c.event.target as HTMLTextAreaElement).select()}">${(x) => x.importString}</textarea>
        </label>
      `,
    )}

    <div class="glance">
      <div class="card" part="gaps">
        <span class="eyebrow">Comp</span>
        ${when((x) => x.gaps.length === 0, html`<p class="ok">No gaps.</p>`)}
        <ul>
          ${repeat((x) => x.gaps, html<string>`<li>${(g) => g}</li>`)}
        </ul>
      </div>
      <div class="card" part="waiting">
        <span class="eyebrow">Waiting on ${(x) => x.waiting.length}</span>
        ${when(
          (x) => x.waiting.length === 0,
          html`<p class="ok">Everyone expected has answered.</p>`,
        )}
        <p class="names">${(x) => x.waiting.join(', ')}</p>
      </div>
    </div>

    <div class="roles" part="roster">
      ${repeat(
        (x) => x.roleGroups,
        html<RoleGroup, VintageTonight>`
          <div class="role">
            <h3>${(g) => g.label} <span>${(g) => g.rows.length}</span></h3>
            <ul>
              ${repeat(
                (g: RoleGroup) => g.rows,
                html<TonightSignup, RoleGroup>`
                  <li class="row ${(s) => s.status} ${(s) => (s.roster === 'benched' ? 'benched' : '')}">
                    <span class="who">
                      <b style="color: var(--color-class-${(s) => s.class})">${(s) => s.characterName}</b>
                      <small>${(s) => titleCase(s.spec)}</small>
                    </span>
                    <span class="answer">${(s) => ANSWER_WORDS[s.status] ?? s.status}${(s) => (s.queued ? ' · queued' : '')}</span>
                    <span class="place">${(s) => rosterLabel(s)}</span>
                    <span class="note">${(s) => s.note ?? ''}</span>
                    <span class="controls">
                      <select
                        aria-label="Group for ${(s) => s.characterName}"
                        ?disabled="${(_, c) => !host(c).canAct}"
                        @change="${(s, c) => host(c).move(s.id, Number((c.event.target as HTMLSelectElement).value))}"
                      >
                        <option value="" ?selected="${(s) => s.group === null}" disabled>group</option>
                        ${repeat(
                          (_, c) => host(c).groupNumbers,
                          html<
                            number,
                            TonightSignup
                          >`<option value="${(n) => n}" ?selected="${(n, c) => c.parent.group === n}">${(n) => n}</option>`,
                        )}
                      </select>
                      <button
                        class="btn small"
                        ?disabled="${(s, c) => !host(c).canAct || s.roster === 'benched'}"
                        @click="${(s, c) => host(c).bench(s.id)}"
                      >Bench</button>
                      <button
                        class="btn small danger"
                        ?disabled="${(_, c) => !host(c).canAct}"
                        @click="${(s, c) => host(c).removeSignup(s.id)}"
                      >Remove</button>
                    </span>
                  </li>
                `,
              )}
            </ul>
          </div>
        `,
      )}
    </div>
    ${when(
      (x) => x.declined.length > 0,
      html<VintageTonight>`<p class="declined" part="declined">Declined: ${(x) => x.declined.map((s) => s.characterName).join(', ')}</p>`,
    )}
  </section>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .tonight {
    display: grid;
    gap: var(--space-md);
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: end;
    gap: var(--space-sm) var(--space-lg);
  }

  .title {
    display: grid;
    gap: 0.2rem;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  h2 {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: clamp(1.8rem, 3.4vw, 2.6rem);
    line-height: 1.05;
    letter-spacing: var(--font-tracking-tight);
  }

  .counts {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs);
  }

  .pill {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: var(--border-width-thin) solid var(--color-border-strong);
  }

  .pill.locked {
    color: var(--color-text-accent);
    border-color: color-mix(in srgb, var(--color-text-accent) 60%, transparent);
  }

  .pill.open {
    color: var(--color-accent-secondary);
    border-color: color-mix(in srgb, var(--color-accent-secondary) 60%, transparent);
  }

  .btn {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.5rem 0.9rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    background: var(--color-accent-secondary);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  .btn.danger {
    color: var(--color-text-accent);
  }

  .btn.small {
    padding: 0.25rem 0.55rem;
    font-size: var(--font-size-xs);
  }

  .btn:disabled,
  select:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .status {
    margin: 0;
    min-block-size: 1.2em;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .status.error {
    color: var(--color-text-accent);
  }

  .status.success {
    color: var(--color-accent-secondary);
  }

  .status:empty {
    display: none;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid
      color-mix(in srgb, var(--color-text-accent) 55%, transparent);
    border-radius: 0.45rem;
    background: color-mix(in srgb, var(--color-text-accent) 8%, var(--color-surface-raised));
  }

  .confirm p {
    flex: 1 1 18rem;
    margin: 0;
  }

  .confirm p span {
    display: block;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .import {
    display: grid;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  textarea {
    inline-size: 100%;
    box-sizing: border-box;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
    background: var(--color-surface-sunken);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    padding: var(--space-xs);
    resize: vertical;
    word-break: break-all;
  }

  .glance {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
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

  .card ul {
    margin: 0;
    padding-inline-start: 1.1rem;
  }

  .card ul:empty {
    display: none;
  }

  .card p {
    margin: 0;
  }

  .card .ok {
    color: var(--color-accent-secondary);
  }

  .names:empty {
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

  .role ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(10rem, 1.3fr) 7rem 6rem minmax(0, 1.4fr) auto;
    align-items: center;
    gap: var(--space-sm);
    padding-block: 0.4rem;
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .row.benched .who b,
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .controls {
    display: flex;
    gap: var(--space-xs);
    justify-content: end;
  }

  select {
    font: var(--font-size-xs) var(--font-family-sans);
    padding: 0.2rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
  }

  .declined {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  @media (max-width: 62rem) {
    .glance {
      grid-template-columns: 1fr;
    }

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
      white-space: normal;
    }

    .note:empty {
      display: none;
    }

    .controls {
      grid-column: 1 / -1;
      justify-content: start;
    }
  }
`;

/**
 * Tonight, in the officers' quarters: the next raid's signups by role, the comp gaps, who
 * hasn't answered, and the raid-night actions as commands. Lock and unlock the roster, place a
 * signup in a group, bench them, remove them (preview and confirm), and copy the addon import
 * string. Feed it `raid-list` / `raid-get`, `signup-list`, `comp-suggest` gaps, and
 * `coordinator-status` waiting; it emits `tonight-changed` after every change so the page
 * re-reads.
 *
 * @tagname vintage-tonight
 * @summary The raid-night view for leaders: roster, gaps, non-responders, and actions.
 * @fires tonight-changed - After a lock, unlock, move, bench, or removal succeeds.
 * @csspart tonight - The whole view.
 * @csspart header - Raid, counts, and the raid-wide actions.
 * @csspart actions - Lock or unlock, and copy the import.
 * @csspart status - The line that says what happened.
 * @csspart confirm - A removal waiting for confirmation.
 * @csspart import - The import string, when copied.
 * @csspart gaps - The comp gaps.
 * @csspart waiting - Who hasn't answered.
 * @csspart roster - The signups by role.
 * @csspart declined - Who declined.
 */
export class VintageTonight extends FASTElement {
  /** The raid, or null when nothing is on the calendar. */
  @observable raid: TonightRaid | null = null;
  @observable signups: TonightSignup[] = [];
  /** Comp gaps as reasons, from `comp-suggest`. */
  @observable gaps: string[] = [];
  /** Who among the expected ranks hasn't answered, from `coordinator-status`. */
  @observable waiting: string[] = [];
  /** IANA zone to show the start in; empty uses the viewer's. */
  @attr({ attribute: 'time-zone' }) timeZone = '';

  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  @observable pending: PendingRemoval | null = null;
  @observable importString = '';
  @observable importNote = '';

  get locked(): boolean {
    return this.raid?.status === 'locked';
  }

  get canAct(): boolean {
    return !this.busy && Boolean(this.raid);
  }

  get startsLabel(): string {
    if (!this.raid) return 'nothing posted';
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    };
    try {
      return new Date(this.raid.startsAt).toLocaleString(undefined, {
        ...options,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
      });
    } catch {
      return new Date(this.raid.startsAt).toLocaleString(undefined, options);
    }
  }

  get countsLine(): string {
    if (!this.raid) return '';
    const count = (pred: (s: TonightSignup) => boolean) => this.signups.filter(pred).length;
    const going = count((s) => (s.status === 'accepted' || s.status === 'late') && !s.queued);
    const parts = [`${going} / ${this.raid.size} going`];
    const late = count((s) => s.status === 'late');
    const tentative = count((s) => s.status === 'tentative');
    const queued = count((s) => s.queued);
    if (late) parts.push(`${late} late`);
    if (tentative) parts.push(`${tentative} tentative`);
    if (queued) parts.push(`${queued} queued`);
    return parts.join(' · ');
  }

  get roleGroups(): RoleGroup[] {
    return ROLES.map((role) => ({
      role,
      label: ROLE_HEADINGS[role],
      rows: this.signups.filter((s) => s.role === role && playing(s)),
    })).filter((g) => g.rows.length > 0);
  }

  get declined(): TonightSignup[] {
    return this.signups.filter((s) => !playing(s));
  }

  /** 1–2 for tens, 1–4 for twenties, 1–8 for forties: five to a group. */
  get groupNumbers(): number[] {
    const groups = Math.max(1, Math.ceil((this.raid?.size ?? 5) / 5));
    return Array.from({ length: groups }, (_, i) => i + 1);
  }

  @command('vintage.roster-lock', {
    label: 'Lock the roster',
    description: 'Lock signups for tonight; after this only raid leaders can change them.',
    category: 'Officers',
  })
  async lock(): Promise<ElementResult<unknown>> {
    return this.change('roster-lock', { eventId: this.raid?.id }, 'Roster locked');
  }

  @command('vintage.roster-unlock', {
    label: 'Unlock signups',
    description: 'Reopen signups for tonight.',
    category: 'Officers',
  })
  async unlock(): Promise<ElementResult<unknown>> {
    return this.change('roster-unlock', { eventId: this.raid?.id }, 'Signups reopened');
  }

  @command('vintage.roster-move', {
    label: 'Place in a group',
    description: 'Put a signed-up character in a raid group.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' }, group: { type: 'number' } },
      required: ['signupId', 'group'],
    },
  })
  async move(signupId: unknown, group: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string' || !Number.isInteger(group)) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup and a group number' });
    }
    return this.change('roster-move', { signupId, group }, `Moved to group ${group}`);
  }

  @command('vintage.roster-bench', {
    label: 'Bench',
    description: 'Bench a signed-up character for tonight; they keep their signup.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' } },
      required: ['signupId'],
    },
  })
  async bench(signupId: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup to bench' });
    }
    return this.change('roster-bench', { signupId }, 'Benched');
  }

  /**
   * Remove a signup. `roster-remove` is destructive, so the first call is the server's preview;
   * nothing changes until `confirmRemove` sends its confirm token back.
   */
  @command('vintage.roster-remove', {
    label: 'Remove from the raid',
    description: 'Preview removing a signup from tonight; confirm to remove it.',
    category: 'Officers',
    parameters: {
      type: 'object',
      properties: { signupId: { type: 'string' } },
      required: ['signupId'],
    },
  })
  async removeSignup(signupId: unknown): Promise<ElementResult<unknown>> {
    if (typeof signupId !== 'string') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give a signup to remove' });
    }
    if (!this.canAct) return failure({ code: 'COMMAND_DISABLED', message: 'Busy, or no raid' });
    const name = this.signups.find((s) => s.id === signupId)?.characterName ?? 'this signup';
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: { willRemove?: Partial<TonightSignup> };
        confirmToken?: string;
      }>('roster-remove', { signupId });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (!token) {
        // A server that removed it without asking: nothing left to confirm.
        this.say('success', `Removed ${name}`);
        this.$emit('tonight-changed');
        return result;
      }
      const willRemove = raw.success ? raw.data?.preview?.willRemove : undefined;
      this.pending = { signupId, name, token, summary: removalSummary(willRemove) };
      this.say('idle', '');
      return result;
    } finally {
      this.busy = false;
    }
  }

  async confirmRemove(): Promise<ElementResult<unknown>> {
    const pending = this.pending;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'No removal waiting' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'roster-remove',
          { signupId: pending.signupId },
          { confirmToken: pending.token },
        ),
      );
      this.pending = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', `Removed ${pending.name}`);
      this.$emit('tonight-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelRemove(): void {
    if (this.pending) this.say('idle', `Kept ${this.pending.name}`);
    this.pending = null;
  }

  @command('vintage.addon-import-get', {
    label: 'Copy the addon import',
    description: 'Get tonight’s addon import string and copy it for pasting in game.',
    category: 'Officers',
  })
  async copyImport(): Promise<ElementResult<unknown>> {
    if (!this.raid) return failure({ code: 'COMMAND_DISABLED', message: 'No raid' });
    this.busy = true;
    try {
      const raw = await getCommandClient().read<{ importString: string; characters: number }>(
        'addon-import-get',
        { eventId: this.raid.id },
      );
      const result = toElementResult(raw);
      if (!result.success || !raw.success || !raw.data) {
        this.say('error', describeError(result));
        return result;
      }
      this.importString = raw.data.importString;
      let copied = false;
      try {
        await navigator.clipboard.writeText(raw.data.importString);
        copied = true;
      } catch {}
      this.importNote = `${raw.data.characters} characters${copied ? ', copied' : ', select and copy'}`;
      this.say(
        'success',
        copied ? 'Import copied. Paste it into the Vintage addon.' : 'Import ready below.',
      );
      return result;
    } finally {
      this.busy = false;
    }
  }

  private async change(
    name: string,
    input: Record<string, unknown>,
    done: string,
  ): Promise<ElementResult<unknown>> {
    if (!this.canAct) return failure({ code: 'COMMAND_DISABLED', message: 'Busy, or no raid' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', String(result.metadata?.reasoning ?? done));
      this.$emit('tonight-changed');
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

if (!customElements.get('vintage-tonight')) {
  await VintageTonight.define({ name: 'vintage-tonight', template, styles });
}
