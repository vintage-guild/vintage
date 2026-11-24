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
import { describeError, type ElementResult, toElementResult } from '../result';
import { browserTimeZone, dayKey, instantFromInputs, timeOfDay } from '../zoned';
import type { LedgerBoss, LedgerKill, LedgerRaid } from './boss-ledger';
import './boss-ledger';
import { formatWhen } from './calendar-shared';
import { deskStyles } from './desk-styles';

/** Blizzard's item qualities, in order (the progress contract's `ITEM_QUALITIES`). */
export const LOOT_QUALITIES = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type LootQuality = (typeof LOOT_QUALITIES)[number];

/** `kill-record` takes at most this many drops per kill. */
export const MAX_DROPS = 12;

/** One drop row in the form. Rows are edited in place so typing doesn't re-render the list. */
interface DropRow {
  name: string;
  quality: LootQuality;
}

/** What `kill-record` answers. */
interface KillRecorded {
  kill: { killedAt: number };
  first: boolean;
}

/** One recorded kill from `kill-list`, newest first. */
export interface ProgressKillEntry {
  id: string;
  raidId: string;
  raidName: string;
  bossId: string;
  bossName: string;
  killedAt: number;
  loot: { name: string; quality: LootQuality }[];
  note: string | null;
  recordedBy: string;
  first: boolean;
}

interface KillRemovePreview {
  willRemove: {
    id: string;
    raidName: string;
    bossName: string;
    killedAt: number;
  };
  wasFirstKill: boolean;
  nextFirstKillAt: number | null;
}

interface PendingKillRemove {
  killId: string;
  token: string;
  summary: string;
  detail: string;
}

const QUALITY_LABELS: Record<LootQuality, string> = {
  poor: 'Poor',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

/** A raid's next target: the first boss in order without a kill. */
const nextBoss = (raid: LedgerRaid | undefined): LedgerBoss | undefined =>
  raid?.bosses.find((b) => b.firstKillAt === null);

const shortDay = (ms: number, timeZone: string) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone });

const dropRow = html<DropRow, VintageProgressDesk>`
  <li class="drop">
    <input
      aria-label="${(_d, c) => `Drop ${c.index + 1} name`}"
      maxlength="80"
      autocomplete="off"
      placeholder="Item name"
      :value="${(d) => d.name}"
      @input="${(d, c) => c.parent.editDrop(d, 'name', (c.event.target as HTMLInputElement).value)}"
    />
    <select
      aria-label="${(_d, c) => `Drop ${c.index + 1} quality`}"
      @change="${(d, c) => c.parent.editDrop(d, 'quality', (c.event.target as HTMLSelectElement).value)}"
    >
      ${repeat(
        () => LOOT_QUALITIES,
        html<
          LootQuality,
          DropRow
        >`<option value="${(q) => q}" ?selected="${(q, c) => q === c.parent.quality}">${(q) => QUALITY_LABELS[q]}</option>`,
      )}
    </select>
    <button type="button" class="remove" aria-label="${(_d, c) => `Remove drop ${c.index + 1}`}" @click="${(d, c) => c.parent.removeDrop(d)}">Remove</button>
  </li>
`;

