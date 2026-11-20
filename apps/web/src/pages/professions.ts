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
  CharacterRecipes,
  ProfessionDetail,
  ProfessionSummary,
  RecipeCrafter,
  RecipeDetail,
  RecipeMatch,
  RecipeRef,
  RosterListing,
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

type View = { kind: 'overview' } | { kind: 'profession' | 'character'; value: string };

/** `/professions`, `/professions/<profession>`, or `/professions/character/<slug>`. */
export function viewFromPath(path: string): View {
  const [, first, second] = path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map(decodeURIComponent);
  if (first === 'character' && second) return { kind: 'character', value: second };
  if (first) return { kind: 'profession', value: first };
  return { kind: 'overview' };
}

/** Where to find a recipe: its item on Wowhead's Forever site, or a Wowhead search by name. */
export const wowheadUrl = (name: string, itemId: number | null) =>
  itemId
    ? `https://www.wowhead.com/forever/item=${itemId}`
    : `https://www.wowhead.com/forever/search?q=${encodeURIComponent(name)}`;

const classSlug = (c: { className: string | null }) =>
  c.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
const fullName = (c: { name: string; surname: string }) =>
  c.surname ? `${c.name} ${c.surname}` : c.name;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Back to the overview, from a profession or a character. */
const backLink = html`<a class="back" href="/professions"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>All professions</a>`;

/** "Opens in a new tab": an arrow leaving a box, in the link's own color. */
const newTab = html`<svg class="new-tab" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** A recipe's name: links to Wowhead; hovering or focusing it opens the page's tooltip. */
const recipeLink = <T extends RecipeRef>() =>
  html<T>`<a class="recipe-name recipe-link" href="${(r) => wowheadUrl(r.name, r.itemId)}" target="_blank" rel="noopener noreferrer" data-recipe="${(r) => r.id}">${(r) => r.name}${newTab}<span class="visually-hidden"> (Wowhead, opens in a new tab)</span></a>`;

const characterPath = (slug: string) => `/professions/character/${encodeURIComponent(slug)}`;

/** A crafter's name opens their crafting page, which links on to the armory. */
const crafter = html<RecipeCrafter>`
  <li class="crafter">
    <a class="name" href="${(c) => characterPath(c.slug)}" style="${(c) => (c.className ? `color: var(--color-class-${classSlug(c)})` : '')}">${(c) => fullName(c)}</a>
    <span class="skill" title="${(c) => `Skill ${c.skill}${c.maxSkill ? ` / ${c.maxSkill}` : ''}`}">${(c) => c.skill}</span>
  </li>
`;

const nobody = html`<span class="nobody">No one yet</span>`;

/** A search result: any profession, so it carries the profession's icon and name. */
const match = html<RecipeMatch>`
  <li class="recipe">
    <img class="icon" src="${(r) => professionIcon(r.profession)}" alt="" loading="lazy" />
    <div class="what">
      ${recipeLink<RecipeMatch>()}
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
    ${recipeLink<CatalogRecipe>()}
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
    <label>
      <span>Character</span>
      <input
        type="search"
        list="roster-names"
        placeholder="Character name"
        autocomplete="off"
        @change="${(x, c) => x.pickCharacter((c.event.target as HTMLInputElement).value)}"
      />
    </label>
    <datalist id="roster-names">
      ${repeat((x) => x.rosterNames, html<string>`<option value="${(n) => n}"></option>`)}
    </datalist>
  </div>
  ${when((x) => x.characterMiss, html`<p class="muted">No one on the roster by that name.</p>`)}
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
  ${backLink}
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

type CharacterProfession = CharacterRecipes['professions'][number];

const refRow = html<RecipeRef>`<li class="ref">${recipeLink<RecipeRef>()}</li>`;

const characterProfession = html<CharacterProfession, Page>`
  <section class="category" id="${(p) => professionSlug(p.profession)}" aria-label="${(p) => p.profession}">
    <h2 class="category-head">
      <span class="with-icon">
        <img class="icon" src="${(p) => professionIcon(p.profession)}" alt="" loading="lazy" />
        ${(p) => p.profession}
        <span class="skill">${(p) => p.skill}${(p) => (p.maxSkill ? ` / ${p.maxSkill}` : '')}</span>
      </span>
      <small>${(p) => p.known.length} known · ${(p) => p.missing.length} missing</small>
    </h2>
    <div class="split">
      <div>
        <h3>Known</h3>
        <ul class="refs">${repeat((p, c) => c.parent.matching(p.known), refRow)}</ul>
      </div>
      <div>
        <h3>Missing</h3>
        <ul class="refs">${repeat((p, c) => c.parent.matching(p.missing), refRow)}</ul>
      </div>
    </div>
  </section>
`;

