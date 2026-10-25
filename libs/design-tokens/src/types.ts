/** Token tiers, following Violet's model (global → semantic → component). */
export const TIERS = ['global', 'semantic', 'component'] as const;
export type Tier = (typeof TIERS)[number];

/** The DTCG `$type`s this library understands. */
export const TOKEN_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'number',
  'duration',
  'cubicBezier',
  'string',
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

/** A literal DTCG value. Aliases are strings of the form `{token.id}`. */
export type TokenValue = string | number | readonly string[] | readonly number[];

/** One token or group in a DTCG file, before validation. */
export interface DtcgGroup {
  $type?: string;
  $description?: string;
  [key: string]: unknown;
}

/** Node metadata kept under `$extensions["dev.vintage.node"]`. */
export interface NodeMeta {
  name: string;
  parent: string | null;
  source?: string;
}

/** A Violet-style token node stored as a DTCG file. */
export interface TokenNodeFile {
  $description?: string;
  $extensions: { 'dev.vintage.node': NodeMeta };
  global?: DtcgGroup;
  semantic?: DtcgGroup;
  component?: DtcgGroup;
}

/** A token as declared by one node (flattened, not yet inherited or alias-resolved). */
export interface DeclaredToken {
  id: string;
  tier: Tier;
  /** Undefined when the node overrides an inherited token without restating its type. */
  type: TokenType | undefined;
  value: TokenValue;
  description: string | undefined;
}

/** A token after inheritance and alias resolution for one node. */
export interface ResolvedToken {
  id: string;
  tier: Tier;
  type: TokenType;
  /** The raw value as written by the winning node (may be an alias). */
  value: TokenValue;
  /** The literal value after following aliases. */
  resolved: TokenValue;
  /** Id of the aliased token, when `value` is an alias. */
  alias: string | undefined;
  description: string | undefined;
  /** The node whose declaration won. */
  origin: string;
  /** Every node in the chain that declared this token, root first (Violet's lineage). */
  lineage: string[];
}

/** All tokens resolved for one node, keyed by id, in declaration order. */
export type ResolvedTokens = Map<string, ResolvedToken>;
