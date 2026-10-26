/** The themes `@vintage/design-tokens` exports; dark is the default on :root. */
export const THEMES = ['vintage-dark', 'vintage-parchment'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'vintage-dark';
/** localStorage key; apps/web's index.html reads it before first paint. */
export const THEME_STORAGE_KEY = 'vintage-theme';

export const isTheme = (value: unknown): value is Theme =>
  (THEMES as readonly unknown[]).includes(value);

/** The theme on `root` (its `data-theme`), or the default. */
export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  const theme = root.dataset.theme;
  return isTheme(theme) ? theme : DEFAULT_THEME;
}

/** Set `data-theme` on `root` and remember it. Storage can be unavailable; the theme still applies. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: keep the theme for this page only.
  }
}
