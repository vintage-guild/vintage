import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { CLASS_NAMES, classRoles, type Role, type WowClass } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import { deskStyles } from './desk-styles';

/** How much the guild wants a class, as `recruiting-get` says it. */
export type RecruitingNeed = 'high' | 'medium' | 'low' | 'closed';
/** The role a line recruits for, or `any`. */
export type RecruitingRole = Role | 'any';

/** One line of the band: a class, the role it's wanted for, the specs, and how much. */
export interface RecruitingDeskNeed {
  wowClass: WowClass;
  role: RecruitingRole;
  specs: string;
  need: RecruitingNeed;
}

/** The slice of `recruiting-get` the desk reads (the site module's `Recruiting`). */
export interface RecruitingDeskBand {
  headline: string;
  pitch: string;
  needs: RecruitingDeskNeed[];
  /** Null while the band still shows the starter text. */
  updatedAt: number | null;
}

/** One editable line. `key` only tells lines apart while the form is open. */
interface Row extends RecruitingDeskNeed {
  key: number;
}

const NEED_CHOICES: { value: RecruitingNeed; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'closed', label: 'Closed' },
];

const NEED_ORDER: Record<RecruitingNeed, number> = { high: 0, medium: 1, low: 2, closed: 3 };

/** Any, then the roles the class plays. */
const roleChoices = (wowClass: WowClass): RecruitingRole[] => ['any', ...classRoles(wowClass)];
/** Whether the line's class plays a role: the role menu hides the others. */
const plays = (row: Row, role: Role) => classRoles(row.wowClass).includes(role);

let nextKey = 0;
const toRow = (n: RecruitingDeskNeed): Row => ({ ...n, key: nextKey++ });

/** The band's lines, in its order. */
function rowsFor(band: RecruitingDeskBand | null): Row[] {
  return (band?.needs ?? []).map((n) => toRow({ ...n, role: n.role ?? 'any' }));
}

/** What `recruiting-set` gets: high before medium before low before closed. */
function needsFrom(rows: Row[]): RecruitingDeskNeed[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => NEED_ORDER[a.r.need] - NEED_ORDER[b.r.need] || a.i - b.i)
    .map(({ r }) => ({
      wowClass: r.wowClass,
      role: r.role,
      specs: r.specs.trim() || 'any',
      need: r.need,
    }));
}

