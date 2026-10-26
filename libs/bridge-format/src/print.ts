// LibDeflate's print-safe encoding (`EncodeForPrint` / `DecodeForPrint`): 3 bytes → 4 characters
// from a 64-character alphabet, packed least-significant bits first. Not RFC 4648 base64.
// Reference: https://github.com/SafeteeWoW/LibDeflate (zlib license).

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()';
const VALUE = new Map([...ALPHABET].map((ch, i) => [ch.charCodeAt(0), i]));

export function encodeForPrint(bytes: Uint8Array): string {
  let out = '';
  let cache = 0;
  let bits = 0;
  for (const byte of bytes) {
    cache += byte * 2 ** bits;
    bits += 8;
    while (bits >= 6) {
      out += ALPHABET[cache % 64];
      cache = Math.floor(cache / 64);
      bits -= 6;
    }
  }
  if (bits > 0) out += ALPHABET[cache % 64];
  return out;
}

/** Inverse of {@link encodeForPrint}; undefined when a character is outside the alphabet. */
export function decodeForPrint(text: string): Uint8Array | undefined {
  if (text.length === 1) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let length = 0;
  let cache = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const value = VALUE.get(text.charCodeAt(i));
    if (value === undefined) return undefined;
    cache += value * 2 ** bits;
    bits += 6;
    if (bits >= 8) {
      out[length++] = cache % 256;
      cache = Math.floor(cache / 256);
      bits -= 8;
    }
  }
  return out.subarray(0, length);
}
