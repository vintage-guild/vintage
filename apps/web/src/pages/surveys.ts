import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import type { Survey, SurveyResponse, SurveyResults } from '@vintage/polls/contract';
import { SURVEY_LIMITS } from '@vintage/polls/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { canSignIn, currentSession } from '../session';
import { currentView } from '../view';
import { pageStyles } from './page-styles';

interface SurveyView extends Omit<Survey, 'results'> {
  results: SurveyResults | null;
  resultsHidden: boolean;
}

interface SurveyGetPayload {
  survey: SurveyView;
  myResponse: SurveyResponse | null;
  responses: number;
}

export function surveyIdFromPath(path: string): string {
  const match = /^\/?surveys\/([^/?#]+)\/?$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

const pageOf = (ctx: { parentContext: { parent: unknown } }): Page =>
  ctx.parentContext.parent as Page;

const template = html<Page>`
  <div class="page">
    <header class="head">
      <span class="eyebrow">The guild asks</span>
      <h1>${(x) => (x.surveyId ? (x.detail?.survey.title ?? 'Survey') : 'Surveys')}</h1>
      ${when(
        (x) => x.allowed,
        html<Page>`
          <p class="links">
            ${when((x) => x.surveyId, html`<a href="/surveys">All surveys</a>`)}
            <a href="/polls">Polls</a>
          </p>
        `,
      )}
    </header>

    ${when(
      (x) => !x.allowed,
      html<Page>`
        <vintage-sign-in-card heading="Surveys are for members" ?available="${() => canSignIn()}">
          Sign in with Discord to answer guild surveys.
        </vintage-sign-in-card>
      `,
    )}

    ${when(
      (x) => x.allowed && !x.surveyId,
      html<Page>`
        <section class="group" aria-labelledby="open-surveys">
          <h2 id="open-surveys">Open</h2>
          ${when(
            (x) => x.loaded && x.open.length === 0,
            html`<p class="muted">No open surveys right now.</p>`,
          )}
          <div class="cards">
            ${repeat(
              (x) => x.open,
              html<SurveyView>`
                <article class="card">
                  <h3><a href="${(s) => `/surveys/${s.id}`}">${(s) => s.title}</a></h3>
                  ${when((s) => s.description, html<SurveyView>`<p class="muted">${(s) => s.description}</p>`)}
                  <p class="meta">
                    ${(s) => `${s.questions.length} question${s.questions.length === 1 ? '' : 's'}`}
                    ${(s) => (s.anonymous ? ' · anonymous' : '')}
                  </p>
                </article>
              `,
            )}
          </div>
        </section>

        <section class="group" aria-labelledby="closed-surveys">
          <h2 id="closed-surveys">Recently closed</h2>
          ${when(
            (x) => x.loaded && x.closed.length === 0,
            html`<p class="muted">No closed surveys yet.</p>`,
          )}
          <div class="cards">
            ${repeat(
              (x) => x.closed,
              html<SurveyView>`
                <article class="card">
                  <h3><a href="${(s) => `/surveys/${s.id}`}">${(s) => s.title}</a></h3>
                  <p class="meta">
                    ${(s) => `${s.questions.length} question${s.questions.length === 1 ? '' : 's'} · closed`}
                  </p>
                </article>
              `,
            )}
          </div>
        </section>
      `,
    )}

    ${when(
      (x) => x.allowed && x.surveyId && x.detail,
      html<Page>`
        ${when(
          (x) => x.detail!.survey.description,
          html<Page>`<p class="lead">${(x) => x.detail!.survey.description}</p>`,
        )}
        <p class="meta">
          ${(x) =>
            `${x.detail!.responses} response${x.detail!.responses === 1 ? '' : 's'}` +
            (x.detail!.survey.anonymous ? ' · anonymous' : '') +
            (x.detail!.survey.status === 'closed' ? ' · closed' : '')}
        </p>

        ${when(
          (x) => x.detail!.survey.status === 'open',
          html<Page>`
            <form class="survey-form" @submit="${(x, c) => x.onSubmit(c.event as SubmitEvent)}">
              ${repeat(
                (x) => x.detail!.survey.questions,
                html<Survey['questions'][number], Page>`
                  <fieldset class="question">
                    <legend>
                      ${(q) => q.prompt}
                      ${when((q) => q.required, html`<span class="req">*</span>`)}
                    </legend>
                    ${when(
                      (q) => q.kind === 'text',
                      html<Survey['questions'][number], Page>`
                        <textarea
                          rows="3"
                          maxlength="${SURVEY_LIMITS.textAnswer}"
                          aria-label="${(q) => q.prompt}"
                          :value="${(q, ctx) => ctx.parent.textAnswer(q.id)}"
                          @input="${(q, ctx) =>
                            ctx.parent.setTextAnswer(
                              q.id,
                              (ctx.event.target as HTMLTextAreaElement).value,
                            )}"
                        ></textarea>
                        <span class="counter">
                          ${(q, ctx) => `${ctx.parent.textAnswer(q.id).length} / ${SURVEY_LIMITS.textAnswer}`}
                        </span>
                      `,
                    )}
                    ${when(
                      (q) => q.kind === 'single',
                      html<Survey['questions'][number], Page>`
                        <div class="options">
                          ${repeat(
                            (q: Survey['questions'][number]) => q.options,
                            html<
                              Survey['questions'][number]['options'][number],
                              Survey['questions'][number]
                            >`
                              <label class="opt">
                                <input
                                  type="radio"
                                  name="${(_, c) => `q-${c.parent.id}`}"
                                  value="${(o) => o.id}"
                                  ?checked="${(o, c) => pageOf(c).hasChoice(c.parent.id, o.id)}"
                                  @change="${(o, c) =>
                                    pageOf(c).setSingleChoice(c.parent.id, o.id)}"
                                />
                                <span>${(o) => o.label}</span>
                              </label>
                            `,
                          )}
                        </div>
                      `,
                    )}
                    ${when(
                      (q) => q.kind === 'multi' || q.kind === 'ranked',
                      html<Survey['questions'][number], Page>`
                        <div class="options">
                          ${repeat(
                            (q: Survey['questions'][number]) => q.options,
                            html<
                              Survey['questions'][number]['options'][number],
                              Survey['questions'][number]
                            >`
                              <label class="opt">
                                <input
                                  type="checkbox"
                                  value="${(o) => o.id}"
                                  ?checked="${(o, c) => pageOf(c).hasChoice(c.parent.id, o.id)}"
                                  @change="${(o, c) =>
                                    pageOf(c).toggleChoice(
                                      c.parent.id,
                                      o.id,
                                      (c.event.target as HTMLInputElement).checked,
                                    )}"
                                />
                                <span>${(o) => o.label}</span>
                              </label>
                            `,
                          )}
                        </div>
                      `,
                    )}
                  </fieldset>
                `,
              )}
              <div class="row">
                <button type="submit" class="primary" ?disabled="${(x) => x.saving}">
                  ${(x) => (x.detail!.myResponse ? 'Update response' : 'Submit response')}
                </button>
              </div>
            </form>
          `,
        )}

        ${when(
          (x) => x.detail!.survey.results,
          html<Page>`
            <section class="group" aria-labelledby="results-title">
              <div class="section-head">
                <h2 id="results-title">Summary</h2>
                ${when(
                  (x) => x.canExport,
                  html<Page>`<button type="button" @click="${(x) => x.exportCsv()}">
                    Export CSV
                  </button>`,
                )}
              </div>
              ${repeat(
                (x) => x.detail!.survey.results!.questions,
                html<SurveyResults['questions'][number]>`
                  <article class="card">
                    <h3>${(q) => q.prompt}</h3>
                    ${when(
                      (q) => q.kind === 'text',
                      html<SurveyResults['questions'][number]>`
                        <ul class="text-answers">
                          ${repeat(
                            (q: SurveyResults['questions'][number]) =>
                              q.kind === 'text' ? q.answers : [],
                            html<{ text: string; displayName: string | null }>`
                              <li>
                                ${(a) => (a.displayName ? `${a.displayName}: ` : '')}${(a) => a.text}
                              </li>
                            `,
                          )}
                        </ul>
                      `,
                    )}
                    ${when(
                      (q) => q.kind !== 'text',
                      html<SurveyResults['questions'][number]>`
                        <ul class="tally-list">
                          ${repeat(
                            (q: SurveyResults['questions'][number]) =>
                              q.kind === 'text' ? [] : q.tally.options,
                            html<{ optionId: string; votes: number }>`
                              <li>${(o) => `${o.optionId}: ${o.votes}`}</li>
                            `,
                          )}
                        </ul>
                      `,
                    )}
                  </article>
                `,
              )}
            </section>
          `,
        )}

        ${when((x) => x.status, html<Page>`<p class="status" role="status">${(x) => x.status}</p>`)}
        ${when((x) => x.exportedCsv, html<Page>`<pre class="csv-preview">${(x) => x.exportedCsv}</pre>`)}
      `,
    )}

    ${when(
      (x) => x.allowed && x.surveyId && x.loaded && !x.detail,
      html`<p class="lead">That survey isn’t here: it may be for a higher rank, or it was removed.</p>`,
    )}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
  </div>
`;

const styles = css`
  .head {
    display: grid;
    gap: 0.2rem;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .links {
    display: flex;
    gap: var(--space-md);
    font-size: var(--font-size-sm);
  }

  .group,
  .cards,
  .survey-form,
  .options {
    display: grid;
    gap: var(--space-sm);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .card,
  .question {
    padding: var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-subtle);
    background: var(--color-surface-raised);
    display: grid;
    gap: var(--space-xs);
  }

  fieldset.question {
    margin: 0;
  }

  legend {
    font-weight: var(--font-weight-bold);
    padding: 0 0.25rem;
  }

  .req {
    color: var(--color-text-accent);
    margin-inline-start: 0.2rem;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
  }

  textarea {
    font: inherit;
    color: var(--color-text-primary);
    background: var(--color-surface-canvas);
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
    padding: 0.5rem 0.65rem;
    resize: vertical;
  }

  .counter,
  .meta,
  .muted,
  .status {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-text-accent);
  }

  button {
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    padding: 0.4rem 0.8rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-canvas);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  button.primary {
    background: var(--color-text-accent);
    border-color: var(--color-text-accent);
    color: var(--color-surface-canvas);
  }

  .csv-preview {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    padding: var(--space-sm);
    border-radius: 0.3rem;
    background: var(--color-surface-raised);
    overflow-x: auto;
    margin: 0;
  }
`;

/** `/surveys` and `/surveys/<id>`: answer guild surveys and inspect or export results (#65). */
export class Page extends FASTElement {
  @observable surveyId = '';
  @observable open: SurveyView[] = [];
  @observable closed: SurveyView[] = [];
  @observable detail: SurveyGetPayload | null = null;
  @observable loaded = false;
  @observable saving = false;
  @observable status = '';
  @observable error = '';
  @observable exportedCsv = '';
  /** Local draft answers keyed by questionId. */
  @observable draftChoices: Record<string, string[]> = {};
  @observable draftText: Record<string, string> = {};

  get allowed(): boolean {
    return currentView() !== 'visitor';
  }

  get canExport(): boolean {
    const session = currentSession();
    return Boolean(session && tierAllows(session.tier as Tier, 'leader'));
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.surveyId = surveyIdFromPath(location.pathname);
    if (this.allowed) void this.load();
  }

  async load(): Promise<void> {
    this.error = '';
    const client = getCommandClient();
    if (this.surveyId) {
      const res = await client.read<SurveyGetPayload>('survey-get', { surveyId: this.surveyId });
      this.loaded = true;
      if (!res.success || !res.data) {
        this.detail = null;
        if (res.error?.code !== 'SURVEY_NOT_FOUND') {
          this.error = res.error?.message ?? 'Could not load survey.';
        }
        return;
      }
      this.detail = res.data;
      this.hydrateDraft(res.data.myResponse);
      return;
    }

    const [openRes, closedRes] = await Promise.all([
      client.read<SurveyView[]>('survey-list', { statuses: ['open'] }),
      client.read<SurveyView[]>('survey-list', { statuses: ['closed'] }),
    ]);
    this.loaded = true;
    if (!openRes.success || !closedRes.success) {
      this.error = openRes.error?.message ?? closedRes.error?.message ?? 'Could not load surveys.';
      return;
    }
    this.open = openRes.data ?? [];
    this.closed = (closedRes.data ?? []).slice(0, 10);
  }

  private hydrateDraft(response: SurveyResponse | null): void {
    const choices: Record<string, string[]> = {};
    const text: Record<string, string> = {};
    for (const a of response?.answers ?? []) {
      choices[a.questionId] = [...a.choices];
      if (a.text !== null) text[a.questionId] = a.text;
    }
    this.draftChoices = choices;
    this.draftText = text;
  }

  textAnswer(questionId: string): string {
    return this.draftText[questionId] ?? '';
  }

  setTextAnswer(questionId: string, value: string): void {
    this.draftText = { ...this.draftText, [questionId]: value };
  }

  hasChoice(questionId: string, optionId: string): boolean {
    return (this.draftChoices[questionId] ?? []).includes(optionId);
  }

  setSingleChoice(questionId: string, optionId: string): void {
    this.draftChoices = { ...this.draftChoices, [questionId]: [optionId] };
  }

  toggleChoice(questionId: string, optionId: string, checked: boolean): void {
    const prev = this.draftChoices[questionId] ?? [];
    const next = checked
      ? prev.includes(optionId)
        ? prev
        : [...prev, optionId]
      : prev.filter((id) => id !== optionId);
    this.draftChoices = { ...this.draftChoices, [questionId]: next };
  }

  async onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.detail) return;
    this.saving = true;
    this.error = '';
    this.status = '';
    const answers = this.detail.survey.questions.map((q) =>
      q.kind === 'text'
        ? { questionId: q.id, text: this.draftText[q.id] ?? '' }
        : { questionId: q.id, choices: this.draftChoices[q.id] ?? [] },
    );
    const res = await getCommandClient().run('response-set', {
      surveyId: this.detail.survey.id,
      answers,
    });
    this.saving = false;
    if (!res.success) {
      this.error = res.error?.message ?? 'Could not save response.';
      return;
    }
    this.status = 'Response saved.';
    await this.load();
  }

  async exportCsv(): Promise<void> {
    if (!this.detail) return;
    this.error = '';
    const res = await getCommandClient().read<{ csv: string }>('survey-export', {
      surveyId: this.detail.survey.id,
    });
    if (!res.success || !res.data) {
      this.error = res.error?.message ?? 'Could not export CSV.';
      return;
    }
    this.exportedCsv = res.data.csv;
  }
}

if (!customElements.get('vintage-surveys-page')) {
  await Page.define({
    name: 'vintage-surveys-page',
    template,
    styles: [pageStyles, styles],
  });
}
