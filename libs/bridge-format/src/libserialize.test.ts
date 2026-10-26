import { describe, expect, it } from 'vitest';
import {
  deserialize,
  type LuaValue,
  luaNumberToString,
  SerializeError,
  serialize,
} from './libserialize';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => Number.parseInt(b, 16));

// Produced by the real LibSerialize (MINOR 7) under Lua 5.4: `SerializeEx({ stable = true }, v)`.
const LUA_VECTORS: [string, LuaValue, string][] = [
  ['embedded 7-bit int', 127, '01ff'],
  ['embedded 12-bit negative', -1, '011c00'],
  ['embedded 12-bit max', 4095, '01f4ff'],
  ['24-bit negative', -70000, '0120011170'],
  ['56-bit int', 4294967296, '013800000100000000'],
  ['2^53', 2 ** 53, '013820000000000000'],
  ['short float as string', 0.5, '015003302e35'],
  ['negative float as string', -1.25, '015804312e3235'],
  ['float as 8 bytes', Math.PI, '0148400921fb54442d18'],
  ['infinity', Number.POSITIVE_INFINITY, '01487ff0000000000000'],
  ['negative zero', -0, '0150042d302e30'],
  ['string', 'abc', '0132616263'],
  ['UTF-8 string', 'Élowen', '0172c3896c6f77656e'],
  ['string reference', ['abc', 'abc'], '012a32616263d001'],
  ['empty table', [], '010a'],
  ['array', [1, 2, 3], '013a030507'],
  ['map in stable key order', { b: 2, a: 'xyz' }, '012612613278797a126205'],
  ['16-byte string (no embedded count)', 'x'.repeat(20), `017014${'78'.repeat(20)}`],
];

describe('LibSerialize compatibility', () => {
  it.each(LUA_VECTORS)('%s serializes like LibSerialize', (_, value, bytes) => {
    expect(hex(serialize(value))).toBe(bytes);
  });

  it.each(LUA_VECTORS)('%s deserializes from LibSerialize bytes', (_, value, bytes) => {
    expect(deserialize(unhex(bytes))).toEqual(value);
  });

  it('keeps -0 as -0', () => {
    expect(Object.is(deserialize(serialize(-0)), -0)).toBe(true);
  });

  it('reads float bytes from a view into a larger buffer', () => {
    const padded = new Uint8Array(32);
    padded.set(unhex('0148400921fb54442d18'), 11);
    expect(deserialize(padded.subarray(11, 21))).toBe(Math.PI);
  });

  it('round-trips nested values', () => {
    const value: LuaValue = {
      list: [1, -2, 300, -70_000, 2 ** 40, 0.1, 'abc', 'abc', true, false],
      nested: { deeper: { name: 'Élowen 🐉', items: [[], [1], { a: 1 }] } },
      many: Array.from({ length: 300 }, (_, i) => i * 7),
    };
    expect(deserialize(serialize(value))).toEqual(value);
  });

  it('writes an empty object as an empty table, which reads back as []', () => {
    expect(deserialize(serialize({}))).toEqual([]);
  });

  it('drops undefined and null object fields, like nil in a Lua table', () => {
    expect(deserialize(serialize({ a: 1, b: null, c: undefined as unknown as LuaValue }))).toEqual({
      a: 1,
    });
  });

  it('refuses arrays with holes, which Lua would truncate', () => {
    expect(() => serialize([1, null, 3])).toThrow(SerializeError);
    // biome-ignore lint/suspicious/noSparseArray: the hole is the point
    expect(() => serialize([1, , 3] as LuaValue[])).toThrow(SerializeError);
  });

  it('reads mixed tables as objects with string index keys', () => {
    // LibSerialize of `{ "x", "y", k = 1 }`: MIXED with embedded counts (2 array, 1 map).
    expect(deserialize(unhex('011e' + '1278' + '1279' + '126b' + '03'))).toEqual({
      1: 'x',
      2: 'y',
      k: 1,
    });
  });

  it('writes a repeated table as a reference and reads it back shared', () => {
    const shared = [1, 2];
    const bytes = serialize([shared, shared]);
    const out = deserialize(bytes) as LuaValue[][];
    expect(out).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(out[0]).toBe(out[1]);
  });

  it('does not let a "__proto__" key reach the prototype', () => {
    // `{ ["__proto__"] = { polluted = true } }` as LibSerialize writes it.
    const text = (t: string) => [t.length * 16 + 2, ...new TextEncoder().encode(t)];
    const bytes = Uint8Array.from([1, 0x16, ...text('__proto__'), 0x16, ...text('polluted'), 0x60]);
    const value = deserialize(bytes) as Record<string, unknown>;
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('untrusted input', () => {
  it('rejects strings that are not UTF-8', () => {
    expect(() => deserialize(unhex('0122fffe'))).toThrow();
  });

  it('rejects truncated input', () => {
    expect(() => deserialize(unhex('01326162'))).toThrow(SerializeError);
  });

  it('rejects trailing values', () => {
    expect(() => deserialize(unhex('010303'))).toThrow(/exactly one/);
  });

  it('rejects a newer serialization version', () => {
    expect(() => deserialize(unhex('0303'))).toThrow(/version 3/);
  });

  it('rejects bad references', () => {
    expect(() => deserialize(unhex('01d001'))).toThrow(/string reference/);
    expect(() => deserialize(unhex('01e801'))).toThrow(/table reference/);
  });

  it('rejects cycles', () => {
    // `local t = {}; t[1] = t`: array of 1 whose element is a reference to table 1.
    expect(() => deserialize(unhex('011ae801'))).toThrow(/Cyclic/);
  });

  it('caps nesting depth', () => {
    const deep = Uint8Array.from([1, ...new Array(40).fill(0x1a), 0x0a]);
    expect(() => deserialize(deep)).toThrow(/nested deeper/);
    expect(() => deserialize(deep, { maxDepth: 64, maxNodes: 1000 })).not.toThrow();
  });

  it('counts repeated table references against maxNodes (billion laughs)', () => {
    // { t1, t2, …, t8 } where t1 holds 15 ones and each later table holds 15 references to
    // the one before it: under 300 bytes that expand to ~15^8 values.
    const bytes = [1, 0x8a, 0xfa, ...new Array(15).fill(0x03)];
    for (let k = 2; k <= 8; k++) {
      bytes.push(0xfa, ...Array.from({ length: 15 }, () => [0xe8, k]).flat());
    }
    expect(bytes.length).toBeLessThan(300);
    expect(() => deserialize(Uint8Array.from(bytes))).toThrow(/More than 200000 values/);
  });

  it('rejects unsupported key types', () => {
    // `{ [true] = 1 }`
    expect(() => deserialize(unhex('01166003'))).toThrow(/key type/);
  });
});

describe('luaNumberToString (%.14g)', () => {
  it.each([
    [0.5, '0.5'],
    [0.1, '0.1'],
    [1e-5, '1e-05'],
    [123.456, '123.456'],
    [1e15, '1e+15'],
    [Math.PI, '3.1415926535898'],
    [2 ** 60, '1.1529215046068e+18'],
  ])('%d → %s', (n, s) => {
    expect(luaNumberToString(n)).toBe(s);
  });
});