const characterView = html<Page>`
  ${backLink}
  ${when(
    (x) => x.character,
    html<Page>`
      <div class="title">
        <h1>
          ${when(
            (x) => x.character?.profileUrl,
            html<Page>`<a class="name" href="${(x) => x.character?.profileUrl ?? ''}" target="_blank" rel="noopener noreferrer" style="${(x) => (x.character?.className ? `color: var(--color-class-${classSlug(x.character)})` : '')}">${(x) => (x.character ? fullName(x.character) : '')}${newTab}<span class="visually-hidden"> (armory, opens in a new tab)</span></a>`,
          )}
          ${when(
            (x) => !x.character?.profileUrl,
            html<Page>`${(x) => (x.character ? fullName(x.character) : '')}`,
          )}
        </h1>
        <span class="muted">Level ${(x) => x.character?.level}${(x) => (x.character?.className ? ` ${x.character.className}` : '')}</span>
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
      </div>
      ${repeat((x) => x.character?.professions ?? [], characterProfession)}
      ${when(
        (x) => x.character?.professions.length === 0,
        html`<p class="muted">No crafting professions on the armory yet.</p>`,
      )}
    `,
  )}
  ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
`;

/**
 * The recipe tooltip: what the item does and takes. One for the page, placed by the hovered link.
 * A popover, so it sits in the top layer over the footer and the fixed bars, whatever their order.
 */
const tooltip = html<Page>`
  <div
    class="tip"
    role="tooltip"
    id="recipe-tip"
    popover="manual"
    style="${(x) => `left: ${x.tipX}px; ${x.tipPlace}`}"
  >
    ${when((x) => x.tipLoading, html`<span class="muted">Loading…</span>`)}
    ${when(
      (x) => !x.tipLoading && !x.tipDetail,
      html<Page>`<strong>${(x) => x.tipName}</strong><span class="muted">Details load after the next daily sync.</span>`,
    )}
    ${when(
      (x) => !x.tipLoading && x.tipDetail,
      html<Page>`
        <strong class="${(x) => `q-${x.tipDetail?.quality ?? 'common'}`}">${(x) => x.tipDetail?.itemName ?? x.tipName}${(x) => ((x.tipDetail?.quantity ?? 1) > 1 ? ` ×${x.tipDetail?.quantity}` : '')}</strong>
        ${repeat((x) => x.tipDetail?.lines ?? [], html<string>`<span>${(l) => l}</span>`)}
        ${when(
          (x) => (x.tipDetail?.reagents.length ?? 0) > 0,
          html<Page>`<span class="tip-head">Reagents</span>${repeat(
            (x) => x.tipDetail?.reagents ?? [],
            html<{
              name: string;
              quantity: number;
            }>`<span>${(r) => r.quantity} × ${(r) => r.name}</span>`,
          )}`,
        )}
        <span class="tip-foot">Open it on Wowhead to see where it’s learned.</span>
      `,
    )}
  </div>
`;

const template = html<Page>`
  <div
    class="page wide"
    @mouseover="${(x, c) => x.onPointer(c.event as MouseEvent, true)}"
    @mouseout="${(x, c) => x.onPointer(c.event as MouseEvent, false)}"
    @focusin="${(x, c) => x.onPointer(c.event, true)}"
    @focusout="${(x, c) => x.onPointer(c.event, false)}"
  >
    ${when((x) => x.view.kind === 'overview', overview)}
    ${when((x) => x.view.kind === 'profession', detail)}
    ${when((x) => x.view.kind === 'character', characterView)}
    ${tooltip}
  </div>
`;

