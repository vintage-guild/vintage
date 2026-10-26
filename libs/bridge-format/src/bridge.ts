import { DEFAULT_DECODE_LIMITS, type DecodeLimits, decodeValue, encodeValue } from './envelope';
import { type BridgeResult, bridgeError } from './errors';
import type { LuaValue } from './libserialize';
import {
  BRIDGE_SCHEMA_VERSION,
  type BridgeKind,
  type BridgePayload,
  PAYLOAD_SCHEMAS,
  type RaidExport,
  type RaidImport,
} from './schemas';

const MAX_REPORTED_ISSUES = 20;

function isKind(kind: unknown): kind is BridgeKind {
  return typeof kind === 'string' && Object.hasOwn(PAYLOAD_SCHEMAS, kind);
}

/** Validate a payload against its schema and wrap it in a paste string. */
export function encodeBridge(payload: BridgePayload): BridgeResult<string> {
  const checked = validate(payload);
  if (!checked.ok) return checked;
  return { ok: true, value: encodeValue(checked.value as unknown as LuaValue) };
}

/** Decode any bridge string. Never throws: every failure is a typed {@link BridgeError}. */
export function decodeBridge(
  input: string,
  limits: DecodeLimits = DEFAULT_DECODE_LIMITS,
): BridgeResult<BridgePayload> {
  const raw = decodeValue(input, limits);
  return raw.ok ? validate(raw.value) : raw;
}

export function decodeRaidImport(input: string, limits?: DecodeLimits): BridgeResult<RaidImport> {
  return decodeKind(input, 'raid-import', limits);
}

export function decodeRaidExport(input: string, limits?: DecodeLimits): BridgeResult<RaidExport> {
  return decodeKind(input, 'raid-export', limits);
}

function decodeKind<K extends BridgeKind>(
  input: string,
  kind: K,
  limits: DecodeLimits = DEFAULT_DECODE_LIMITS,
): BridgeResult<Extract<BridgePayload, { kind: K }>> {
  const decoded = decodeBridge(input, limits);
  if (!decoded.ok) return decoded;
  if (decoded.value.kind !== kind) {
    return bridgeError('WRONG_KIND', `Expected a ${kind} string, got ${decoded.value.kind}`, {
      expected: kind,
      actual: decoded.value.kind,
    });
  }
  return decoded as BridgeResult<Extract<BridgePayload, { kind: K }>>;
}

/** Version first, then kind, then the kind's schema. */
function validate(value: unknown): BridgeResult<BridgePayload> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return bridgeError('INVALID_PAYLOAD', 'The payload is not a table with fields');
  }
  const { v, kind } = value as { v?: unknown; kind?: unknown };
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return bridgeError('INVALID_PAYLOAD', 'The payload has no schema version (v)');
  }
  if (v !== BRIDGE_SCHEMA_VERSION) {
    const newer = v > BRIDGE_SCHEMA_VERSION;
    return bridgeError(
      'UNSUPPORTED_VERSION',
      `Schema version ${v} is ${newer ? 'newer than' : 'not'} supported (this build reads ${BRIDGE_SCHEMA_VERSION})`,
      { version: v, supported: BRIDGE_SCHEMA_VERSION },
    );
  }
  if (!isKind(kind)) {
    const shown = typeof kind === 'string' ? kind.slice(0, 40) : typeof kind;
    return bridgeError('UNKNOWN_KIND', `Unknown payload kind "${shown}"`, { kind: shown });
  }
  const parsed = PAYLOAD_SCHEMAS[kind].safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return bridgeError('INVALID_PAYLOAD', `The ${kind} payload doesn't match its schema`, {
      issues,
      issueCount: parsed.error.issues.length,
    });
  }
  return { ok: true, value: parsed.data };
}
