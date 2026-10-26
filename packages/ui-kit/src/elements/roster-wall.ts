import { attr, css, FASTElement, html, observable, repeat, when } from '@lushly-dev/fast-element';
import { titleCase } from '../labels';

/** One member on the wall: a row of `member-list`. */
export interface RosterMember {
  id: string;
  displayName: string;
  rank: string | null;
  main: { name: string; class: string; spec: string; role: string } | null;
}

/** Guild ranks in display order, with their group labels. */
export const RANK_GROUPS: readonly [rank: string, label: string][] = [
  ['officer', 'Officers'],
  ['raid-leader', 'Raid leaders'],
  ['raider', 'Raiders'],
  ['flex-raider', 'Flex raiders'],
  ['recruit', 'Recruits'],
  ['member', 'Members'],
];

type Row = RosterMember & { me: boolean };

interface Group {
  rank: string;
  label: string;
  members: Row[];
}

const template = html<VintageRosterWall>`
  <div class="wall" part="wall">
    ${repeat(
      (x) => x.groups,
      html<Group>`
        <section class="group" part="group" aria-label="${(g) => g.label}">
          <h3 class="label"><span>${(g) => g.label}</span><b class="num">${(g) => g.members.length}</b></h3>
          <ul class="names">
            ${repeat(
              (g) => g.members,
              html<Row>`
                <li class="${(m) => (m.me ? 'you' : '')}">
                  <span class="name" style="${(m) => (m.main ? `color: var(--color-class-${m.main.class})` : '')}">${(m) => m.main?.name ?? m.displayName}</span>
                  ${when(
                    (m) => m.main,
                    html<Row>`<small>${(m) => titleCase(m.main?.spec ?? '')} · ${(m) => m.main?.role}</small>`,
                  )}
                  ${when((m) => !m.main, html`<small>no character yet</small>`)}
                  ${when((m) => m.me, html`<span class="tag">you</span>`)}
                </li>
              `,
            )}
          </ul>
        </section>
      `,
    )}
    ${when(
      (x) => x.groups.length === 0,
      html<VintageRosterWall>`<p class="empty">${(x) => x.emptyText}</p>`,
    )}
  </div>
`;

const styles = css`
  :host {
    display: block;
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
  }

  .wall {
    display: grid;
    gap: var(--space-md);
  }

  .group {
    display: grid;
    gap: var(--space-xs);
  }

  .label {
    display: flex;
    gap: var(--space-xs);
    align-items: baseline;
    margin: 0;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
  }

  .label b {
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-regular);
  }

  .names {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.3rem var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    padding: 0.35rem 0.4rem;
    border-radius: 0.2rem;
    border-block-end: var(--border-width-thin) solid var(--color-border-default);
    font-size: var(--font-size-sm);
  }

  .name {
    font-weight: var(--font-weight-bold);
  }

  small {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  li.you {
    background: color-mix(in srgb, var(--color-text-accent) 12%, transparent);
    border-block-end-color: var(--color-text-accent);
  }

  .tag {
    margin-inline-start: auto;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    letter-spacing: var(--font-tracking-wider);
    text-transform: uppercase;
    color: var(--color-text-accent);
  }

  .empty {
    margin: 0;
    color: var(--color-text-secondary);
  }
`;

/**
 * Every member on the rolls, grouped by guild rank, each shown as their main character's name
 * in its class color with spec and role. The signed-in member's row is marked.
 *
 * @tagname vintage-roster-wall
 * @summary Class-colored roster grouped by rank, fed from `member-list`.
 * @csspart wall - The whole wall.
 * @csspart group - One rank's block.
 */
export class VintageRosterWall extends FASTElement {
  /** Rows of `member-list`. */
  @observable members: RosterMember[] = [];
  /** The signed-in member's id, to mark their row. */
  @attr me = '';
  /** Shown when there are no members. */
  @attr({ attribute: 'empty-text' }) emptyText = 'Nobody on the rolls yet.';

  get groups(): Group[] {
    return RANK_GROUPS.map(([rank, label]) => ({
      rank,
      label,
      members: this.members
        .filter((m) => m.rank === rank)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((m) => ({ ...m, me: m.id === this.me })),
    })).filter((g) => g.members.length > 0);
  }
}

if (!customElements.get('vintage-roster-wall')) {
  await VintageRosterWall.define({ name: 'vintage-roster-wall', template, styles });
}
