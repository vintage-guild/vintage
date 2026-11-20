import {
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  when,
} from '@lushly-dev/fast-element';
import type {
  CatalogRecipe,
  ProfessionDetail,
  ProfessionSummary,
  RecipeCrafter,
  RecipeMatch,
} from '@vintage/armory/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { professionIcon } from '../class-icons';
import { pageStyles } from './page-styles';

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 250;

/** Crafters shown on a recipe before "+N more". */
const SHOWN = 3;

/** `First Aid` is `/professions/first-aid`. */
export const professionSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

/** The profession in `/professions/<slug>`, or empty on the overview. */
export const professionFromPath = (path: string) =>
  decodeURIComponent(path.replace(/^\/+|\/+$/g, '').split('/')[1] ?? '');

const classSlug = (c: RecipeCrafter) => c.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
const fullName = (c: RecipeCrafter) => (c.surname ? `${c.name} ${c.surname}` : c.name);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

const nobody = html`<span class="nobody">No one yet</span>`;

/** A search result: any profession, so it carries the profession's icon and name. */
const match = html<RecipeMatch>`
  <li class="recipe">
    <img class="icon" src="${(r) => professionIcon(r.profession)}" alt="" loading="lazy" />
    <div class="what">
      <span class="recipe-name">${(r) => r.name}</span>
      <a class="sub" href="${(r) => `/professions/${professionSlug(r.profession)}`}">${(r) => r.profession}</a>
    </div>
    ${when(
      (r) => r.crafters.length > 0,
      html<RecipeMatch>`<ul class="crafters" aria-label="${(r) => `Who can craft ${r.name}`}">${repeat((r) => r.crafters, crafter)}</ul>`,
    )}
    ${when((r) => r.crafters.length === 0, nobody)}
  </li>
`;

type Category = { name: string; recipes: CatalogRecipe[] };

/** Rows sit in a category's list, so the page is the parent's parent. */
const pageOf = (c: ExecutionContext<Category>) => c.parentContext.parent as unknown as Page;
const isOpen = (r: CatalogRecipe, c: ExecutionContext<Category>) =>
  pageOf(c).expanded.includes(r.id);

/** A recipe in a profession's list: the best crafters, the rest behind "+N more". */
const catalogRecipe = html<CatalogRecipe, Category>`
  <li class="row">
    <span class="recipe-name">${(r) => r.name}</span>
    ${when(
      (r) => r.crafters.length > 0,
      html<
        CatalogRecipe,
        Category
      >`<ul class="crafters" aria-label="${(r) => `Who can craft ${r.name}`}">
        ${repeat((r, c) => (isOpen(r, c) ? r.crafters : r.crafters.slice(0, SHOWN)), crafter)}
        ${when(
          (r, c) => r.crafters.length > SHOWN && !isOpen(r, c),
          html<
            CatalogRecipe,
            Category
          >`<li><button type="button" class="more" @click="${(r, c) => pageOf(c).expand(r.id)}">+${(r) => r.crafters.length - SHOWN} more</button></li>`,
        )}
      </ul>`,
    )}
    ${when((r) => r.crafters.length === 0, nobody)}
  </li>
`;

const card = html<ProfessionSummary>`
  <li>
    <a class="card" href="${(p) => `/professions/${professionSlug(p.profession)}`}">
      <span class="card-head">
        <img class="icon" src="${(p) => professionIcon(p.profession)}" alt="" loading="lazy" />
        <span>
          <span class="card-name">${(p) => p.profession}</span>
          <small>${(p) => plural(p.crafterCount, 'crafter')}${(p) => (p.recipeCount === null ? '' : ` · ${p.knownCount} of ${p.recipeCount} recipes`)}</small>
        </span>
      </span>
      <span class="top">
        ${repeat(
          (p) => p.top,
          html<RecipeCrafter>`<span class="top-row"><span>${(c) => fullName(c)}</span><span class="skill">${(c) => c.skill}</span></span>`,
        )}
      </span>
    </a>
  </li>
`;

