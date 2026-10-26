import { FASTElement, html, when } from '@lushly-dev/fast-element';
import { canSignIn, currentSession } from '../session';
import { pageStyles } from './page-styles';

const template = html<Page>`
  <div class="page">
    <h1>Characters</h1>
    ${when(
      () => !currentSession(),
      html`
        <vintage-sign-in-card heading="Your characters" ?available="${() => canSignIn()}">
          Sign in with Discord to register your main and alts for raid signups.
        </vintage-sign-in-card>
      `,
    )}
    ${when(
      () => currentSession(),
      html`
        <section aria-labelledby="add">
          <h2 id="add">Add a character</h2>
          <vintage-character-form></vintage-character-form>
        </section>
      `,
    )}
  </div>
`;

/** The member's characters. Signed out until Discord sign-in (#7). */
export class Page extends FASTElement {}
await Page.define({ name: 'vintage-characters-page', template, styles: pageStyles });
