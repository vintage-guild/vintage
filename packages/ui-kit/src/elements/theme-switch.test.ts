import { CommandRegistry } from '@lushly-dev/fast-element/command.js';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle } from '../test-helpers';
import { THEME_STORAGE_KEY } from '../theme';
import type { VintageThemeSwitch } from './theme-switch';
import './theme-switch';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

const sw = (el: Element) =>
  el.shadowRoot!.querySelector('violet-switch') as HTMLElement & { checked: boolean };

describe('vintage-theme-switch', () => {
  it('starts from the document theme', async () => {
    document.documentElement.dataset.theme = 'vintage-parchment';
    const el = await mount<VintageThemeSwitch>('<vintage-theme-switch></vintage-theme-switch>');
    expect(el.theme).toBe('vintage-parchment');
    expect(sw(el).checked).toBe(true);
  });

  it('toggles data-theme, remembers it, and announces it', async () => {
    const el = await mount<VintageThemeSwitch>('<vintage-theme-switch></vintage-theme-switch>');
    const seen: string[] = [];
    el.addEventListener('theme-change', (e) => seen.push((e as CustomEvent).detail));

    expect(el.toggleTheme()).toEqual({ success: true, data: { theme: 'vintage-parchment' } });
    await settle();
    expect(document.documentElement.dataset.theme).toBe('vintage-parchment');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('vintage-parchment');
    expect(sw(el).checked).toBe(true);

    el.toggleTheme();
    expect(document.documentElement.dataset.theme).toBe('vintage-dark');
    expect(seen).toEqual(['vintage-parchment', 'vintage-dark']);
  });

  it('is reachable as vintage.theme-toggle', async () => {
    await mount<VintageThemeSwitch>('<vintage-theme-switch></vintage-theme-switch>');
    const result = await CommandRegistry.execute('vintage.theme-toggle');
    expect(result).toEqual({ success: true, data: { theme: 'vintage-parchment' } });
  });
});