const overview = html<Page>`
  <h1>Professions</h1>
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
  </div>
  ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
  ${when(
    (x) => x.searched && !x.error,
    html<Page>`
      <p class="count" aria-live="polite">
        ${(x) => (x.results.length === 0 ? 'No recipes match.' : plural(x.results.length, 'recipe'))}
      </p>
      <ul class="recipes">${repeat((x) => x.results, match)}</ul>
      ${when(
        (x) => x.truncated,
        html`<p class="muted">Showing the first 50. Add more of the name to narrow it.</p>`,
      )}
    `,
  )}
  ${when(
    (x) => !x.searched,
    html<Page>`<ul class="cards">${repeat((x) => x.summaries, card)}</ul>`,
  )}
`;

const category = html<Category, Page>`
  <section class="category" aria-label="${(c) => c.name}">
    <h2 class="category-head">
      <span>${(c) => c.name}</span>
      <small>${(c, ctx) => ctx.parent.knownIn(c.recipes)} of ${(c) => c.recipes.length} known</small>
    </h2>
    <ul class="rows">${repeat((c, ctx) => ctx.parent.shown(c.recipes), catalogRecipe)}</ul>
  </section>
`;

const detail = html<Page>`
  <a class="back" href="/professions">All professions</a>
  ${when(
    (x) => x.detail,
    html<Page>`
      <div class="title">
        <img class="icon big" src="${(x) => professionIcon(x.detail?.profession ?? '')}" alt="" />
        <h1>${(x) => x.detail?.profession}</h1>
        <span class="muted">${(x) => x.detail?.knownCount} of ${(x) => x.detail?.recipeCount} recipes known in the guild</span>
      </div>
      <div class="controls" role="search">
        <label>
          <span>Recipe</span>
          <input
            type="search"
            placeholder="Recipe name"
            :value="${(x) => x.filter}"
            @input="${(x, c) => {
              x.filter = (c.event.target as HTMLInputElement).value;
            }}"
          />
        </label>
        <div class="toggle" role="group" aria-label="Which recipes">
          <button type="button" aria-pressed="${(x) => String(!x.knownOnly)}" @click="${(x) => {
            x.knownOnly = false;
          }}">All recipes</button>
          <button type="button" aria-pressed="${(x) => String(x.knownOnly)}" @click="${(x) => {
            x.knownOnly = true;
          }}">Known in the guild</button>
        </div>
      </div>
      ${repeat((x) => x.categories, category)}
      ${when((x) => x.categories.length === 0, html`<p class="muted">No recipes match.</p>`)}
    `,
  )}
  ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
`;

