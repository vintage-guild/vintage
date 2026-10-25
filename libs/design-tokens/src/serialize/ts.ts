import type { ThemeDef } from '../nodes';
import type { ResolvedToken, ResolvedTokens } from '../types';
import { cssLiteral, GENERATED_HEADER } from './css';

/** A resolved token as a TS literal: numbers stay numbers, everything else is its CSS text. */
function tsLiteral(token: ResolvedToken): string {
  if (typeof token.resolved === 'number') return String(token.resolved);
  const text = cssLiteral(token.type, token.resolved);
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/** The TS token map: every theme's resolved tokens, flat by id, as const. */
export function tokensTs(themes: readonly { theme: ThemeDef; tokens: ResolvedTokens }[]): string {
  const blocks = themes.map(({ theme, tokens }) => {
    const lines = [...tokens.values()].map((t) => `    '${t.id}': ${tsLiteral(t)},`);
    return `  '${theme.node}': {\n${lines.join('\n')}\n  },`;
  });
  return [
    `// ${GENERATED_HEADER}`,
    '// Resolved literal values per theme, keyed by token id. Use for Discord embeds and other',
    '// places CSS variables cannot reach.',
    '',
    `export const tokens = {\n${blocks.join('\n')}\n} as const;`,
    '',
  ].join('\n');
}
