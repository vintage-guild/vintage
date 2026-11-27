import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import {
  type ClassNeed,
  type GuildProfile,
  type Recruiting,
  STARTER_PROFILE,
  STARTER_RECRUITING,
} from '@vintage/site/contract';
import { getCommandClient, titleCase } from '@vintage/ui-kit';
import { classIcon } from '../class-icons';
import { ART } from '../content/art';
import { formatMonthDay } from '../dates';
import { readGuildProfile } from '../guild-profile';
import { buttonStyles } from './button-styles';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <section class="band" id="recruiting" aria-labelledby="h-recruiting">
    <img class="arms" src="${ART.recruiting}" alt="" decoding="async" />
    <div class="wrap" ?data-pending="${(x) => !x.recruiting}">
      <div class="lead">
        <span class="eyebrow">${(x) => x.eyebrow}</span>
        <h1 id="h-recruiting">${(x) => x.band.headline}</h1>
        <p class="pitch">${(x) => x.band.pitch}</p>
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
          html`<p class="muted small">Discord invites come from an officer for now; the public link lands here once the GM sets it.</p>`,
        )}
      </div>
      <table class="needs">
        <thead><tr><th>Class</th><th>Specs</th><th class="end">Need</th></tr></thead>
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
                <td class="muted">${(n) => n.specs}</td>
                <td class="end"><span class="need ${(n) => n.need}">${(n) => n.need}</span></td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  </section>
`;

const styles = css`
  ${pageStyles}
  ${buttonStyles}

  :host {
    padding: 0;
  }

  /* The cream band, on the inverse surface tokens, filling the page under the header. */
  .band {
    display: block;
    position: relative;
    overflow: hidden;
    padding-block: var(--space-2xl) var(--space-3xl);
    background: var(--color-surface-inverse);
    color: var(--color-text-inverse);
    box-shadow:
      inset 0 12px 30px rgb(0 0 0 / 8%),
      inset 0 -12px 30px rgb(0 0 0 / 6%);
  }

  .wrap {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    gap: var(--space-lg) var(--space-xl);
    align-items: start;
    max-inline-size: 80rem;
    margin-inline: auto;
    padding-inline: var(--space-inset);
  }

  /* Until recruiting-get answers, the text keeps its place but shows nothing. */
  .wrap[data-pending] {
    visibility: hidden;
  }

  .lead {
    display: grid;
    gap: var(--space-sm);
  }

  h1 {
    color: var(--color-text-inverse);
    font-size: clamp(2rem, 4vw, 3.4rem);
    font-weight: var(--font-weight-heavy);
    line-height: 1.02;
  }

  .eyebrow {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-rose-700);
  }

  .pitch,
  .muted {
    margin: 0;
    color: var(--color-leather-700);
  }

  .pitch {
    max-inline-size: 52ch;
  }

  .muted {
    font-size: var(--font-size-sm);
  }

  .small {
    font-size: var(--font-size-xs);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .btn.primary {
    background: var(--color-verdigris-700);
    border-color: color-mix(in srgb, var(--color-verdigris-700) 60%, black);
    color: var(--color-parchment-50);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 22%),
      0 1px 0 rgb(0 0 0 / 25%);
  }

  /* The shield and staff stand at the band's right edge: in the margin on wide screens, behind
     the needs table on narrower ones. Multiply keeps the ink in the paper. */
  .arms {
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: max(0px, calc((100% - 80rem) / 2 - 9rem));
    block-size: 94%;
    inline-size: auto;
    opacity: 0.26;
    mix-blend-mode: multiply;
    pointer-events: none;
    user-select: none;
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
    border-block-end: var(--border-width-thin) solid var(--color-border-inverse);
    vertical-align: middle;
  }

  .needs th {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-leather-700);
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
    border: var(--border-width-thin) solid color-mix(in srgb, var(--color-leather-900) 55%, transparent);
    box-shadow: 0 1px 2px var(--color-shadow-soft);
  }

  .needs .end {
    text-align: end;
    white-space: nowrap;
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

  .need.closed {
    border: var(--border-width-thin) solid var(--color-border-inverse);
    color: var(--color-leather-700);
  }

  @media (max-width: 62rem) {
    .wrap {
      grid-template-columns: 1fr;
    }

    /* Stacked, the lead comes first; the arms drop behind the table, fainter. */
    .arms {
      inset-block: auto 0;
      inset-inline-end: -2rem;
      block-size: 48%;
      opacity: 0.16;
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