const styles = css`
  .page.wide {
    position: relative;
    max-inline-size: 72rem;
  }

  .recipe-link {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .recipe-link:hover {
    text-decoration: underline;
  }

  .recipe-link .new-tab {
    opacity: 0.45;
  }

  .tip {
    position: fixed;
    inset: auto;
    margin: 0;
    overflow: visible;
    inline-size: 18rem;
    padding: var(--space-sm);
    color: var(--color-text-primary);
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
    background: var(--color-surface-raised);
    box-shadow: var(--shadow-low);
    font-size: var(--font-size-xs);
    pointer-events: none;
  }

  .tip:popover-open {
    display: grid;
    gap: 0.15rem;
  }

  .tip strong {
    font-size: var(--font-size-sm);
  }

  .tip-head {
    margin-block-start: var(--space-xs);
    font-weight: var(--font-weight-bold);
  }

  .tip-foot {
    margin-block-start: var(--space-xs);
    color: var(--color-text-secondary);
  }

  .q-poor {
    color: var(--color-quality-poor);
  }

  .q-uncommon {
    color: var(--color-quality-uncommon);
  }

  .q-rare {
    color: var(--color-quality-rare);
  }

  .q-epic {
    color: var(--color-quality-epic);
  }

  .q-legendary {
    color: var(--color-quality-legendary);
  }

  .with-icon {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: var(--space-md);
    padding-block-start: var(--space-xs);
  }

  .split h3 {
    margin: 0 0 var(--space-xs);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .refs {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);
  }

  .refs .recipe-name {
    font-weight: var(--font-weight-regular);
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
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    justify-self: start;
    padding: 0.4rem 0.75rem 0.4rem 0.6rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.2rem;
    background: var(--color-surface-raised);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition:
      color var(--motion-duration-normal) var(--motion-ease-out),
      border-color var(--motion-duration-normal) var(--motion-ease-out);
  }

  .back svg {
    transition: translate var(--motion-duration-normal) var(--motion-ease-out);
  }

  .back:hover,
  .back:focus-visible {
    border-color: var(--color-accent-primary);
    color: var(--color-text-accent);
  }

  .back:hover svg {
    translate: -3px 0;
  }

  .back:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  @media (prefers-reduced-motion: reduce) {
    .back,
    .back svg {
      transition: none;
    }
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
 * `/professions`: an overview card per crafting profession (`armory-profession-list`), a recipe
 * search across them all (`armory-recipe-search`), and a character search from the roster.
 * `/professions/<name>`: that profession's whole recipe catalog with who knows each recipe
 * (`armory-profession-get`). `/professions/character/<slug>`: one character's known and missing
 * recipes (`armory-character-recipes`). Every recipe links to Wowhead and shows what it makes and
 * takes on hover or focus (`armory-recipe-get`). Open to all.
 */
export class Page extends FASTElement {
  readonly view = viewFromPath(location.pathname);
  @observable summaries: ProfessionSummary[] = [];
  @observable detail: ProfessionDetail | null = null;
  @observable character: CharacterRecipes | null = null;
  /** "First Last" for each roster character, for the character search's suggestions. */
  @observable rosterNames: string[] = [];
  @observable characterMiss = false;
  @observable tipOpen = false;
  @observable tipLoading = false;
  @observable tipName = '';
  @observable tipDetail: RecipeDetail | null = null;
  @observable tipX = 0;
  /** `top: …` below the link, or `bottom: …` above it when the window has no room below. */
  @observable tipPlace = 'top: 0px';
  private slugByName = new Map<string, string>();
  /** Recipe details already read, by recipe id; null when not synced yet. */
  private tips = new Map<number, RecipeDetail | null>();
  private tipFor = 0;
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
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    if (this.view.kind === 'profession') void this.loadDetail(this.view.value);
    else if (this.view.kind === 'character') void this.loadCharacter(this.view.value);
    else {
      void this.loadSummaries();
      void this.loadRosterNames();
    }
  }

  async loadRosterNames(): Promise<void> {
    const result = await getCommandClient().read<RosterListing[]>('armory-guild-roster', {});
    if (!result.success || !result.data) return;
    const listed = result.data.filter((e) => e.level >= 10);
    this.slugByName = new Map(listed.map((e) => [fullName(e).toLowerCase(), e.slug]));
    this.rosterNames = listed.map((e) => fullName(e)).sort((a, b) => a.localeCompare(b));
  }

  /** Open a character picked or typed in the character search; a name off the roster says so. */
  pickCharacter(value: string): void {
    const name = value.trim().toLowerCase();
    if (!name) return;
    const slug =
      this.slugByName.get(name) ??
      [...this.slugByName].find(([full]) => full.split(' ')[0] === name)?.[1];
    this.characterMiss = !slug;
    if (!slug) return;
    history.pushState({}, '', characterPath(slug));
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  async loadCharacter(slug: string): Promise<void> {
    const result = await getCommandClient().read<CharacterRecipes>('armory-character-recipes', {
      slug,
    });
    if (result.success && result.data) {
      this.character = result.data;
      this.scrollToHash();
    } else if (result.error?.code === 'CHARACTER_NOT_FOUND')
      this.error = 'No one on the roster by that name.';
    else this.error = result.error?.message ?? 'Could not read the character.';
  }

  /**
   * `#blacksmithing` (from a profession on the roster) scrolls to that profession once it has
   * rendered; the page's sections live in its shadow root, so the browser can't find them itself.
   */
  private scrollToHash(): void {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    setTimeout(() => {
      const section = this.shadowRoot?.getElementById(id);
      if (!section) return;
      // Below the sticky header, which wraps to two rows on narrower windows.
      const header = document.querySelector('vintage-logo-header')?.getBoundingClientRect().height;
      const top = section.getBoundingClientRect().top + window.scrollY - (header ?? 0) - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    });
  }

  /** Recipes on a character's list after the name filter. */
  matching(recipes: RecipeRef[]): RecipeRef[] {
    const needle = this.filter.trim().toLowerCase();
    return needle ? recipes.filter((r) => r.name.toLowerCase().includes(needle)) : recipes;
  }

  /** Hover or focus moving onto or off a recipe link opens or closes its tooltip. */
  onPointer(event: Event, entering: boolean): void {
    const link = (event.composedPath()[0] as Element | undefined)?.closest?.(
      'a[data-recipe]',
    ) as HTMLAnchorElement | null;
    if (!link) return;
    const next = (event as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (!entering && next && link.contains(next)) return;
    if (entering) void this.openTip(link);
    else this.closeTip();
  }

  private get tipEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>('#recipe-tip') ?? null;
  }

  /** The tooltip is placed for where the link was, so a scroll closes it. */
  private readonly onScroll = () => {
    if (this.tipOpen) this.closeTip();
  };

  closeTip(): void {
    this.tipOpen = false;
    const tip = this.tipEl;
    if (tip?.matches(':popover-open')) tip.hidePopover();
  }

  async openTip(link: HTMLAnchorElement): Promise<void> {
    const id = Number(link.dataset.recipe);
    const tip = this.tipEl;
    if (!tip || !id) return;
    const at = link.getBoundingClientRect();
    const width = 18 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    this.tipX = Math.max(8, Math.min(at.left, window.innerWidth - width - 8));
    this.tipPlace =
      window.innerHeight - at.bottom >= 320 || at.top < 320
        ? `top: ${at.bottom + 6}px`
        : `bottom: ${window.innerHeight - at.top + 6}px`;
    this.tipName = link.firstChild?.textContent?.trim() ?? '';
    this.tipFor = id;
    this.tipOpen = true;
    if (!tip.matches(':popover-open')) tip.showPopover();
    link.setAttribute('aria-describedby', 'recipe-tip');
    if (this.tips.has(id)) {
      this.tipDetail = this.tips.get(id) ?? null;
      this.tipLoading = false;
      return;
    }
    this.tipLoading = true;
    const result = await getCommandClient().read<{ detail: RecipeDetail | null }>(
      'armory-recipe-get',
      { recipeId: id },
    );
    const detail = result.success ? (result.data?.detail ?? null) : null;
    if (result.success) this.tips.set(id, detail);
    if (this.tipFor !== id) return;
    this.tipDetail = detail;
    this.tipLoading = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('scroll', this.onScroll, true);
    clearTimeout(this.timer);
    this.asked++;
  }

  async loadSummaries(): Promise<void> {
    const result = await getCommandClient().read<ProfessionSummary[]>('armory-profession-list', {});
    if (result.success && result.data) this.summaries = result.data;
    else this.error = result.error?.message ?? 'Could not read the professions.';
  }

  async loadDetail(profession: string): Promise<void> {
    const result = await getCommandClient().read<ProfessionDetail>('armory-profession-get', {
      profession,
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
