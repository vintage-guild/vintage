import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { RosterListing, RosterProfession } from '@vintage/armory/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { classIcon, professionIcon } from '../class-icons';
import { currentSession } from '../session';
import { pageStyles } from './page-styles';

/**
 * The guild's in-game rank names by Blizzard's rank index, which counts from 0: the game's rank 1
 * (Guild Master) is index 0, rank 2 (Officer) is 1, and so on. Checked against the live roster.
 */
export const RANK_NAMES: Readonly<Record<number, string>> = {
  0: 'Guild Master',
  1: 'Officer',
  2: 'Officer Alt',
  3: 'Raider',
  4: 'Flex Raider',
  5: 'Members & Alts',
  6: 'Recruit',
};

export const rankName = (rank: number) => RANK_NAMES[rank] ?? `Rank ${rank + 1}`;

/** The raid roster: the Guild Master, officers, and raiders; then flex raiders and recruits. */
const RAID_RANKS: ReadonlySet<number> = new Set([0, 1, 3]);
const FLEX_RANK = 4;
const RECRUIT_RANK = 6;

/** Blizzard's armory hides characters below this level, so the roster leaves them out. */
const MIN_LEVEL = 10;

/** The profession card and filter count a profession from this skill level up. */
const CRAFT_MIN = 225;

type StatKey = 'wowClass' | 'profession';

interface Stat {
  name: string;
  count: number;
  /** Bar length against the card's largest count. */
  pct: number;
  icon: string;
}

/** Counts by name, largest first, with each bar's share of the largest. */
function toStats(names: string[], icon: (name: string) => string): Stat[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([name, count]) => ({ name, count, pct: (count / max) * 100, icon: icon(name) }));
}

/** A ranked bar list; a bar's button toggles the matching filter. */
const statList = (stats: (x: Page) => Stat[], key: StatKey, unit: string) => html<Page>`
  <ul class="stats ${(x) => (x[key] ? 'has-pick' : '')}">
    ${repeat(
      stats,
      html<Stat, Page>`<li>
        <button
          type="button"
          class="stat"
          aria-pressed="${(s, c) => String(c.parent[key] === s.name)}"
          aria-label="${(s) => `${s.name}, ${s.count} ${unit}`}"
          @click="${(s, c) => c.parent.pick(key, s.name)}"
        >
          <img class="stat-icon" src="${(s) => s.icon}" alt="" loading="lazy" />
          <span class="stat-name">${(s) => s.name}</span>
          <span class="stat-track"><span class="stat-bar" style="inline-size: ${(s) => s.pct}%"></span></span>
          <span class="stat-count">${(s) => s.count}</span>
        </button>
      </li>`,
    )}
  </ul>
  ${when((x) => stats(x).length === 0, html`<p class="muted">None yet.</p>`)}
`;

type SortKey = 'rank' | 'name' | 'level';

const percent = (p: RosterProfession) =>
  p.maxLevel ? Math.min(100, Math.round((p.level / p.maxLevel) * 100)) : 100;

const classSlug = (e: RosterListing) => e.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';

/** The character's name in game: Forever names are first name and surname. */
const inGameName = (e: RosterListing) => (e.surname ? `${e.name} ${e.surname}` : e.name);

/** "Opens in a new tab": an arrow leaving a box, in the link's own color. */
const newTab = html`<svg class="new-tab" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Classic's secondary skills: shown smaller, after the two primaries. */
const SECONDARY: ReadonlySet<string> = new Set(['Cooking', 'First Aid', 'Fishing']);
const primaries = (e: RosterListing) => e.professions.filter((p) => !SECONDARY.has(p.name));
const secondaries = (e: RosterListing) => e.professions.filter((p) => SECONDARY.has(p.name));
const profLabel = (p: RosterProfession) =>
  `${p.name} ${p.level}${p.maxLevel ? ` / ${p.maxLevel}` : ''}`;

/** The character's crafting page, at this profession's section. */
const craftingPath = (p: RosterProfession, e: RosterListing) =>
  `/professions/character/${encodeURIComponent(e.slug)}#${p.name.toLowerCase().replace(/\s+/g, '-')}`;

