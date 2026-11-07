import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';

/** The registered character a card is for: the slice of `member-me`'s characters it needs. */
export interface ArmoryCardCharacter {
  id: string;
  /** "Bloodfen" or "Bloodfen Il": a registered last name is the armory surname. */
  name: string;
  class: string;
}

/** One equipped item, as `armory-get` / `armory-list` answer it. */
export interface ArmoryCardItem {
  slot: string;
  itemId: number;
  name: string | null;
  quality: string | null;
  itemLevel: number | null;
}

/** A character's armory link, as `armory-list` answers it (the fields the card shows). */
export interface ArmoryCardEntry {
  characterId: string;
  name: string;
  surname: string;
  slug: string;
  status: 'pending' | 'found' | 'not-found' | 'error';
  profile: {
    level: number;
    className: string | null;
    raceName: string | null;
    guildName: string | null;
    activeSpec: string | null;
    equippedItemLevel: number | null;
  } | null;
  equipment: ArmoryCardItem[];
  avatarUrl: string | null;
  classMismatch: boolean;
  error: string | null;
  requestedAt: number;
  checkedAt: number | null;
  /** When the link was last saved. Later than `requestedAt`: saved within the cooldown, no fetch yet. */
  linkedAt?: number;
}

/** `armory-refresh`'s cooldown (`ARMORY_REFRESH_COOLDOWN_MS` in `@vintage/armory`, above ui-kit). */
const REFRESH_COOLDOWN_MS = 10 * 60_000;

const QUALITIES = new Set(['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary']);

const SLOT_LABELS: Record<string, string> = {
  FINGER_1: 'Ring',
  FINGER_2: 'Ring',
  TRINKET_1: 'Trinket',
  TRINKET_2: 'Trinket',
  MAIN_HAND: 'Main hand',
  OFF_HAND: 'Off hand',
  SHOULDER: 'Shoulders',
  WRIST: 'Wrists',
};

