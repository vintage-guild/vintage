import { FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { AboutSection, GuildProfile } from '@vintage/site/contract';
import { paragraphs, readGuildProfile } from '../guild-profile';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <article class="page" aria-busy="${(x) => !x.profile}">
    <header>
      <h1>Vintage</h1>
      ${when((x) => x.profile, html<Page>`<p class="lead">${(x) => x.profile?.aboutLead}</p>`)}
    </header>
    ${repeat(
      (x) => x.profile?.aboutSections ?? [],
      html<AboutSection>`
        <section>
          <h2>${(s) => s.heading}</h2>
          ${repeat((s) => paragraphs(s.body), html<string>`<p>${(p) => p}</p>`)}
        </section>
      `,
    )}
  </article>
`;

/**
 * The public About page, in the guild's own words: `guild-profile-get`'s lead and sections,
 * which officers edit in the quarters' Guild tab.
 */
export class Page extends FASTElement {
  @observable profile: GuildProfile | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void readGuildProfile().then((profile) => {
      this.profile = profile;
    });
  }
}

await Page.define({ name: 'vintage-about-page', template, styles: pageStyles });