/**
 * Icon and level, linking to the character's crafting page; the name and cap are in the tooltip
 * and for screen readers.
 */
const profession = (minor: boolean) => html<RosterProfession, RosterListing>`
  <li class="prof ${minor ? 'minor' : ''}">
    <a class="prof-link" href="${(p, c) => craftingPath(p, c.parent)}" title="${profLabel}">
      <img class="prof-icon" src="${(p) => professionIcon(p.name)}" alt="" loading="lazy" />
      <span class="visually-hidden">${profLabel}</span>
      <span class="prof-level" aria-hidden="true">${(p) => p.level}</span>
      ${
        minor
          ? ''
          : html<RosterProfession>`<span class="bar" aria-hidden="true"><span style="inline-size: ${(p) => percent(p)}%"></span></span>`
      }
    </a>
  </li>
`;
const primary = profession(false);
const secondary = profession(true);

const row = html<RosterListing, Page>`
  <tr data-status="${(e) => e.status}">
    <td data-label="Character"><div class="who">
      ${when(
        (e) => e.avatarUrl,
        html<RosterListing>`<img class="portrait" src="${(e) => e.avatarUrl ?? ''}" alt="" loading="lazy" />`,
      )}
      ${when(
        (e) => !e.avatarUrl && e.className,
        html<RosterListing>`<img class="portrait" src="${(e) => classIcon(e.className ?? '', 'medium')}" alt="" loading="lazy" />`,
      )}
      ${when(
        (e) => !e.avatarUrl && !e.className,
        html<RosterListing>`<span class="portrait blank" aria-hidden="true">${(e) => e.name.charAt(0)}</span>`,
      )}
      <span class="names">
        ${when(
          (e) => e.profileUrl,
          html<RosterListing>`<a class="name" href="${(e) => e.profileUrl ?? ''}" target="_blank" rel="noopener noreferrer" style="${(e) => (e.className ? `color: var(--color-class-${classSlug(e)})` : '')}">${(e) => inGameName(e)}${newTab}<span class="visually-hidden"> (armory, opens in a new tab)</span></a>`,
        )}
        ${when(
          (e) => !e.profileUrl,
          html<RosterListing>`<span class="name">${(e) => inGameName(e)}</span>`,
        )}
        ${when((e) => e.raceName, html<RosterListing>`<small>${(e) => e.raceName}</small>`)}
      </span>
    </div></td>
    <td data-label="Discord">
      ${when(
        (e, c) => c.parent.discordName(e),
        html<
          RosterListing,
          Page
        >`<span class="discord">${(e, c) => c.parent.discordName(e)}</span>`,
      )}
      ${when(
        (e, c) => !c.parent.discordName(e),
        html`<small class="muted unlinked">Not linked</small>`,
      )}
    </td>
    <td class="num" data-label="Level">${(e) => e.level}</td>
    <td data-label="Spec">
      ${when(
        (e) => e.status === 'found',
        html<RosterListing>`<span class="spec">${(e) => e.activeSpec ?? '—'}</span>
          <small>${(e) => e.className ?? ''}</small>`,
      )}
      ${when((e) => e.status === 'pending', html`<small class="muted">Looking up…</small>`)}
      ${when(
        (e) => e.status === 'error',
        html<RosterListing>`<small class="muted" title="${(e) => e.error ?? ''}">Armory: ${(e) => e.error ?? 'unavailable'}</small>`,
      )}
    </td>
    <td data-label="Professions">
      ${when(
        (e) => e.professions.length > 0,
        html<RosterListing>`<ul class="profs">${repeat(primaries, primary)}${repeat(secondaries, secondary)}</ul>`,
      )}
      ${when((e) => e.professions.length === 0, html`<small class="muted">—</small>`)}
    </td>
    <td data-label="Rank"><span class="rank">${(e) => rankName(e.guildRank)}</span></td>
  </tr>
`;

const sortButton = (key: SortKey, label: string) => html<Page>`<button
  type="button"
  class="sort"
  @click="${(x) => x.sortBy(key)}"
>${label}${(x) => (x.sort === key ? ' ▾' : '')}</button>`;

