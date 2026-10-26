import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { getCommandClient } from '../client';
import { describeError, type ElementResult, toElementResult } from '../result';
import { deskStyles } from './desk-styles';

/** One titled part of the About page (the site module's `AboutSection`). */
export interface GuildProfileSection {
  heading: string;
  body: string;
}

/** The slice of `guild-profile-get` the desk reads (the site module's `GuildProfile`). */
export interface GuildProfileDeskProfile {
  pills: string[];
  intro: string;
  aboutLead: string;
  aboutSections: GuildProfileSection[];
  discordInvite: string | null;
  contactEmail: string | null;
  /** Null while the site still shows the starter profile. */
  updatedAt: number | null;
}

/** The most About sections `guild-profile-set` takes. */
const MAX_SECTIONS = 6;

const template = html<VintageGuildProfileDesk>`
  <form class="desk" part="desk" @submit="${(x, c) => x.submit(c.event)}">
    <p class="meta" part="meta">${(x) => x.metaLine()}</p>
    ${when(
      (x) => !x.profile && x.error,
      html<VintageGuildProfileDesk>`<p class="error" part="error" role="alert">${(x) => x.error}</p>`,
    )}

    ${when(
      (x) => x.profile,
      html<VintageGuildProfileDesk>`
        <fieldset part="hero" ?disabled="${(x) => !x.canEdit || x.busy}">
          <legend>Home page</legend>
          <div class="field">
            <label for="pills">Facts under the title</label>
            <textarea
              id="pills"
              rows="4"
              :value="${(x) => x.pills}"
              @input="${(x, c) => x.edit('pills', (c.event.target as HTMLTextAreaElement).value)}"
            ></textarea>
            <small>One per line, up to six: ruleset, raid nights, sizes, style. Visitors see them under the title.</small>
          </div>
          <div class="field">
            <label for="intro">Intro</label>
            <textarea
              id="intro"
              rows="4"
              maxlength="400"
              required
              :value="${(x) => x.intro}"
              @input="${(x, c) => x.edit('intro', (c.event.target as HTMLTextAreaElement).value)}"
            ></textarea>
            <small>The paragraph under the title, for everyone.</small>
          </div>
        </fieldset>

        <fieldset part="about" ?disabled="${(x) => !x.canEdit || x.busy}">
          <legend>About page</legend>
          <div class="field">
            <label for="lead">Opening line</label>
            <input
              id="lead"
              maxlength="300"
              required
              :value="${(x) => x.aboutLead}"
              @input="${(x, c) => x.edit('aboutLead', (c.event.target as HTMLInputElement).value)}"
            />
          </div>
          ${repeat(
            (x) => x.sections,
            html<GuildProfileSection, VintageGuildProfileDesk>`
              <div class="section">
                <input
                  aria-label="Section heading"
                  maxlength="60"
                  required
                  :value="${(s) => s.heading}"
                  @input="${(s, c) => c.parent.editSection(s, 'heading', (c.event.target as HTMLInputElement).value)}"
                />
                <textarea
                  aria-label="${(s) => `${s.heading || 'Section'} text`}"
                  rows="5"
                  maxlength="1500"
                  required
                  :value="${(s) => s.body}"
                  @input="${(s, c) => c.parent.editSection(s, 'body', (c.event.target as HTMLTextAreaElement).value)}"
                ></textarea>
                <button
                  type="button"
                  class="remove"
                  ?disabled="${(_, c) => c.parent.sections.length <= 1}"
                  @click="${(s, c) => c.parent.removeSection(s)}"
                >Remove this section</button>
              </div>
            `,
            { recycle: false },
          )}
          <p class="actions">
            <button
              type="button"
              ?disabled="${(x) => x.sections.length >= MAX_SECTIONS}"
              @click="${(x) => x.addSection()}"
            >Add a section</button>
          </p>
          <small>Separate paragraphs with a blank line.</small>
        </fieldset>

        <fieldset part="links" ?disabled="${(x) => !x.canEdit || x.busy}">
          <legend>Links</legend>
          <div class="field">
            <label for="invite">Discord invite</label>
            <input
              id="invite"
              type="url"
              placeholder="https://discord.gg/…"
              :value="${(x) => x.discordInvite}"
              @input="${(x, c) => x.edit('discordInvite', (c.event.target as HTMLInputElement).value)}"
            />
            <small>"Join the Discord" goes here. Empty sends visitors to the recruiting band instead.</small>
          </div>
          <div class="field">
            <label for="contact">Contact email</label>
            <input
              id="contact"
              type="email"
              :value="${(x) => x.contactEmail}"
              @input="${(x, c) => x.edit('contactEmail', (c.event.target as HTMLInputElement).value)}"
            />
            <small>The Privacy and Terms pages list it. Empty says to ask an officer in Discord.</small>
          </div>
        </fieldset>

        ${when(
          (x) => x.canEdit,
          html<VintageGuildProfileDesk>`
            <p class="actions">
              <button type="submit" class="primary" ?disabled="${(x) => x.busy || !x.dirty}">Save the profile</button>
              <button type="button" ?disabled="${(x) => x.busy || !x.dirty}" @click="${(x) => x.reset()}">Undo changes</button>
            </p>
          `,
        )}
        ${when(
          (x) => !x.canEdit,
          html`<p class="note">Officers edit the guild profile. You can read it here.</p>`,
        )}
      `,
    )}
    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </form>
`;

