import afdSite from '../nodes/afd-site.tokens.json' with { type: 'json' };
import vintage from '../nodes/vintage.tokens.json' with { type: 'json' };
import vintageDark from '../nodes/vintage-dark.tokens.json' with { type: 'json' };
import vintageParchment from '../nodes/vintage-parchment.tokens.json' with { type: 'json' };
import type { TokenNodeFile } from './types';

/**
 * The node tree (PLAN §3.8):
 *
 *   afd-site → vintage → vintage-dark
 *                      → vintage-parchment
 */
export const NODES = {
  'afd-site': afdSite as TokenNodeFile,
  vintage: vintage as TokenNodeFile,
  'vintage-dark': vintageDark as TokenNodeFile,
  'vintage-parchment': vintageParchment as TokenNodeFile,
} as const satisfies Record<string, TokenNodeFile>;

export type NodeName = keyof typeof NODES;

export interface ThemeDef {
  /** The node exported as this theme; also the `data-theme` value. */
  node: NodeName;
  label: string;
  /** The default theme also claims `:root`, so pages without `data-theme` get it. */
  isDefault: boolean;
}

/** Nodes exported as themes. Dark is the member-app default. */
export const THEMES = [
  { node: 'vintage-dark', label: 'Vintage Dark', isDefault: true },
  { node: 'vintage-parchment', label: 'Vintage Parchment', isDefault: false },
] as const satisfies readonly ThemeDef[];

export type ThemeName = (typeof THEMES)[number]['node'];
