import {
  type DeclaredToken,
  type DtcgGroup,
  type NodeMeta,
  type ResolvedToken,
  type ResolvedTokens,
  TIERS,
  TOKEN_TYPES,
  type TokenNodeFile,
  type TokenType,
  type TokenValue,
} from './types';

/** Any problem in the node definitions: bad value, unknown alias, broken inheritance. */
export class TokenError extends Error {
  override name = 'TokenError';
}

const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALIAS = /^\{([a-z0-9.-]+)\}$/;

const LITERAL_CHECKS: Record<TokenType, (v: unknown) => boolean> = {
  color: (v) => typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v),
  dimension: (v) =>
    typeof v === 'string' &&
    (/^-?\d*\.?\d+(px|rem|em|vw|vh|%)?$/.test(v) || /^clamp\(.+\)$/.test(v)),
  fontFamily: (v) =>
    (typeof v === 'string' && v.length > 0) ||
    (Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === 'string' && f.length > 0)),
  fontWeight: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000,
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  duration: (v) => typeof v === 'string' && /^\d+(\.\d+)?(ms|s)$/.test(v),
  cubicBezier: (v) => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number'),
  string: (v) => typeof v === 'string',
};

/** The token id an alias value points at, or undefined for a literal. */
export function aliasTarget(value: TokenValue): string | undefined {
  return typeof value === 'string' ? ALIAS.exec(value)?.[1] : undefined;
}

function isTokenType(t: unknown): t is TokenType {
  return typeof t === 'string' && (TOKEN_TYPES as readonly string[]).includes(t);
}