const template = html<VintageProgressDesk>`
  <div class="desk wide" part="desk">
    ${when((x) => x.error, html<VintageProgressDesk>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when((x) => x.loading && !x.raids.length, html`<p class="meta">Reading the ledger…</p>`)}

    ${when(
      (x) => x.raids.length,
      html<VintageProgressDesk>`
        <header class="head">
          <h2 id="h-progress">${(x) => x.headline}</h2>
          <p class="meta">${(x) => x.subline}</p>
        </header>

        <div class="split">
          <vintage-boss-ledger
            part="ledger"
            :raids="${(x) => x.raids}"
            :latest="${(x) => x.latest}"
            ?open="${(x) => x.open}"
            opens-on="${(x) => x.opensOn}"
          ></vintage-boss-ledger>

          ${when(
            (x) => x.canRecord,
            html<VintageProgressDesk>`
              <form class="record" part="form" aria-labelledby="h-record" @submit="${(x, c) => x.submit(c.event)}">
                <h3 id="h-record">Record a kill</h3>
                ${when(
                  (x) => !x.open,
                  html<VintageProgressDesk>`<p class="note">${(x) => x.closedNote}</p>`,
                )}
                <fieldset ?disabled="${(x) => !x.open || x.busy}">
                  <legend class="sr">The kill</legend>
                  <div class="field">
                    <label for="raid">Raid</label>
                    <select id="raid" @change="${(x, c) => x.pickRaid((c.event.target as HTMLSelectElement).value)}">
                      ${repeat(
                        (x) => x.raids,
                        html<
                          LedgerRaid,
                          VintageProgressDesk
                        >`<option value="${(r) => r.id}" ?selected="${(r, c) => r.id === c.parent.raidId}">${(r) => r.name}</option>`,
                      )}
                    </select>
                  </div>
                  <div class="field">
                    <label for="boss">Boss</label>
                    <select id="boss" @change="${(x, c) => x.pickBoss((c.event.target as HTMLSelectElement).value)}">
                      ${repeat(
                        (x) => x.bossChoices,
                        html<
                          { id: string; label: string },
                          VintageProgressDesk
                        >`<option value="${(b) => b.id}" ?selected="${(b, c) => b.id === c.parent.bossId}">${(b) => b.label}</option>`,
                      )}
                    </select>
                    ${when(
                      (x) => x.boss?.datamined,
                      html`<small>This name is from the beta client; Blizzard hasn’t published it yet.</small>`,
                    )}
                  </div>
                  <div class="when">
                    <div class="field">
                      <label for="date">Date</label>
                      <input
                        id="date"
                        type="date"
                        :value="${(x) => x.date}"
                        @input="${(x, c) => x.edit('date', (c.event.target as HTMLInputElement).value)}"
                      />
                    </div>
                    <div class="field">
                      <label for="time">Time</label>
                      <input
                        id="time"
                        type="time"
                        :value="${(x) => x.time}"
                        @input="${(x, c) => x.edit('time', (c.event.target as HTMLInputElement).value)}"
                      />
                    </div>
                  </div>
                  <small class="zone">${(x) => x.zoneNote}</small>
                </fieldset>

                <fieldset ?disabled="${(x) => !x.open || x.busy}">
                  <legend>What dropped</legend>
                  ${when((x) => !x.drops.length, html`<p class="note">Nothing yet. Add each item with its quality.</p>`)}
                  <ol class="drops">${repeat((x) => x.drops, dropRow, { positioning: true })}</ol>
                  <p class="actions">
                    <button type="button" ?disabled="${(x) => x.drops.length >= MAX_DROPS}" @click="${(x) => x.addDrop()}">Add a drop</button>
                  </p>
                </fieldset>

                <div class="field">
                  <label for="note">Note <span class="meta">(optional)</span></label>
                  <input
                    id="note"
                    maxlength="200"
                    autocomplete="off"
                    ?disabled="${(x) => !x.open || x.busy}"
                    :value="${(x) => x.note}"
                    @input="${(x, c) => x.edit('note', (c.event.target as HTMLInputElement).value)}"
                  />
                </div>

                ${when((x) => x.open, html<VintageProgressDesk>`<p class="summary" part="summary">${(x) => x.summary}</p>`)}
                <p class="actions">
                  <button type="submit" class="primary" ?disabled="${(x) => !x.open || x.busy || !x.boss}">Record the kill</button>
                </p>
                <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
              </form>
            `,
          )}
          ${when(
            (x) => !x.canRecord,
            html`<p class="note">Raid leaders and officers record kills.</p>`,
          )}
        </div>

        ${when(
          (x) => x.kills.length > 0,
          html<VintageProgressDesk>`
            <section class="log" part="log" aria-labelledby="h-kill-log">
              <h3 id="h-kill-log">Kill log${(x) => (x.raid ? ` · ${x.raid.name}` : '')}</h3>
              ${when(
                (x) => !x.raidKills.length,
                html`<p class="note">No kills recorded for this raid yet.</p>`,
              )}
              ${when(
                (x) => x.pendingRemove,
                html<VintageProgressDesk>`
                  <div class="confirm" role="alertdialog" aria-labelledby="kill-remove-heading" aria-describedby="kill-remove-detail">
                    <p id="kill-remove-heading"><strong>${(x) => x.pendingRemove?.summary}</strong></p>
                    <p id="kill-remove-detail" class="note">${(x) => x.pendingRemove?.detail}</p>
                    <p class="actions">
                      <button type="button" class="danger" ?disabled="${(x) => x.busy}" @click="${(x) => x.confirmRemove()}">Remove kill</button>
                      <button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.cancelRemove()}">Keep kill</button>
                    </p>
                  </div>
                `,
              )}
              <ol class="kill-rows">
                ${repeat(
                  (x) => x.raidKills,
                  html<ProgressKillEntry, VintageProgressDesk>`
                    <li class="kill-row">
                      <div class="kill-main">
                        <strong>${(k) => k.bossName}</strong>
                        ${when((k) => k.first, html`<small class="badge">first kill</small>`)}
                        <span class="meta">${(k, c) => c.parent.whenLabel(k.killedAt)}</span>
                        <span class="meta">by ${(k) => k.recordedBy}</span>
                        ${when(
                          (k) => k.loot.length > 0,
                          html<ProgressKillEntry>`<span class="meta">· ${(k) => k.loot.map((l) => l.name).join(', ')}</span>`,
                        )}
                        ${when(
                          (k) => k.note,
                          html<ProgressKillEntry>`<span class="meta">· ${(k) => k.note}</span>`,
                        )}
                      </div>
                      ${when(
                        (_k, c) => c.parent.canRemove,
                        html<ProgressKillEntry, VintageProgressDesk>`
                          <button
                            type="button"
                            class="remove"
                            ?disabled="${(_k, c) => c.parent.busy}"
                            @click="${(k, c) => c.parent.requestRemove(k)}"
                          >
                            Remove
                          </button>
                        `,
                      )}
                    </li>
                  `,
                )}
              </ol>
              ${when(
                (x) => x.removeStatusText,
                html<VintageProgressDesk>`<p class="status ${(x) => x.removeStatusKind}" role="status" aria-live="polite">${(x) => x.removeStatusText}</p>`,
              )}
            </section>
          `,
        )}
      `,
    )}
  </div>
`;