/** Level sorts highest first; rank (0 = Guild Master) and name sort ascending. */
const ariaSort = (key: SortKey) => (x: Page) =>
  x.sort !== key ? 'none' : key === 'level' ? 'descending' : 'ascending';

const rosterTable = (rows: (x: Page) => RosterListing[], label: string) => html<Page>`
  <div class="table-wrap">
    <table aria-label="${label}" class="${(x) => (x.showDiscord ? '' : 'no-discord')}">
      <thead>
        <tr>
          <th scope="col" aria-sort="${ariaSort('name')}">${sortButton('name', 'Character')}</th>
          <th scope="col" data-label="Discord">Discord</th>
          <th scope="col" class="num" aria-sort="${ariaSort('level')}">${sortButton('level', 'Level')}</th>
          <th scope="col">Spec</th>
          <th scope="col">Professions</th>
          <th scope="col" aria-sort="${ariaSort('rank')}">${sortButton('rank', 'Rank')}</th>
        </tr>
      </thead>
      <tbody>
        ${repeat(rows, row)}
      </tbody>
    </table>
    ${when((x) => rows(x).length === 0, html`<p class="muted empty">No one matches those filters.</p>`)}
  </div>
`;

const template = html<Page>`
  <div class="page wide">
    <h1>Roster</h1>
    ${when(
      (x) => x.showDiscord,
      html`<p class="muted">
        Link your characters on <a href="/characters">Characters</a> to show your Discord name.
      </p>`,
    )}
    ${when((x) => !x.loaded, html`<p class="muted">Loading the roster…</p>`)}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when(
      (x) => x.loaded && !x.error,
      html<Page>`
            <div class="dashboard">
              <section class="card" aria-labelledby="by-class">
                <h2 id="by-class" class="card-title">Raid roster by class</h2>
                ${statList((x) => x.classStats, 'wowClass', 'in the raid roster')}
              </section>
              <section class="card" aria-labelledby="by-profession">
                <h2 id="by-profession" class="card-title">Primary professions ${CRAFT_MIN}+</h2>
                ${statList((x) => x.professionStats, 'profession', `at ${CRAFT_MIN} or higher`)}
              </section>
            </div>
            <div class="controls" role="search">
              <label>
                <span>Search</span>
                <input
                  type="search"
                  placeholder="${(x) => (x.showDiscord ? 'Character or Discord name' : 'Character name')}"
                  :value="${(x) => x.query}"
                  @input="${(x, c) => {
                    x.query = (c.event.target as HTMLInputElement).value;
                  }}"
                />
              </label>
              <label>
                <span>Rank</span>
                <select
                  @change="${(x, c) => {
                    x.rank = (c.event.target as HTMLSelectElement).value;
                  }}"
                >
                  <option value="">All ranks</option>
                  ${repeat(
                    (x) => x.ranks,
                    html<number>`<option value="${(r) => r}">${(r) => rankName(r)}</option>`,
                  )}
                </select>
              </label>
              <label>
                <span>Class</span>
                <select
                  @change="${(x, c) => {
                    x.wowClass = (c.event.target as HTMLSelectElement).value;
                  }}"
                >
                  <option value="" ?selected="${(x) => !x.wowClass}">All classes</option>
                  ${repeat(
                    (x) => x.classes,
                    html<
                      string,
                      Page
                    >`<option value="${(c) => c}" ?selected="${(c, ctx) => ctx.parent.wowClass === c}">${(c) => c}</option>`,
                  )}
                </select>
              </label>
              <label>
                <span>Profession ${CRAFT_MIN}+</span>
                <select
                  @change="${(x, c) => {
                    x.profession = (c.event.target as HTMLSelectElement).value;
                  }}"
                >
                  <option value="" ?selected="${(x) => !x.profession}">All professions</option>
                  ${repeat(
                    (x) => x.professions,
                    html<
                      string,
                      Page
                    >`<option value="${(p) => p}" ?selected="${(p, ctx) => ctx.parent.profession === p}">${(p) => p}</option>`,
                  )}
                </select>
              </label>
              <p class="count" aria-live="polite">
                ${(x) => x.visible.length} of ${(x) => x.listed.length} characters
              </p>
            </div>
            <section aria-labelledby="raiders">
              <h2 id="raiders">Raid roster <span class="tally">${(x) => x.raiders.length}</span></h2>
              ${rosterTable((x) => x.raiders, 'Raid roster')}
              <h3 id="flex">Flex raiders <span class="tally">${(x) => x.flex.length}</span></h3>
              ${rosterTable((x) => x.flex, 'Flex raiders')}
              <h3 id="recruits">Recruits <span class="tally">${(x) => x.recruits.length}</span></h3>
              ${rosterTable((x) => x.recruits, 'Recruits')}
            </section>
            <section aria-labelledby="others">
              <h2 id="others">Members &amp; alts <span class="tally">${(x) => x.others.length}</span></h2>
              ${rosterTable((x) => x.others, 'Members and alts')}
              <p class="muted note">Characters under level ${MIN_LEVEL} aren't listed.</p>
            </section>
          `,
    )}
  </div>
`;

