import { css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import type { RosterListing, RosterProfession } from '@vintage/armory/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { classIcon } from '../class-icons';
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

type SortKey = 'rank' | 'name' | 'level';

const percent = (p: RosterProfession) =>
  p.maxLevel ? Math.min(100, Math.round((p.level / p.maxLevel) * 100)) : 100;

const classSlug = (e: RosterListing) => e.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';

/** The character's name in game: Forever names are first name and surname. */
const inGameName = (e: RosterListing) => (e.surname ? `${e.name} ${e.surname}` : e.name);

const profession = html<RosterProfession>`
  <li class="prof" title="${(p) => `${p.name} ${p.level}${p.maxLevel ? ` / ${p.maxLevel}` : ''}`}">
    <span class="prof-name">${(p) => p.name}</span>
    <span class="prof-level">${(p) => p.level}${(p) => (p.maxLevel ? `/${p.maxLevel}` : '')}</span>
    <span class="bar" aria-hidden="true"><span style="inline-size: ${(p) => percent(p)}%"></span></span>
  </li>
`;

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
          html<RosterListing>`<a class="name" href="${(e) => e.profileUrl ?? ''}" target="_blank" rel="noopener noreferrer" style="${(e) => (e.className ? `color: var(--color-class-${classSlug(e)})` : '')}">${(e) => inGameName(e)}<span class="visually-hidden"> (armory, opens in a new tab)</span></a>`,
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
        html<RosterListing>`<ul class="profs">${repeat((e) => e.professions, profession)}</ul>`,
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

const ariaSort = (key: SortKey) => (x: Page) => (x.sort === key ? 'ascending' : 'none');

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
    <p class="lead">
      Everyone in the guild in game, straight from the WoW: Forever armory: spec, professions,
      and a link to each character's armory page. Refreshed every half hour.${when(
        (x) => x.showDiscord,
        html` A character shows its member's Discord name once they link it on
          <a href="/characters">Characters</a>.`,
      )}
    </p>
    ${when((x) => !x.loaded, html`<p class="muted">Loading the roster…</p>`)}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when(
      (x) => x.loaded && !x.error,
      html<Page>`
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
                    x.className = (c.event.target as HTMLSelectElement).value;
                  }}"
                >
                  <option value="">All classes</option>
                  ${repeat((x) => x.classes, html<string>`<option value="${(c) => c}">${(c) => c}</option>`)}
                </select>
              </label>
              <label>
                <span>Profession</span>
                <select
                  @change="${(x, c) => {
                    x.profession = (c.event.target as HTMLSelectElement).value;
                  }}"
                >
                  <option value="">All professions</option>
                  ${repeat((x) => x.professions, html<string>`<option value="${(p) => p}">${(p) => p}</option>`)}
                </select>
              </label>
              <p class="count" aria-live="polite">
                ${(x) => x.visible.length} of ${(x) => x.listed.length} characters
              </p>
            </div>
            <section aria-labelledby="raiders">
              <h2 id="raiders">Raid roster <span class="tally">${(x) => x.raiders.length}</span></h2>
              <p class="muted">The Guild Master, officers, and raiders.</p>
              ${rosterTable((x) => x.raiders, 'Raid roster')}
              <h3 id="flex">Flex raiders <span class="tally">${(x) => x.flex.length}</span></h3>
              ${rosterTable((x) => x.flex, 'Flex raiders')}
              <h3 id="recruits">Recruits <span class="tally">${(x) => x.recruits.length}</span></h3>
              ${rosterTable((x) => x.recruits, 'Recruits')}
            </section>
            <section aria-labelledby="others">
              <h2 id="others">Members &amp; alts <span class="tally">${(x) => x.others.length}</span></h2>
              ${rosterTable((x) => x.others, 'Members and alts')}
              <p class="muted note">
                Characters under level ${MIN_LEVEL} aren't listed: the armory doesn't show them
                until they reach it.${(x) => (x.lowLevel > 0 ? ` (${x.lowLevel} in the guild now.)` : '')}
              </p>
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

  .spec {
    font-weight: var(--font-weight-medium);
  }

  .profs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.75rem;
    padding: 0;
    list-style: none;
  }

  .prof {
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 0.35rem;
    align-items: baseline;
    min-inline-size: 7.5rem;
  }

  .prof-name {
    font-size: var(--font-size-xs);
  }

  .prof-level {
    justify-self: end;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .bar {
    grid-column: 1 / -1;
    block-size: 0.2rem;
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
  @observable className = '';
  /** A profession name, or '' for any. */
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

  get lowLevel(): number {
    return this.entries.length - this.listed.length;
  }

  get ranks(): number[] {
    return [...new Set(this.listed.map((e) => e.guildRank))].sort((a, b) => a - b);
  }

  get classes(): string[] {
    return [...new Set(this.listed.flatMap((e) => (e.className ? [e.className] : [])))].sort();
  }

  get professions(): string[] {
    return [...new Set(this.listed.flatMap((e) => e.professions.map((p) => p.name)))].sort();
  }

  get visible(): RosterListing[] {
    const q = this.query.trim().toLowerCase();
    const rank = this.rank === '' ? null : Number(this.rank);
    const filtered = this.listed.filter(
      (e) =>
        (rank === null || e.guildRank === rank) &&
        (!this.className || e.className === this.className) &&
        (!this.profession || e.professions.some((p) => p.name === this.profession)) &&
        (!q || `${e.name} ${e.surname} ${this.discordName(e) ?? ''}`.toLowerCase().includes(q)),
    );
    const byName = (a: RosterListing, b: RosterListing) => a.name.localeCompare(b.name);
    const compare: Record<SortKey, (a: RosterListing, b: RosterListing) => number> = {
      rank: (a, b) => a.guildRank - b.guildRank || byName(a, b),
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