const styles = css`
  .section {
    display: grid;
    gap: var(--space-xs);
    padding-block-end: var(--space-sm);
    border-block-end: var(--border-width-thin) dashed var(--color-border-default);
  }

  .section input {
    font-weight: var(--font-weight-bold);
  }

  .remove {
    justify-self: start;
    padding: 0.25rem 0.6rem;
    font-size: var(--font-size-xs);
  }
`;

/**
 * The officers' editor for the guild profile: the home page's facts and intro, the About page,
 * the Discord invite, and the contact email. Feed it `guild-profile-get`; Save runs
 * `guild-profile-set` with every field and emits `profile-changed` so the page re-reads.
 * Without `can-edit` (raid leaders) every field is read-only. With no profile and an `error`,
 * it shows only the error.
 *
 * @tagname vintage-guild-profile-desk
 * @summary Edit the guild's hero facts and intro, About page, Discord invite, and contact.
 * @fires profile-changed - After a save succeeds.
 * @csspart desk - The whole form.
 * @csspart meta - When it was last saved, or that it shows the starter text.
 * @csspart error - Why the profile could not be read; shown instead of the form.
 * @csspart hero - The home page fields.
 * @csspart about - The About page fields.
 * @csspart links - The Discord invite and contact email.
 * @csspart status - What just happened.
 */
export class VintageGuildProfileDesk extends FASTElement {
  /** The profile as `guild-profile-get` answered it. */
  @observable profile: GuildProfileDeskProfile | null = null;
  /** Whether the viewer may save (officers). */
  @attr({ attribute: 'can-edit', mode: 'boolean' }) canEdit = false;
  /** Optional IANA zone for the saved time; the viewer's zone when empty. */
  @attr({ attribute: 'time-zone' }) timeZone = '';
  /** Why `guild-profile-get` failed, if it did. */
  @observable error = '';
  /** The pills, one per line, as the textarea holds them. */
  @observable pills = '';
  @observable intro = '';
  @observable aboutLead = '';
  @observable sections: GuildProfileSection[] = [];
  @observable discordInvite = '';
  @observable contactEmail = '';
  @observable dirty = false;
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  profileChanged(): void {
    this.reset();
  }

  /** Put the form back to the saved profile. */
  reset(): void {
    const p = this.profile;
    this.pills = (p?.pills ?? []).join('\n');
    this.intro = p?.intro ?? '';
    this.aboutLead = p?.aboutLead ?? '';
    this.sections = (p?.aboutSections ?? []).map((s) => ({ ...s }));
    this.discordInvite = p?.discordInvite ?? '';
    this.contactEmail = p?.contactEmail ?? '';
    this.dirty = false;
  }

  metaLine(): string {
    if (!this.profile) return this.error ? '' : 'Loading the profile…';
    const at = this.profile.updatedAt;
    if (at == null) return 'Showing the starter text. Nobody has saved the profile yet.';
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    try {
      return `Last saved ${new Date(at).toLocaleString(undefined, {
        ...options,
        ...(this.timeZone ? { timeZone: this.timeZone } : {}),
      })}.`;
    } catch {
      return `Last saved ${new Date(at).toLocaleString(undefined, options)}.`;
    }
  }

  edit(
    field: 'pills' | 'intro' | 'aboutLead' | 'discordInvite' | 'contactEmail',
    value: string,
  ): void {
    this[field] = value;
    this.dirty = true;
  }

  /** Sections change in place so typing never re-renders the field under the cursor. */
  editSection(section: GuildProfileSection, field: 'heading' | 'body', value: string): void {
    section[field] = value;
    this.dirty = true;
  }

  addSection(): void {
    if (this.sections.length >= MAX_SECTIONS) return;
    this.sections = [...this.sections, { heading: '', body: '' }];
    this.dirty = true;
  }

  removeSection(section: GuildProfileSection): void {
    if (this.sections.length <= 1) return;
    this.sections = this.sections.filter((s) => s !== section);
    this.dirty = true;
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  /** What `guild-profile-set` gets: every field, empty links as null. */
  input(): Record<string, unknown> {
    return {
      pills: this.pills
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
      intro: this.intro,
      aboutLead: this.aboutLead,
      aboutSections: this.sections.map((s) => ({ heading: s.heading, body: s.body })),
      discordInvite: this.discordInvite.trim() || null,
      contactEmail: this.contactEmail.trim() || null,
    };
  }

  @command('vintage.guild-profile-save', {
    label: 'Save the guild profile',
    description:
      'Save the home page facts and intro, the About page, the invite, and the contact as the form shows them.',
    category: 'Officers',
  })
  async save(): Promise<ElementResult<unknown>> {
    if (!this.canEdit) {
      return failure({ code: 'COMMAND_DISABLED', message: 'Officers edit the profile' });
    }
    if (!this.profile) {
      return failure({
        code: 'COMMAND_DISABLED',
        message: 'The profile hasn’t loaded, so there is nothing to save',
      });
    }
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run('guild-profile-set', this.input()),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.dirty = false;
      this.say('success', 'Saved. The site shows it now.');
      this.$emit('profile-changed');
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

if (!customElements.get('vintage-guild-profile-desk')) {
  await VintageGuildProfileDesk.define({
    name: 'vintage-guild-profile-desk',
    template,
    styles: [deskStyles, styles],
  });
}