const styles = css`
  .page.wide {
    max-inline-size: 72rem;
  }

  /* Discord names are for recruits and up; visitors and members don't get the column. */
  .no-discord [data-label='Discord'] {
    display: none;
  }

  h3 {
    margin: var(--space-md) 0 0;
    font-family: var(--font-family-display);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  .tally {
    margin-inline-start: 0.35rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-regular);
    color: var(--color-text-secondary);
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

  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
    gap: var(--space-md);
  }

  .card {
    display: grid;
    align-content: start;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    background: var(--color-surface-raised);
  }

  h2.card-title {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .stats {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .stat {
    display: grid;
    grid-template-columns: 1.15rem 7.5rem 1fr 2rem;
    align-items: center;
    gap: 0.5rem;
    inline-size: 100%;
    min-block-size: 1.75rem;
    padding: 0.15rem 0.35rem;
    border: 0;
    border-radius: 0.25rem;
    background: none;
    color: var(--color-text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: start;
    cursor: pointer;
  }

  .stat:hover,
  .stat:focus-visible {
    background: var(--color-surface-sunken);
  }

  .stat:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
  }

  .stat-icon {
    inline-size: 1.15rem;
    block-size: 1.15rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.2rem;
  }

  .stat-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One series, one color; the bar grows from the left with a rounded data end. */
  .stat-bar {
    display: block;
    min-inline-size: 2px;
    block-size: 0.6rem;
    border-radius: 0 4px 4px 0;
    background: var(--color-accent-secondary);
  }

  .stat-count {
    justify-self: end;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  /* A picked bar stays; the rest step back. */
  .has-pick .stat[aria-pressed='false'] {
    opacity: 0.45;
  }

  .stat[aria-pressed='true'] .stat-name {
    font-weight: var(--font-weight-bold);
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
    min-inline-size: 11rem;
    padding: 0.45rem 0.6rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font: inherit;
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    letter-spacing: normal;
    text-transform: none;
  }

  .controls input:focus-visible,
  .controls select:focus-visible,
  .sort:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .count {
    margin-inline-start: auto;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .table-wrap {
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    background: var(--color-surface-raised);
    overflow: hidden;
  }

  table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th {
    padding: var(--space-xs) var(--space-sm);
    border-block-end: var(--border-width-thin) solid var(--color-border-strong);
    text-align: start;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .sort {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    white-space: nowrap;
    cursor: pointer;
  }

  th[aria-sort='ascending'] .sort {
    color: var(--color-text-primary);
  }

  td {
    padding: var(--space-xs) var(--space-sm);
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    vertical-align: middle;
  }

  tbody tr:last-child td {
    border-block-end: 0;
  }

  tbody tr:hover {
    background: var(--color-surface-sunken);
  }

  .num {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  td small {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .who {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-inline-size: 13rem;
  }

  .portrait {
    flex: none;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.3rem;
    object-fit: cover;
  }

  .portrait.blank {
    display: grid;
    place-items: center;
    background: var(--color-surface-sunken);
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-secondary);
  }

  .names {
    display: grid;
  }

  .name {
    font-weight: var(--font-weight-bold);
    text-decoration: none;
    color: var(--color-text-primary);
  }

  a.name:hover {
    text-decoration: underline;
  }

  .new-tab {
    margin-inline-start: 0.3rem;
    vertical-align: baseline;
    opacity: 0.6;
  }

  a.name:hover .new-tab,
  a.name:focus-visible .new-tab {
    opacity: 1;
  }

  .spec {
    font-weight: var(--font-weight-medium);
  }

  .profs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .prof-link {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 0.3rem;
    align-items: center;
    color: inherit;
    text-decoration: none;
    border-radius: 0.2rem;
  }

  .prof-link:hover .prof-icon,
  .prof-link:focus-visible .prof-icon {
    border-color: var(--color-accent-primary);
  }

  .prof-link:hover .prof-level {
    color: var(--color-text-accent);
  }

  .prof-link:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .prof-icon {
    inline-size: 1.25rem;
    block-size: 1.25rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.2rem;
  }

  .prof-level {
    min-inline-size: 1.6rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
  }

  /* Secondaries: smaller and dimmer, set off from the primaries by a rule. */
  .prof.minor .prof-icon {
    inline-size: 1rem;
    block-size: 1rem;
    opacity: 0.8;
  }

  .prof.minor .prof-level {
    min-inline-size: 0;
    color: var(--color-text-secondary);
  }

  .prof:not(.minor) + .prof.minor {
    padding-inline-start: 0.6rem;
    border-inline-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .bar {
    grid-column: 1 / -1;
    block-size: 0.15rem;
    margin-block-start: 0.15rem;
    border-radius: 0.1rem;
    background: var(--color-surface-sunken);
    overflow: hidden;
  }

  .bar > span {
    display: block;
    block-size: 100%;
    background: var(--color-accent-secondary);
  }

  .rank {
    white-space: nowrap;
  }

  .note {
    margin-block-start: var(--space-xs);
    font-size: var(--font-size-sm);
  }

  .empty {
    padding: var(--space-md);
  }

  /* Phones: each character becomes a card, cells labelled. */
  @media (max-width: 44rem) {
    .count {
      margin-inline-start: 0;
    }

    thead {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    table,
    tbody,
    tr,
    td {
      display: block;
    }

    tr {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-xs) var(--space-sm);
      padding: var(--space-sm);
      border-block-end: var(--border-width-thin) solid var(--color-border-default);
    }

    td {
      padding: 0;
      border: 0;
    }

    td[data-label='Character'] {
      grid-column: 1;
    }

    td[data-label='Level']::before {
      content: 'Lv ';
      color: var(--color-text-secondary);
    }

    td[data-label='Discord'],
    td[data-label='Spec'],
    td[data-label='Professions'] {
      grid-column: 1 / -1;
    }

    td[data-label='Discord']::before {
      content: 'Discord: ';
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    td[data-label='Discord'] small {
      display: inline;
    }

    td[data-label='Rank'] {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    td[data-label='Level'] {
      grid-column: 2;
      grid-row: 1;
      align-self: end;
    }
  }
`;