function isObject(v: unknown): v is DtcgGroup {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readToken(
  where: string,
  id: string,
  tier: DeclaredToken['tier'],
  raw: DtcgGroup,
  inheritedType: TokenType | undefined,
): DeclaredToken {
  const type = raw.$type === undefined ? inheritedType : raw.$type;
  if (type !== undefined && !isTokenType(type)) {
    throw new TokenError(`${where}: ${id} has unknown $type "${String(type)}"`);
  }
  const value = raw.$value as TokenValue;
  if (aliasTarget(value) === undefined && type !== undefined && !LITERAL_CHECKS[type](value)) {
    throw new TokenError(`${where}: ${id} has an invalid ${type} value ${JSON.stringify(value)}`);
  }
  const description = typeof raw.$description === 'string' ? raw.$description : undefined;
  return { id, tier, type, value, description };
}

function walkGroup(
  where: string,
  tier: DeclaredToken['tier'],
  group: DtcgGroup,
  path: string[],
  inheritedType: TokenType | undefined,
  out: DeclaredToken[],
): void {
  const groupType = group.$type === undefined ? inheritedType : group.$type;
  if (groupType !== undefined && !isTokenType(groupType)) {
    throw new TokenError(`${where}: group ${path.join('.')} has unknown $type "${groupType}"`);
  }
  for (const [key, child] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (!SEGMENT.test(key)) {
      throw new TokenError(`${where}: "${[...path, key].join('.')}" is not a kebab-case segment`);
    }
    if (!isObject(child)) {
      throw new TokenError(`${where}: ${[...path, key].join('.')} must be a token or group`);
    }
    const childPath = [...path, key];
    if ('$value' in child) {
      out.push(readToken(where, childPath.join('.'), tier, child, groupType));
    } else {
      walkGroup(where, tier, child, childPath, groupType, out);
    }
  }
}

/** Flatten one node file into the tokens it declares, tier by tier. */
export function flattenNode(file: TokenNodeFile): DeclaredToken[] {
  const where = file.$extensions['dev.vintage.node'].name;
  const out: DeclaredToken[] = [];
  for (const tier of TIERS) {
    const group = file[tier];
    if (group !== undefined) walkGroup(where, tier, group, [], undefined, out);
  }
  return out;
}

/** Node names from the root down to `name`, following `parent` links. */
export function ancestry(name: string, nodes: Readonly<Record<string, TokenNodeFile>>): string[] {
  const chain: string[] = [];
  let current: string | null = name;
  while (current !== null) {
    if (chain.includes(current)) {
      throw new TokenError(`inheritance cycle: ${[...chain, current].join(' → ')}`);
    }
    const file: TokenNodeFile | undefined = nodes[current];
    if (file === undefined) throw new TokenError(`unknown node "${current}"`);
    const meta: NodeMeta = file.$extensions['dev.vintage.node'];
    if (meta.name !== current) {
      throw new TokenError(`node registered as "${current}" names itself "${meta.name}"`);
    }
    chain.unshift(current);
    current = meta.parent;
  }
  return chain;
}

type Merged = Omit<ResolvedToken, 'resolved' | 'alias'>;

function mergeDeclared(merged: Map<string, Merged>, node: string, token: DeclaredToken): void {
  const existing = merged.get(token.id);
  if (existing === undefined) {
    if (token.type === undefined) {
      throw new TokenError(`${node}: ${token.id} is new here and needs a $type`);
    }
    merged.set(token.id, { ...token, type: token.type, origin: node, lineage: [node] });
    return;
  }
  if (existing.tier !== token.tier) {
    throw new TokenError(
      `${node}: ${token.id} is ${existing.tier} in ${existing.origin}; overrides keep the tier (got ${token.tier})`,
    );
  }
  if (token.type !== undefined && token.type !== existing.type) {
    throw new TokenError(
      `${node}: ${token.id} is ${existing.type} in ${existing.origin}; overrides keep the type (got ${token.type})`,
    );
  }
  merged.set(token.id, {
    ...existing,
    value: token.value,
    description: token.description ?? existing.description,
    origin: node,
    lineage: [...existing.lineage, node],
  });
}

function followAlias(
  node: string,
  start: Merged,
  merged: Map<string, Merged>,
): { resolved: TokenValue; alias: string | undefined } {
  const seen = [start.id];
  let current = start;
  let target = aliasTarget(current.value);
  const alias = target;
  while (target !== undefined) {
    const next = merged.get(target);
    if (next === undefined) {
      throw new TokenError(`${node}: ${current.id} references unknown token {${target}}`);
    }
    if (seen.includes(next.id)) {
      throw new TokenError(`${node}: alias cycle ${[...seen, next.id].join(' → ')}`);
    }
    if (next.type !== start.type) {
      throw new TokenError(
        `${node}: ${start.id} (${start.type}) references {${next.id}} (${next.type})`,
      );
    }
    seen.push(next.id);
    current = next;
    target = aliasTarget(current.value);
  }
  if (!LITERAL_CHECKS[start.type](current.value)) {
    throw new TokenError(
      `${node}: ${start.id} resolves to an invalid ${start.type} ${JSON.stringify(current.value)}`,
    );
  }
  return { resolved: current.value, alias };
}

/** CSS custom property name for a token id: `color.surface.canvas` → `--color-surface-canvas`. */
export function cssVarName(id: string): string {
  return `--${id.replaceAll('.', '-')}`;
}

/**
 * Resolve a node: walk its ancestry root-first, let each node override what it declares,
 * then follow aliases. Throws a TokenError on any inconsistency.
 */
export function resolveNode(
  name: string,
  nodes: Readonly<Record<string, TokenNodeFile>>,
): ResolvedTokens {
  const merged = new Map<string, Merged>();
  for (const node of ancestry(name, nodes)) {
    const declared = flattenNode(nodes[node]!);
    const seen = new Set<string>();
    for (const token of declared) {
      if (seen.has(token.id)) throw new TokenError(`${node}: ${token.id} is declared twice`);
      seen.add(token.id);
      mergeDeclared(merged, node, token);
    }
  }
  const resolved: ResolvedTokens = new Map();
  const cssNames = new Map<string, string>();
  for (const token of merged.values()) {
    const css = cssVarName(token.id);
    const clash = cssNames.get(css);
    if (clash !== undefined) {
      throw new TokenError(`${name}: ${token.id} and ${clash} both map to ${css}`);
    }
    cssNames.set(css, token.id);
    resolved.set(token.id, { ...token, ...followAlias(name, token, merged) });
  }
  return resolved;
}

/** Tokens a node declares with the same raw value its parent already resolves to. */
export function redundantOverrides(
  name: string,
  nodes: Readonly<Record<string, TokenNodeFile>>,
): string[] {
  const file = nodes[name];
  if (file === undefined) throw new TokenError(`unknown node "${name}"`);
  const parent = file.$extensions['dev.vintage.node'].parent;
  if (parent === null) return [];
  const inherited = resolveNode(parent, nodes);
  return flattenNode(file)
    .filter((token) => {
      const before = inherited.get(token.id);
      return before !== undefined && JSON.stringify(before.value) === JSON.stringify(token.value);
    })
    .map((token) => token.id);
}
