import {
  attr,
  css,
  FASTElement,
  html,
  observable,
  repeat,
  volatile,
  when,
} from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { ruleHours, ruleLead, ruleWords } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import { browserTimeZone } from '../zoned';
import { formatWhen } from './calendar-shared';
import { deskStyles } from './desk-styles';
import type { CoordinatorState } from './officer-strip';

/** The slice of `coordinator-status` → `config` the desk reads (the coordinator's own config). */
export interface CoordinatorDeskConfig {
  signupChannelId: string | null;
  opsChannelId: string | null;
  expectedRanks: string[];
  dmReminders: boolean;
  paused: boolean;
}

/** One upcoming raid from `coordinator-status` → `upcoming`. */
export interface CoordinatorDeskRaid {
  eventId: string;
  name: string;
  startsAt: number;
  status: string;
  done: { rule: string; status: string; at: number | null }[];
  dueNow: string[];
  waiting: { memberId: string; displayName: string }[];
}

/** One `coordinator-log` row, with the raid it belongs to. */
export interface CoordinatorDeskEntry {
  id: string;
  eventId: string;
  raidName: string;
  rule: string;
  status: string;
  detail: string | null;
  /** When it finished, or when it was claimed if it never did. */
  at: number;
}

/** The ranks Random can chase, in guild order (identity's `GUILD_RANKS`). */
const RANK_CHOICES: readonly { rank: string; label: string }[] = [
  { rank: 'officer', label: 'Officers' },
  { rank: 'raid-leader', label: 'Raid leaders' },
  { rank: 'raider', label: 'Raiders' },
  { rank: 'flex-raider', label: 'Flex raiders' },
  { rank: 'recruit', label: 'Recruits' },
  { rank: 'member', label: 'Members' },
  { rank: 'friend', label: 'Friends' },
];

/** A Discord channel id, as `coordinator-config-set` checks it. */
const SNOWFLAKE = /^\d{17,20}$/;

/** How long after "Run now" the desk reads again: the tick runs after the command returns. */
export const RUN_REREAD_MS = 5000;

/** An upcoming raid as its card reads it, everything worded already. */
interface RaidCard {
  raid: CoordinatorDeskRaid;
  when: string;
  done: string;
  due: string;
  waiting: string;
  canRepost: boolean;
}

/** A log line, worded. */
interface LogLine {
  entry: CoordinatorDeskEntry;
  when: string;
  what: string;
  flag: string;
}

/**
 * "Posted the signups, Reminded the people who haven’t answered (72 and 24 hours before), Sent
 * reminder DMs ×3 (24 hours before)": each kind once, in order, with its lead times, and a
 * count where one lead time covers several sends (a DM per member).
 */
export function summarizeRules(rules: string[], form: 'done' | 'todo' = 'done'): string {
  const kinds = new Map<string, { n: number; hours: number[] }>();
  for (const rule of rules) {
    const words = ruleWords(rule, form);
    const kind = kinds.get(words) ?? { n: 0, hours: [] };
    kind.n += 1;
    const hours = ruleHours(rule);
    if (hours !== null && !kind.hours.includes(hours)) kind.hours.push(hours);
    kinds.set(words, kind);
  }
  return [...kinds]
    .map(([words, { n, hours }]) => {
      const count = n > Math.max(hours.length, 1) ? ` ×${n}` : '';
      const lead = hours.length
        ? ` (${hours.join(' and ')} hour${hours.length === 1 && hours[0] === 1 ? '' : 's'} before)`
        : '';
      return `${words}${count}${lead}`;
    })
    .join(', ');
}

const raidCard = html<RaidCard, VintageCoordinatorDesk>`
  <li class="raid" part="raid">
    <div class="raid-head">
      <strong>${(r) => r.raid.name}</strong>
      <time datetime="${(r) => new Date(r.raid.startsAt).toISOString()}">${(r) => r.when}</time>
    </div>
    <dl>
      <dt>Done</dt>
      <dd>${(r) => r.done || 'Nothing yet'}</dd>
      ${when(
        (r) => r.due,
        html<RaidCard>`<dt>Due now</dt>
        <dd>${(r) => r.due}</dd>`,
      )}
      <dt>Hasn’t answered</dt>
      <dd>${(r) => r.waiting || 'Everyone Random chases has answered'}</dd>
    </dl>
    ${when(
      (_r, c) => c.parent.canAct,
      html<RaidCard, VintageCoordinatorDesk>`
        <p class="actions">
          <button
            type="button"
            ?disabled="${(r, c) => c.parent.busy || !r.canRepost}"
            title="${(r) => (r.canRepost ? '' : 'Random hasn’t posted this raid yet')}"
            @click="${(r, c) => c.parent.repost(r.raid.eventId)}"
          >Replace the signup post</button>
        </p>
      `,
    )}
  </li>
`;

