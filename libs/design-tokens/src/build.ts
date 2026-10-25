import { NODES, THEMES, type ThemeDef } from './nodes';
import { ancestry, resolveNode } from './resolve';
import { GENERATED_HEADER, themeCss } from './serialize/css';
import { fenuiLua } from './serialize/lua';
import { tokensTs } from './serialize/ts';
import type { ResolvedTokens, TokenNodeFile } from './types';

export interface ResolvedTheme {
  theme: ThemeDef;
  chain: string[];
  tokens: ResolvedTokens;
}

/** Resolve every exported theme. */
export function resolveThemes(
  nodes: Readonly<Record<string, TokenNodeFile>> = NODES,
  themes: readonly ThemeDef[] = THEMES,
): ResolvedTheme[] {
  return themes.map((theme) => ({
    theme,
    chain: ancestry(theme.node, nodes),
    tokens: resolveNode(theme.node, nodes),
  }));
}

/**
 * Every generated file, keyed by path relative to `libs/design-tokens`. Pure: the build
 * script (scripts/build-design-tokens.mjs) writes these, and a test checks the committed
 * copies still match.
 */
export function buildOutputs(
  nodes: Readonly<Record<string, TokenNodeFile>> = NODES,
  themes: readonly ThemeDef[] = THEMES,
): Record<string, string> {
  const resolved = resolveThemes(nodes, themes);
  const out: Record<string, string> = {};
  for (const { theme, chain, tokens } of resolved) {
    out[`generated/css/${theme.node}.css`] = themeCss(theme, chain, tokens);
  }
  // Drop each theme file's header line; keep its chain comment and block.
  const blocks = resolved.map(({ theme, chain, tokens }) =>
    themeCss(theme, chain, tokens).split('\n').slice(1).join('\n'),
  );
  out['generated/css/themes.css'] =
    `/* ${GENERATED_HEADER} */\n/* Every theme in one file. The default theme also claims :root. */\n\n${blocks.join('\n')}`;
  out['generated/tokens.ts'] = tokensTs(resolved);
  out['generated/lua/VintageTokens.lua'] = fenuiLua(resolved);
  return out;
}
