import { FASTElement, html, repeat } from '@lushly-dev/fast-element';
import { SIGNUP_STATUSES, type SignupStatus } from '@vintage/ui-kit';
import { CLASS_NAMES, CLASSES, ROLES, type Role, type WowClass } from '@vintage/wow-data';
import { pageStyles } from './page-styles';

const firstSpec = (c: WowClass) => Object.keys(CLASSES[c])[0] ?? '';

// Dev only (see routes.ts): every ui-kit element with sample data.
const template = html<Page>`
  <div class="page">
    <h1>Components</h1>
    <p class="lead">Every @vintage/ui-kit element. Switch the theme in the header to check both.</p>
    <section>
      <h2>Class badges</h2>
      <p class="row">
        ${repeat(
          () => CLASS_NAMES,
          html<WowClass>`<vintage-class-badge wow-class="${(c) => c}" spec="${firstSpec}"></vintage-class-badge>`,
        )}
      </p>
    </section>
    <section>
      <h2>Role badges</h2>
      <p class="row">
        ${repeat(() => ROLES, html<Role>`<vintage-role-badge raid-role="${(r) => r}"></vintage-role-badge>`)}
      </p>
    </section>
    <section>
      <h2>Character form</h2>
      <p>Runs <code>character-add</code> through the stub client, which answers NOT_CONNECTED.</p>
      <vintage-character-form></vintage-character-form>
    </section>
    <section>
      <h2>Signup cards</h2>
      <div class="row">
        ${repeat(
          () => SIGNUP_STATUSES,
          html<SignupStatus>`
            <vintage-signup-card event-title="Onyxia's Lair" starts-at="2026-12-10T03:00:00Z" status="${(s) => s}"></vintage-signup-card>
          `,
        )}
      </div>
    </section>
    <section><h2>Sign-in card</h2><vintage-sign-in-card></vintage-sign-in-card></section>
  </div>
`;

export class Page extends FASTElement {}
await Page.define({ name: 'vintage-ui-gallery', template, styles: pageStyles });
