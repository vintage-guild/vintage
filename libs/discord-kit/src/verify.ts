// Ed25519 verification of a Discord interaction request (PLAN §6.2).
// Discord signs `X-Signature-Timestamp + rawBody` with the application's key and sends the
// signature hex-encoded in `X-Signature-Ed25519`. Verify over the raw body, before parsing JSON.
// Uses only WebCrypto, so it runs on Node 22+, Vercel, Convex, and browsers alike.

export const SIGNATURE_HEADER = 'x-signature-ed25519';
export const TIMESTAMP_HEADER = 'x-signature-timestamp';

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

/**
 * True when `signature` is a valid Ed25519 signature of `timestamp + body` under `publicKey`.
 * Never throws for bad input: a missing header, malformed hex, or a bad key all return false.
 */
export async function verifyInteraction(
  publicKey: string | CryptoKey,
  { signature, timestamp, body }: SignedRequest,
): Promise<boolean> {
  if (!signature || !timestamp) return false;
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