const logLine = html<LogLine>`
  <li class="${(l) => `entry ${l.entry.status}`}">
    <time datetime="${(l) => new Date(l.entry.at).toISOString()}">${(l) => l.when}</time>
    <span class="what">
      ${(l) => l.what}
      ${when((l) => l.flag, html<LogLine>`<b class="flag">${(l) => l.flag}</b>`)}
    </span>
    ${when((l) => l.entry.detail, html<LogLine>`<small class="why">${(l) => l.entry.detail}</small>`)}
  </li>
`;

const template = html<VintageCoordinatorDesk>`
  <div class="desk wide" part="desk">
    ${when((x) => x.error, html<VintageCoordinatorDesk>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when((x) => x.loading && !x.config, html`<p class="meta">Asking Random how it’s doing…</p>`)}

    ${when(
      (x) => x.config,
      html<VintageCoordinatorDesk>`
        <section class="${(x) => `state ${x.state}`}" part="state" aria-labelledby="h-state">
          <h2 id="h-state">${(x) => x.headline}</h2>
          <p class="meta">${(x) => x.stateLine}</p>
          ${when(
            (x) => x.canAct,
            html<VintageCoordinatorDesk>`
              <p class="actions">
                ${when(
                  (x) => !x.config?.paused,
                  html<VintageCoordinatorDesk>`<button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.pause()}">Pause Random</button>`,
                )}
                ${when(
                  (x) => x.config?.paused,
                  html<VintageCoordinatorDesk>`<button type="button" class="primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.resume()}">Resume Random</button>`,
                )}
                <button
                  type="button"
                  ?disabled="${(x) => x.busy || x.state !== 'running'}"
                  @click="${(x) => x.run()}"
                >Run a check now</button>
                <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.$emit('coordinator-changed')}">Refresh</button>
              </p>
            `,
          )}
        </section>

        <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>

        <section aria-labelledby="h-upcoming">
          <h2 id="h-upcoming">Coming up</h2>
          ${when(
            (x) => !x.cards.length,
            html`<p class="note">No open raids coming up. Random starts on a raid once it’s on the calendar.</p>`,
          )}
          <ul class="raids">${repeat((x) => x.cards, raidCard)}</ul>
        </section>

        <section aria-labelledby="h-log">
          <h2 id="h-log">Random’s log</h2>
          <p class="note">What Random did for these raids and why, newest first. It answers “why did the bot ping me?”.</p>
          ${when((x) => !x.lines.length, html`<p class="note">Nothing logged yet.</p>`)}
          <ol class="log" part="log">${repeat((x) => x.lines, logLine)}</ol>
        </section>

        <form class="settings" part="settings" @submit="${(x, c) => x.submit(c.event)}">
          <h2>Settings</h2>
          <fieldset ?disabled="${(x) => !x.canConfigure || x.busy}">
            <legend>Where Random posts</legend>
            <div class="field">
              <label for="signup">Signup channel id</label>
              <input
                id="signup"
                inputmode="numeric"
                autocomplete="off"
                :value="${(x) => x.signupChannel}"
                @input="${(x, c) => x.edit('signupChannel', (c.event.target as HTMLInputElement).value)}"
              />
              <small>Signup posts, reminders, and the final roster go here. Random does nothing until this is set.</small>
            </div>
            <div class="field">
              <label for="ops">Officer channel id</label>
              <input
                id="ops"
                inputmode="numeric"
                autocomplete="off"
                :value="${(x) => x.opsChannel}"
                @input="${(x, c) => x.edit('opsChannel', (c.event.target as HTMLInputElement).value)}"
              />
              <small>The comp digest, the addon import string, and anything that failed. In Discord, turn on Developer Mode, then right-click a channel and choose Copy Channel ID.</small>
            </div>
          </fieldset>
          <fieldset ?disabled="${(x) => !x.canConfigure || x.busy}">
            <legend>Whose answers Random chases</legend>
            <div class="ranks">
              ${repeat(
                () => RANK_CHOICES,
                html<(typeof RANK_CHOICES)[number], VintageCoordinatorDesk>`
                  <label class="check">
                    <input
                      type="checkbox"
                      ?checked="${(r, c) => c.parent.ranks.includes(r.rank)}"
                      @change="${(r, c) => c.parent.toggleRank(r.rank, (c.event.target as HTMLInputElement).checked)}"
                    />
                    ${(r) => r.label}
                  </label>
                `,
              )}
            </div>
            <label class="check">
              <input
                type="checkbox"
                ?checked="${(x) => x.dmReminders}"
                @change="${(x, c) => x.edit('dmReminders', (c.event.target as HTMLInputElement).checked)}"
              />
              DM whoever hasn’t answered at the last reminder
            </label>
            <small>Members can still turn DMs off for themselves on their own page.</small>
          </fieldset>
          ${when(
            (x) => x.canConfigure,
            html<VintageCoordinatorDesk>`
              <p class="actions">
                <button type="submit" class="primary" ?disabled="${(x) => x.busy || !x.dirty}">Save settings</button>
                <button type="button" ?disabled="${(x) => x.busy || !x.dirty}" @click="${(x) => x.reset()}">Undo changes</button>
              </p>
            `,
          )}
          ${when(
            (x) => !x.canConfigure,
            html`<p class="note">Officers change Random’s settings. You can read them here.</p>`,
          )}
        </form>
      `,
    )}
  </div>