/** Blizzard's slot type as a label: `MAIN_HAND` → "Main hand", `FINGER_1` → "Ring". */
export const slotLabel = (slot: string): string =>
  SLOT_LABELS[slot] ?? titleCase(slot.toLowerCase().replaceAll('_', ' '));

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function ago(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'just now';
  const [n, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 48 * 60
        ? [Math.floor(minutes / 60), 'hour']
        : [Math.floor(minutes / 1440), 'day'];
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/** The registered name split the way armory-link does: a last name is the surname. */
const registeredLast = (name: string): string | null => name.trim().split(/\s+/)[1] ?? null;

/** The card's state, from the entry. `asked` is a fetch in flight (refresh or sweep). */
type CardState = 'unlinked' | 'pending' | 'found' | 'not-found' | 'error';

const itemTemplate = html<ArmoryCardItem>`
  <li>
    <span class="slot">${(i) => slotLabel(i.slot)}</span>
    <span class="item ${(i) => (i.quality && QUALITIES.has(i.quality) ? `q-${i.quality}` : '')}"
      >${(i) => i.name ?? `Item ${i.itemId}`}</span
    >
    <span class="ilvl">${(i) => (i.itemLevel === null ? '' : i.itemLevel)}</span>
  </li>
`;

const template = html<VintageArmoryCard>`
  <article class="card ${(x) => x.state}" part="card" aria-label="${(x) => `${x.character?.name ?? ''} on the armory`}">
    <header class="head">
      ${when(
        (x) => x.entry?.avatarUrl,
        html<VintageArmoryCard>`<img
          class="avatar"
          part="avatar"
          src="${(x) => x.entry?.avatarUrl ?? ''}"
          alt=""
          width="56"
          height="56"
          loading="lazy"
          referrerpolicy="no-referrer"
        />`,
        html<VintageArmoryCard>`<span class="avatar blank" part="avatar" aria-hidden="true"
          >${(x) => (x.character?.name ?? '?').charAt(0)}</span
        >`,
      )}
      <div class="who">
        <h3 style="color: var(--color-class-${(x) => x.character?.class ?? 'warrior'})">
          ${(x) => x.title}
        </h3>
        <p class="line">${(x) => x.summary}</p>
      </div>
      ${when(
        (x) => x.state === 'found' && x.entry?.profile?.equippedItemLevel != null,
        html<VintageArmoryCard>`<p class="ilvl-figure" part="item-level">
          <b>${(x) => x.entry?.profile?.equippedItemLevel}</b> <small>item level</small>
        </p>`,
      )}
    </header>

    <p class="note" part="note">${(x) => x.note}</p>
    ${when(
      (x) => x.entry?.classMismatch,
      html<VintageArmoryCard>`<p class="warn" part="mismatch">
        The armory says ${(x) => x.entry?.profile?.className ?? 'another class'}; this character is
        registered as a ${(x) => titleCase(x.character?.class ?? '')}. Check the name.
      </p>`,
    )}

    ${when(
      (x) => x.state === 'found' && (x.entry?.equipment.length ?? 0) > 0,
      html<VintageArmoryCard>`<details part="gear">
        <summary>Gear (${(x) => x.entry?.equipment.length})</summary>
        <ul class="gear">${repeat((x) => x.entry?.equipment ?? [], itemTemplate)}</ul>
      </details>`,
    )}

    ${when(
      (x) => x.showLinkForm,
      html<VintageArmoryCard>`<form class="link" part="link-form" @submit="${(x, c) => {
        c.event.preventDefault();
        void x.link(x.surnameDraft);
      }}">
        ${when(
          (x) => x.needsSurname,
          html<VintageArmoryCard>`<label>
            <span>Surname</span>
            <input
              name="surname"
              autocomplete="off"
              spellcheck="false"
              maxlength="12"
              .value="${(x) => x.surnameDraft}"
              @input="${(x, c) => {
                x.surnameDraft = (c.event.target as HTMLInputElement).value;
              }}"
            />
          </label>`,
        )}
        <button type="submit" class="btn primary" ?disabled="${(x) => x.busy}">
          ${(x) => (x.state === 'unlinked' ? 'Find on the armory' : 'Look up again')}
        </button>
      </form>`,
    )}

    ${when(
      (x) => x.state !== 'unlinked',
      html<VintageArmoryCard>`<div class="controls" part="controls">
        <button type="button" class="btn" ?disabled="${(x) => x.busy || (x.state === 'pending' && !x.waiting)}" @click="${(x) => x.refresh()}">Refresh</button>
        <button type="button" class="btn danger" ?disabled="${(x) => x.busy}" @click="${(x) => x.unlink()}">Unlink</button>
      </div>`,
    )}

    ${when(
      (x) => x.pendingUnlink,
      html<VintageArmoryCard>`<div class="confirm" part="confirm" role="alertdialog" aria-labelledby="confirm-text">
        <p id="confirm-text">Unlink <b>${(x) => x.title}</b> from the armory? The character stays registered.</p>
        <button type="button" class="btn danger" @click="${(x) => x.confirmUnlink()}">Unlink</button>
        <button type="button" class="btn" @click="${(x) => x.cancelUnlink()}">Keep</button>
      </div>`,
    )}

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </article>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .card {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-low);
  }

  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-sm);
  }

  .avatar {
    inline-size: 3.5rem;
    block-size: 3.5rem;
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    object-fit: cover;
  }

  .avatar.blank {
    display: grid;
    place-items: center;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    background: var(--color-surface-sunken);
  }

  .who {
    display: grid;
    min-inline-size: 0;
  }

  h3 {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-md);
  }

  .line,
  .note,
  .warn,
  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    text-wrap: pretty;
  }

  .line,
  .note {
    color: var(--color-text-secondary);
  }

  .warn {
    color: var(--color-text-accent);
  }

  .ilvl-figure {
    display: grid;
    justify-items: end;
    margin: 0;
  }

  .ilvl-figure b {
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    line-height: 1;
  }

  .ilvl-figure small {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  details summary {
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .gear {
    display: grid;
    gap: 0.15rem;
    margin: var(--space-xs) 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);
  }

  .gear li {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) auto;
    gap: var(--space-xs);
  }

  .slot,
  .ilvl {
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .item {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .q-poor {
    color: var(--color-quality-poor);
  }
  .q-common {
    color: var(--color-quality-common);
  }
  .q-uncommon {
    color: var(--color-quality-uncommon);
  }
  .q-rare {
    color: var(--color-quality-rare);
  }
  .q-epic {
    color: var(--color-quality-epic);
  }
  .q-legendary {
    color: var(--color-quality-legendary);
  }

  .link {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm);
  }

  .link label {
    display: grid;
    gap: 0.2rem;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  input {
    font: var(--font-size-md) var(--font-family-sans);
    padding: 0.4rem 0.6rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    inline-size: 10rem;
  }

  .controls {
    display: flex;
    gap: var(--space-xs);
  }

  .btn {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.35rem 0.75rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .btn.primary {
    border-color: var(--color-accent-secondary);
    color: var(--color-accent-secondary);
  }

  .btn.danger {
    color: var(--color-text-accent);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn:focus-visible,
  input:focus-visible,
  summary:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
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
  }

  .confirm p {
    flex: 1 1 16rem;
    margin: 0;
  }

  .status:empty {
    display: none;
  }

  .status.error {
    color: var(--color-feedback-danger);
  }

  .status.success {
    color: var(--color-feedback-success);
  }

  @media (max-width: 30rem) {
    .head {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .ilvl-figure {
      grid-column: 1 / -1;
      justify-items: start;
    }

    .gear li {
      grid-template-columns: 5rem minmax(0, 1fr) auto;
    }
  }
`;

