// Ed25519 verification of a Discord interaction request (PLAN §6.2).
// Discord signs `X-Signature-Timestamp + rawBody` with the application's key and sends the
// signature hex-encoded in `X-Signature-Ed25519`. Verify over the raw body, before parsing JSON.
// The signed timestamp (Unix seconds) must also be recent, so a captured request can't be
// replayed later: one more than 5 minutes from now, either way, is rejected.
// Uses only WebCrypto, so it runs on Node 22+, Vercel, Convex, and browsers alike.

export const SIGNATURE_HEADER = 'x-signature-ed25519';
export const TIMESTAMP_HEADER = 'x-signature-timestamp';

/** How far the signed timestamp may be from now, in either direction, by default. */
export const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

const ED25519 = { name: 'Ed25519' } as const;
const encoder = new TextEncoder();

/** Decode a hex string; `undefined` when it is not even-length hex. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Import the application's public key (hex, from the Developer Portal) for verification. */
export async function importPublicKey(publicKeyHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(publicKeyHex);
  if (raw?.length !== 32) throw new Error('Discord public key must be 32 bytes of hex');
  return crypto.subtle.importKey('raw', raw, ED25519, false, ['verify']);
}

export interface SignedRequest {
  /** Value of `X-Signature-Ed25519` (hex). */
  signature: string | null | undefined;
  /** Value of `X-Signature-Timestamp`. */
  timestamp: string | null | undefined;
  /** The raw request body, exactly as received. */
  body: string | Uint8Array<ArrayBuffer>;
}

export interface VerifyOptions {
  /** The clock to check the timestamp against. Default: the real one. */
  now?: () => Date;
  /** Largest accepted distance between the timestamp and now. Default 5 minutes. */
  maxAgeSeconds?: number;
}

/** True when `timestamp` is whole Unix seconds within `maxAgeSeconds` of `now`. */
function isFresh(timestamp: string, now: Date, maxAgeSeconds: number): boolean {
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  return Math.abs(now.getTime() / 1000 - Number(timestamp)) <= maxAgeSeconds;
}

/**
 * True when `signature` is a valid Ed25519 signature of `timestamp + body` under `publicKey`
 * and `timestamp` is within `maxAgeSeconds` of now (the replay window).
 * Never throws for bad input: a missing header, malformed hex, or a bad key all return false.
 */
export async function verifyInteraction(
  publicKey: string | CryptoKey,
  { signature, timestamp, body }: SignedRequest,
  { now = () => new Date(), maxAgeSeconds = MAX_TIMESTAMP_SKEW_SECONDS }: VerifyOptions = {},
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  if (!isFresh(timestamp, now(), maxAgeSeconds)) return false;
  const sig = hexToBytes(signature);
  if (sig?.length !== 64) return false;
  try {
    const key = typeof publicKey === 'string' ? await importPublicKey(publicKey) : publicKey;
    return await crypto.subtle.verify(ED25519, key, sig, signedMessage(timestamp, body));
  } catch {
    return false;
  }
}

/** The exact bytes Discord signs: timestamp followed by the raw body. */
export function signedMessage(
  timestamp: string,
  body: string | Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const ts = encoder.encode(timestamp);
  const payload = typeof body === 'string' ? encoder.encode(body) : body;
  const out = new Uint8Array(ts.length + payload.length);
  out.set(ts, 0);
  out.set(payload, ts.length);
  return out;
}
