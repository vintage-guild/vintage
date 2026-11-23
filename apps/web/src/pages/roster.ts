import {
  css,
  type ExecutionContext,
  FASTElement,
  html,
  observable,
  repeat,
  when,
} from '@lushly-dev/fast-element';
import {
  ROSTER_ROLES,
  type RosterListing,
  type RosterProfession,
  type RosterRole,
} from '@vintage/armory/contract';
import { getCommandClient } from '@vintage/ui-kit';
import { classRoles, isWowClass, type WowClass } from '@vintage/wow-data';
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
const POOL_RANKS: ReadonlySet<number> = new Set([0, 1, 3, FLEX_RANK, RECRUIT_RANK]);

/** Blizzard's armory hides characters below this level, so the roster leaves them out. */
const MIN_LEVEL = 10;

/** Canonical display order for the nine launch-era classes in the composition chart. */
const CLASS_ORDER: readonly { name: string; slug: WowClass }[] = [
  { name: 'Warrior', slug: 'warrior' },
  { name: 'Paladin', slug: 'paladin' },
  { name: 'Hunter', slug: 'hunter' },
  { name: 'Rogue', slug: 'rogue' },
  { name: 'Priest', slug: 'priest' },
  { name: 'Shaman', slug: 'shaman' },
  { name: 'Mage', slug: 'mage' },
  { name: 'Warlock', slug: 'warlock' },
  { name: 'Druid', slug: 'druid' },
];

const ROLE_META: Record<RosterRole, { label: string; token: string }> = {
  tank: { label: 'Tank', token: '--color-role-tank' },
  healer: { label: 'Healer', token: '--color-role-healer' },
  melee: { label: 'Melee', token: '--color-role-melee' },
  ranged: { label: 'Ranged', token: '--color-role-ranged' },
};

const isRosterRole = (value: string): value is RosterRole =>
  (ROSTER_ROLES as readonly string[]).includes(value);

type CompScope = 'raid' | 'pool';

interface ClassColumn {
  name: string;
  slug: string;
  count: number;
  pct: number;
  icon: string;
  color: string;
  detail: string;
  filterable: boolean;
}

interface RoleColumn {
  role: RosterRole;
  label: string;
  count: number;
  secondaryCount: number;
  pct: number;
  share: number;
  color: string;
  detail: string;
}

interface ChartScale {
  max: number;
  ticks: number[];
}

/** Clean integer Y-axis ceiling and evenly spaced gridline ticks. */
function chartScale(maxVal: number): ChartScale {
  if (maxVal <= 4) return { max: 4, ticks: [4, 2, 0] };
  if (maxVal <= 6) return { max: 6, ticks: [6, 4, 2, 0] };
  if (maxVal <= 8) return { max: 8, ticks: [8, 6, 4, 2, 0] };
  if (maxVal <= 12) return { max: 12, ticks: [12, 9, 6, 3, 0] };
  const step = maxVal <= 20 ? 5 : 10;
  const max = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = max; v >= 0; v -= step) ticks.push(v);
  return { max, ticks };
}

/** Format a compact `"2 Protection, 1 Fury"` breakdown for chart hover tooltips. */
function formatBreakdown(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');
}

type SortKey = 'rank' | 'name' | 'level';

const percent = (p: RosterProfession) =>
  p.maxLevel ? Math.min(100, Math.round((p.level / p.maxLevel) * 100)) : 100;

const classSlug = (e: RosterListing) => e.className?.toLowerCase().replace(/[^a-z]/g, '') ?? '';

/** The character's name in game: Forever names are first name and surname. */
const inGameName = (e: RosterListing) => (e.surname ? `${e.name} ${e.surname}` : e.name);

/** "Opens in a new tab": an arrow leaving a box, in the link's own color. */
const newTab = html`<svg class="new-tab" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Down-chevron for native selects and collapsible drawers. */
const chevron = (cls: string) =>
  html`<svg class="${cls}" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

/** The roles a roster character's class can play; every role while its class is unknown. */
function playableRoles(e: RosterListing): readonly RosterRole[] {
  const key = e.className?.toLowerCase().replace(/\s+/g, '') ?? '';
  return isWowClass(key) ? classRoles(key) : ROSTER_ROLES;
}

/** The page, from inside the role editor's repeat of roles. */
const editorPage = (c: ExecutionContext) => c.parentContext.parent as unknown as Page;

const alsoOption = html<RosterRole>`
  <label class="also-option">
    <input
      type="checkbox"
      :checked="${(r, c) => editorPage(c).editAlso.includes(r)}"
      ?disabled="${(_r, c) => editorPage(c).savingRole}"
      @change="${(r, c) => {
        editorPage(c).toggleEditAlso(r, (c.event.target as HTMLInputElement).checked);
      }}"
    />
    <span>${(r) => ROLE_META[r].label}</span>
  </label>
`;