const styles = css`
  .desk.wide {
    max-inline-size: 64rem;
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

  .head {
    display: grid;
    gap: var(--space-xs);
  }

  .head p {
    margin: 0;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: var(--space-lg);
    align-items: start;
  }

  @media (max-width: 52rem) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .record {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
    min-inline-size: 0;
  }

  .record > .note {
    margin: 0;
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .when {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-sm);
  }

  .drops {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .drop {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 7rem max-content;
    gap: var(--space-xs);
  }

  .drop input,
  .drop select {
    inline-size: 100%;
  }

  .summary {
    margin: 0;
    font-size: var(--font-size-sm);
    text-wrap: pretty;
  }

  .log {
    display: grid;
    gap: var(--space-sm);
  }

  .kill-rows {
    display: grid;
    gap: var(--space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kill-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xs) var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.375rem;
    font-size: var(--font-size-sm);
  }

  .kill-main {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-xs);
  }

  .badge {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .confirm {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-feedback-danger);
    border-radius: 0.5rem;
  }

  .confirm p {
    margin: 0;
  }

  button.danger {
    background: var(--color-feedback-danger);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }
`;

/**
 * The officers' Progress tab: the ledger as members see it, with a form beside it to record a
 * kill (raid, boss, when, what dropped and its quality, a note). Feed it `progress-get`
 * (`raids`, `latest`, `open`, `opens-on`). Recording needs `can-record` (leader tier, as
 * `kill-record` is); before the raids unlock the form stays closed, since the server refuses
 * a kill before then. After a kill is recorded it emits `progress-changed` so the page reads
 * again.
 *
 * @tagname vintage-progress-desk
 * @summary The progression ledger with a form to record a kill and its loot.
 * @fires progress-changed - After a kill is recorded.
 * @csspart desk - The whole desk.
 * @csspart ledger - The boss ledger.
 * @csspart form - The record-a-kill form.
 * @csspart log - The recorded kill log.
 * @csspart summary - What the form will record, in words.
 * @csspart status - What just happened.
 */