/** `/roster`: every character in the in-game guild, from `armory-guild-roster`. Open to all. */
export class Page extends FASTElement {
  @observable entries: RosterListing[] = [];
  @observable loaded = false;
  @observable error = '';
  @observable query = '';
  /** A rank index as text, or '' for every rank. */
  @observable rank = '';
  /** A class name, or '' for any. Not `className`: that's the element's class attribute. */
  @observable wowClass = '';
  /** A profession name, held at CRAFT_MIN or higher, or '' for any. */
  @observable profession = '';
  @observable sort: SortKey = 'rank';

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  /** Discord display names by member id (`member-list`), for the roster's Discord column. */
  @observable members: Record<string, string> = {};
  /** Whether the Discord column shows: `member-list` answered (recruits and up). */
  @observable showDiscord = false;

  discordName(e: RosterListing): string | null {
    return e.memberId ? (this.members[e.memberId] ?? null) : null;
  }

  async load(): Promise<void> {
    const client = getCommandClient();
    const [result, members] = await Promise.all([
      client.read<RosterListing[]>('armory-guild-roster', {}),
      // Visitors can't read the member list; don't ask.
      currentSession()
        ? client.read<{ id: string; displayName: string }[]>('member-list', {})
        : Promise.resolve(null),
    ]);
    if (members?.success && members.data) {
      this.members = Object.fromEntries(members.data.map((m) => [m.id, m.displayName]));
      this.showDiscord = true;
    }
    if (result.success && result.data) {
      this.entries = result.data;
      this.error = '';
    } else {
      this.error = result.error?.message ?? 'Could not read the roster.';
    }
    this.loaded = true;
  }

