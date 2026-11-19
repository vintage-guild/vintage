import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { RecipeCrafter, RecipeMatch } from '@vintage/armory/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { professionIcon } from '../class-icons';
import { pageStyles } from './page-styles';

/** Professions with recipes (gathering skills have none). */
const CRAFTS = [
  'Alchemy',
  'Blacksmithing',
  'Cooking',
  'Enchanting',
  'Engineering',
  'First Aid',
  'Leatherworking',
  'Mining',
  'Tailoring',
];

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 250;

const classSlug = (c: RecipeCrafter) => c.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
const fullName = (c: RecipeCrafter) => (c.surname ? `${c.name} ${c.surname}` : c.name);

/** "Opens in a new tab": an arrow leaving a box, in the link's own color. */
const newTab = html`<svg class="new-tab" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const crafter = html<RecipeCrafter>`
  <li class="crafter">
    ${when(
      (c) => c.profileUrl,
      html<RecipeCrafter>`<a class="name" href="${(c) => c.profileUrl ?? ''}" target="_blank" rel="noopener noreferrer" style="${(c) => (c.className ? `color: var(--color-class-${classSlug(c)})` : '')}">${(c) => fullName(c)}${newTab}<span class="visually-hidden"> (armory, opens in a new tab)</span></a>`,
    )}
    ${when((c) => !c.profileUrl, html<RecipeCrafter>`<span class="name">${(c) => fullName(c)}</span>`)}
    <span class="skill" title="${(c) => `Skill ${c.skill}${c.maxSkill ? ` / ${c.maxSkill}` : ''}`}">${(c) => c.skill}</span>
  </li>
`;

const recipe = html<RecipeMatch>`
  <li class="recipe">
    <img class="icon" src="${(r) => professionIcon(r.profession)}" alt="" loading="lazy" />
    <div class="what">
      <span class="recipe-name">${(r) => r.name}</span>
      <small>${(r) => r.profession}</small>
    </div>
    <ul class="crafters" aria-label="${(r) => `Who can craft ${r.name}`}">
      ${repeat((r) => r.crafters, crafter)}
    </ul>
  </li>
`;

const template = html<Page>`
  <div class="page wide">
    <h1>Recipes</h1>
    <div class="controls" role="search">
      <label>
        <span>Recipe</span>
        <input
          type="search"
          placeholder="Recipe name"
          :value="${(x) => x.query}"
          @input="${(x, c) => x.type((c.event.target as HTMLInputElement).value)}"
        />
      </label>
      <label>
        <span>Profession</span>
        <select
          @change="${(x, c) => x.pickProfession((c.event.target as HTMLSelectElement).value)}"
        >
          <option value="">All professions</option>
          ${repeat(() => CRAFTS, html<string>`<option value="${(p) => p}">${(p) => p}</option>`)}
        </select>
      </label>
    </div>
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when(
      (x) => x.searched && !x.error,
      html<Page>`
        <p class="count" aria-live="polite">
          ${(x) => (x.results.length === 0 ? 'No recipes match.' : `${x.results.length} recipe${x.results.length === 1 ? '' : 's'}`)}
        </p>
        <ul class="recipes">${repeat((x) => x.results, recipe)}</ul>
        ${when(
          (x) => x.truncated,
          html`<p class="muted">Showing the first 50. Add more of the name to narrow it.</p>`,
        )}
      `,
    )}
  </div>
`;

const styles = css`
  .page.wide {
    max-inline-size: 72rem;
  }

  .muted {
    color: var(--color-text-secondary);
  }

  .error {
    color: var(--color-text-accent);
  }

  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-sm) var(--space-md);
  }

  .controls label {
    display: grid;
    gap: 0.2rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .controls input,
  .controls select {
    min-inline-size: 14rem;
    padding: 0.45rem 0.6rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    letter-spacing: normal;
    text-transform: none;
  }

  .controls input:focus-visible,
  .controls select:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .recipes {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    background: var(--color-surface-raised);
  }

  .recipes:empty {
    display: none;
  }

  .recipe {
    display: grid;
    grid-template-columns: 1.75rem minmax(10rem, 16rem) 1fr;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
  }

  .recipe:last-child {
    border-block-end: 0;
  }

  .icon {
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
  }

  .what {
    display: grid;
  }

  .recipe-name {
    font-weight: var(--font-weight-bold);
  }

  .what small {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .crafters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);
  }

  .crafter {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }

  .name {
    font-weight: var(--font-weight-medium);
    text-decoration: none;
    color: var(--color-text-primary);
  }

  a.name:hover {
    text-decoration: underline;
  }

  .new-tab {
    margin-inline-start: 0.3rem;
    opacity: 0.6;
  }

  a.name:hover .new-tab,
  a.name:focus-visible .new-tab {
    opacity: 1;
  }

  .skill {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  @media (max-width: 44rem) {
    .recipe {
      grid-template-columns: 1.75rem 1fr;
    }

    .crafters {
      grid-column: 1 / -1;
    }
  }
`;

/** `/recipes`: who in the guild can craft what, from `armory-recipe-search`. Open to all. */
export class Page extends FASTElement {
  @observable query = '';
  @observable profession = '';
  @observable results: RecipeMatch[] = [];
  @observable truncated = false;
  /** A search has answered since the query last became searchable. */
  @observable searched = false;
  @observable error = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped per search, so an older answer that lands last changes nothing. */
  private asked = 0;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    this.asked++;
  }

  type(value: string): void {
    this.query = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(), DEBOUNCE_MS);
  }

  pickProfession(value: string): void {
    this.profession = value;
    void this.search();
  }

  async search(): Promise<void> {
    const mine = ++this.asked;
    const query = this.query.trim();
    if (query.length < 2) {
      this.results = [];
      this.truncated = false;
      this.searched = false;
      this.error = '';
      return;
    }
    const result = await getCommandClient().read<{ recipes: RecipeMatch[]; truncated: boolean }>(
      'armory-recipe-search',
      { query, ...(this.profession ? { profession: this.profession } : {}) },
    );
    if (mine !== this.asked) return;
    if (result.success && result.data) {
      this.results = result.data.recipes;
      this.truncated = result.data.truncated;
      this.error = '';
    } else {
      this.error = result.error?.message ?? 'Could not search recipes.';
    }
    this.searched = true;
  }
}

await Page.define({
  name: 'vintage-recipes-page',
  template,
  styles: [pageStyles, styles],
});
