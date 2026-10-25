import { parseHex } from '../color';
import type { ThemeDef } from '../nodes';
import type { ResolvedTokens } from '../types';
import { GENERATED_HEADER } from './css';

/**
 * FenUI semantic color token → the Vintage token that fills it. FenUI themes map semantic
 * names to primitive names in `FenUI.Tokens.colors` (FenUI Core/Tokens.lua, ThemeManager.lua).
 */
export const FENUI_SEMANTIC_MAP = {
  surfacePanel: 'color.surface.canvas',
  surfaceHeader: 'color.surface.raised',
  surfaceElevated: 'color.surface.raised',
  surfaceInset: 'color.surface.sunken',
  surfaceDeep: 'color.surface.sunken',
  textDefault: 'color.text.primary',
  textStrong: 'color.text.primary',
  textMuted: 'color.text.secondary',
  textOnAccent: 'color.accent.contrast',
  textHeading: 'color.text.primary',
  textTitle: 'color.text.accent',
  textDanger: 'color.feedback.danger',
  borderDefault: 'color.border.strong',
  borderSubtle: 'color.border.default',
  borderFocus: 'color.focus.ring',
  interactiveDefault: 'color.accent.primary',
  interactiveSelected: 'color.accent.primary',
  accentBar: 'color.accent.primary',
  feedbackSuccess: 'color.feedback.success',
  feedbackError: 'color.feedback.danger',
} as const;

/** Token groups copied into `VintageTokens.wow[theme]` for addon code that needs WoW colors. */
export const WOW_GROUPS = ['quality', 'class', 'role', 'signup'] as const;

const camel = (s: string) => s.replace(/[.-]([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const pascal = (s: string) => camel(s).replace(/^[a-z]/, (c) => c.toUpperCase());
const luaKey = (k: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `["${k}"]`);

function rgba(hex: string): string {
  const fmt = (n: number) => String(Number(n.toFixed(3)));
  return `{ ${parseHex(hex).map(fmt).join(', ')} }`;
}

function colorOf(tokens: ResolvedTokens, id: string): string {
  const token = tokens.get(id);
  if (token === undefined || token.type !== 'color') {
    throw new Error(`Lua export needs color token ${id}`);
  }
  return String(token.resolved);
}

/** FenUI primitive name for a Vintage token in a theme: `vintageDarkSurfaceCanvas`. */
export function fenuiPrimitiveName(theme: string, id: string): string {
  return camel(`${theme}.${id.replace(/^color\./, '')}`);
}

/** The interim FenUI theme table (until Violet ships a Lua exporter). */
export function fenuiLua(themes: readonly { theme: ThemeDef; tokens: ResolvedTokens }[]): string {
  const colors: string[] = [];
  const themeBlocks: string[] = [];
  const wowBlocks: string[] = [];
  for (const { theme, tokens } of themes) {
    const used = [...new Set(Object.values(FENUI_SEMANTIC_MAP))];
    for (const id of used) {
      const hex = colorOf(tokens, id);
      colors.push(`\t${fenuiPrimitiveName(theme.node, id)} = ${rgba(hex)}, -- ${hex} ${id}`);
    }
    const mapping = Object.entries(FENUI_SEMANTIC_MAP).map(
      ([fen, id]) => `\t\t\t${fen} = "${fenuiPrimitiveName(theme.node, id)}",`,
    );
    themeBlocks.push(
      [
        `\t["${theme.node}"] = {`,
        `\t\tname = "${pascal(theme.node)}",`,
        `\t\tdescription = "${theme.label} (Vintage design tokens)",`,
        '\t\tlayout = "ModernDark",',
        '\t\ttokens = {',
        ...mapping,
        '\t\t},',
        '\t},',
      ].join('\n'),
    );
    const groups = WOW_GROUPS.map((group) => {
      const prefix = `color.${group}.`;
      const entries = [...tokens.values()]
        .filter((t) => t.id.startsWith(prefix))
        .map((t) => {
          const hex = String(t.resolved);
          return `\t\t\t${luaKey(t.id.slice(prefix.length))} = ${rgba(hex)}, -- ${hex}`;
        });
      return [`\t\t${group} = {`, ...entries, '\t\t},'].join('\n');
    });
    wowBlocks.push([`\t["${theme.node}"] = {`, ...groups, '\t},'].join('\n'));
  }
  return [
    `-- ${GENERATED_HEADER}`,
    '-- Interim FenUI theme table until Violet ships a Lua exporter (PLAN §3.8).',
    '--',
    '-- Usage in the addon:',
    '--   for name, rgba in pairs(VintageTokens.colors) do FenUI.Tokens.colors[name] = rgba end',
    '--   FenUI:RegisterTheme("VintageDark", VintageTokens.themes["vintage-dark"])',
    '',
    'local _, ns = ...',
    '',
    'local VintageTokens = {}',
    '',
    '-- Primitives to merge into FenUI.Tokens.colors: { r, g, b, a } in 0-1.',
    'VintageTokens.colors = {',
    ...colors,
    '}',
    '',
    '-- FenUI theme configs: semantic token -> primitive name above.',
    'VintageTokens.themes = {',
    ...themeBlocks,
    '}',
    '',
    '-- WoW colors per theme for addon code: item quality, class, role, signup status.',
    'VintageTokens.wow = {',
    ...wowBlocks,
    '}',
    '',
    'if type(ns) == "table" then',
    '\tns.VintageTokens = VintageTokens',
    'end',
    '',
    'return VintageTokens',
    '',
  ].join('\n');
}
