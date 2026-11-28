import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import {
  type ClassNeed,
  type GuildProfile,
  needNote,
  type Recruiting,
  STARTER_PROFILE,
  STARTER_RECRUITING,
} from '@vintage/site/contract';
import { getCommandClient, titleCase } from '@vintage/ui-kit';
import { classIcon } from '../class-icons';
import { formatMonthDay } from '../dates';
import { readGuildProfile } from '../guild-profile';
import { buttonStyles } from './button-styles';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page wide" id="recruiting" ?data-pending="${(x) => !x.recruiting}">
    <div>
      <header class="head">
        <span class="eyebrow">${(x) => x.eyebrow}</span>
        <h1>${(x) => x.band.headline}</h1>
      </header>
      <vintage-markdown class="pitch" :text="${(x) => x.band.pitch}"></vintage-markdown>
      <p class="actions">
        ${when(
          (x) => x.profile.discordInvite,
          html<Page>`<a class="btn primary" href="${(x) => x.profile.discordInvite ?? ''}" rel="noopener">Join the Discord</a>`,
        )}
        <a class="btn ${(x) => (x.profile.discordInvite ? '' : 'primary')}" href="/apply">Apply to raid</a>
        <a class="btn" href="/about">How we raid</a>
        <a class="btn" href="/roster">Who’s in</a>
      </p>
      ${when(
        (x) => !x.profile.discordInvite,
        html`<p class="muted small">Ask an officer for a Discord invite.</p>`,
      )}
      <div class="card">
        <table class="needs">
          <thead><tr><th>Class</th><th>Role</th><th>Special notes</th><th class="end">Demand</th></tr></thead>
          <tbody>
            ${repeat(
              (x) => x.band.needs,
              html<ClassNeed>`
                <tr>
                  <td class="cls">
                    <img
                      src="${(n) => classIcon(n.wowClass)}"
                      alt=""
                      width="28"
                      height="28"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                    />
                    <span>${(n) => titleCase(n.wowClass)}</span>
                  </td>
                  <td class="role">${(n) => titleCase(n.role ?? 'any')}</td>
                  <td class="muted">${(n) => needNote(n.specs)}</td>
                  <td class="end"><span class="need ${(n) => n.need}">${(n) => n.need}</span></td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;

const styles = css`
  ${pageStyles}
  ${buttonStyles}

  /* The shared page column at Roster's and Professions' width, with the standard heading: the
     headline, the pitch, then the classes. */
  .page.wide {
    max-inline-size: 72rem;
    gap: var(--space-md);
  }

  .page > div {
    display: grid;
    gap: var(--space-md);
  }

  .head {
    display: grid;
    gap: var(--space-xs);
  }

  /* Until recruiting-get answers, the text keeps its place but shows nothing. */
  .page[data-pending] {
    visibility: hidden;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .pitch {
    display: block;
    max-inline-size: 65ch;
    color: var(--color-text-secondary);
  }

  .muted {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .small {
    font-size: var(--font-size-xs);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin: 0;
  }

  .card {
    margin-block-start: var(--space-md);
    padding: var(--space-xs) var(--space-md);
    border-radius: 0.4rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-raised);
    overflow-x: auto;
  }

  .needs {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .needs th,
  .needs td {
    text-align: start;
    padding-block: 0.6rem;
    padding-inline-end: var(--space-sm);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    vertical-align: middle;
  }

  .needs tbody tr:last-child td {
    border-block-end: 0;
  }

  .needs th {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  /* Blizzard's class icon (Wowhead's CDN, as the bot uses), framed like an in-game icon. */
  .needs .cls {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-weight: var(--font-weight-bold);
  }

  .needs .cls img {
    flex: none;
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border-radius: 0.3rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    box-shadow: 0 1px 2px var(--color-shadow-soft);
  }

  .needs .end {
    text-align: end;
    white-space: nowrap;
    padding-inline-end: 0;
  }

  .need {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border-radius: 0.2rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
  }

  .need.high {
    background: var(--color-verdigris-700);
    color: var(--color-parchment-50);
  }

  .need.medium {
    background: var(--color-parchment-200);
    color: var(--color-text-inverse);
  }

  .need.low {
    border: var(--border-width-thin) solid var(--color-border-strong);
    color: var(--color-text-primary);
  }

  .need.closed {
    border: var(--border-width-thin) solid var(--color-border-default);
    color: var(--color-text-secondary);
  }

  /* Phones: tighter spacing, so the four columns fit the card without scrolling sideways. */
  @media (max-width: 36rem) {
    .card {
      padding-inline: var(--space-sm);
    }

    .needs th,
    .needs td {
      padding-inline-end: var(--space-xs);
    }

    .needs .cls {
      gap: var(--space-xs);
    }

    .need {
      padding-inline: 0.35rem;
    }
  }
`;

/**
 * The Recruitment page: the recruiting band officers edit in the quarters' Recruiting tab
 * (`recruiting-get`), with the guild profile's Discord invite. Public, like the band was on the
 * storefront.
 */
export class Page extends FASTElement {
  /** `recruiting-get`; null until it answers, so the band never shows text it then replaces. */
  @observable recruiting: Recruiting | null = null;
  /** `guild-profile-get`, for the Discord invite; null until it answers. */
  @observable guild: GuildProfile | null = null;

  get band(): Recruiting {
    return this.recruiting ?? STARTER_RECRUITING;
  }

  get profile(): GuildProfile {
    return this.guild ?? STARTER_PROFILE;
  }

  get eyebrow(): string {
    const at = this.band.updatedAt;
    return at === null ? 'Recruiting' : `Recruiting · updated ${formatMonthDay(at)}`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  /** A failed read shows the starter text rather than an empty band. */
  async load(): Promise<void> {
    const [result, guild] = await Promise.all([
      getCommandClient().read<Recruiting>('recruiting-get'),
      readGuildProfile(),
    ]);
    this.guild = guild;
    this.recruiting = result.success && result.data ? result.data : STARTER_RECRUITING;
  }
}

await Page.define({ name: 'vintage-recruitment-page', template, styles });
