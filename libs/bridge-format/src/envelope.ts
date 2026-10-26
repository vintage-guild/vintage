// The envelope around a payload: `!VIN:1!` + EncodeForPrint(Deflate(LibSerialize(value))).
// Envelope version 1 is exactly that pipeline; the schema version lives inside the payload.
// The addon side is `LibDeflate:EncodeForPrint(LibDeflate:CompressDeflate(LibSerialize:Serialize(v)))`.
import { deflateSync, Inflate } from 'fflate';
import { type BridgeResult, bridgeError } from './errors';
import { DEFAULT_DESERIALIZE_LIMITS, deserialize, type LuaValue, serialize } from './libserialize';
import { decodeForPrint, encodeForPrint } from './print';

export const ENVELOPE_VERSION = 1;
export const PREFIX = `!VIN:${ENVELOPE_VERSION}!`;
const PREFIX_RE = /^!VIN:(\d+)!/;

export interface DecodeLimits {
  /** Longest pasted string accepted, in characters. */
  maxEncodedLength: number;
  /** Largest serialized payload accepted after inflating, in bytes. */
  maxSerializedBytes: number;
  /** Deepest table nesting accepted. */
  maxDepth: number;
  /** Most values accepted, counting repeated table references each time. */
  maxNodes: number;
}

export const DEFAULT_DECODE_LIMITS: DecodeLimits = {
  maxEncodedLength: 1_000_000,
  maxSerializedBytes: 2 * 1024 * 1024,
  ...DEFAULT_DESERIALIZE_LIMITS,
};

/** Wrap any serializable value. Payload validation happens a layer up. */
export function encodeValue(value: LuaValue): string {
  return PREFIX + encodeForPrint(deflateSync(serialize(value), { level: 9 }));
}

/** Unwrap a pasted string to its raw value, without checking it against a schema. */
export function decodeValue(
  input: string,
  limits: DecodeLimits = DEFAULT_DECODE_LIMITS,
): BridgeResult<LuaValue> {
  const text = input.trim();
  if (text.length > limits.maxEncodedLength) {
    return bridgeError('TOO_LARGE', `The string is longer than ${limits.maxEncodedLength} chars`);
  }
  const prefix = PREFIX_RE.exec(text);
  if (!prefix) {
    return bridgeError('NOT_A_BRIDGE_STRING', 'The string does not start with !VIN:');
  }
  const envelope = Number(prefix[1]);
  if (envelope !== ENVELOPE_VERSION) {
    return bridgeError(
      'UNSUPPORTED_ENCODING',
      `Envelope version ${envelope} is not supported (this build reads ${ENVELOPE_VERSION})`,
      { version: envelope, supported: ENVELOPE_VERSION },
    );
  }
  const compressed = decodeForPrint(text.slice(prefix[0].length));
  if (!compressed) return bridgeError('CORRUPT', 'The string has characters outside its alphabet');
  const inflated = inflate(compressed, limits.maxSerializedBytes);
  if (!inflated.ok) return inflated;
  try {
    return { ok: true, value: deserialize(inflated.value, limits) };
  } catch (err) {
    return bridgeError('CORRUPT', `The payload could not be read: ${(err as Error).message}`);
  }
}

class TooLarge extends Error {}

/** Raw inflate, fed in small chunks so a deflate bomb stops at `maxBytes`, not after it. */
function inflate(compressed: Uint8Array, maxBytes: number): BridgeResult<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new TooLarge();
    chunks.push(chunk);
  });
  try {
    const step = 1024;
    for (let i = 0; i < compressed.length; i += step) {
      stream.push(compressed.subarray(i, i + step), i + step >= compressed.length);
    }
    if (compressed.length === 0) stream.push(compressed, true);
  } catch (err) {
    if (err instanceof TooLarge) {
      return bridgeError('TOO_LARGE', `The payload inflates past ${maxBytes} bytes`);
    }
    return bridgeError('CORRUPT', `The payload could not be inflated: ${(err as Error).message}`);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: true, value: out };
}
