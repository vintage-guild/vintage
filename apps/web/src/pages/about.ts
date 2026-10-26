import { FASTElement, html, repeat } from '@lushly-dev/fast-element';
import { ROLES, type Role } from '@vintage/wow-data';
import { pageStyles } from './page-styles';

// Placeholder copy until officers edit pages through the `site` module.
const template = html<Page>`
  <article class="page">
    <header>
      <h1>Vintage</h1>
      <p class="lead">A raiding guild on WoW: Forever, built around players who have raided
        together since Vanilla.</p>
    </header>

    <section aria-labelledby="raids">
      <h2 id="raids">Raiding</h2>
      <p>WoW: Forever launches on November 4. Barrow Deeps, Hyjal Summit, and Onyxia's Lair
        unlock on December 9, and we plan to be ready for them.</p>
      <p>Many of us have raided together through Vanilla, The Burning Crusade, and Wrath, and plenty
        have server firsts and Ahead of the Curve behind them. Forever is a fresh start for the same
        group, and we're making room for a few more people who raid the same way.</p>
    </section>

    <section aria-labelledby="recruiting">
      <h2 id="recruiting">Recruitment</h2>
      <p>We raid with every role:</p>
      <p class="row">
        ${repeat(() => ROLES, html<Role>`<vintage-role-badge raid-role="${(r) => r}"></vintage-role-badge>`)}
      </p>
      <p>To join, ask an officer for an invite to our Discord. New members start as recruits for
        about two weeks. Once you're in, sign in with Discord to add your characters.</p>
    </section>
  </article>
`;

/** The public about and recruitment page. */
export class Page extends FASTElement {}
await Page.define({ name: 'vintage-about-page', template, styles: pageStyles });
