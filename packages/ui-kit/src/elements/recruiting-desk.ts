import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { CLASS_NAMES, type WowClass } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';

/** How much the guild wants a class, as `recruiting-get` says it. */
export type RecruitingNeed = 'high' | 'medium' | 'closed';

/** The slice of `recruiting-get` the desk reads (the site module's `Recruiting`). */
export interface RecruitingDeskBand {
  headline: string;
  pitch: string;
  needs: { wowClass: WowClass; specs: string; need: RecruitingNeed }[];
  /** Null while the band still shows the starter text. */
  updatedAt: number | null;
}

/** One editable row: every class has one, `none` keeps it off the band. */
interface Row {
  wowClass: WowClass;
  specs: string;
  need: RecruitingNeed | 'none';
}

const NEED_CHOICES: { value: Row['need']; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'closed', label: 'Closed' },
  { value: 'none', label: 'Not listed' },
];

const NEED_ORDER: Record<RecruitingNeed, number> = { high: 0, medium: 1, closed: 2 };

/** The band's classes first, in its order, then the classes it leaves out. */
function rowsFor(band: RecruitingDeskBand | null): Row[] {
  const listed: Row[] = (band?.needs ?? []).map((n) => ({ ...n }));
  const rest = CLASS_NAMES.filter((c) => !listed.some((r) => r.wowClass === c)).map(
    (wowClass): Row => ({ wowClass, specs: 'any', need: 'none' }),
  );
  return [...listed, ...rest];
}

/** What `recruiting-set` gets: listed classes, high before medium before closed. */
function needsFrom(rows: Row[]): RecruitingDeskBand['needs'] {
  return rows
    .filter((r): r is Row & { need: RecruitingNeed } => r.need !== 'none')
    .map((r, i) => ({ r, i }))
    .sort((a, b) => NEED_ORDER[a.r.need] - NEED_ORDER[b.r.need] || a.i - b.i)
    .map(({ r }) => ({ wowClass: r.wowClass, specs: r.specs.trim() || 'any', need: r.need }));
}

const template = html<VintageRecruitingDesk>`
  <form class="desk" part="desk" @submit="${(x, c) => x.submit(c.event)}">
    <p class="meta" part="meta">${(x) => x.metaLine()}</p>

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
      <small>The band lists high first, then medium, then closed. Not listed keeps a class off it.</small>
      <div class="rows">
        ${repeat(
          (x) => x.rows,
          html<Row, VintageRecruitingDesk>`
            <div class="row">
              <span class="cls">${(r) => titleCase(r.wowClass)}</span>
              <select
                aria-label="${(r) => `${titleCase(r.wowClass)} need`}"
                @change="${(r, c) => c.parent.setNeed(r, (c.event.target as HTMLSelectElement).value)}"
              >
                ${repeat(
                  () => NEED_CHOICES,
                  html<
                    (typeof NEED_CHOICES)[number],
                    Row
                  >`<option value="${(o) => o.value}" :selected="${(o, c) => c.parent.need === o.value}">${(o) => o.label}</option>`,
                )}
              </select>
              <input
                aria-label="${(r) => `${titleCase(r.wowClass)} specs`}"
                maxlength="60"
                placeholder="any"
                :value="${(r) => r.specs}"
                @input="${(r, c) => c.parent.setSpecs(r, (c.event.target as HTMLInputElement).value)}"
              />
            </div>
          `,
        )}
      </div>
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
    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </form>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .desk {
    display: grid;
    gap: var(--space-md);
    max-inline-size: 48rem;
  }

  .field {
    display: grid;
    gap: 0.3rem;
  }

  label,
  legend {
    font-weight: var(--font-weight-bold);
  }

  input,
  textarea,
  select {
    font: var(--font-size-md) var(--font-family-sans);
    padding: 0.45rem 0.6rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    max-inline-size: 100%;
    min-inline-size: 0;
  }

  textarea {
    resize: vertical;
    line-height: 1.5;
  }

  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  button:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  :disabled {
    opacity: 0.7;
  }

  .needs {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.5rem;
  }

  legend {
    padding-inline: var(--space-xs);
  }

  .rows {
    display: grid;
    gap: var(--space-xs);
  }

  .row {
    display: grid;
    grid-template-columns: 6rem 9rem minmax(0, 1fr);
    align-items: center;
    gap: var(--space-sm);
  }

  @media (max-width: 30rem) {
    .row {
      grid-template-columns: 1fr 1fr;
    }

    .row input {
      grid-column: 1 / -1;
    }
  }

  .cls {
    font-weight: var(--font-weight-bold);
  }

  small,
  .meta,
  .note {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
  }

  button {
    font: var(--font-weight-medium) var(--font-size-sm) var(--font-family-sans);
    padding: 0.5rem 0.9rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  button.primary {
    background: var(--color-accent-secondary);
    border-color: transparent;
    color: var(--color-surface-canvas);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .status {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
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
`;

/**
 * The officers' editor for the home page's recruiting band: the headline, the pitch, and a
 * need and specs for each class. Feed it `recruiting-get`; Save runs `recruiting-set` with
 * all three and emits `recruiting-changed` so the page re-reads. Without `can-edit` (raid
 * leaders, who see the quarters but not this command) every field is read-only.
 *
 * @tagname vintage-recruiting-desk
 * @summary Edit the recruiting band's headline, pitch, and class needs.
 * @fires recruiting-changed - After a save succeeds.
 * @csspart desk - The whole form.
 * @csspart meta - When it was last saved, or that it shows the starter text.
 * @csspart needs - The class rows.
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
    if (!this.recruiting) return 'Loading the band…';
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
    row.need = value as Row['need'];
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
    description: 'Save the headline, pitch, and class needs as the form shows them.',
    category: 'Officers',
  })
  async save(): Promise<ElementResult<unknown>> {
    if (!this.canEdit) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers edit the band' });
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
      this.say('success', 'Saved. The home page shows it now.');
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
  await VintageRecruitingDesk.define({ name: 'vintage-recruiting-desk', template, styles });
}
