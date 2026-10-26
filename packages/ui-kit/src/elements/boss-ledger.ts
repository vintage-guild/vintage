import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';

/** One drop; `quality` is a Blizzard quality name (`--color-quality-<quality>`). */
export interface LedgerLoot {
  name: string;
  quality: string;
}

/** One boss row of `progress-get`: the guild's first kill, or null. */
export interface LedgerBoss {
  id: string;
  name: string;
  /** The name is datamined from the beta client; the ledger says so on hover. */
  datamined: boolean;
  firstKillAt: number | null;
  loot: LedgerLoot[];
}

export interface LedgerRaid {
  id: string;
  name: string;
  size: number;
  bosses: LedgerBoss[];
}

/** The latest first kill, for the callout above the ledger. */
export interface LedgerKill {
  raidName: string;
  bossName: string;
  killedAt: number;
  loot: LedgerLoot[];
}

type SlotState = 'killed' | 'next' | 'open' | 'locked';

interface SlotView {
  boss: LedgerBoss;
  state: SlotState;
  /** The hover and focus tooltip, also the accessible name. */
  tip: string;
  /** First-kill date, short, for the slot face. */
  date: string;
}

interface RaidView {
  raid: LedgerRaid;
  killed: number;
  tally: string;
  slots: SlotView[];
}