const template = html<Page>`
  <div class="page wide">
    ${when((x) => !x.slug, overview)}
    ${when((x) => x.slug, detail)}
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

  .controls input {
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
  .toggle button:focus-visible,
  .more:focus-visible,
  .card:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .toggle {
    display: inline-flex;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
    overflow: hidden;
  }

  .toggle button {
    padding: 0.45rem 0.8rem;
    border: 0;
    background: none;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .toggle button[aria-pressed='true'] {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font-weight: var(--font-weight-bold);
  }

  .count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .icon {
    inline-size: 1.75rem;
    block-size: 1.75rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
  }

  .icon.big {
    inline-size: 2.5rem;
    block-size: 2.5rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards > li {
    display: grid;
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .card:hover {
    border-color: var(--color-border-strong);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .card-head > span {
    display: grid;
  }

  .card-name {
    font-weight: var(--font-weight-bold);
  }

  .card small,
  .what .sub,
  .category-head small {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .top {
    display: grid;
    gap: 0.15rem;
    font-size: var(--font-size-sm);
  }

  .top-row {
    display: flex;
    justify-content: space-between;
  }

  .recipes,
  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .recipes {
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

  .what {
    display: grid;
  }

  .recipe-name {
    font-weight: var(--font-weight-bold);
  }

  .what .sub {
    text-decoration: none;
  }

  .what .sub:hover {
    text-decoration: underline;
  }

  .back {
    font-size: var(--font-size-sm);
  }

  .title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm) var(--space-md);
  }

  .category {
    gap: 0;
  }

  h2.category-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-block-end: var(--space-xs);
    border-block-end: var(--border-width-thin) solid var(--color-border-strong);
    font-size: var(--font-size-md);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(10rem, 18rem) 1fr;
    align-items: baseline;
    gap: var(--space-sm);
    padding: var(--space-xs) 0;
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .row .recipe-name {
    font-weight: var(--font-weight-medium);
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

  .nobody {
    font-size: var(--font-size-sm);
    font-style: italic;
    color: var(--color-text-secondary);
  }

  .more {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-text-accent);
    font: inherit;
    font-size: var(--font-size-xs);
    cursor: pointer;
  }

  @media (max-width: 44rem) {
    .recipe {
      grid-template-columns: 1.75rem 1fr;
    }

    .recipe .crafters,
    .recipe .nobody {
      grid-column: 1 / -1;
    }

    .row {
      grid-template-columns: 1fr;
    }
  }
`;

/**
 * `/professions`: an overview card per crafting profession (`armory-profession-list`) and a recipe
 * search across them all (`armory-recipe-search`). `/professions/<name>`: that profession's whole
 * recipe catalog with who knows each recipe (`armory-profession-get`). Open to all.
 */
export class Page extends FASTElement {
  readonly slug = professionFromPath(location.pathname);
  @observable summaries: ProfessionSummary[] = [];
  @observable detail: ProfessionDetail | null = null;
  @observable query = '';
  @observable results: RecipeMatch[] = [];
  @observable truncated = false;
  /** A search has answered since the query last became searchable. */
  @observable searched = false;
  /** Filters the profession's list by name, in the page. */
  @observable filter = '';
  @observable knownOnly = false;
  /** Recipes whose whole crafter list is open. */
  @observable expanded: number[] = [];
  @observable error = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped per search, so an older answer that lands last changes nothing. */
  private asked = 0;

  connectedCallback(): void {
    super.connectedCallback();
    void (this.slug ? this.loadDetail() : this.loadSummaries());
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.timer);
    this.asked++;
  }

  async loadSummaries(): Promise<void> {
    const result = await getCommandClient().read<ProfessionSummary[]>('armory-profession-list', {});
    if (result.success && result.data) this.summaries = result.data;
    else this.error = result.error?.message ?? 'Could not read the professions.';
  }

  async loadDetail(): Promise<void> {
    const result = await getCommandClient().read<ProfessionDetail>('armory-profession-get', {
      profession: this.slug,
    });
    if (result.success && result.data) this.detail = result.data;
    else if (result.error?.code === 'PROFESSION_NOT_FOUND') this.error = 'No such profession.';
    else this.error = result.error?.message ?? 'Could not read the profession.';
  }

  /** Categories with a recipe left after the name filter and the known toggle. */
  get categories(): { name: string; recipes: CatalogRecipe[] }[] {
    return (this.detail?.categories ?? []).filter((c) => this.shown(c.recipes).length > 0);
  }

  shown(recipes: CatalogRecipe[]): CatalogRecipe[] {
    const needle = this.filter.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        (!this.knownOnly || r.crafters.length > 0) &&
        (!needle || r.name.toLowerCase().includes(needle)),
    );
  }

  knownIn(recipes: CatalogRecipe[]): number {
    return recipes.filter((r) => r.crafters.length > 0).length;
  }

  expand(id: number): void {
    this.expanded = [...this.expanded, id];
  }

  type(value: string): void {
    this.query = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.search(), DEBOUNCE_MS);
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
      { query },
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
  name: 'vintage-professions-page',
  template,
  styles: [pageStyles, styles],
});
