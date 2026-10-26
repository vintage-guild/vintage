import { attr, css, FASTElement, html, observable } from '@lushly-dev/fast-element';
import { type CommandResult, command, success } from '@lushly-dev/fast-element/command.js';
import '../primitives';
import { applyTheme, currentTheme, type Theme } from '../theme';

const template = html<VintageThemeSwitch>`
  <violet-switch
    part="switch"
    :checked="${(x) => x.theme === 'vintage-parchment'}"
    @change="${(x) => x.toggleTheme()}"
  >
    ${(x) => x.label}
  </violet-switch>
`;

const styles = css`
  :host {
    display: inline-flex;
    color: var(--color-text-secondary);
    font-family: var(--font-family-sans);
  }

  violet-switch {
    font-family: var(--font-family-sans);
  }
`;

/**
 * Switches the page between the dark and parchment themes by setting `data-theme` on the
 * document element, and remembers the choice. Also exposed as the `vintage.theme-toggle`
 * command for the command palette and agents.
 *
 * @tagname vintage-theme-switch
 * @summary Dark / parchment theme switch.
 * @fires theme-change - The theme changed; `detail` is the new theme name.
 * @csspart switch - The violet-switch.
 */
export class VintageThemeSwitch extends FASTElement {
  /** Text next to the switch; on means parchment. */
  @attr label = 'Parchment';
  @observable theme: Theme = 'vintage-dark';

  connectedCallback(): void {
    super.connectedCallback();
    this.theme = currentTheme();
  }

  @command('vintage.theme-toggle', {
    label: 'Switch theme',
    description: 'Switch the page between the dark and parchment themes.',
    category: 'View',
  })
  toggleTheme(): CommandResult<{ theme: Theme }> {
    return this.setTheme(this.theme === 'vintage-dark' ? 'vintage-parchment' : 'vintage-dark');
  }

  setTheme(theme: Theme): CommandResult<{ theme: Theme }> {
    this.theme = theme;
    applyTheme(theme);
    this.$emit('theme-change', theme);
    return success({ theme });
  }
}

if (!customElements.get('vintage-theme-switch')) {
  await VintageThemeSwitch.define({ name: 'vintage-theme-switch', template, styles });
}