const monthDay = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** A `YYYY-MM-DD` calendar date as "Dec 9", the same in every zone. */
function calendarDay(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? monthDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()) : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 'es'}`;

function slotState(boss: LedgerBoss, open: boolean, nextId: string | null): SlotState {
  if (boss.firstKillAt !== null) return 'killed';
  if (!open) return 'locked';
  return boss.id === nextId ? 'next' : 'open';
}

const STATUS: Record<Exclude<SlotState, 'killed'>, string | null> = {
  next: 'next target',
  open: 'not yet',
  locked: null, // the unlock label
};

/** One slot: its state, its face date, and the tooltip that doubles as its accessible name. */
function slotView(
  boss: LedgerBoss,
  open: boolean,
  nextId: string | null,
  opensLabel: string,
): SlotView {
  const state = slotState(boss, open, nextId);
  const date = boss.firstKillAt === null ? '' : monthDay(boss.firstKillAt);
  const status = state === 'killed' ? `first kill ${date}` : (STATUS[state] ?? opensLabel);
  const tip = `${boss.name} · ${status}${boss.datamined ? ' · datamined name' : ''}`;
  return { boss, state, tip, date };
}

/** "k / n" (the unlock date is said once, by the page, not on every closed row). */
function tallyOf(killed: number, total: number): string {
  return killed === total ? `${killed} / ${total} · cleared` : `${killed} / ${total}`;
}

const check = html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const lootLine = html<LedgerLoot>`<span class="item q-${(l) => l.quality}" part="loot">[${(l) => l.name}]</span>`;

const template = html<VintageBossLedger>`
  <div class="ledger" part="ledger">
    ${when(
      (x) => x.latest,
      html<VintageBossLedger>`
        <article class="callout" part="callout">
          <span class="badge">${check}</span>
          <div class="text">
            <span class="eyebrow">First kill</span>
            <h3 class="kill">${(x) => x.latest?.bossName}</h3>
            <p class="meta">
              ${(x) => x.latest?.raidName} ·
              <time datetime="${(x) => new Date(x.latest?.killedAt ?? 0).toISOString()}">
                ${(x) => monthDay(x.latest?.killedAt ?? 0)}
              </time>
            </p>
            ${when(
              (x) => (x.latest?.loot.length ?? 0) > 0,
              html<VintageBossLedger>`<p class="loot">${repeat((x) => x.latest?.loot ?? [], lootLine)}</p>`,
            )}
          </div>
        </article>
      `,
    )}
    <ol class="raids" part="raids">
      ${repeat(
        (x) => x.rows,
        html<RaidView>`
          <li class="raid">
            <div class="head">
              <h3 class="name">${(r) => r.raid.name}</h3>
              <span class="size">${(r) => r.raid.size} players · ${(r) => plural(r.raid.bosses.length, 'boss')}</span>
              <span class="tally" part="tally">${(r) => r.tally}</span>
            </div>
            <ol class="slots" aria-label="${(r) => r.raid.name} bosses">
              ${repeat(
                (r) => r.slots,
                html<SlotView>`
                  <li class="slot ${(s) => s.state}" tabindex="0" aria-label="${(s) => s.tip}">
                    ${when(
                      (s) => s.state === 'killed',
                      html<SlotView>`<span class="mark">${check}</span><span class="date">${(s) => s.date}</span>`,
                    )}
                    ${when(
                      (s) => s.state !== 'killed',
                      html<SlotView>`<span class="index" aria-hidden="true">${(_, c) => c.index + 1}</span>`,
                    )}
                    <span class="tip" role="tooltip" aria-hidden="true">${(s) => s.tip}</span>
                  </li>
                `,
                { positioning: true },
              )}
            </ol>
          </li>
        `,
      )}
    </ol>
    ${when(
      (x) => x.hasDatamined,
      html`<p class="note" part="note">Hover or focus a slot for the boss. Barrow Deeps and Hyjal Summit names are datamined from the beta client, not published by Blizzard.</p>`,
    )}
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .ledger {
    display: grid;
    gap: var(--space-md);
  }

  h3,
  p,
  ol {
    margin: 0;
  }

  ol {
    padding: 0;
    list-style: none;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  /* the first-kill callout */
  .callout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-sm);
    align-items: start;
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-inline-start: var(--border-width-thick) solid var(--color-gold-500);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-gold-500) 14%, var(--color-surface-raised)),
      var(--color-surface-raised) 55%
    );
    box-shadow:
      inset 0 1px 0 rgb(255 244 228 / 6%),
      0 14px 34px rgb(0 0 0 / 45%);
  }

  .badge {
    display: inline-grid;
    place-items: center;
    inline-size: 2.4rem;
    block-size: 2.4rem;
    border-radius: 50%;
    background: var(--color-gold-500);
    color: var(--color-accent-contrast);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--color-gold-500) 40%, transparent);
  }

  .badge svg {
    inline-size: 1.1rem;
    block-size: 1.1rem;
  }

  .text {
    display: grid;
    gap: 0.2rem;
    min-inline-size: 0;
  }

  .kill {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-heavy);
    font-size: var(--font-size-lg);
    line-height: 1.1;
    letter-spacing: var(--font-tracking-tight);
  }

  .meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .loot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .item.q-poor {
    color: var(--color-quality-poor);
  }

  .item.q-common {
    color: var(--color-quality-common);
  }

  .item.q-uncommon {
    color: var(--color-quality-uncommon);
  }

  .item.q-rare {
    color: var(--color-quality-rare);
  }

  .item.q-epic {
    color: var(--color-quality-epic);
  }

  .item.q-legendary {
    color: var(--color-quality-legendary);
  }

  /* the rows */
  .raids {
    display: grid;
  }

  .raid {
    display: grid;
    grid-template-columns: minmax(11rem, 15rem) 1fr;
    gap: var(--space-sm) var(--space-md);
    align-items: center;
    padding-block: var(--space-sm);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .raid:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .head {
    display: grid;
    gap: 0.15rem;
  }

  .name {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-md);
    letter-spacing: var(--font-tracking-tight);
  }

  .size {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .tally {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .slot {
    position: relative;
    display: grid;
    place-content: center;
    gap: 0.1rem;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: color-mix(in srgb, var(--color-surface-canvas) 60%, transparent);
    box-shadow: inset 0 1px 0 rgb(255 244 228 / 4%);
    cursor: default;
  }

  .slot.locked {
    border-color: var(--color-border-default);
    border-style: dotted;
  }

  .index {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    opacity: 0.7;
  }

  .slot.next .index {
    color: var(--color-verdigris-200);
    opacity: 1;
  }

  .slot.next {
    border-style: dashed;
    border-color: var(--color-verdigris-400);
    background: color-mix(in srgb, var(--color-verdigris-500) 14%, transparent);
  }

  .slot.killed {
    border-color: var(--color-gold-500);
    background: var(--color-gold-500);
    color: var(--color-accent-contrast);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 30%),
      0 6px 16px color-mix(in srgb, var(--color-gold-500) 35%, transparent);
  }

  .mark {
    display: block;
    line-height: 0;
    text-align: center;
  }

  .date {
    font-family: var(--font-family-mono);
    font-size: 0.6rem;
    line-height: 1;
    letter-spacing: 0;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .slot:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: 2px;
  }

  /* the tooltip: boss name, state, and the datamined note */
  .tip {
    position: absolute;
    inset-block-end: calc(100% + 0.45rem);
    inset-inline-start: 50%;
    z-index: 2;
    inline-size: max-content;
    max-inline-size: min(14rem, 80vw);
    padding: 0.4rem 0.6rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    line-height: var(--font-leading-normal);
    text-align: center;
    text-transform: none;
    letter-spacing: 0;
    box-shadow: 0 10px 24px rgb(0 0 0 / 45%);
    translate: -50% 0;
    /* Hidden tips take no layout space, so they never widen the page. */
    display: none;
    pointer-events: none;
  }

  .slot:hover .tip,
  .slot:focus-visible .tip {
    display: block;
  }

  .slot:first-child .tip {
    inset-inline-start: 0;
    translate: 0;
    text-align: start;
  }

  .slot:last-child .tip {
    inset-inline-start: auto;
    inset-inline-end: 0;
    translate: 0;
    text-align: end;
  }

  .note {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    max-inline-size: 60ch;
  }

  @media (max-width: 40rem) {
    .raid {
      grid-template-columns: 1fr;
      gap: var(--space-xs);
    }

    .head {
      grid-template-columns: 1fr auto;
      align-items: baseline;
    }

    .head .size {
      grid-column: 1;
    }

    .head .tally {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      text-align: end;
    }

    .slot {
      inline-size: 2.4rem;
      block-size: 2.4rem;
    }
  }
`;

/**
 * The progression ledger: one row per raid with one slot per boss. A killed boss is a filled
 * gold slot with a check and its first-kill date, the next target is a dashed verdigris slot,
 * and before the raids unlock every row says when they do. Boss names show on hover or focus,
 * with a note when the name is datamined. A "first kill" card above the rows names the latest
 * kill with its loot in quality colors. Feed it `progress-get`.
 *
 * @tagname vintage-boss-ledger
 * @summary Per-raid boss slots with first-kill dates and the latest kill's loot.
 * @csspart ledger - The whole block.
 * @csspart callout - The first-kill card.
 * @csspart loot - One item in the loot line.
 * @csspart raids - The rows.
 * @csspart tally - A row's "k / n" or "unlocks" label.
 * @csspart note - The datamined note.
 */
export class VintageBossLedger extends FASTElement {
  /** Raids and their bosses, from `progress-get`. */
  @observable raids: LedgerRaid[] = [];
  /** The latest first kill, or null for no callout. */
  @observable latest: LedgerKill | null = null;
  /** Whether the raids have unlocked. Closed rows show `unlocks <date>` and no next target. */
  @attr({ mode: 'boolean' }) open = false;
  /** The unlock day as a calendar date (`2026-12-09`), so the label reads the same in every zone. */
  @attr({ attribute: 'opens-on' }) opensOn = '';

  get opensLabel(): string {
    const day = calendarDay(this.opensOn);
    return day ? `unlocks ${day}` : 'not open yet';
  }

  get hasDatamined(): boolean {
    return this.raids.some((r) => r.bosses.some((b) => b.datamined));
  }

  get rows(): RaidView[] {
    const open = this.open;
    const opensLabel = this.opensLabel;
    return this.raids.map((raid) => {
      const killed = raid.bosses.filter((b) => b.firstKillAt !== null).length;
      const nextId = open ? (raid.bosses.find((b) => b.firstKillAt === null)?.id ?? null) : null;
      return {
        raid,
        killed,
        tally: tallyOf(killed, raid.bosses.length),
        slots: raid.bosses.map((boss) => slotView(boss, open, nextId, opensLabel)),
      };
    });
  }
}

if (!customElements.get('vintage-boss-ledger')) {
  await VintageBossLedger.define({ name: 'vintage-boss-ledger', template, styles });
}
