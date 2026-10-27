import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import { CLASS_NAMES, type WowClass } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import { deskStyles } from './desk-styles';

/** The applicant's own application, as `application-get` answers it (no labels, no reviewer). */
export interface OwnApplication {
  id: string;
  characterName: string;
  wowClass: WowClass;
  spec: string;
  role: 'raider' | 'flex-raider';
  status: 'new' | 'in-review' | 'accepted' | 'declined' | 'withdrawn';
  reply: string | null;
}

const OPEN = new Set(['new', 'in-review']);

const STATUS_LINE: Record<OwnApplication['status'], string> = {
  new: 'The officers have it and will answer in Discord.',
  'in-review': 'The officers are looking at it; check your Discord DMs.',
  accepted: 'Accepted. Welcome to Vintage!',
  declined: 'Not this time.',
  withdrawn: 'You withdrew it.',
};

interface Fields {
  characterName: string;
  wowClass: WowClass;
  spec: string;
  role: 'raider' | 'flex-raider';
  about: string;
  experience: string;
  availability: string;
}

const EMPTY: Fields = {
  characterName: '',
  wowClass: 'warrior',
  spec: '',
  role: 'raider',
  about: '',
  experience: '',
  availability: '',
};

const template = html<VintageApplyForm>`
  ${when(
    (x) => x.application,
    html<VintageApplyForm>`
      <section class="desk" part="status-card">
        <h3>${(x) => `Your application: ${x.application?.characterName} (${titleCase(x.application?.spec ?? '')} ${titleCase(x.application?.wowClass ?? '')})`}</h3>
        <p>${(x) => STATUS_LINE[x.application?.status ?? 'new']}</p>
        ${when(
          (x) => x.application?.reply,
          html<VintageApplyForm>`<p class="reply" part="reply"><strong>The officers wrote:</strong> ${(x) => x.application?.reply}</p>`,
        )}
        ${when(
          (x) => x.application && OPEN.has(x.application.status),
          html<VintageApplyForm>`<p class="actions"><button type="button" ?disabled="${(x) => x.busy}" @click="${(x) => x.withdraw()}">Withdraw it</button></p>`,
        )}
      </section>
    `,
  )}
  ${when(
    (x) => !x.application || !OPEN.has(x.application.status),
    html<VintageApplyForm>`
      <form class="desk" part="form" @submit="${(x, c) => x.submit(c.event)}">
        <div class="pair">
          <div class="field">
            <label for="name">Character</label>
            <input id="name" required maxlength="12" :value="${(x) => x.fields.characterName}" @input="${(x, c) => x.set('characterName', (c.event.target as HTMLInputElement).value)}" />
          </div>
          <div class="field">
            <label for="class">Class</label>
            <select id="class" :value="${(x) => x.fields.wowClass}" @change="${(x, c) => x.set('wowClass', (c.event.target as HTMLSelectElement).value)}">
              ${repeat(
                () => CLASS_NAMES,
                html<WowClass>`<option value="${(c) => c}">${(c) => titleCase(c)}</option>`,
              )}
            </select>
          </div>
          <div class="field">
            <label for="spec">Spec</label>
            <input id="spec" required maxlength="40" placeholder="restoration" :value="${(x) => x.fields.spec}" @input="${(x, c) => x.set('spec', (c.event.target as HTMLInputElement).value)}" />
          </div>
          <div class="field">
            <label for="role">I want to raid as</label>
            <select id="role" :value="${(x) => x.fields.role}" @change="${(x, c) => x.set('role', (c.event.target as HTMLSelectElement).value)}">
              <option value="raider">A core raider</option>
              <option value="flex-raider">A flex raider, when there is room</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="about">A few words about you</label>
          <textarea id="about" required rows="4" maxlength="1000" :value="${(x) => x.fields.about}" @input="${(x, c) => x.set('about', (c.event.target as HTMLTextAreaElement).value)}"></textarea>
        </div>
        <div class="field">
          <label for="experience">Your raiding experience</label>
          <textarea id="experience" required rows="4" maxlength="1000" :value="${(x) => x.fields.experience}" @input="${(x, c) => x.set('experience', (c.event.target as HTMLTextAreaElement).value)}"></textarea>
        </div>
        <div class="field">
          <label for="availability">Which nights and times you can raid</label>
          <input id="availability" required maxlength="400" :value="${(x) => x.fields.availability}" @input="${(x, c) => x.set('availability', (c.event.target as HTMLInputElement).value)}" />
        </div>
        <p class="actions">
          <button type="submit" class="primary" ?disabled="${(x) => x.busy}">Send my application</button>
        </p>
      </form>
    `,
  )}
  <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
`;

const styles = css`
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: var(--space-sm);
  }

  .reply {
    white-space: pre-wrap;
  }
`;

/**
 * The website's application form (#135), for someone signed in with Discord. Shows their latest
 * application and its status when they have one (with Withdraw while it is open), and the form
 * otherwise. Submits `application-submit`; officers answer in Discord or the quarters.
 *
 * @tagname vintage-apply-form
 * @summary Apply to raid with the guild, and see where your application stands.
 * @fires application-changed - After a submit or withdraw succeeds.
 * @csspart form - The application form.
 * @csspart status-card - The applicant's own application.
 * @csspart reply - The officers' reply, when there is one.
 * @csspart status - What just happened.
 */
export class VintageApplyForm extends FASTElement {
  /** Their latest application, from `application-get` with no id; null when they have none. */
  @observable application: OwnApplication | null = null;
  /** How officers see the applicant; the signed-in member's name. */
  @attr({ attribute: 'applicant-name' }) applicantName = '';
  @observable fields: Fields = { ...EMPTY };
  @observable busy = false;
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  set(field: keyof Fields, value: string): void {
    this.fields = { ...this.fields, [field]: value } as Fields;
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.send();
  }

  @command('vintage.application-submit', {
    label: 'Send the application',
    description: 'Apply to raid with the guild with what the form says.',
    category: 'Members',
  })
  async send(): Promise<ElementResult<unknown>> {
    if (this.busy) return failure({ code: 'COMMAND_DISABLED', message: 'Busy' });
    this.busy = true;
    try {
      const f = this.fields;
      const result = toElementResult(
        await getCommandClient().run<OwnApplication>('application-submit', {
          characterName: f.characterName.trim(),
          wowClass: f.wowClass,
          spec: f.spec.trim(),
          role: f.role,
          about: f.about.trim(),
          experience: f.experience.trim(),
          availability: f.availability.trim(),
          ...(this.applicantName ? { applicantName: this.applicantName } : {}),
        }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.application = result.data as OwnApplication;
      this.fields = { ...EMPTY };
      this.say('success', 'Sent. The officers answer in Discord.');
      this.$emit('application-changed');
      return result;
    } finally {
      this.busy = false;
    }
  }

  @command('vintage.application-withdraw', {
    label: 'Withdraw the application',
    description: 'Take back your open application.',
    category: 'Members',
  })
  async withdraw(): Promise<ElementResult<unknown>> {
    const a = this.application;
    if (!a || this.busy)
      return failure({ code: 'COMMAND_DISABLED', message: 'Nothing to withdraw' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run<OwnApplication>('application-withdraw', {
          applicationId: a.id,
        }),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.application = result.data as OwnApplication;
      this.say('success', 'Withdrawn.');
      this.$emit('application-changed');
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

if (!customElements.get('vintage-apply-form')) {
  await VintageApplyForm.define({
    name: 'vintage-apply-form',
    template,
    styles: [deskStyles, styles],
  });
}