`;

const styles = css`
  .desk.wide {
    max-inline-size: 60rem;
  }

  h2 {
    margin: 0 0 var(--space-xs);
    font-size: var(--font-size-lg);
    text-wrap: balance;
  }

  section,
  .settings {
    display: grid;
    gap: var(--space-sm);
    min-inline-size: 0;
  }

  .state {
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-inline-start: 0.3rem solid var(--color-feedback-success);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
  }

  .state.paused,
  .state.unconfigured {
    border-inline-start-color: var(--color-accent-primary);
  }

  .raids,
  .log {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .raid {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
  }

  .raid-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-xs) var(--space-sm);
  }

  .raid-head time {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.2rem var(--space-sm);
    margin: 0;
    font-size: var(--font-size-sm);
  }

  dt {
    color: var(--color-text-secondary);
  }

  dd {
    margin: 0;
    text-wrap: pretty;
  }

  @media (max-width: 30rem) {
    dl {
      grid-template-columns: 1fr;
    }

    dd {
      margin-block-end: var(--space-xs);
    }
  }

  .entry {
    display: grid;
    grid-template-columns: 11rem minmax(0, 1fr);
    gap: 0.1rem var(--space-sm);
    padding-block: var(--space-xs);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .entry time {
    color: var(--color-text-secondary);
  }

  .entry .why {
    grid-column: 2;
  }

  @media (max-width: 30rem) {
    .entry {
      grid-template-columns: 1fr;
    }

    .entry .why {
      grid-column: 1;
    }
  }

  .flag {
    margin-inline-start: var(--space-xs);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .entry.failed .flag {
    color: var(--color-feedback-danger);
  }

  .ranks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    font-weight: var(--font-weight-regular);
  }
`;

/**
 * The officers' view of Random, the coordinator bot: whether it is running, what it has done
 * and will do for each upcoming raid, who it is still chasing, its log with the reason for
 * every entry, and its settings. Feed it `coordinator-status` (`config`, `upcoming`) and the
 * `coordinator-log` rows for those raids. Pause, resume, run a check, and replace a signup post
 * need `can-act` (leaders); saving the settings needs `can-configure` (officers). After every
 * change it emits `coordinator-changed` so the page reads again.
 *
 * @tagname vintage-coordinator-desk
 * @summary Random's status, upcoming work, log, and settings.
 * @fires coordinator-changed - After an action succeeds, and when Refresh is pressed.
 * @csspart desk - The whole desk.
 * @csspart state - Running, paused, or not set up, with the controls.
 * @csspart status - What just happened.
 * @csspart raid - One upcoming raid.
 * @csspart log - Random's log.
 * @csspart settings - The settings form.
 */
export class VintageCoordinatorDesk extends FASTElement {
  /** `coordinator-status` → `config`; null until it is read. */
  @observable config: CoordinatorDeskConfig | null = null;
  @observable upcoming: CoordinatorDeskRaid[] = [];
  @observable entries: CoordinatorDeskEntry[] = [];
  /** Optional IANA zone for times; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Pause, resume, run, and repost (leader tier). */
  @attr({ attribute: 'can-act', mode: 'boolean' }) canAct = false;
  /** Save the settings (officer tier). */
  @attr({ attribute: 'can-configure', mode: 'boolean' }) canConfigure = false;
  @attr({ mode: 'boolean' }) loading = false;
  /** Why the status could not be read. */
  @attr error = '';
  @observable signupChannel = '';
  @observable opsChannel = '';
  @observable ranks: string[] = [];
  @observable dmReminders = true;
  @observable dirty = false;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  private reread: ReturnType<typeof setTimeout> | undefined;

  configChanged(): void {
    if (!this.dirty) this.reset();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.reread);
  }

  private get zone(): string {
    return this.timeZone || browserTimeZone();
  }

  @volatile
  get state(): CoordinatorState {
    if (!this.config) return 'unknown';
    if (this.config.paused) return 'paused';
    return this.config.signupChannelId ? 'running' : 'unconfigured';
  }

  @volatile
  get headline(): string {
    if (this.state === 'paused') return 'Random is paused';
    if (this.state === 'unconfigured') return 'Random isn’t set up';
    return 'Random is running';
  }

  @volatile
  get stateLine(): string {
    if (this.state === 'paused') {
      return 'Nothing is posted, reminded, or locked until it resumes. What came due meanwhile goes out on the next check.';
    }
    if (this.state === 'unconfigured') {
      return this.canConfigure
        ? 'Give it a signup channel below and it starts on its next check.'
        : 'An officer needs to give it a signup channel before it posts anything.';
    }
    const n = this.upcoming.length;
    return `It checks every few minutes: posts signups, reminds whoever hasn’t answered, and locks the roster. ${n} raid${n === 1 ? '' : 's'} coming up.`;
  }

  @volatile
  get cards(): RaidCard[] {
    return this.upcoming.map((raid) => ({
      raid,
      when: formatWhen(raid.startsAt, this.zone),
      done: summarizeRules(raid.done.filter((d) => d.status === 'sent').map((d) => d.rule)),
      due: summarizeRules(raid.dueNow, 'todo'),
      waiting: raid.waiting.length
        ? `${raid.waiting.length}: ${raid.waiting.map((w) => w.displayName).join(', ')}`
        : '',
      canRepost: raid.done.some((d) => d.rule === 'post' && d.status === 'sent'),
    }));
  }

  @volatile
  get lines(): LogLine[] {
    return [...this.entries]
      .sort((a, b) => b.at - a.at)
      .map((entry) => {
        const lead = ruleLead(entry.rule);
        return {
          entry,
          when: formatWhen(entry.at, this.zone),
          what: `${ruleWords(entry.rule)}${lead ? ` (${lead})` : ''} · ${entry.raidName}`,
          flag: entry.status === 'sent' ? '' : entry.status,
        };
      });
  }

  /** Put the settings form back to the saved config. */
  reset(): void {
    this.signupChannel = this.config?.signupChannelId ?? '';
    this.opsChannel = this.config?.opsChannelId ?? '';
    this.ranks = [...(this.config?.expectedRanks ?? [])];
    this.dmReminders = this.config?.dmReminders ?? true;
    this.dirty = false;
  }

  edit(field: 'signupChannel' | 'opsChannel', value: string): void;
  edit(field: 'dmReminders', value: boolean): void;
  edit(field: 'signupChannel' | 'opsChannel' | 'dmReminders', value: string | boolean): void {
    if (field === 'dmReminders') this.dmReminders = value as boolean;
    else this[field] = value as string;
    this.dirty = true;
  }

  toggleRank(rank: string, on: boolean): void {
    const rest = this.ranks.filter((r) => r !== rank);
    this.ranks = on
      ? RANK_CHOICES.map((c) => c.rank).filter((r) => r === rank || rest.includes(r))
      : rest;
    this.dirty = true;
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  /** The fields that differ from the saved config, or why the form can't be saved. */
  private patch(): { input: Record<string, unknown> } | { problem: string } {
    const saved = this.config;
    if (!saved) return { problem: 'The settings haven’t loaded yet' };
    const signup = this.signupChannel.trim();
    const ops = this.opsChannel.trim();
    for (const [label, id] of [
      ['signup channel', signup],
      ['officer channel', ops],
    ] as const) {
      if (id && !SNOWFLAKE.test(id)) {
        return { problem: `The ${label} id should be 17 to 20 digits, copied from Discord` };
      }
    }
    if (!this.ranks.length) return { problem: 'Pick at least one rank for Random to chase' };
    const input: Record<string, unknown> = {};
    if ((signup || null) !== saved.signupChannelId) input.signupChannelId = signup || null;
    if ((ops || null) !== saved.opsChannelId) input.opsChannelId = ops || null;
    if (this.ranks.join() !== saved.expectedRanks.join()) input.expectedRanks = this.ranks;
    if (this.dmReminders !== saved.dmReminders) input.dmReminders = this.dmReminders;
    return { input };
  }

  @command('vintage.coordinator-config-save', {
    label: 'Save Random’s settings',
    description:
      'Save the channels, the ranks Random chases, and DM reminders as the form shows them.',
    category: 'Officers',
  })
  async save(): Promise<ElementResult<unknown>> {
    if (!this.canConfigure) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers change Random’s settings' });
    }
    const patch = this.patch();
    if ('problem' in patch) {
      this.say('error', `${patch.problem}.`);
      return failure({ code: 'VALIDATION_ERROR', message: patch.problem });
    }
    if (!Object.keys(patch.input).length) {
      this.dirty = false;
      return failure({ code: 'COMMAND_DISABLED', message: 'Nothing changed' });
    }
    return this.act(
      'coordinator-config-set',
      patch.input,
      'Saved. Random uses them from its next check.',
      () => {
        this.dirty = false;
      },
    );
  }

  @command('vintage.coordinator-pause', {
    label: 'Pause Random',
    description: 'Stop Random posting, reminding, and locking until it is resumed.',
    category: 'Officers',
  })
  async pause(): Promise<ElementResult<unknown>> {
    return this.act(
      'coordinator-pause',
      {},
      'Paused. Random won’t post or remind until you resume it.',
    );
  }

  @command('vintage.coordinator-resume', {
    label: 'Resume Random',
    description:
      'Restart Random; anything that came due while it was paused goes out on its next check.',
    category: 'Officers',
  })
  async resume(): Promise<ElementResult<unknown>> {
    return this.act(
      'coordinator-resume',
      {},
      'Running again. Anything that came due goes out on the next check.',
    );
  }

  @command('vintage.coordinator-run', {
    label: 'Run a check now',
    description: 'Have Random check now instead of waiting a few minutes. Nothing is sent twice.',
    category: 'Officers',
  })
  async run(): Promise<ElementResult<unknown>> {
    return this.act(
      'coordinator-run',
      {},
      'Random is checking now. The log catches up in a few seconds.',
      () => {
        clearTimeout(this.reread);
        this.reread = setTimeout(() => this.$emit('coordinator-changed'), RUN_REREAD_MS);
      },
    );
  }

  @command('vintage.coordinator-repost', {
    label: 'Replace a signup post',
    description: 'Delete a raid’s signup post and have Random post a fresh one. Signups are kept.',
    category: 'Officers',
  })
  async repost(eventId: string): Promise<ElementResult<unknown>> {
    const raid = this.upcoming.find((r) => r.eventId === eventId);
    if (!raid) return failure({ code: 'COMMAND_DISABLED', message: 'That raid isn’t coming up' });
    return this.act(
      'coordinator-repost',
      { eventId },
      `A fresh signup post for ${raid.name} goes out on the next check. Signups are kept.`,
    );
  }

  /** Run a leader or officer command, say how it went, and have the page read again. */
  private async act(
    name: string,
    input: Record<string, unknown>,
    done: string,
    after?: () => void,
  ): Promise<ElementResult<unknown>> {
    if (name !== 'coordinator-config-set' && !this.canAct) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Raid leaders and officers run Random' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      after?.();
      this.say('success', done);
      this.$emit('coordinator-changed');
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

if (!customElements.get('vintage-coordinator-desk')) {
  await VintageCoordinatorDesk.define({
    name: 'vintage-coordinator-desk',
    template,
    styles: [deskStyles, styles],
  });
}
