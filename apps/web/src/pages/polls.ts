import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { getCommandClient } from '@vintage/ui-kit';
import { type PollCardModel, type PollGet, pollCardModel } from '../polls';
import { canSignIn } from '../session';
import { currentView } from '../view';
import { pageStyles } from './page-styles';

/** How many closed polls the list shows, newest first. */
const CLOSED_SHOWN = 10;

/** The poll id in `/polls/<id>`, or empty on the list. */
export function pollIdFromPath(path: string): string {
  const match = /^\/?polls\/([^/?#]+)\/?$/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

const card = html<PollCardModel, Page>`
  <vintage-poll-card
    eyebrow="${(p) => (p.readonly ? 'Closed' : 'Open')}"
    poll-id="${(p) => p.id}"
    question="${(p) => p.question}"
    description="${(p) => p.description}"
    note="${(p) => p.note}"
    method="${(p) => p.method}"
    :maxChoices="${(p) => p.maxChoices}"
    ?readonly="${(p) => p.readonly}"
    ?results-hidden="${(p) => p.resultsHidden}"
    ballots="${(p) => p.ballots}"
    :options="${(p) => p.options}"
    :myChoices="${(p) => p.myChoices}"
    :winners="${(p) => p.winners}"
    @vote-cast="${(_, c) => c.parent.load()}"
    @vote-retract="${(_, c) => c.parent.load()}"
  ></vintage-poll-card>
`;

const template = html<Page>`
  <div class="page">
    <header class="head">
      <span class="eyebrow">The guild asks</span>
      <h1>${(x) => (x.pollId ? 'Poll' : 'Polls')}</h1>
      ${when(
        (x) => x.allowed,
        html<Page>`
          <p class="links">
            ${when((x) => x.pollId, html`<a href="/polls">All polls</a>`)}
            ${when(
              (x) => x.view === 'officer',
              html`<a href="/officers?tab=polls">Close and manage in the quarters</a>`,
            )}
          </p>
        `,
      )}
    </header>

    ${when(
      (x) => !x.allowed,
      html<Page>`
        <vintage-sign-in-card heading="Polls are for members" ?available="${() => canSignIn()}">
          Sign in with Discord to see the guild’s questions and vote. Polls are posted in Discord too.
        </vintage-sign-in-card>
      `,
    )}

    ${when(
      (x) => x.allowed && x.pollId,
      html<Page>`
        ${repeat((x) => (x.single ? [x.single] : []), card)}
        ${when(
          (x) => x.loaded && !x.single,
          html`<p class="lead">That poll isn’t here: it may be for a higher rank, or it was removed.</p>`,
        )}
      `,
    )}

    ${when(
      (x) => x.allowed && !x.pollId,
      html<Page>`
        <section class="group" aria-labelledby="open-title">
          <h2 id="open-title">Open</h2>
          ${when(
            (x) => x.loaded && x.open.length === 0,
            html`<p class="muted">No open polls. Raid leaders open one with /vintage poll create in Discord.</p>`,
          )}
          <div class="cards">${repeat((x) => x.open, card)}</div>
        </section>
        <section class="group" aria-labelledby="closed-title">
          <h2 id="closed-title">Recently closed</h2>
          ${when(
            (x) => x.loaded && x.closed.length === 0,
            html`<p class="muted">Nothing closed yet.</p>`,
          )}
          <div class="cards">${repeat((x) => x.closed, card)}</div>
        </section>
      `,
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
    flex-wrap: wrap;
    gap: var(--space-md);
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .group {
    display: grid;
    gap: var(--space-sm);
  }

  .cards {
    display: grid;
    gap: var(--space-md);
  }

  .muted {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-text-accent);
  }
`;

/**
 * `/polls` and `/polls/<id>`: the guild's questions for members and up. Open polls take votes
 * here exactly as in Discord (the same `vote-cast`), and ranked polls are voted here, since
 * Discord links to this page for them. Closed polls show their result when the poll allows it.
 * The role view decides whether to show the page; `poll-list` and `poll-get` decide which polls
 * and tallies a member may see.
 */
export class Page extends FASTElement {
  readonly view = currentView();
  /** Members and up: visitors get the sign-in card. */
  readonly allowed = this.view !== 'visitor';
  readonly pollId = pollIdFromPath(location.pathname);
  @observable open: PollCardModel[] = [];
  @observable closed: PollCardModel[] = [];
  @observable single: PollCardModel | null = null;
  @observable loaded = false;
  @observable error = '';

  connectedCallback(): void {
    super.connectedCallback();
    if (this.allowed) void this.load();
  }

  async load(): Promise<void> {
    this.error = '';
    if (this.pollId) {
      this.single = await this.get(this.pollId);
      this.loaded = true;
      return;
    }
    const client = getCommandClient();
    const [open, closed] = await Promise.all([
      client.read<{ id: string }[]>('poll-list'),
      client.read<{ id: string; closedAt: number | null }[]>('poll-list', {
        statuses: ['closed'],
      }),
    ]);
    if (!open.success || !closed.success) {
      this.error = (open.success ? closed : open).error?.message ?? 'Could not read the polls';
      this.loaded = true;
      return;
    }
    const recent = [...(closed.data ?? [])]
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
      .slice(0, CLOSED_SHOWN);
    const [openCards, closedCards] = await Promise.all([
      Promise.all((open.data ?? []).map((p) => this.get(p.id))),
      Promise.all(recent.map((p) => this.get(p.id))),
    ]);
    this.open = openCards.filter((p): p is PollCardModel => p !== null);
    this.closed = closedCards.filter((p): p is PollCardModel => p !== null);
    this.loaded = true;
  }

  private async get(pollId: string): Promise<PollCardModel | null> {
    const got = await getCommandClient().read<PollGet>('poll-get', { pollId });
    return got.success && got.data ? pollCardModel(got.data) : null;
  }
}

await Page.define({
  name: 'vintage-polls-page',
  template,
  styles: [pageStyles, styles],
});