/**
 * One registered character's WoW: Forever armory card: the portrait, level, race, class and
 * spec, guild, item level, and gear the armory last gave, with Refresh (`armory-refresh`) and
 * Unlink (`armory-unlink`: the server's preview, then confirm). Unlinked, it offers to find the
 * character (`armory-link`), asking for a surname only when the registered name has none. Feed
 * it the character and its `armory-list` entry; it emits `armory-changed` after a change so the
 * page re-reads (a fetch lands a few seconds later).
 *
 * @tagname vintage-armory-card
 * @summary A character's armory card: level, item level, gear, and link controls.
 * @fires armory-changed - After a link, refresh, or unlink succeeds; `detail` is the character id.
 * @csspart card - The whole card.
 * @csspart avatar - The armory portrait, or the initial without one.
 * @csspart item-level - The equipped item level figure.
 * @csspart note - What the armory said last, or what to do.
 * @csspart mismatch - The armory's class differs from the registered one.
 * @csspart gear - The equipped gear list.
 * @csspart link-form - Find the character on the armory.
 * @csspart controls - Refresh and Unlink.
 * @csspart confirm - An unlink waiting for confirmation.
 * @csspart status - What just happened.
 */
export class VintageArmoryCard extends FASTElement {
  @observable character: ArmoryCardCharacter | null = null;
  @observable entry: ArmoryCardEntry | null = null;
  /** Epoch ms for "checked 5 minutes ago"; the page sets it, tests pin it. */
  @observable now = Date.now();
  @observable busy = false;
  @observable surnameDraft = '';
  @observable pendingUnlink: { token: string } | null = null;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  /**
   * FAST's change callback for `entry`. A success line ("Looking up …", "Asked the armory again")
   * describes a fetch in flight, so it goes once the page brings an entry whose fetch has landed.
   * Errors stay until the next action.
   */
  entryChanged(_prev: ArmoryCardEntry | null, next: ArmoryCardEntry | null): void {
    const landed = next !== null && next.checkedAt !== null && next.checkedAt >= next.requestedAt;
    if (landed && this.statusKind === 'success') this.say('idle', '');
  }

  get state(): CardState {
    return this.entry ? this.entry.status : 'unlinked';
  }

  /** The registered name has no last name, so linking needs one typed. */
  get needsSurname(): boolean {
    return !!this.character && registeredLast(this.character.name) === null;
  }

  /**
   * Relinked (a corrected surname) within `armory-refresh`'s cooldown: the server saved it but
   * started no fetch, so nothing is in flight. The hourly sweep or a Refresh looks it up.
   */
  get waiting(): boolean {
    const e = this.entry;
    return !!e && e.status === 'pending' && (e.linkedAt ?? 0) > e.requestedAt;
  }

  get showLinkForm(): boolean {
    return this.state === 'unlinked' || (this.state === 'not-found' && this.needsSurname);
  }

  get title(): string {
    const e = this.entry;
    return e ? `${e.name} ${e.surname}` : (this.character?.name ?? '');
  }

  /** "Level 20 Orc Warrior · Protection · <Vintage>" once found. */
  get summary(): string {
    const p = this.entry?.profile;
    if (!p) return titleCase(this.character?.class ?? '');
    const who = [p.raceName, p.className].filter(Boolean).join(' ');
    return [`Level ${p.level} ${who}`.trim(), p.activeSpec, p.guildName && `<${p.guildName}>`]
      .filter(Boolean)
      .join(' · ');
  }