export class VintageProgressDesk extends FASTElement {
  /** `progress-get` → `raids`. */
  @observable raids: LedgerRaid[] = [];
  /** `progress-get` → `latest`. */
  @observable latest: LedgerKill | null = null;
  /** `kill-list` → `kills` (newest first, with recorder and first-kill flag). */
  @observable kills: ProgressKillEntry[] = [];
  /** `progress-get` → `open`: whether the raids have unlocked. */
  @attr({ mode: 'boolean' }) open = false;
  /** `progress-get` → `opensOn` (`2026-12-09`). */
  @attr({ attribute: 'opens-on' }) opensOn = '';
  /** Optional IANA zone for the form's date and time; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Record a kill (leader tier). */
  @attr({ attribute: 'can-record', mode: 'boolean' }) canRecord = false;
  /** Remove a recorded kill (officer tier). */
  @attr({ attribute: 'can-remove', mode: 'boolean' }) canRemove = false;
  @attr({ mode: 'boolean' }) loading = false;
  /** Why the ledger could not be read. */
  @attr error = '';
  @observable raidId = '';
  @observable bossId = '';
  @observable date = '';
  @observable time = '';
  @observable note = '';
  @observable drops: DropRow[] = [];
  /** Bumped when a drop row is edited in place, so the summary follows. */
  @observable dropEdits = 0;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  @observable pendingRemove: PendingKillRemove | null = null;
  @observable removeStatusText = '';
  @observable removeStatusKind: 'idle' | 'error' | 'success' = 'idle';
  /** The officer chose the boss; until then it follows the raid's next target. */
  private bossPicked = false;

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.date) this.setNow();
  }

  raidsChanged(): void {
    if (!this.raids.some((r) => r.id === this.raidId)) this.raidId = this.raids[0]?.id ?? '';
    this.followNext();
  }

  private get zone(): string {
    return this.timeZone || browserTimeZone();
  }

  @volatile
  get raid(): LedgerRaid | undefined {
    return this.raids.find((r) => r.id === this.raidId);
  }

  @volatile
  get boss(): LedgerBoss | undefined {
    return this.raid?.bosses.find((b) => b.id === this.bossId);
  }

  /** Recorded kills for the selected raid, newest first. */
  @volatile
  get raidKills(): ProgressKillEntry[] {
    if (!this.raidId) return this.kills;
    return this.kills.filter((k) => k.raidId === this.raidId);
  }

  whenLabel(ms: number): string {
    return formatWhen(ms, this.zone);
  }

  @volatile
  get killed(): number {
    return this.raids.reduce(
      (n, r) => n + r.bosses.filter((b) => b.firstKillAt !== null).length,
      0,
    );
  }

  @volatile
  get total(): number {
    return this.raids.reduce((n, r) => n + r.bosses.length, 0);
  }

  get opensLabel(): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.opensOn);
    if (!m) return 'later';
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return day.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }

  @volatile
  get headline(): string {
    if (!this.open) return `The raids unlock ${this.opensLabel}`;
    return `${this.killed} of ${this.total} bosses down`;
  }

  @volatile
  get subline(): string {
    const raids = this.raids.map((r) => {
      const down = r.bosses.filter((b) => b.firstKillAt !== null).length;
      return `${r.name} ${down}/${r.bosses.length}`;
    });
    return this.open
      ? raids.join(' · ')
      : `${this.total} bosses across ${raids.length} raids, none down yet.`;
  }

  get closedNote(): string {
    return `Kills can be recorded from ${this.opensLabel}, when the raids unlock. The server refuses anything earlier.`;
  }

  get zoneNote(): string {
    return `In your time zone (${this.zone}).`;
  }

  @volatile
  get bossChoices(): { id: string; label: string }[] {
    const raid = this.raid;
    if (!raid) return [];
    const next = this.open ? nextBoss(raid)?.id : undefined;
    return raid.bosses.map((b, i) => {
      const state =
        b.firstKillAt !== null
          ? ` · down ${shortDay(b.firstKillAt, this.zone)}`
          : b.id === next
            ? ' · next'
            : '';
      return { id: b.id, label: `${i + 1}. ${b.name}${state}` };
    });
  }

  /** The kill time the form holds, or null when the date or time is malformed. */
  @volatile
  get killedAt(): number | null {
    return instantFromInputs(this.date, this.time, this.zone);
  }

  /** The drops that will be sent: rows with a name. */
  @volatile
  get namedDrops(): DropRow[] {
    void this.dropEdits;
    return this.drops
      .map((d) => ({ name: d.name.trim(), quality: d.quality }))
      .filter((d) => d.name);
  }

  /** What the form will record, in words, and whether it becomes the ledger entry. */
  @volatile
  get summary(): string {
    const raid = this.raid;
    const boss = this.boss;
    const at = this.killedAt;
    if (!raid || !boss) return '';
    if (at === null) return 'Give the date and time it died.';
    const n = this.namedDrops.length;
    const drops = n ? `, with ${n} drop${n === 1 ? '' : 's'}` : ', with no drops';
    const base = `Records ${boss.name} in ${raid.name}, ${formatWhen(at, this.zone)}${drops}.`;
    if (boss.firstKillAt === null) return `${base} It’s the guild’s first kill of ${boss.name}.`;
    if (at < boss.firstKillAt) {
      return `${base} That’s earlier than the first kill on record (${shortDay(boss.firstKillAt, this.zone)}), so it becomes the ledger entry.`;
    }
    return `${base} ${boss.name} is already down; the first kill (${shortDay(boss.firstKillAt, this.zone)}) stays on the ledger.`;
  }

  pickRaid(id: string): void {
    this.raidId = id;
    this.bossPicked = false;
    this.followNext();
  }

  pickBoss(id: string): void {
    this.bossId = id;
    this.bossPicked = true;
  }

  edit(field: 'date' | 'time' | 'note', value: string): void {
    this[field] = value;
  }

  /** The date and time to now, in the form's zone. */
  setNow(): void {
    const now = Date.now();
    this.date = dayKey(now, this.zone);
    this.time = timeOfDay(now, this.zone);
  }

  addDrop(): void {
    if (this.drops.length >= MAX_DROPS) return;
    this.drops = [...this.drops, { name: '', quality: 'epic' }];
  }

  removeDrop(drop: DropRow): void {
    this.drops = this.drops.filter((d) => d !== drop);
  }

  editDrop(drop: DropRow, field: 'name' | 'quality', value: string): void {
    if (field === 'name') drop.name = value;
    else if ((LOOT_QUALITIES as readonly string[]).includes(value))
      drop.quality = value as LootQuality;
    this.dropEdits += 1;
  }

  /** Until the officer picks a boss, the form follows the raid's next target. */
  private followNext(): void {
    const raid = this.raid;
    if (this.bossPicked && raid?.bosses.some((b) => b.id === this.bossId)) return;
    this.bossPicked = false;
    this.bossId = (nextBoss(raid) ?? raid?.bosses[0])?.id ?? '';
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.record();
  }

  @command('vintage.kill-record', {
    label: 'Record a kill',
    description:
      'Record the kill the form holds: the raid, the boss, when it died, what dropped with its quality, and the note.',
    category: 'Officers',
  })
  async record(): Promise<ElementResult<unknown>> {
    if (!this.canRecord) {
      return failure({
        code: 'COMMAND_DISABLED',
        message: 'Raid leaders and officers record kills',
      });
    }
    if (!this.open) {
      return failure({ code: 'COMMAND_DISABLED', message: `The raids unlock ${this.opensLabel}` });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    const raid = this.raid;
    const boss = this.boss;
    if (!raid || !boss) {
      this.say('error', 'Pick the raid and the boss.');
      return failure({ code: 'VALIDATION_ERROR', message: 'Pick the raid and the boss' });
    }
    const killedAt = this.killedAt;
    if (killedAt === null) {
      this.say('error', 'Give the date and time it died.');
      return failure({ code: 'VALIDATION_ERROR', message: 'Give the date and time it died' });
    }
    const note = this.note.trim();
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run<KillRecorded>('kill-record', {
          raidId: raid.id,
          bossId: boss.id,
          killedAt,
          loot: this.namedDrops,
          note: note || null,
        }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const first = (result.data as KillRecorded | undefined)?.first ?? false;
      this.say(
        'success',
        first
          ? `First kill of ${boss.name} in ${raid.name}. It’s on the ledger.`
          : `${boss.name} again. The first kill${boss.firstKillAt === null ? '' : ` (${shortDay(boss.firstKillAt, this.zone)})`} stays on the ledger.`,
      );
      this.drops = [];
      this.note = '';
      this.bossPicked = false;
      this.$emit('progress-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  private say(kind: 'error' | 'success', text: string): void {
    this.statusKind = kind;
    this.statusText = text;
  }

  private sayRemove(kind: 'idle' | 'error' | 'success', text: string): void {
    this.removeStatusKind = kind;
    this.removeStatusText = text;
  }

  @command('vintage.kill-remove', {
    label: 'Remove a recorded kill',
    description:
      'Preview removing a recorded boss kill (naming the boss, raid, time, and ledger effect) before confirming.',
    category: 'Officers',
  })
  async requestRemove(kill: ProgressKillEntry): Promise<ElementResult<unknown>> {
    if (!this.canRemove) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers remove recorded kills' });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{
        preview?: KillRemovePreview;
        confirmToken?: string;
      }>('kill-remove', { killId: kill.id });
      const result = toElementResult(raw);
      if (!result.success) {
        this.sayRemove('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      const preview = raw.success ? raw.data?.preview : undefined;
      if (!token || !preview) {
        this.pendingRemove = null;
        this.sayRemove('success', `Removed ${kill.bossName} (${kill.raidName}).`);
        this.$emit('progress-changed');
        return result;
      }
      const when = formatWhen(preview.willRemove.killedAt, this.zone);
      let detail = 'The guild’s first kill stays on the ledger.';
      if (preview.wasFirstKill && preview.nextFirstKillAt !== null) {
        detail = `This is the current first kill. Removing it moves the ledger’s first kill to ${formatWhen(preview.nextFirstKillAt, this.zone)}.`;
      } else if (preview.wasFirstKill) {
        detail = `This is the only recorded kill of ${preview.willRemove.bossName}. Removing it returns the boss to unkilled on the ledger.`;
      }
      this.pendingRemove = {
        killId: kill.id,
        token,
        summary: `Remove ${preview.willRemove.bossName} in ${preview.willRemove.raidName} (${when})?`,
        detail,
      };
      this.sayRemove('idle', '');
      return result;
    } finally {
      this.busy = false;
      if (this.pendingRemove) {
        Updates.enqueue(() =>
          this.shadowRoot?.querySelector<HTMLButtonElement>('.confirm button.danger')?.focus(),
        );
      }
    }
  }

  async confirmRemove(): Promise<ElementResult<unknown>> {
    const pending = this.pendingRemove;
    if (!pending) return failure({ code: 'NOTHING_TO_CONFIRM', message: 'Nothing waiting' });
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'kill-remove',
          { killId: pending.killId },
          { confirmToken: pending.token },
        ),
      );
      this.pendingRemove = null;
      if (!result.success) {
        this.sayRemove('error', describeError(result));
        return result;
      }
      this.sayRemove('success', 'Kill removed.');
      this.$emit('progress-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelRemove(): void {
    this.pendingRemove = null;
    this.sayRemove('idle', '');
  }
}

if (!customElements.get('vintage-progress-desk')) {
  await VintageProgressDesk.define({
    name: 'vintage-progress-desk',
    template,
    styles: [deskStyles, styles],
  });
}
