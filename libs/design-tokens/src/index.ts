import { tokens } from '../generated/tokens';
import { hexToInt } from './color';
import type { ThemeName } from './nodes';

export { buildOutputs, type ResolvedTheme, resolveThemes } from './build';
export { contrastRatio, hexToInt, parseHex, type Rgba, relativeLuminance } from './color';
export {
  CLASS_KEYS,
  CONTRAST_PAIRS,
  type ContrastPair,
  type ContrastResult,
  checkContrast,
  QUALITY_KEYS,
  ROLE_KEYS,
  SIGNUP_KEYS,
} from './contrast';
export { NODES, type NodeName, THEMES, type ThemeDef, type ThemeName } from './nodes';
export {
  aliasTarget,
  ancestry,
  cssVarName,
  flattenNode,
  redundantOverrides,
  resolveNode,
  TokenError,
} from './resolve';
export { cssBlock, cssValue, themeSelectors } from './serialize/css';
export { FENUI_SEMANTIC_MAP, fenuiPrimitiveName } from './serialize/lua';
export * from './types';
export { tokens };

/** Token ids, e.g. `color.quality.epic`. */
export type TokenId = keyof (typeof tokens)['vintage-dark'];

/** A resolved literal value for a theme (generated at build time; no runtime resolution). */
export function tokenValue<T extends ThemeName, K extends keyof (typeof tokens)[T]>(
  theme: T,
  id: K,
): (typeof tokens)[T][K] {
  return tokens[theme][id];
}

/** A color token as the 24-bit integer Discord embeds take. */
export function discordColor(id: TokenId, theme: ThemeName = 'vintage-dark'): number {
  const value = tokens[theme][id];
  if (typeof value !== 'string' || !value.startsWith('#')) {
    throw new Error(`${id} is not a color token`);
  }
  return hexToInt(value);
}
