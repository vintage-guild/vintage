import { css, FASTElement, html, repeat } from '@lushly-dev/fast-element';
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
      <h2>Signup card</h2>
      <p>One per status. Answering runs <code>signup-set</code> through the command client.</p>
      <div class="cards">
        ${repeat(
          () => SIGNUP_STATUSES,
          html<SignupStatus>`
            <vintage-signup-card event-id="demo" event-title="Onyxia's Lair" starts-at="2026-12-10T03:00:00Z" lock-label="signups lock 6:00 pm" status="${(s) => s}" character-id="demo" character-label="Bloodfen · Protection"></vintage-signup-card>
          `,
        )}
      </div>
    </section>
    <section><h2>Sign-in card</h2><vintage-sign-in-card></vintage-sign-in-card></section>
    <section>
      <h2>Figures</h2>
      <div class="figures">
        <vintage-figure value="10" unit="days" caption="to launch"></vintage-figure>
        <vintage-figure value="0" unit="/ 22" caption="bosses down"></vintage-figure>
        <vintage-figure value="33" caption="on the rolls" tone="good"></vintage-figure>
        <vintage-figure value="7" unit="/ 22" caption="accent tone" tone="accent"></vintage-figure>
      </div>
    </section>
    <section>
      <h2>Hero</h2>
      <p>The home page uses it with art; here it is plain, with every slot filled.</p>
      <vintage-hero>
        <span slot="eyebrow">Normal ruleset</span>
        <h1>Forming for <em>Forever.</em></h1>
        <p slot="standfirst">A raiding guild for WoW: Forever.</p>
        <div slot="actions"><violet-button appearance="primary">Apply to raid</violet-button></div>
        <div slot="figures">
          <vintage-figure value="45" unit="days" caption="to raids"></vintage-figure>
          <vintage-figure value="33" caption="on the rolls" tone="good"></vintage-figure>
        </div>
      </vintage-hero>
    </section>
  </div>
`;

const styles = css`
  ${pageStyles}

  .figures {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
    gap: var(--space-md);
  }

  vintage-hero h1 em {
    font-style: normal;
    color: var(--color-text-accent);
  }
`;

export class Page extends FASTElement {}
await Page.define({ name: 'vintage-ui-gallery', template, styles });