  get note(): string {
    const e = this.entry;
    if (!e) {
      return this.needsSurname
        ? 'Not linked. Give its surname to show its level, item level, and gear here.'
        : 'Not linked. Find it on the armory to show its level, item level, and gear here.';
    }
    if (this.waiting) {
      const left = Math.ceil((e.requestedAt + REFRESH_COOLDOWN_MS - this.now) / 60_000);
      const retry =
        left > 0 ? `press Refresh in ${left} minute${left === 1 ? '' : 's'}` : 'press Refresh';
      return `Saved as ${e.name} ${e.surname}. The last lookup was under 10 minutes ago, so this one runs within the hour, or ${retry}.`;
    }
    const asked = e.checkedAt === null || e.requestedAt > e.checkedAt;
    if (e.status === 'pending' || (asked && e.status !== 'found')) {
      return `Looking up ${e.name} ${e.surname} on the armory…`;
    }
    if (e.status === 'not-found') {
      const fix = this.needsSurname
        ? 'check the surname below'
        : 'if the name is misspelled, edit the character above';
      return `The armory has no ${e.name} ${e.surname}. Characters show up from level 10, once they've logged out; ${fix}.`;
    }
    if (e.status === 'error') return `The armory didn't answer: ${e.error ?? 'unknown error'}`;
    const checked = e.checkedAt === null ? '' : `Checked ${ago(e.checkedAt, this.now)}`;
    return asked ? `${checked}; looking again…` : `${checked}.`;
  }

  @command('vintage.armory-link', {
    label: 'Find on the armory',
    description: 'Link this character to its WoW: Forever armory entry.',
    category: 'Characters',
    parameters: {
      type: 'object',
      properties: { surname: { type: 'string', description: 'Only when the name has none' } },
    },
  })
  async link(surname?: unknown): Promise<ElementResult<unknown>> {
    const character = this.character;
    if (!character) return failure({ code: 'NO_CHARACTER', message: 'No character on this card' });
    const typed = typeof surname === 'string' ? surname.trim() : '';
    if (this.needsSurname && !typed) {
      this.say('error', 'Type the surname first');
      return failure({ code: 'INVALID_PARAMETERS', message: 'Give the surname' });
    }
    const input = this.needsSurname
      ? { characterId: character.id, surname: typed }
      : { characterId: character.id };
    return this.run('armory-link', input, `Linked ${character.name}`);
  }

  @command('vintage.armory-refresh', {
    label: 'Refresh from the armory',
    description: 'Fetch this character from the armory again (once every 10 minutes).',
    category: 'Characters',
  })
  async refresh(): Promise<ElementResult<unknown>> {
    const character = this.character;
    if (!character) return failure({ code: 'NO_CHARACTER', message: 'No character on this card' });
    return this.run('armory-refresh', { characterId: character.id }, 'Asked the armory again');
  }

  /** Unlink: the first call is the server's preview; `confirmUnlink` finishes it. */
  async unlink(): Promise<ElementResult<unknown>> {
    const character = this.character;
    if (!character) return failure({ code: 'NO_CHARACTER', message: 'No character on this card' });
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const raw = await getCommandClient().run<{ confirmToken?: string }>('armory-unlink', {
        characterId: character.id,
      });
      const result = toElementResult(raw);
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      const token = raw.success ? raw.data?.confirmToken : undefined;
      if (token) {
        this.pendingUnlink = { token };
        this.say('idle', '');
      }
      return result;
    } finally {
      this.busy = false;
    }
  }

  async confirmUnlink(): Promise<ElementResult<unknown>> {
    const pending = this.pendingUnlink;
    const character = this.character;
    if (!pending || !character) {
      return failure({ code: 'NOTHING_TO_CONFIRM', message: 'No unlink waiting' });
    }
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          'armory-unlink',
          { characterId: character.id },
          { confirmToken: pending.token },
        ),
      );
      this.pendingUnlink = null;
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', `Unlinked ${this.title}`);
      this.$emit('armory-changed', character.id);
      return result;
    } finally {
      this.busy = false;
    }
  }

  cancelUnlink(): void {
    this.pendingUnlink = null;
    this.say('idle', '');
  }

  private async run(
    name: string,
    input: Record<string, unknown>,
    done: string,
  ): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.say('success', done);
      this.$emit('armory-changed', this.character?.id);
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

if (!customElements.get('vintage-armory-card')) {
  await VintageArmoryCard.define({ name: 'vintage-armory-card', template, styles });
}