const roleEditor = html<RosterListing, Page>`
  <div class="role-editor">
    <label class="role-field">
      <span>Main</span>
      <span class="select-wrap compact">
        <select
          aria-label="Main raid role"
          :value="${(_e, c) => c.parent.editRole}"
          ?disabled="${(_e, c) => c.parent.savingRole}"
          @change="${(_e, c) => {
            c.parent.setEditRole((c.event.target as HTMLSelectElement).value);
          }}"
        >
          ${when((e) => !e.characterId, html`<option value="">Not set</option>`)}
          ${repeat(
            () => ROSTER_ROLES,
            html<
              RosterRole,
              Page
            >`<option value="${(r) => r}" ?selected="${(r, ctx) => ctx.parent.editRole === r}">${(r) => ROLE_META[r].label}</option>`,
          )}
        </select>
        ${chevron('select-icon')}
      </span>
    </label>
    ${when(
      (e, c) => c.parent.alsoChoices(e).length > 0,
      html<RosterListing, Page>`<fieldset class="role-field also-field">
        <legend>Also plays</legend>
        ${repeat((e, c) => c.parent.alsoChoices(e), alsoOption)}
      </fieldset>`,
    )}
    <div class="role-actions">
      <button
        type="button"
        class="role-save"
        ?disabled="${(_e, c) => c.parent.savingRole}"
        @click="${(e, c) => c.parent.saveRole(e)}"
      >${(_e, c) => (c.parent.savingRole ? 'Saving…' : 'Save')}</button>
      <button
        type="button"
        class="role-cancel"
        ?disabled="${(_e, c) => c.parent.savingRole}"
        @click="${(_e, c) => c.parent.cancelRoleEdit()}"
      >Cancel</button>
    </div>
    ${when(
      (_e, c) => Boolean(c.parent.roleEditError),
      html<
        RosterListing,
        Page
      >`<small class="error" role="alert">${(_e, c) => c.parent.roleEditError}</small>`,
    )}
  </div>
`;

