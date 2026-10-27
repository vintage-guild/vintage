import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { command, failure } from '@lushly-dev/fast-element/command.js';
import type { WowClass } from '@vintage/wow-data';
import { getCommandClient } from '../client';
import { titleCase } from '../labels';
import { describeError, type ElementResult, toElementResult } from '../result';
import { deskStyles } from './desk-styles';

/** The slice of an `application-list` row the desk reads (the applications module's Application). */
export interface ApplicationsDeskRow {
  id: string;
  applicantName: string;
  characterName: string;
  wowClass: WowClass;
  spec: string;
  role: 'raider' | 'flex-raider';
  about: string;
  experience: string;
  availability: string;
  status: 'new' | 'in-review' | 'accepted' | 'declined' | 'withdrawn';
  labels: {
    role: 'raider' | 'flex-raider' | 'social' | null;
    complete: boolean | null;
    fit: number | null;
  } | null;
  reply: string | null;
  createdAt: number;
}

const OPEN = new Set(['new', 'in-review']);
const FIT = ['poor', 'partial', 'good', 'strong'];

const STATUS_LABEL: Record<ApplicationsDeskRow['status'], string> = {
  new: 'New',
  'in-review': 'In review',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

/** "Reads as raider · complete · fit strong", or why there are no labels. */
export function labelsText(labels: ApplicationsDeskRow['labels']): string {
  if (!labels) return 'Not labeled';
  return [
    labels.role ? `reads as ${labels.role}` : 'role unsure',
    labels.complete === null ? 'completeness unsure' : labels.complete ? 'complete' : 'incomplete',
    labels.fit === null ? 'fit unsure' : `fit ${FIT[labels.fit] ?? labels.fit}`,
  ].join(' · ');
}

const template = html<VintageApplicationsDesk>`
  <div class="desk" part="desk">
    <div class="filters" role="group" aria-label="Show">
      <button type="button" aria-pressed="${(x) => String(x.showClosed === false)}" @click="${(x) => x.filter(false)}">Open</button>
      <button type="button" aria-pressed="${(x) => String(x.showClosed)}" @click="${(x) => x.filter(true)}">All</button>
    </div>
    ${when(
      (x) => x.error,
      html<VintageApplicationsDesk>`<p class="error" part="error" role="alert">${(x) => x.error}</p>`,
    )}
    ${when(
      (x) => !x.error && x.visible().length === 0,
      html<VintageApplicationsDesk>`<p class="note" part="empty">${(x) => (x.showClosed ? 'No applications yet.' : 'No open applications.')}</p>`,
    )}
    <ul class="list" part="list">
      ${repeat(
        (x) => x.visible(),
        html<ApplicationsDeskRow, VintageApplicationsDesk>`
          <li class="item ${(a, c) => (a.id === c.parent.selectedId ? 'selected' : '')}">
            <button type="button" class="pick" @click="${(a, c) => c.parent.select(a.id)}">
              <strong>${(a) => a.characterName}</strong>
              <span>${(a) => `${titleCase(a.spec)} ${titleCase(a.wowClass)} · ${a.role === 'raider' ? 'Raider' : 'Flex raider'}`}</span>
              <span class="status">${(a) => STATUS_LABEL[a.status]}</span>
            </button>
          </li>
        `,
        { recycle: false },
      )}
    </ul>

    ${when(
      (x) => x.selected(),
      html<VintageApplicationsDesk>`
        <article class="detail" part="detail">
          <h3>${(x) => `${x.selected()?.characterName} · ${titleCase(x.selected()?.spec ?? '')} ${titleCase(x.selected()?.wowClass ?? '')}`}</h3>
          <p class="meta">${(x) => `From ${x.selected()?.applicantName} · ${STATUS_LABEL[x.selected()?.status ?? 'new']}`}</p>
          <p class="labels" part="labels">${(x) => labelsText(x.selected()?.labels ?? null)}</p>
          <h4>About</h4>
          <p class="text">${(x) => x.selected()?.about}</p>
          <h4>Raiding experience</h4>
          <p class="text">${(x) => x.selected()?.experience}</p>
          <h4>Availability</h4>
          <p class="text">${(x) => x.selected()?.availability}</p>
          ${when(
            (x) => x.selected()?.reply,
            html<VintageApplicationsDesk>`<h4>Officers replied</h4><p class="text">${(x) => x.selected()?.reply}</p>`,
          )}
          ${when(
            (x) => x.isOpen(),
            html<VintageApplicationsDesk>`
              <div class="field">
                <label for="reply">Reply (they get it in a DM)</label>
                <textarea
                  id="reply"
                  rows="3"
                  maxlength="1500"
                  :value="${(x) => x.replyText}"
                  ?disabled="${(x) => x.busy}"
                  @input="${(x, c) => {
                    x.replyText = (c.event.target as HTMLTextAreaElement).value;
                  }}"
                ></textarea>
              </div>
              <p class="actions">
                <button type="button" class="primary" ?disabled="${(x) => x.busy}" @click="${(x) => x.accept()}">Accept</button>
                <button type="button" ?disabled="${(x) => x.busy || !x.replyText.trim()}" @click="${(x) => x.reply()}">Send reply</button>
                <button type="button" class="danger" ?disabled="${(x) => x.busy}" @click="${(x) => x.decline()}">${(x) => (x.declineToken ? 'Confirm decline' : 'Decline')}</button>
              </p>
            `,
          )}
        </article>
      `,
    )}
    <p class="status ${(x) => x.statusKind}" part="status" role="status" aria-live="polite">${(x) => x.statusText}</p>
  </div>
`;

const styles = css`
  .filters {
    display: flex;
    gap: var(--space-xs);
  }

  .filters button[aria-pressed='true'] {
    font-weight: var(--font-weight-bold);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-xs);
  }

  .pick {
    inline-size: 100%;
    display: grid;
    grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) auto;
    gap: var(--space-sm);
    text-align: start;
  }

  .item.selected .pick {
    border-color: var(--color-border-strong);
    font-weight: var(--font-weight-bold);
  }

  .detail {
    display: grid;
    gap: var(--space-xs);
    padding-block-start: var(--space-sm);
    border-block-start: var(--border-width-thin) solid var(--color-border-strong);
  }

  .detail h3,
  .detail h4 {
    margin: 0;
  }

  .text {
    white-space: pre-wrap;
    margin: 0;
  }

  @media (max-width: 30rem) {
    .pick {
      grid-template-columns: 1fr;
    }
  }
`;

/**
 * The officers' applications desk: the open applications (or all), one at a time with its labels
 * and answers, and Accept, Send reply, and Decline (a second click confirms). Feed it
 * `application-list`; every action runs the command and emits `applications-changed` so the page
 * re-reads.
 *
 * @tagname vintage-applications-desk
 * @summary Review guild applications: read, accept, reply, decline.
 * @fires applications-changed - After an accept, reply, or decline succeeds.
 * @csspart desk - The whole desk.
 * @csspart list - The applications.
 * @csspart detail - The selected application.
 * @csspart labels - The Decisions labels line.
 * @csspart empty - Shown when there is nothing to list.
 * @csspart error - Why the list could not be read.
 * @csspart status - What just happened.
 */
export class VintageApplicationsDesk extends FASTElement {
  /** `application-list` rows, newest first. */
  @observable applications: ApplicationsDeskRow[] = [];
  /** Why `application-list` failed, if it did. */
  @observable error = '';
  @observable showClosed = false;
  @observable selectedId = '';
  @observable replyText = '';
  @observable busy = false;
  /** Set after the first Decline click: the second click declines for real. */
  @observable declineToken = '';
  @observable statusText = '';
  @observable statusKind: 'idle' | 'error' | 'success' = 'idle';

  applicationsChanged(): void {
    if (!this.applications.some((a) => a.id === this.selectedId)) {
      this.selectedId = this.visible()[0]?.id ?? '';
    }
  }

  visible(): ApplicationsDeskRow[] {
    return this.showClosed
      ? this.applications
      : this.applications.filter((a) => OPEN.has(a.status));
  }

  selected(): ApplicationsDeskRow | undefined {
    return this.applications.find((a) => a.id === this.selectedId);
  }

  isOpen(): boolean {
    const a = this.selected();
    return Boolean(a && OPEN.has(a.status));
  }

  filter(showClosed: boolean): void {
    this.showClosed = showClosed;
    if (!this.visible().some((a) => a.id === this.selectedId)) {
      this.selectedId = this.visible()[0]?.id ?? '';
    }
  }

  select(id: string): void {
    this.selectedId = id;
    this.replyText = '';
    this.declineToken = '';
    this.say('idle', '');
  }

  @command('vintage.application-accept', {
    label: 'Accept the application',
    description: 'Accept the selected application, with the reply if one is written.',
    category: 'Officers',
  })
  async accept(): Promise<ElementResult<unknown>> {
    const reply = this.replyText.trim();
    return this.act(
      'Accepted. They get the onboarding note; give them the recruit role in Discord.',
      'application-review',
      {
        status: 'accepted',
        ...(reply ? { reply } : {}),
      },
    );
  }

  @command('vintage.application-reply', {
    label: 'Reply to the applicant',
    description: 'Send the written reply and mark the application in review.',
    category: 'Officers',
  })
  async reply(): Promise<ElementResult<unknown>> {
    const reply = this.replyText.trim();
    if (!reply) return failure({ code: 'COMMAND_DISABLED', message: 'Write a reply first' });
    return this.act('Reply sent.', 'application-review', { status: 'in-review', reply });
  }

  @command('vintage.application-decline', {
    label: 'Decline the application',
    description: 'First click shows what will happen; the second declines.',
    category: 'Officers',
  })
  async decline(): Promise<ElementResult<unknown>> {
    const a = this.selected();
    if (!a || this.busy)
      return failure({ code: 'COMMAND_DISABLED', message: 'Pick an open application' });
    const reply = this.replyText.trim();
    const input = { applicationId: a.id, ...(reply ? { reply } : {}) };
    if (!this.declineToken) {
      this.busy = true;
      try {
        const preview = toElementResult(
          await getCommandClient().run<{ confirmToken?: string }>('application-decline', input),
        );
        const token = preview.success ? preview.data?.confirmToken : undefined;
        if (!token) {
          this.say(
            'error',
            preview.success ? 'Could not prepare the decline' : describeError(preview),
          );
          return preview;
        }
        this.declineToken = token;
        this.say(
          'idle',
          `Decline ${a.characterName}? Click Confirm decline.${reply ? ' They get your reply.' : ' They get no message.'}`,
        );
        return preview;
      } finally {
        this.busy = false;
      }
    }
    const token = this.declineToken;
    this.declineToken = '';
    return this.act('Declined.', 'application-decline', input, token);
  }

  private async act(
    done: string,
    name: string,
    input: Record<string, unknown>,
    confirmToken?: string,
  ): Promise<ElementResult<unknown>> {
    const a = this.selected();
    if (!a || this.busy)
      return failure({ code: 'COMMAND_DISABLED', message: 'Pick an open application' });
    this.busy = true;
    try {
      const result = toElementResult(
        await getCommandClient().run(
          name,
          { applicationId: a.id, ...input },
          confirmToken ? { confirmToken } : undefined,
        ),
      );
      if (!result.success) {
        this.say('error', describeError(result));
        return result;
      }
      this.replyText = '';
      this.say('success', done);
      this.$emit('applications-changed');
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

if (!customElements.get('vintage-applications-desk')) {
  await VintageApplicationsDesk.define({
    name: 'vintage-applications-desk',
    template,
    styles: [deskStyles, styles],
  });
}