  sortBy(key: SortKey): void {
    this.sort = key;
  }

  /** Everyone the roster shows: level 10 and up. */
  get listed(): RosterListing[] {
    return this.entries.filter((e) => e.level >= MIN_LEVEL);
  }

  get ranks(): number[] {
    return [...new Set(this.listed.map((e) => e.guildRank))].sort((a, b) => a - b);
  }

  get classes(): string[] {
    return [...new Set(this.listed.flatMap((e) => (e.className ? [e.className] : [])))].sort();
  }

  /** Professions someone listed holds at CRAFT_MIN or higher, for the filter. */
  get professions(): string[] {
    return [
      ...new Set(
        this.listed.flatMap((e) =>
          e.professions.filter((p) => p.level >= CRAFT_MIN).map((p) => p.name),
        ),
      ),
    ].sort();
  }

  /** The raid roster's characters by class. */
  get classStats(): Stat[] {
    const raid = this.listed.filter((e) => RAID_RANKS.has(e.guildRank) && e.className);
    return toStats(
      raid.map((e) => e.className ?? ''),
      (name) => classIcon(name, 'medium'),
    );
  }

  /** Listed characters by primary profession held at CRAFT_MIN or higher. */
  get professionStats(): Stat[] {
    const names = this.listed.flatMap((e) =>
      primaries(e)
        .filter((p) => p.level >= CRAFT_MIN)
        .map((p) => p.name),
    );
    return toStats(names, (name) => professionIcon(name, 'medium'));
  }

  /** A card's bar sets its filter, or clears it when already set. */
  pick(key: StatKey, name: string): void {
    this[key] = this[key] === name ? '' : name;
  }

  get visible(): RosterListing[] {
    const q = this.query.trim().toLowerCase();
    const rank = this.rank === '' ? null : Number(this.rank);
    const filtered = this.listed.filter(
      (e) =>
        (rank === null || e.guildRank === rank) &&
        (!this.wowClass || e.className === this.wowClass) &&
        (!this.profession ||
          e.professions.some((p) => p.name === this.profession && p.level >= CRAFT_MIN)) &&
        (!q || `${e.name} ${e.surname} ${this.discordName(e) ?? ''}`.toLowerCase().includes(q)),
    );
    const byName = (a: RosterListing, b: RosterListing) => a.name.localeCompare(b.name);
    const compare: Record<SortKey, (a: RosterListing, b: RosterListing) => number> = {
      rank: (a, b) => a.guildRank - b.guildRank || b.level - a.level || byName(a, b),
      name: byName,
      level: (a, b) => b.level - a.level || byName(a, b),
    };
    return filtered.sort(compare[this.sort]);
  }

  get raiders(): RosterListing[] {
    return this.visible.filter((e) => RAID_RANKS.has(e.guildRank));
  }

  get flex(): RosterListing[] {
    return this.visible.filter((e) => e.guildRank === FLEX_RANK);
  }

  get recruits(): RosterListing[] {
    return this.visible.filter((e) => e.guildRank === RECRUIT_RANK);
  }

  get others(): RosterListing[] {
    return this.visible.filter(
      (e) =>
        !RAID_RANKS.has(e.guildRank) && e.guildRank !== FLEX_RANK && e.guildRank !== RECRUIT_RANK,
    );
  }
}

await Page.define({
  name: 'vintage-roster-page',
  template,
  styles: [pageStyles, styles],
});