const template = html<VintageRecruitingDesk>`
  <form class="desk" part="desk" @submit="${(x, c) => x.submit(c.event)}">
    <p class="meta" part="meta">${(x) => x.metaLine()}</p>
    ${when(
      (x) => !x.recruiting && x.error,
      html<VintageRecruitingDesk>`<p class="error" part="error" role="alert">${(x) => x.error}</p>`,
    )}

    ${when(
      (x) => x.recruiting,
      html<VintageRecruitingDesk>`
    <div class="field">
      <label for="headline">Headline</label>
      <input
        id="headline"
        maxlength="120"
        required
        :value="${(x) => x.headline}"
        ?disabled="${(x) => !x.canEdit || x.busy}"
        @input="${(x, c) => x.edit('headline', (c.event.target as HTMLInputElement).value)}"
      />
      <small>The band's big line. Say what the guild needs most.</small>
    </div>

    <div class="field">
      <label for="pitch">Pitch</label>
      <textarea
        id="pitch"
        rows="5"
        maxlength="800"
        required
        :value="${(x) => x.pitch}"
        ?disabled="${(x) => !x.canEdit || x.busy}"
        @input="${(x, c) => x.edit('pitch', (c.event.target as HTMLTextAreaElement).value)}"
      ></textarea>
      <small>Visitors read this before they ask an officer for an invite.</small>
    </div>

    <fieldset class="needs" part="needs" ?disabled="${(x) => !x.canEdit || x.busy}">
      <legend>Classes</legend>
      <small>The page lists high first, then medium, low, and closed.</small>
      ${when(
        (x) => x.rows.length > 0,
        html<VintageRecruitingDesk>`
          <div class="row head" aria-hidden="true">
            <span>Class</span><span>Role</span><span>Specs</span><span>Demand</span><span></span>
          </div>
        `,
      )}
      <div class="rows">
        ${repeat(
          (x) => x.rows,
          html<Row, VintageRecruitingDesk>`
            <div class="row">
              <select
                class="cls"
                aria-label="${(r) => `${titleCase(r.wowClass)} class`}"
                :value="${(r) => r.wowClass}"
                @change="${(r, c) => c.parent.setClass(r, (c.event.target as HTMLSelectElement).value)}"
              >
                <option value="warrior">Warrior</option>
                <option value="paladin">Paladin</option>
                <option value="hunter">Hunter</option>
                <option value="rogue">Rogue</option>
                <option value="priest">Priest</option>
                <option value="shaman">Shaman</option>
                <option value="mage">Mage</option>
                <option value="warlock">Warlock</option>
                <option value="druid">Druid</option>
              </select>
              <select
                class="role"
                aria-label="${(r) => `${titleCase(r.wowClass)} role`}"
                :value="${(r) => r.role}"
                @change="${(r, c) => c.parent.setRole(r, (c.event.target as HTMLSelectElement).value)}"
              >
                <option value="any">Any</option>
                <option value="tank" ?hidden="${(row) => !plays(row, 'tank')}" ?disabled="${(row) => !plays(row, 'tank')}">Tank</option>
                <option value="healer" ?hidden="${(row) => !plays(row, 'healer')}" ?disabled="${(row) => !plays(row, 'healer')}">Healer</option>
                <option value="melee" ?hidden="${(row) => !plays(row, 'melee')}" ?disabled="${(row) => !plays(row, 'melee')}">Melee</option>
                <option value="ranged" ?hidden="${(row) => !plays(row, 'ranged')}" ?disabled="${(row) => !plays(row, 'ranged')}">Ranged</option>
              </select>
              <input
                class="specs"
                aria-label="${(r) => `${titleCase(r.wowClass)} specs`}"
                maxlength="60"
                placeholder="any"
                :value="${(r) => r.specs}"
                @input="${(r, c) => c.parent.setSpecs(r, (c.event.target as HTMLInputElement).value)}"
              />
              <select
                class="need"
                aria-label="${(r) => `${titleCase(r.wowClass)} demand`}"
                :value="${(r) => r.need}"
                @change="${(r, c) => c.parent.setNeed(r, (c.event.target as HTMLSelectElement).value)}"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="closed">Closed</option>
              </select>
              <button
                type="button"
                class="remove"
                aria-label="${(r) => `Remove ${titleCase(r.wowClass)} ${r.role === 'any' ? '' : r.role}`.trim()}"
                @click="${(r, c) => c.parent.removeRow(r)}"
              >Remove</button>
            </div>
          `,
          // Fresh rows on every reset: a reused row would keep the values typed into the line
          // that sat there before the save re-sorted the list.
          { recycle: false },
        )}
      </div>
      ${when(
        (x) => x.rows.length === 0,
        html`<p class="note">Nothing listed. The page says strong players of any class can apply.</p>`,
      )}
      <p class="add">
        <button type="button" @click="${(x) => x.addRow()}">Add a line</button>
      </p>
    </fieldset>

    ${when(
      (x) => x.canEdit,
      html<VintageRecruitingDesk>`
        <p class="actions">
          <button type="submit" class="primary" ?disabled="${(x) => x.busy || !x.dirty}">Save the band</button>
          <button type="button" ?disabled="${(x) => x.busy || !x.dirty}" @click="${(x) => x.reset()}">Undo changes</button>
        </p>
      `,
    )}
    ${when(
      (x) => !x.canEdit,
      html`<p class="note">Officers edit the recruiting band. You can read it here.</p>`,
    )}
      `,
    )}
    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </form>
`;

const styles = css`
  .rows {
    display: grid;
    gap: var(--space-xs);
  }

  .row {
    display: grid;
    grid-template-columns: 8rem 7rem minmax(0, 1fr) 7rem auto;
    align-items: center;
    gap: var(--space-sm);
  }

  .row.head {
    margin-block-start: var(--space-xs);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .add {
    margin: 0;
  }

  /* Phones: class and role on one line, specs on the next, demand and Remove under it. */
  @media (max-width: 36rem) {
    .row {
      grid-template-columns: 1fr 1fr;
      padding-block-end: var(--space-xs);
      border-block-end: var(--border-width-thin) solid var(--color-border);
    }

    .row.head {
      display: none;
    }

    .row .specs {
      grid-column: 1 / -1;
    }
  }
`;

