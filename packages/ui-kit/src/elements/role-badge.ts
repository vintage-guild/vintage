import { attr, FASTElement, html } from '@lushly-dev/fast-element';
import '../primitives';
import { isRole, titleCase } from '../labels';
import { badgeStyles } from './badge-styles';

const template = html<VintageRoleBadge>`
  <violet-badge appearance="outline" size="${(x) => x.size}" part="badge">
    <span
      class="swatch"
      part="swatch"
      style="${(x) => (x.known ? `--_swatch: var(--color-role-${x.raidRole})` : '')}"
    ></span>
    <span class="label">${(x) => (x.known ? titleCase(x.raidRole) : 'No role')}</span>
  </violet-badge>
`;

/**
 * A raid role (tank, healer, melee, ranged) with its role color.
 *
 * @tagname vintage-role-badge
 * @summary Raid role badge with the role color.
 * @csspart badge - The violet-badge pill.
 * @csspart swatch - The role color dot.
 * @cssprop --color-role-tank - One `--color-role-<role>` token per role (from @vintage/design-tokens).
 */
export class VintageRoleBadge extends FASTElement {
  /** A wow-data role: `tank`, `healer`, `melee`, or `ranged`. Not `role`, which is ARIA's. */
  @attr({ attribute: 'raid-role' }) raidRole = '';
  /** violet-badge size: `sm`, `md`, or `lg`. */
  @attr size = 'md';

  get known(): boolean {
    return isRole(this.raidRole);
  }
}

if (!customElements.get('vintage-role-badge')) {
  await VintageRoleBadge.define({ name: 'vintage-role-badge', template, styles: badgeStyles });
}
