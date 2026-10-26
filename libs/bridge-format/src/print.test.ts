import { describe, expect, it } from 'vitest';
import { decodeForPrint, encodeForPrint } from './print';

// Produced by LibDeflate 1.0.2 `EncodeForPrint` under Lua 5.4.
const LUA_VECTORS: [number[], string][] = [
  [[1, 2, 3, 4, 255], 'biWae8p'],
  [[0, 255, 128], 'a8pG'],
  [[...new TextEncoder().encode('hello')], 'OvgBS9g'],
];

describe('LibDeflate print encoding', () => {
  it.each(LUA_VECTORS)('%j encodes like LibDeflate', (bytes, text) => {
    expect(encodeForPrint(Uint8Array.from(bytes))).toBe(text);
    expect(Array.from(decodeForPrint(text) ?? [])).toEqual(bytes);
  });

  it('round-trips every length and byte value', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      expect(decodeForPrint(encodeForPrint(bytes))).toEqual(bytes);
    }
  });

  it('rejects characters outside the alphabet and lone characters', () => {
    expect(decodeForPrint('abc!')).toBeUndefined();
    expect(decodeForPrint('ab cd')).toBeUndefined();
    expect(decodeForPrint('a')).toBeUndefined();
  });
});