const roleView = html<RosterListing, Page>`
  <div class="role-view">
    <div class="role-tags">
      ${when(
        (e) => Boolean(e.preferredRole),
        html<RosterListing>`<span class="role-pill">
          <span class="role-dot" style="background: var(${(e) => ROLE_META[e.preferredRole!].token})" aria-hidden="true"></span>
          <span>${(e) => ROLE_META[e.preferredRole!].label}</span>
        </span>`,
      )}
      ${when((e) => !e.preferredRole, html`<small class="muted">Not set</small>`)}
      ${when(
        (e) => e.alsoRoles.length > 0,
        html<RosterListing>`<small class="muted">Also ${(e) => e.alsoRoles.map((r) => ROLE_META[r].label).join(', ')}</small>`,
      )}
    </div>
    ${when(
      (e, c) => c.parent.canEditRole(e),
      html<RosterListing, Page>`<button
        type="button"
        class="role-edit-btn"
        aria-label="${(e) => `Edit raid role for ${inGameName(e)}`}"
        @click="${(e, c) => c.parent.startRoleEdit(e)}"
      >${(e) => (e.preferredRole ? 'Edit' : 'Set')}</button>`,
    )}
  </div>
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
    <td data-label="Role">
      ${when((e, c) => c.parent.editingSlug === e.slug, roleEditor)}
      ${when((e, c) => c.parent.editingSlug !== e.slug, roleView)}
    </td>
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
          <th scope="col">Role</th>
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

const compDrawer = html<Page>`
  <section class="comp-drawer ${(x) => (x.compOpen ? 'open' : '')}" aria-labelledby="comp-heading">
    <button
      type="button"
      class="comp-toggle"
      aria-expanded="${(x) => String(x.compOpen)}"
      aria-controls="comp-panel"
      @click="${(x) => x.toggleComp()}"
    >
      <span class="comp-toggle-title">
        <span id="comp-heading" class="card-title">Raid composition</span>
        <span class="comp-total-pill">${(x) => x.compPool.length} ${(x) => (x.compScope === 'raid' ? 'raiders' : 'in pool')}</span>
      </span>
      <span class="comp-mini" aria-hidden="true">
        ${repeat(
          (x) => x.compRoleColumns,
          html<RoleColumn>`<span class="mini-role">
            <span class="role-dot" style="background: ${(r) => r.color}"></span>
            <span>${(r) => r.count}</span>
            <span class="mini-role-label">${(r) => r.label}</span>
          </span>`,
        )}
        ${when(
          (x) => x.compUnsetCount > 0,
          html<Page>`<span class="mini-role mini-unset">${(x) => x.compUnsetCount} unset</span>`,
        )}
      </span>
      <span class="comp-toggle-action">
        <span>${(x) => (x.compOpen ? 'Hide charts' : 'Show charts')}</span>
        ${chevron('drawer-chevron')}
      </span>
    </button>
    <div id="comp-panel" class="comp-collapse" ?inert="${(x) => !x.compOpen}">
      <div class="comp-collapse-inner">
        <div class="comp-body">
          <div class="comp-summary">
            <div class="kpi">
              <span class="kpi-label">${(x) => (x.compScope === 'raid' ? 'Total raiders' : 'Raid + flex & recruits')}</span>
              <div class="kpi-row">
                <strong class="kpi-value">${(x) => x.compPool.length}</strong>
                <span class="kpi-meta">${(x) => x.compMeta}</span>
              </div>
            </div>
            <div class="scope-tabs" role="group" aria-label="Composition scope">
              <button
                type="button"
                class="scope-btn"
                aria-pressed="${(x) => String(x.compScope === 'raid')}"
                @click="${(x) => x.setCompScope('raid')}"
              >Raid roster <span class="scope-num">${(x) => x.raidPool.length}</span></button>
              <button
                type="button"
                class="scope-btn"
                aria-pressed="${(x) => String(x.compScope === 'pool')}"
                @click="${(x) => x.setCompScope('pool')}"
              >+ Flex &amp; recruits <span class="scope-num">${(x) => x.fullRaidPool.length}</span></button>
            </div>
          </div>
          ${when(
            (x) => x.compAssignedCount > 0,
            html<Page>`
              <div class="share-bar" role="img" aria-label="${(x) => x.roleShareLabel}">
                ${repeat(
                  (x: Page) => x.compRoleColumns.filter((r) => r.count > 0),
                  html<RoleColumn>`<span
                    class="share-seg"
                    style="inline-size: ${(r) => r.share}%; background: ${(r) => r.color}"
                    title="${(r) => `${r.label}: ${r.count} (${Math.round(r.share)}%)`}"
                  ></span>`,
                )}
              </div>
            `,
          )}
          <div class="comp-charts">
            <div class="chart-card">
              <div class="chart-head">
                <h3 class="card-title">Raiders by class</h3>
                <span class="chart-hint">Click a bar to filter</span>
              </div>
              <div class="vchart class-chart ${(x) => (x.wowClass ? 'has-pick' : '')}">
                <div class="y-axis" aria-hidden="true">
                  ${repeat((x) => x.classChartScale.ticks, html<number>`<span>${(t) => t}</span>`)}
                </div>
                <div class="plot-area">
                  <div class="gridlines" aria-hidden="true">
                    ${repeat((x) => x.classChartScale.ticks, html`<span class="gridline"></span>`)}
                  </div>
                  <div class="columns">
                    ${repeat(
                      (x) => x.compClassColumns,
                      html<ClassColumn, Page>`<button
                        type="button"
                        class="col-btn ${(c) => (c.count === 0 ? 'zero' : '')}"
                        ?disabled="${(c) => !c.filterable}"
                        aria-pressed="${(c, ctx) => String(ctx.parent.wowClass === c.name)}"
                        aria-label="${(c) => `${c.name}: ${c.count} ${c.count === 1 ? 'raider' : 'raiders'}${c.detail ? ` (${c.detail})` : ''}`}"
                        title="${(c) => `${c.name}: ${c.count}${c.detail ? ` — ${c.detail}` : ''}`}"
                        @click="${(c, ctx) => c.filterable && ctx.parent.pickClass(c.name)}"
                      >
                        <span class="col-slot">
                          <span
                            class="col-bar"
                            style="block-size: ${(c) => c.pct}%; background: ${(c) => c.color}"
                          >
                            <span class="col-val">${(c) => c.count}</span>
                          </span>
                        </span>
                        <span class="col-x">
                          ${when((c) => c.icon, html<ClassColumn>`<img class="col-icon" src="${(c) => c.icon}" alt="" loading="lazy" />`)}
                          <span class="col-label">${(c) => c.name}</span>
                        </span>
                      </button>`,
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div class="chart-card">
              <div class="chart-head">
                <h3 class="card-title">Raiders by role</h3>
                <span class="chart-hint">${(x) => x.roleChartHint}</span>
              </div>
              <div class="vchart role-chart ${(x) => (x.role ? 'has-pick' : '')}">
                <div class="y-axis" aria-hidden="true">
                  ${repeat((x) => x.roleChartScale.ticks, html<number>`<span>${(t) => t}</span>`)}
                </div>
                <div class="plot-area">
                  <div class="gridlines" aria-hidden="true">
                    ${repeat((x) => x.roleChartScale.ticks, html`<span class="gridline"></span>`)}
                  </div>
                  <div class="columns">
                    ${repeat(
                      (x) => x.compRoleColumns,
                      html<RoleColumn, Page>`<button
                        type="button"
                        class="col-btn ${(r) => (r.count === 0 ? 'zero' : '')}"
                        aria-pressed="${(r, ctx) => String(ctx.parent.role === r.role)}"
                        aria-label="${(r) => `${r.label}: ${r.count}${r.count > 0 ? ` (${Math.round(r.share)}%)` : ''}${r.secondaryCount > 0 ? `, +${r.secondaryCount} flex` : ''}${r.detail ? ` — ${r.detail}` : ''}`}"
                        title="${(r) => `${r.label}: ${r.count}${r.count > 0 ? ` (${Math.round(r.share)}%)` : ''}${r.secondaryCount > 0 ? ` · +${r.secondaryCount} secondary` : ''}${r.detail ? ` — ${r.detail}` : ''}`}"
                        @click="${(r, ctx) => ctx.parent.pickRole(r.role)}"
                      >
                        <span class="col-slot">
                          <span
                            class="col-bar"
                            style="block-size: ${(r) => r.pct}%; background: ${(r) => r.color}"
                          >
                            <span class="col-val">${(r) => r.count}<small class="col-pct">${(r) => (r.count > 0 ? ` ${Math.round(r.share)}%` : '')}</small></span>
                          </span>
                        </span>
                        <span class="col-x role-col-x">
                          <span class="role-x-main">
                            <span class="role-dot" style="background: ${(r) => r.color}" aria-hidden="true"></span>
                            <span class="col-label">${(r) => r.label}</span>
                          </span>
                          ${when(
                            (r) => r.secondaryCount > 0,
                            html<RoleColumn>`<span class="role-flex">+${(r) => r.secondaryCount} flex</span>`,
                          )}
                        </span>
                      </button>`,
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
`;

const template = html<Page>`
  <div class="page wide">
    <header class="head">
      <h1>Roster</h1>
      ${when(
        (x) => x.showDiscord,
        html`<p class="muted">
          Link your characters on <a href="/characters">Characters</a> to show your Discord name.
        </p>`,
      )}
    </header>
    ${when((x) => !x.loaded, html`<p class="muted">Loading the roster…</p>`)}
    ${when((x) => x.error, html<Page>`<p class="error" role="alert">${(x) => x.error}</p>`)}
    ${when(
      (x) => x.loaded && !x.error,
      html<Page>`
            ${compDrawer}
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
                <span class="select-wrap">
                  <select
                    :value="${(x) => x.rank}"
                    @change="${(x, c) => {
                      x.rank = (c.event.target as HTMLSelectElement).value;
                    }}"
                  >
                    <option value="" ?selected="${(x) => !x.rank}">All ranks</option>
                    ${repeat(
                      (x) => x.ranks,
                      html<
                        number,
                        Page
                      >`<option value="${(r) => r}" ?selected="${(r, ctx) => ctx.parent.rank === String(r)}">${(r) => rankName(r)}</option>`,
                    )}
                  </select>
                  ${chevron('select-icon')}
                </span>
              </label>
              <label>
                <span>Class</span>
                <span class="select-wrap">
                  <select
                    :value="${(x) => x.wowClass}"
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
                  ${chevron('select-icon')}
                </span>
              </label>
              <label>
                <span>Role</span>
                <span class="select-wrap">
                  <select
                    :value="${(x) => x.role}"
                    @change="${(x, c) => x.setRole((c.event.target as HTMLSelectElement).value)}"
                  >
                    <option value="" ?selected="${(x) => !x.role}">All roles</option>
                    ${repeat(
                      () => ROSTER_ROLES,
                      html<
                        RosterRole,
                        Page
                      >`<option value="${(r) => r}" ?selected="${(r, ctx) => ctx.parent.role === r}">${(r) => ROLE_META[r].label}</option>`,
                    )}
                  </select>
                  ${chevron('select-icon')}
                </span>
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
  :host {
    padding-block-start: var(--space-lg);
  }

  .page.wide {
    max-inline-size: 72rem;
    gap: var(--space-md);
  }

  .head {
    display: grid;
    gap: var(--desk-space-xs);
  }

  section + section {
    margin-block-start: var(--space-xs);
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

  /* Fold-out raid composition drawer at the top of the page. */
  .comp-drawer {
    display: grid;
    gap: 0;
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.35rem;
    background: var(--color-surface-raised);
    overflow: hidden;
  }

  .comp-toggle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xs) var(--space-md);
    inline-size: 100%;
    padding: 0.65rem var(--space-md);
    border: 0;
    background: none;
    color: var(--color-text-primary);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .comp-toggle:hover {
    background: var(--color-surface-sunken);
  }

  .comp-toggle-title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .comp-total-pill {
    padding: 0.1rem 0.5rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 999px;
    background: var(--color-surface-sunken);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .comp-mini {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem var(--space-sm);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .mini-role {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .mini-role-label,
  .mini-unset {
    color: var(--color-text-secondary);
  }

  .role-dot {
    inline-size: 0.55rem;
    block-size: 0.55rem;
    border-radius: 999px;
    flex: none;
  }

  .comp-toggle-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-inline-start: auto;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .drawer-chevron {
    transition: transform 200ms var(--motion-ease-out);
  }

  .comp-drawer.open .drawer-chevron {
    transform: rotate(180deg);
  }

  .comp-collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 240ms var(--motion-ease-out);
  }

  .comp-drawer.open .comp-collapse {
    grid-template-rows: 1fr;
  }

  .comp-collapse-inner {
    overflow: hidden;
  }

  .comp-body {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md) var(--space-md);
    border-block-start: var(--border-width-thin) solid var(--color-border-default);
  }

  .comp-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--space-sm) var(--space-md);
  }

  .kpi {
    display: grid;
    gap: 0.15rem;
  }

  .kpi-label {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .kpi-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.65rem;
  }

  .kpi-value {
    font-family: var(--font-family-display);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .kpi-meta {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .scope-tabs {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.2rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.3rem;
    background: var(--color-surface-sunken);
  }

  .scope-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.65rem;
    border: 0;
    border-radius: 0.2rem;
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
  }

  .scope-btn:hover {
    color: var(--color-text-primary);
  }

  .scope-btn[aria-pressed='true'] {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-edge);
  }

  .scope-num {
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .share-bar {
    display: flex;
    block-size: 0.5rem;
    border-radius: 999px;
    background: var(--color-surface-sunken);
    overflow: hidden;
    gap: 2px;
  }

  .share-seg {
    display: block;
    block-size: 100%;
    transition: inline-size 220ms var(--motion-ease-out);
  }

  .comp-charts {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: var(--space-md);
  }

  .chart-card {
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.3rem;
    background: var(--color-surface-sunken);
  }

  .chart-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-xs);
  }

  .chart-head h3 {
    margin: 0;
  }

  .chart-hint {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .vchart {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    grid-template-rows: 10.5rem auto;
    column-gap: 0.45rem;
    padding-block-start: 1.45rem;
  }

  .y-axis {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--color-text-secondary);
    transform: translateY(-0.35em);
  }

  .plot-area {
    grid-column: 2;
    grid-row: 1 / 3;
    display: grid;
    grid-template-rows: 10.5rem auto;
    position: relative;
  }

  .gridlines {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
  }

  .gridline {
    border-block-start: 1px dashed var(--color-border-default);
  }

  .gridline:last-child {
    border-block-start: var(--border-width-thin) solid var(--color-border-strong);
  }

  .columns {
    grid-column: 1;
    grid-row: 1 / 3;
    z-index: 1;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0.35rem;
    padding-inline: 0.25rem;
  }

  .col-btn {
    display: grid;
    grid-template-rows: 10.5rem auto;
    justify-items: center;
    align-items: end;
    row-gap: 0.45rem;
    padding: 0;
    border: 0;
    border-radius: 0.25rem;
    background: none;
    color: var(--color-text-primary);
    font: inherit;
    cursor: pointer;
  }

  .col-btn:disabled {
    cursor: default;
  }

  .col-slot {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    inline-size: 100%;
    block-size: 100%;
  }

  .col-bar {
    position: relative;
    inline-size: min(100%, 2.15rem);
    border-radius: 0.25rem 0.25rem 0 0;
    box-shadow: var(--shadow-edge);
    transition:
      block-size 220ms var(--motion-ease-out),
      opacity 150ms ease,
      filter 150ms ease;
  }

  .role-chart .col-bar {
    inline-size: min(100%, 3.5rem);
  }

  .col-val {
    position: absolute;
    inset-block-end: calc(100% + 0.25rem);
    inset-inline-start: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .col-pct {
    font-size: 0.7rem;
    font-weight: var(--font-weight-regular);
    color: var(--color-text-secondary);
  }

  .col-btn.zero .col-val,
  .col-btn.zero .col-label {
    color: var(--color-text-secondary);
    opacity: 0.65;
  }

  .col-btn.zero .col-icon {
    opacity: 0.45;
  }

  .col-x {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    max-inline-size: 100%;
  }

  .role-col-x {
    gap: 0.1rem;
  }

  .role-x-main {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .role-flex {
    font-family: var(--font-family-mono);
    font-size: 0.68rem;
    color: var(--color-text-secondary);
  }

  .col-icon {
    inline-size: 1.15rem;
    block-size: 1.15rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.2rem;
  }

  .col-label {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-family-sans);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .col-btn:hover:not(:disabled) .col-bar {
    filter: brightness(1.12);
  }

  .col-btn:hover:not(:disabled) .col-label,
  .col-btn[aria-pressed='true'] .col-label {
    color: var(--color-text-primary);
  }

  .col-btn[aria-pressed='true'] .col-label {
    font-weight: var(--font-weight-bold);
  }

  .vchart.has-pick .col-btn[aria-pressed='false'] {
    opacity: 0.38;
  }

  .comp-toggle:focus-visible,
  .scope-btn:focus-visible,
  .col-btn:focus-visible,
  .role-edit-btn:focus-visible,
  .role-save:focus-visible,
  .role-cancel:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .card-title {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-xs) var(--space-sm);
  }

  .controls label {
    display: grid;
    gap: 0.25rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .select-wrap {
    position: relative;
    display: grid;
    align-items: center;
  }

  .controls input,
  .controls select,
  .role-editor select {
    box-sizing: border-box;
    min-inline-size: 11rem;
    max-inline-size: 100%;
    padding: 0.45rem 0.75rem;
    border: var(--border-width-thin) solid var(--color-border-strong);
    border-radius: 0.25rem;
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
    font: inherit;
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    line-height: var(--font-leading-normal);
    letter-spacing: normal;
    text-transform: none;
  }

  .controls input {
    min-inline-size: 15rem;
  }

  .controls select,
  .role-editor select {
    inline-size: 100%;
    appearance: none;
    padding-inline-end: 2.25rem;
    cursor: pointer;
  }

  .controls select option,
  .role-editor select option {
    background: var(--color-surface-raised);
    color: var(--color-text-primary);
  }

  .select-icon {
    position: absolute;
    inset-inline-end: 0.75rem;
    pointer-events: none;
    color: var(--color-text-secondary);
  }

  .select-wrap.compact select {
    min-inline-size: 7.5rem;
    padding: 0.25rem 1.85rem 0.25rem 0.5rem;
    font-size: var(--font-size-xs);
  }

  .select-wrap.compact .select-icon {
    inset-inline-end: 0.5rem;
  }

  .controls input:hover,
  .controls select:hover,
  .role-editor select:hover {
    border-color: var(--color-text-secondary);
  }

  .select-wrap:hover .select-icon,
  .controls select:focus-visible + .select-icon,
  .role-editor select:focus-visible + .select-icon {
    color: var(--color-text-primary);
  }

  .controls input:focus-visible,
  .controls select:focus-visible,
  .role-editor select:focus-visible,
  .sort:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: var(--border-width-thin);
  }

  .count {
    margin-inline-start: auto;
    padding-block: 0.45rem;
    font-size: var(--font-size-sm);
    line-height: var(--font-leading-normal);
    color: var(--color-text-secondary);
  }

  /* Inline raid role display & compact editor in the Role column. */
  .role-view {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    min-inline-size: 6.5rem;
  }

  .role-tags {
    display: grid;
    gap: 0.1rem;
  }

  .role-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .role-edit-btn {
    padding: 0.12rem 0.45rem;
    border: var(--border-width-thin) solid var(--color-border-default);
    border-radius: 0.25rem;
    background: none;
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
    opacity: 0.65;
  }

  tr:hover .role-edit-btn,
  .role-edit-btn:hover,
  .role-edit-btn:focus-visible {
    opacity: 1;
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  .role-editor {
    display: grid;
    gap: 0.35rem;
    min-inline-size: 9.5rem;
  }

  .role-field {
    display: grid;
    gap: 0.15rem;
    font-family: var(--font-family-mono);
    font-size: 0.68rem;
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }

  .also-field {
    border: 0;
    margin: 0;
    padding: 0;
    min-inline-size: 0;
  }

  .also-field legend {
    padding: 0;
  }

  .also-option {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-end: 0.5rem;
    font-family: var(--font-family-sans);
    font-size: 0.8rem;
    letter-spacing: normal;
    text-transform: none;
    color: var(--color-text-primary);
  }

  .role-actions {
    display: flex;
    gap: 0.35rem;
  }

  .role-save,
  .role-cancel {
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    cursor: pointer;
  }

  .role-save {
    border: var(--border-width-thin) solid transparent;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-weight: var(--font-weight-bold);
  }

  .role-cancel {
    border: var(--border-width-thin) solid var(--color-border-strong);
    background: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }

  .role-save:disabled,
  .role-cancel:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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
    min-inline-size: 12rem;
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
    text-decoration: none;
    color: inherit;
    border-radius: 0.25rem;
  }

  .prof-link:hover .prof-icon {
    border-color: var(--color-accent-secondary);
  }

  .prof-link:hover .prof-level {
    color: var(--color-text-accent);
  }

  .prof-link:focus-visible {
    outline: var(--border-width-thin) solid var(--color-focus-ring);
    outline-offset: 2px;
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

  @media (prefers-reduced-motion: reduce) {
    .drawer-chevron,
    .comp-collapse,
    .share-seg,
    .col-bar {
      transition: none;
    }
  }

  @media (max-width: 58rem) {
    .comp-charts {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* Phones: each character becomes a card, cells labelled. */
  @media (max-width: 44rem) {
    .comp-mini {
      display: none;
    }

    .class-chart .col-label {
      font-size: 0.65rem;
    }

    .controls label {
      flex: 1 1 10rem;
    }

    .controls input {
      min-inline-size: 0;
      inline-size: 100%;
    }

    .count {
      margin-inline-start: 0;
      padding-block: 0;
    }

    .role-edit-btn {
      opacity: 1;
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
    td[data-label='Role'],
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
  /** An active role filter from the composition chart, or '' for any. */
  @observable role: RosterRole | '' = '';
  @observable sort: SortKey = 'rank';
  /** Whether the top raid composition charts drawer is folded open. */
  @observable compOpen = false;
  /** Whether the composition charts count core raiders only or include flex & recruits. */
  @observable compScope: CompScope = 'raid';
  /** Inline role editor state: slug of the row being edited, or '' when closed. */
  @observable editingSlug = '';
  @observable editRole: RosterRole | '' = '';
  /** The other roles being edited, in `ROSTER_ROLES` order. */
  @observable editAlso: RosterRole[] = [];
  @observable savingRole = false;
  @observable roleEditError = '';

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

  /** Officers can edit any character's role; signed-in members can edit their own linked one. */
  canEditRole(e: RosterListing): boolean {
    const session = currentSession();
    if (!session) return false;
    if (session.tier === 'officer') return true;
    return Boolean(e.characterId && e.memberId && e.memberId === session.memberId);
  }

  startRoleEdit(e: RosterListing): void {
    this.editingSlug = e.slug;
    this.editRole = e.preferredRole ?? (e.characterId ? 'melee' : '');
    this.editAlso = e.alsoRoles.filter((r) => playableRoles(e).includes(r));
    this.roleEditError = '';
  }

  cancelRoleEdit(): void {
    this.editingSlug = '';
    this.roleEditError = '';
  }

  setEditRole(value: string): void {
    this.editRole = isRosterRole(value) ? value : '';
    this.editAlso = this.editRole ? this.editAlso.filter((r) => r !== this.editRole) : [];
  }

  /**
   * The other roles the editor offers for a row: its class's roles besides the main one. Empty
   * (no control) for a class with one role, or before a main role is picked.
   */
  alsoChoices(e: RosterListing): RosterRole[] {
    const playable = playableRoles(e);
    if (!this.editRole || playable.length < 2) return [];
    return playable.filter((r) => r !== this.editRole);
  }

  toggleEditAlso(role: RosterRole, on: boolean): void {
    const next = new Set(this.editAlso);
    if (on) next.add(role);
    else next.delete(role);
    this.editAlso = ROSTER_ROLES.filter((r) => next.has(r));
  }

  async saveRole(entry: RosterListing): Promise<void> {
    if (this.savingRole) return;
    const preferredRole: RosterRole | null = this.editRole || null;
    const alsoRoles: RosterRole[] = preferredRole
      ? this.editAlso.filter((r) => r !== preferredRole)
      : [];
    this.savingRole = true;
    this.roleEditError = '';
    try {
      const client = getCommandClient();
      const result = entry.characterId
        ? preferredRole
          ? await client.run('character-update', {
              characterId: entry.characterId,
              role: preferredRole,
              alsoRoles,
            })
          : {
              success: false as const,
              error: { code: 'VALIDATION_ERROR', message: 'Pick a main role.' },
            }
        : await client.run('armory-guild-roster-role-set', {
            slug: entry.slug,
            preferredRole,
            alsoRoles,
          });
      if (!result.success) {
        this.roleEditError = result.error?.message ?? 'Could not save role.';
        return;
      }
      this.entries = this.entries.map((row) =>
        row.slug === entry.slug ? { ...row, preferredRole, alsoRoles } : row,
      );
      this.editingSlug = '';
    } finally {
      this.savingRole = false;
    }
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

  toggleComp(): void {
    this.compOpen = !this.compOpen;
  }

  setCompScope(scope: CompScope): void {
    this.compScope = scope;
  }

  pickRole(role: RosterRole): void {
    this.role = this.role === role ? '' : role;
  }

  /** The Role filter; anything but a role clears it. */
  setRole(value: string): void {
    this.role = isRosterRole(value) ? value : '';
  }

  sortBy(key: SortKey): void {
    this.sort = key;
  }

  /** Everyone the roster shows: level 10 and up. */
  get listed(): RosterListing[] {
    return this.entries.filter((e) => e.level >= MIN_LEVEL);
  }

  /** Core raid roster (GM, Officer, Raider) for composition charts. */
  get raidPool(): RosterListing[] {
    return this.listed.filter((e) => RAID_RANKS.has(e.guildRank));
  }

  /** Raid roster plus flex raiders and recruits for full-pool composition charts. */
  get fullRaidPool(): RosterListing[] {
    return this.listed.filter((e) => POOL_RANKS.has(e.guildRank));
  }

  /** Characters currently summarized by the composition charts. */
  get compPool(): RosterListing[] {
    return this.compScope === 'raid' ? this.raidPool : this.fullRaidPool;
  }

  /** Raiders in `compPool` who have a declared raid role (never guessed from armory spec). */
  get compAssignedCount(): number {
    return this.compPool.filter((e) => e.preferredRole !== null).length;
  }

  /** Raiders in `compPool` who have not declared a raid role yet. */
  get compUnsetCount(): number {
    return this.compPool.length - this.compAssignedCount;
  }

  get roleChartHint(): string {
    if (this.compUnsetCount > 0) {
      return `${this.compUnsetCount} not set yet`;
    }
    return 'Declared main roles';
  }

  get classChartScale(): ChartScale {
    const counts = new Map<string, number>();
    for (const e of this.compPool) {
      const key = e.className ?? 'Unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return chartScale(Math.max(0, ...counts.values()));
  }

  get compClassColumns(): ClassColumn[] {
    const byClass = new Map<string, RosterListing[]>();
    for (const e of this.compPool) {
      const key = e.className ?? '';
      const list = byClass.get(key) ?? [];
      list.push(e);
      byClass.set(key, list);
    }
    const max = this.classChartScale.max;
    const cols: ClassColumn[] = CLASS_ORDER.map(({ name, slug }) => {
      const members = byClass.get(name) ?? [];
      const count = members.length;
      return {
        name,
        slug,
        count,
        pct: (count / max) * 100,
        icon: classIcon(name, 'medium'),
        color: `var(--color-class-${slug})`,
        detail: formatBreakdown(members.map((m) => m.activeSpec ?? 'No spec')),
        filterable: count > 0,
      };
    });
    const unknown = byClass.get('') ?? [];
    if (unknown.length > 0) {
      cols.push({
        name: 'Unknown',
        slug: 'unknown',
        count: unknown.length,
        pct: (unknown.length / max) * 100,
        icon: '',
        color: 'var(--color-signup-no-response)',
        detail: `${unknown.length} unenriched`,
        filterable: false,
      });
    }
    return cols;
  }

  get roleChartScale(): ChartScale {
    const counts = new Map<RosterRole, number>();
    for (const e of this.compPool) {
      if (!e.preferredRole) continue;
      counts.set(e.preferredRole, (counts.get(e.preferredRole) ?? 0) + 1);
    }
    return chartScale(Math.max(0, ...counts.values()));
  }

  get compRoleColumns(): RoleColumn[] {
    const byMain = new Map<RosterRole, RosterListing[]>();
    const bySecondary = new Map<RosterRole, RosterListing[]>();
    for (const e of this.compPool) {
      if (e.preferredRole) {
        const list = byMain.get(e.preferredRole) ?? [];
        list.push(e);
        byMain.set(e.preferredRole, list);
      }
      for (const also of e.alsoRoles) {
        const list = bySecondary.get(also) ?? [];
        list.push(e);
        bySecondary.set(also, list);
      }
    }
    const max = this.roleChartScale.max;
    const assigned = this.compAssignedCount;
    return ROSTER_ROLES.map((role) => {
      const mainMembers = byMain.get(role) ?? [];
      const flexMembers = bySecondary.get(role) ?? [];
      const count = mainMembers.length;
      const meta = ROLE_META[role];
      const mainDetail = formatBreakdown(mainMembers.map((m) => m.className ?? 'Unknown'));
      const flexDetail = formatBreakdown(flexMembers.map((m) => m.className ?? 'Unknown'));
      const detail = [
        mainDetail ? `Main: ${mainDetail}` : '',
        flexDetail ? `Flex: ${flexDetail}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        role,
        label: meta.label,
        count,
        secondaryCount: flexMembers.length,
        pct: (count / max) * 100,
        share: assigned > 0 ? (count / assigned) * 100 : 0,
        color: `var(${meta.token})`,
        detail,
      };
    });
  }

  get compMeta(): string {
    const total = this.compPool.length;
    if (total === 0) return 'No raiders yet';
    const at60 = this.compPool.filter((e) => e.level >= 60).length;
    const melee = this.compPool.filter((e) => e.preferredRole === 'melee').length;
    const ranged = this.compPool.filter((e) => e.preferredRole === 'ranged').length;
    const dps = melee + ranged;
    const parts = [`${at60} at lv 60`];
    if (dps > 0) parts.push(`${dps} DPS (${melee} melee · ${ranged} ranged)`);
    if (this.compUnsetCount > 0) parts.push(`${this.compUnsetCount} role unset`);
    return parts.join(' · ');
  }

  get roleShareLabel(): string {
    const parts = this.compRoleColumns
      .filter((r) => r.count > 0)
      .map((r) => `${r.label} ${r.count} (${Math.round(r.share)}%)`);
    return `Declared role share: ${parts.join(', ')}`;
  }

  get ranks(): number[] {
    return [...new Set(this.listed.map((e) => e.guildRank))].sort((a, b) => a - b);
  }

  get classes(): string[] {
    return [...new Set(this.listed.flatMap((e) => (e.className ? [e.className] : [])))].sort();
  }

  /** A class bar sets the Class filter, or clears it when already set. */
  pickClass(name: string): void {
    this.wowClass = this.wowClass === name ? '' : name;
  }

  get visible(): RosterListing[] {
    const q = this.query.trim().toLowerCase();
    const rank = this.rank === '' ? null : Number(this.rank);
    const filtered = this.listed.filter(
      (e) =>
        (rank === null || e.guildRank === rank) &&
        (!this.wowClass || e.className === this.wowClass) &&
        (!this.role || e.preferredRole === this.role) &&
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
