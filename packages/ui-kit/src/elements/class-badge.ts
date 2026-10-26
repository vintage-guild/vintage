import { attr, FASTElement, html, when } from '@lushly-dev/fast-element';
import '../primitives';
import { isWowClass, titleCase } from '../labels';
import { badgeStyles } from './badge-styles';

const template = html<VintageClassBadge>`
  <violet-badge appearance="outline" size="${(x) => x.size}" part="badge">
    <span
      class="swatch"
      part="swatch"
      style="${(x) => (x.known ? `--_swatch: var(--color-class-${x.wowClass})` : '')}"
    ></span>
    ${when((x) => Boolean(x.spec), html<VintageClassBadge>`<span class="detail">${(x) => titleCase(x.spec)}</span>`)}
    <span class="label">${(x) => (x.known ? titleCase(x.wowClass) : 'Unknown class')}</span>
  </violet-badge>
`;

/**
 * A character's class, with the class color as a swatch and an optional spec. The text stays
 * in the theme's text color; Blizzard's class colors are only readable on the dark WoW frame.
 *
 * @tagname vintage-class-badge
 * @summary Class (and spec) badge with the Blizzard class color.
 * @csspart badge - The violet-badge pill.
 * @csspart swatch - The class color dot.
 * @cssprop --color-class-warrior - One `--color-class-<class>` token per class (from @vintage/design-tokens).
 */
export class VintageClassBadge extends FASTElement {
  /** A wow-data class id, such as `paladin`. */
  @attr({ attribute: 'wow-class' }) wowClass = '';
  /** Optional spec id, such as `holy`; shown before the class name. */
  @attr spec = '';
  /** violet-badge size: `sm`, `md`, or `lg`. */
  @attr size = 'md';

  get known(): boolean {
    return isWowClass(this.wowClass);
  }
}

if (!customElements.get('vintage-class-badge')) {
  await VintageClassBadge.define({
    name: 'vintage-class-badge',
    template,
    styles: badgeStyles,
  });
}
