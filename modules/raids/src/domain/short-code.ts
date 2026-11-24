// Short site link codes for raid events (raid-scheduling.plan.md §3): 6 lowercase characters from
// an unambiguous alphabet (no 0, o, 1, l, i), unique per guild.

export const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const SHORT_CODE_LENGTH = 6;
export const SHORT_CODE_MAX_RETRIES = 10;

const SHORT_CODE_RE = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);
/** Largest multiple of alphabet length (31) below 256, for rejection-sampled uniform bytes. */
const BYTE_LIMIT = Math.floor(256 / SHORT_CODE_ALPHABET.length) * SHORT_CODE_ALPHABET.length;

/** Trim and lowercase a short code for case-insensitive lookup. */
export function normalizeShortCode(code: string): string {
  return code.trim().toLowerCase();
}

/** True when `code` is a canonical 6-character short code from the unambiguous alphabet. */
export function isValidShortCode(code: string): boolean {
  return SHORT_CODE_RE.test(code);
}

function cryptoShortCode(): string {
  const n = SHORT_CODE_ALPHABET.length;
  const buf = new Uint8Array(16);
  let out = '';
  while (out.length < SHORT_CODE_LENGTH) {
    globalThis.crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= BYTE_LIMIT) continue;
      out += SHORT_CODE_ALPHABET[byte % n]!;
      if (out.length === SHORT_CODE_LENGTH) return out;
    }
  }
  return out;
}

/** Generate a 6-character lowercase short code. Uses Web Crypto when available unless `random` is given. */
export function generateShortCode(random?: () => number): string {
  if (!random && typeof globalThis.crypto?.getRandomValues === 'function') {
    return cryptoShortCode();
  }
  const n = SHORT_CODE_ALPHABET.length;
  const rng = random ?? Math.random;
  let out = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(rng() * n) % n]!;
  }
  return out;
}