/**
 * The officers' editor for the Recruitment page's band: the headline, the pitch, and the lines
 * it recruits for, each a class, a role (or any), the specs, and a demand. A class can have a
 * line per role. Feed it `recruiting-get`; Save runs `recruiting-set` with all three and emits
 * `recruiting-changed` so the page re-reads. Without `can-edit` (raid leaders, who see the
 * quarters but not this command) every field is read-only.
 *
 * @tagname vintage-recruiting-desk
 * @summary Edit the recruiting band's headline, pitch, and class and role lines.
 * @fires recruiting-changed - After a save succeeds.
 * @csspart desk - The whole form.
 * @csspart meta - When it was last saved, or that it shows the starter text.
 * @csspart error - Why the band could not be read; shown instead of the form.
 * @csspart needs - The class and role lines.
 * @csspart status - What just happened.
 */
export class VintageRecruitingDesk extends FASTElement {
  /** The band as `recruiting-get` answered it. */
  @observable recruiting: RecruitingDeskBand | null = null;
  /** Whether the viewer may save (officers). */
  @attr({ attribute: 'can-edit', mode: 'boolean' }) canEdit = false;
  /** Optional IANA zone for the saved time; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  @observable headline = '';
  @observable pitch = '';
  @observable rows: Row[] = rowsFor(null);
  /** The form differs from the saved band. */
  @observable dirty = false;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';
  /** Why `recruiting-get` failed, if it did. With no band to edit, the desk shows only this. */
  @observable error = '';

  recruitingChanged(): void {
    this.reset();
  }

  /** Put the form back to the saved band. */
  reset(): void {
    this.headline = this.recruiting?.headline ?? '';
    this.pitch = this.recruiting?.pitch ?? '';
    this.rows = rowsFor(this.recruiting);
    this.dirty = false;
  }

  metaLine(): string {
    const at = this.recruiting?.updatedAt;
    if (!this.recruiting) return this.error ? '' : 'Loading the band…';
    if (at == null) return 'Showing the starter text. Nobody has saved the band yet.';
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    let when: string;
    try {
      when = new Date(at).toLocaleString(undefined, {
        ...options,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
      });
    } catch {
      when = new Date(at).toLocaleString(undefined, options);
    }
    return `Last saved ${when}.`;
  }

  edit(field: 'headline' | 'pitch', value: string): void {
    this[field] = value;
    this.dirty = true;
  }

  /** Rows change in place so typing never re-renders the row under the cursor. */
  setNeed(row: Row, value: string): void {
    if (!NEED_CHOICES.some((o) => o.value === value)) return;
    row.need = value as RecruitingNeed;
    this.dirty = true;
  }

  /**
   * A new class replaces the line, so its role choices are the new class's. A role the new
   * class can't play goes back to any.
   */
  setClass(row: Row, value: string): void {
    if (!(CLASS_NAMES as readonly string[]).includes(value)) return;
    const wowClass = value as WowClass;
    const role = roleChoices(wowClass).includes(row.role) ? row.role : 'any';
    this.rows = this.rows.map((r) => (r === row ? { ...r, wowClass, role } : r));
    this.dirty = true;
  }

  setRole(row: Row, value: string): void {
    if (!roleChoices(row.wowClass).includes(value as RecruitingRole)) return;
    row.role = value as RecruitingRole;
    this.dirty = true;
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      toRow({ wowClass: 'warrior', role: 'any', specs: '', need: 'high' }),
    ];
    this.dirty = true;
  }

  removeRow(row: Row): void {
    this.rows = this.rows.filter((r) => r !== row);
    this.dirty = true;
  }

  setSpecs(row: Row, value: string): void {
    row.specs = value;
    this.dirty = true;
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  @command('vintage.recruiting-save', {
    label: 'Save the recruiting band',
    description: 'Save the headline, pitch, and class and role lines as the form shows them.',
    category: 'Officers',
  })
  async save(): Promise<ElementResult<unknown>> {
    if (!this.canEdit) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers edit the band' });
    }
    if (!this.recruiting) {
      return failure({
        code: 'COMMAND_DISABLED',
        message: 'The band hasn’t loaded, so there is nothing to save',
      });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('recruiting-set', {
          headline: this.headline,
          pitch: this.pitch,
          needs: needsFrom(this.rows),
        }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.dirty = false;
      this.say('success', 'Saved. The Recruitment page shows it now.');
      this.$emit('recruiting-changed');
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

if (!customElements.get('vintage-recruiting-desk')) {
  await VintageRecruitingDesk.define({
    name: 'vintage-recruiting-desk',
    template,
    styles: [deskStyles, styles],
  });
}
