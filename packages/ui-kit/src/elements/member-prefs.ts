import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import type { ListedCharacter } from './character-list';

/** Every IANA zone the browser knows, or a short list where it can't say. */
function knownZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
  }
}

const browserZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

const characterOption = (c: ListedCharacter) => `${c.name} · ${titleCase(c.class)}`;

const template = html<VintageMemberPrefs>`
  <div class="prefs" part="prefs">
    <div class="field" part="main">
      <label for="main">Main character</label>
      ${when(
        (x) => x.characters.length > 0,
        html<VintageMemberPrefs>`
          <select
            id="main"
            ?disabled="${(x) => x.busy}"
            @change="${(x, c) => x.setMain((c.event.target as HTMLSelectElement).value)}"
          >
            ${repeat(
              (x) => x.characters,
              html<
                ListedCharacter,
                VintageMemberPrefs
              >`<option value="${(ch) => ch.id}" :selected="${(ch) => ch.isMain}">${(ch) => characterOption(ch)}</option>`,
            )}
          </select>
          <small>Raid signups and the home page use your main.
            <a href="${(x) => x.charactersHref}">Manage characters</a></small>
        `,
      )}
      ${when(
        (x) => x.characters.length === 0,
        html<VintageMemberPrefs>`<p class="none">No characters yet.
          <a href="${(x) => x.charactersHref}">Add your main</a> to sign up for raids.</p>`,
      )}
    </div>

    <div class="field" part="time-zone">
      <label for="zone">Time zone</label>
      <select
        id="zone"
        ?disabled="${(x) => x.busy}"
        @change="${(x, c) => x.setTimeZone((c.event.target as HTMLSelectElement).value)}"
      >
        <option value="" :selected="${(x) => !x.timezone}">My browser's (${() => browserZone()})</option>
        ${repeat(
          (x) => x.zones,
          html<
            string,
            VintageMemberPrefs
          >`<option value="${(z) => z}" :selected="${(z, c) => c.parent.timezone === z}">${(z) => z.replaceAll('_', ' ')}</option>`,
        )}
      </select>
      <small>Raid times across the site show in this zone.</small>
    </div>

    <div class="field" part="reminders">
      <label class="check">
        <input
          type="checkbox"
          ?checked="${(x) => !x.dmOptOut}"
          ?disabled="${(x) => x.busy}"
          @change="${(x, c) => x.setReminders((c.event.target as HTMLInputElement).checked)}"
        />
        Send me reminder DMs before raids
      </label>
      <small>Random, the guild's raven, DMs you if you haven't answered a raid's signup. Channel reminders still
        happen either way.</small>
    </div>

    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .prefs {
    display: grid;
    gap: var(--space-md);
  }

  .field {
    display: grid;
    gap: 0.3rem;
    max-inline-size: 32rem;
  }

  label {
    font-weight: var(--font-weight-bold);
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  select {
    font: var(--font-size-md) var(--font-family-sans);
    padding: 0.45rem 0.6rem;
    border-radius: 0.35rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    max-inline-size: 100%;
  }

  input[type='checkbox'] {
    inline-size: 1.1rem;
    block-size: 1.1rem;
    accent-color: var(--color-accent-secondary);
  }

  select:focus-visible,
  input:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  small,
  .none {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-wrap: pretty;
  }

  a {
    color: var(--color-text-accent);
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
 * The member's own settings: their main character (`character-update`), the time zone raid
 * times show in, and whether the bot may DM reminders (both `member-prefs-set`). Feed it
 * `member-me`'s characters and prefs; it emits `prefs-changed` after a change so the app can
 * refresh the session (times follow the new zone) and the page can re-read.
 *
 * @tagname vintage-member-prefs
 * @summary Main character, time zone, and reminder DMs for the signed-in member.
 * @fires prefs-changed - After a main, time zone, or reminder change succeeds.
 * @csspart prefs - The whole form.
 * @csspart main - The main-character field.
 * @csspart time-zone - The time zone field.
 * @csspart reminders - The reminder DM switch.
 * @csspart status - What just happened.
 */
export class VintageMemberPrefs extends FASTElement {
  @observable characters: ListedCharacter[] = [];
  /** The member's zone, or empty for "my browser's". */
  @attr timezone = '';
  /** True when the member has turned reminder DMs off. */
  @attr({ attribute: 'dm-opt-out', mode: 'boolean' }) dmOptOut = false;
  /** Where "Manage characters" goes. */
  @attr({ attribute: 'characters-href' }) charactersHref = '/characters';
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  readonly zones = knownZones();

  connectedCallback(): void {
    super.connectedCallback();
    this.syncSelects();
  }

  timezoneChanged(): void {
    this.syncSelects();
  }

  charactersChanged(): void {
    this.syncSelects();
  }

  /**
   * Put each select on the stored value once its options exist. Option bindings alone don't
   * move a select's selection after the options are built, so this sets it directly.
   */
  private syncSelects(): void {
    queueMicrotask(() => {
      const zone = this.shadowRoot?.querySelector<HTMLSelectElement>('#zone');
      if (zone) zone.value = this.timezone;
      const main = this.shadowRoot?.querySelector<HTMLSelectElement>('#main');
      const mainId = this.characters.find((c) => c.isMain)?.id;
      if (main && mainId) main.value = mainId;
    });
  }

  @command('vintage.member-main-set', {
    label: 'Set main character',
    description: 'Make one of your characters your main.',
    category: 'Profile',
    parameters: {
      type: 'object',
      properties: { characterId: { type: 'string' } },
      required: ['characterId'],
    },
  })
  async setMain(characterId: unknown): Promise<ElementResult<unknown>> {
    if (typeof characterId !== 'string' || !this.characters.some((c) => c.id === characterId)) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick one of your characters' });
    }
    const name = this.characters.find((c) => c.id === characterId)?.name ?? 'That character';
    return this.run('character-update', { characterId, isMain: true }, `${name} is your main`, {
      main: characterId,
    });
  }

  @command('vintage.member-timezone-set', {
    label: 'Set time zone',
    description: "Set the time zone raid times show in; empty uses the browser's.",
    category: 'Profile',
    parameters: {
      type: 'object',
      properties: { timezone: { type: 'string' } },
      required: ['timezone'],
    },
  })
  async setTimeZone(zone: unknown): Promise<ElementResult<unknown>> {
    if (typeof zone !== 'string' || (zone !== '' && !this.zones.includes(zone))) {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Pick a time zone from the list' });
    }
    const said = zone
      ? `Times now show in ${zone.replaceAll('_', ' ')}`
      : "Times follow your browser's zone";
    const result = await this.run('member-prefs-set', { timezone: zone }, said, { timezone: zone });
    if (result.success) this.timezone = zone;
    return result;
  }

  @command('vintage.member-reminders-set', {
    label: 'Reminder DMs',
    description: 'Turn reminder DMs from Random, the guild bot, on or off.',
    category: 'Profile',
    parameters: {
      type: 'object',
      properties: { on: { type: 'boolean' } },
      required: ['on'],
    },
  })
  async setReminders(on: unknown): Promise<ElementResult<unknown>> {
    if (typeof on !== 'boolean') {
      return failure({ code: 'INVALID_PARAMETERS', message: 'Say on (true) or off (false)' });
    }
    const result = await this.run(
      'member-prefs-set',
      { dmOptOut: !on },
      on ? 'Reminder DMs on' : 'Reminder DMs off',
      { dmOptOut: !on },
    );
    if (result.success) this.dmOptOut = !on;
    return result;
  }

  private async run(
    name: string,
    input: Record<string, unknown>,
    done: string,
    detail: Record<string, unknown>,
  ): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(await getCommandClient().run(name, input));
      if (!result.success) {
        this.statusKind = 'error';
        this.statusText = describeError(result);
        return result;
      }
      this.statusKind = 'success';
      this.statusText = done;
      this.$emit('prefs-changed', detail);
      return result;
    } finally {
      this.busy = false;
    }
  }
}

if (!customElements.get('vintage-member-prefs')) {
  await VintageMemberPrefs.define({ name: 'vintage-member-prefs', template, styles });
}
