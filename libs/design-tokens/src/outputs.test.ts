import { describe, expect, it } from 'vitest';
import themesCss from '../generated/css/themes.css?raw';
import darkCss from '../generated/css/vintage-dark.css?raw';
import parchmentCss from '../generated/css/vintage-parchment.css?raw';
import lua from '../generated/lua/VintageTokens.lua?raw';
import { tokens } from '../generated/tokens';
import tokensTs from '../generated/tokens.ts?raw';
import { buildOutputs, resolveThemes } from './build';
import type { ThemeName } from './nodes';
import { cssVarName } from './resolve';
import { FENUI_SEMANTIC_MAP, fenuiPrimitiveName, WOW_GROUPS } from './serialize/lua';

const committed: Record<string, string> = {
  'generated/css/vintage-dark.css': darkCss,
  'generated/css/vintage-parchment.css': parchmentCss,
  'generated/css/themes.css': themesCss,
  'generated/tokens.ts': tokensTs,
  'generated/lua/VintageTokens.lua': lua,
};
const lf = (s: string) => s.replaceAll('\r\n', '\n');
const outputs = buildOutputs();
const themes = resolveThemes();

describe('generated files', () => {
  it('builds exactly the committed set', () => {
    expect(Object.keys(outputs).sort()).toEqual(Object.keys(committed).sort());
  });

  it.each(Object.keys(committed))('%s is up to date (run pnpm tokens:build)', (path) => {
    expect(lf(committed[path]!)).toBe(outputs[path]);
  });
});

describe('CSS', () => {
  const css = { 'vintage-dark': darkCss, 'vintage-parchment': parchmentCss };

  it('scopes themes under data-theme, with dark also on :root', () => {
    expect(darkCss).toContain(':root,\n[data-theme="vintage-dark"] {');
    expect(parchmentCss).toContain('\n[data-theme="vintage-parchment"] {');
    expect(parchmentCss).not.toContain(':root');
    expect(themesCss.indexOf('[data-theme="vintage-dark"]')).toBeLessThan(
      themesCss.indexOf('[data-theme="vintage-parchment"]'),
    );
  });

  it('declares every token once per theme, keeping aliases live', () => {
    for (const { theme, tokens: resolved } of themes) {
      const text = css[theme.node as ThemeName];
      for (const token of resolved.values()) {
        const decl = `  ${cssVarName(token.id)}: `;
        expect(text.split(decl).length - 1, `${theme.node} ${token.id}`).toBe(1);
        if (token.alias) expect(text).toContain(`${decl}var(${cssVarName(token.alias)});`);
      }
    }
  });

  it('writes literal values in CSS syntax', () => {
    expect(darkCss).toContain(
      '--font-family-display: "Bitter Variable", "Bitter", "Georgia", serif;',
    );
    expect(darkCss).toContain('--motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1);');
    expect(darkCss).toContain('--color-quality-epic: #a335ee;');
    expect(parchmentCss).toContain('--color-surface-canvas: var(--color-parchment-100);');
  });
});

describe('TS map', () => {
  it('holds resolved literals for every theme and token', () => {
    for (const { theme, tokens: resolved } of themes) {
      const map: Record<string, unknown> = tokens[theme.node as ThemeName];
      expect(Object.keys(map)).toEqual([...resolved.keys()]);
      expect(map['color.surface.canvas']).toBe(resolved.get('color.surface.canvas')?.resolved);
    }
    expect(tokens['vintage-dark']['font.weight.bold']).toBe(700);
  });
});

describe('FenUI Lua table', () => {
  it('maps every FenUI semantic token to a defined primitive in each theme', () => {
    for (const { theme } of themes) {
      for (const [fen, id] of Object.entries(FENUI_SEMANTIC_MAP)) {
        const primitive = fenuiPrimitiveName(theme.node, id);
        expect(lua).toContain(`\t\t\t${fen} = "${primitive}",`);
        expect(lua).toMatch(new RegExp(`\\n\\t${primitive} = \\{ [0-9., ]+ \\}, -- #`));
      }
    }
  });

  it('carries WoW colors per theme and balances its braces', () => {
    for (const group of WOW_GROUPS) expect(lua).toContain(`\t\t${group} = {`);
    expect(lua).toContain('\t\t\tepic = { 0.639, 0.208, 0.933, 1 }, -- #a335ee');
    expect(lua).toContain('\t\t\t["no-response"] = {');
    expect(lua.split('{').length).toBe(lua.split('}').length);
    expect(lua.trimEnd().endsWith('return VintageTokens')).toBe(true);
  });
});
