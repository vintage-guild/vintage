import { FASTElement, html, observable, when } from '@lushly-dev/fast-element';
import { LEGAL_UPDATED } from '../content/legal';
import { readGuildProfile } from '../guild-profile';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <article class="page">
    <header>
      <h1>Terms</h1>
      <p class="lead">The ground rules for using this site and the Vintage bot. Updated
        ${LEGAL_UPDATED}.</p>
    </header>

    <section aria-labelledby="what">
      <h2 id="what">What this is</h2>
      <p>A free tool the guild's officers run for Vintage members: the calendar, signups, roster,
        polls, and progress. It's provided as is, by volunteers, with no guarantee it's always up
        or error free.</p>
    </section>

    <section aria-labelledby="accounts">
      <h2 id="accounts">Your account</h2>
      <p>You sign in with Discord, and your rank in our Discord server decides what you can do
        here. Keep your Discord account secure; anything done while signed in as you counts as
        you.</p>
    </section>

    <section aria-labelledby="conduct">
      <h2 id="conduct">How to use it</h2>
      <p>Use it for guild business, in good faith. Don't impersonate anyone, sign up characters
        that aren't yours, game polls, or try to get around what your rank allows. Notes and
        anything else you write should follow the same rules as our Discord.</p>
      <p>Officers can correct signups, remove content, and limit or remove access for anyone who
        breaks these rules or the guild's.</p>
    </section>

    <section aria-labelledby="loot">
      <h2 id="loot">Raids and loot</h2>
      <p>The site records what the guild decides. Raid spots, loot, and ranks follow the guild's
        published rules and the officers' calls, not anything the site shows by mistake.</p>
    </section>

    <section aria-labelledby="blizzard">
      <h2 id="blizzard">Not affiliated with Blizzard</h2>
      <p>World of Warcraft and Blizzard Entertainment are trademarks of Blizzard Entertainment,
        Inc. Vintage is a player guild; this site isn't made, endorsed, or supported by Blizzard.
        The guild's art and logo belong to their creators and aren't covered by the site's code
        license.</p>
    </section>

    <section aria-labelledby="privacy">
      <h2 id="privacy">Privacy</h2>
      <p>What we keep and how to have it removed is on the <a href="/privacy">Privacy</a>
        page.</p>
    </section>

    <section aria-labelledby="changes">
      <h2 id="changes">Changes</h2>
      <p>We may update these terms; the date above says when, and we'll say so in Discord. Using
        the site after a change means you accept it.</p>
    </section>

    <section aria-labelledby="contact">
      <h2 id="contact">Contact</h2>
      ${when(
        (x) => x.contactEmail,
        html<Page>`<p>Write to <a href="mailto:${(x) => x.contactEmail}">${(x) => x.contactEmail}</a>, or ask an officer in our Discord.</p>`,
      )}
      ${when((x) => !x.contactEmail, html`<p>Ask an officer in our Discord.</p>`)}
    </section>
  </article>
`;

/** `/terms`: the ground rules for the site and the bot. */
export class Page extends FASTElement {
  /** The contact email from `guild-profile-get`, or empty: then it says to ask in Discord. */
  @observable contactEmail = '';

  connectedCallback(): void {
    super.connectedCallback();
    void readGuildProfile().then((profile) => {
      this.contactEmail = profile.contactEmail ?? '';
    });
  }
}
await Page.define({ name: 'vintage-terms-page', template, styles: pageStyles });
