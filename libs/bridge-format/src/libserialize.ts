// A TypeScript port of LibSerialize's wire format (serialization version 1), so strings the
// addon builds with `LibSerialize:Serialize` decode here and the other way round.
// Format reference: https://github.com/rossnichols/LibSerialize (MIT), "Encoding format".
//
// Lua tables map to JS values like this:
//   array-like table (keys 1..n)  ↔  array
//   map-like table (string keys)  ↔  plain object
//   empty table                    →  [] (LibSerialize can't tell `{}` from an empty array)
// Map keys are written in LibSerialize's `stable` order (string keys sorted), so a Lua
// encoder using `SerializeEx({ stable = true }, value)` produces the same bytes.

export type LuaValue = null | boolean | number | string | LuaValue[] | { [key: string]: LuaValue };

export class SerializeError extends Error {
  override name = 'SerializeError';
}

/** Limits that keep decoding untrusted input bounded. */
export interface DeserializeLimits {
  /** Deepest table nesting accepted. */
  maxDepth: number;
  /** Most values accepted once table references are expanded (stops "billion laughs"). */
  maxNodes: number;
}

export const DEFAULT_DESERIALIZE_LIMITS: DeserializeLimits = { maxDepth: 32, maxNodes: 200_000 };

const SERIALIZATION_VERSION = 1;
const DESERIALIZATION_VERSION = 2;

// `TTTT T000` type indexes (LibSerialize `_ReaderIndex`).
const T = {
  NIL: 0,
  NUM_16_POS: 1,
  NUM_16_NEG: 2,
  NUM_24_POS: 3,
  NUM_24_NEG: 4,
  NUM_32_POS: 5,
  NUM_32_NEG: 6,
  NUM_64_POS: 7,
  NUM_64_NEG: 8,
  NUM_FLOAT: 9,
  NUM_FLOATSTR: 10,
  NUM_FLOATSTR_NEG: 11,
  BOOL_T: 12,
  BOOL_F: 13,
  STR_8: 14,
  TABLE_8: 17,
  ARRAY_8: 20,
  MIXED_8: 23,
  STRINGREF_8: 26,
  TABLEREF_8: 29,
} as const;

// `CCCC TT10` embedded-count type indexes (LibSerialize `_EmbeddedIndex`).
const E = { STRING: 0, TABLE: 1, ARRAY: 2, MIXED: 3 } as const;

const utf8 = new TextEncoder();
// Fatal, so bytes that aren't UTF-8 fail as corrupt instead of turning into U+FFFD. ignoreBOM
// keeps a leading U+FEFF in each string, as Lua does, instead of silently dropping it.
const fromUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// ── Writing ──────────────────────────────────────────────────────────────────

class ByteWriter {
  private buf = new Uint8Array(256);
  length = 0;

  private reserve(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  byte(b: number): void {
    this.reserve(1);
    this.buf[this.length++] = b;
  }

  /** Big-endian unsigned int in `size` bytes (1–4 or 7). Uses arithmetic: values reach 2^56. */
  int(n: number, size: number): void {
    this.reserve(size);
    for (let i = size - 1; i >= 0; i--) {
      this.buf[this.length + i] = n % 256;
      n = Math.floor(n / 256);
    }
    this.length += size;
  }

  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Bytes needed for a count or reference index (max 3, like LibSerialize). */
function countBytes(n: number): 1 | 2 | 3 {
  if (n < 256) return 1;
  if (n < 65536) return 2;
  if (n < 16777216) return 3;
  throw new SerializeError('Object limit exceeded');
}

/** Bytes needed for an integer payload: 2, 3, 4, or 7 (small ints are embedded). */
function intBytes(n: number): 2 | 3 | 4 | 7 {
  if (n < 65536) return 2;
  if (n < 16777216) return 3;
  if (n < 4294967296) return 4;
  return 7;
}

const INT_TYPE: Record<number, number> = {
  2: T.NUM_16_POS,
  3: T.NUM_24_POS,
  4: T.NUM_32_POS,
  7: T.NUM_64_POS,
};

/** Lua 5.1's `tostring(number)`, i.e. C's `%.14g`. */
export function luaNumberToString(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  if (n === 0) return Object.is(n, -0) ? '-0' : '0';
  const [mantissa = '', expPart = '0'] = n.toExponential(13).split('e');
  const exp = Number(expPart);
  const strip = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
  if (exp < -4 || exp >= 14) {
    const sign = exp < 0 ? '-' : '+';
    return `${strip(mantissa)}e${sign}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  return strip(n.toFixed(13 - exp));
}

function floatBytes(n: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, n, false);
  return out;
}

class Serializer {
  private readonly out = new ByteWriter();
  private readonly stringRefs = new Map<string, number>();
  private readonly tableRefs = new Map<object, number>();

  run(value: LuaValue): Uint8Array {
    this.out.byte(SERIALIZATION_VERSION);
    this.write(value);
    return this.out.result();
  }

  private write(value: LuaValue | undefined): void {
    if (value === null || value === undefined) this.out.byte(T.NIL * 8);
    else if (typeof value === 'boolean') this.out.byte((value ? T.BOOL_T : T.BOOL_F) * 8);
    else if (typeof value === 'number') this.number(value);
    else if (typeof value === 'string') this.string(value);
    else if (typeof value === 'object') this.table(value);
    else throw new SerializeError(`Unhandled type: ${typeof value}`);
  }

  private number(n: number): void {
    if (Object.is(n, -0)) this.floatString('-0.0', false);
    else if (!Number.isInteger(n) || Math.abs(n) >= 2 ** 56) this.float(n);
    else if (n >= 0 && n < 128) this.out.byte(n * 2 + 1);
    else if (n > -4096 && n < 4096) {
      const packed = Math.abs(n) * 16 + (n < 0 ? 8 : 0) + 4;
      this.out.byte(packed % 256);
      this.out.byte(Math.floor(packed / 256));
    } else {
      const abs = Math.abs(n);
      const size = intBytes(abs);
      this.out.byte((n < 0 ? 8 : 0) + (INT_TYPE[size] ?? 0) * 8);
      this.out.int(abs, size);
    }
  }

  private float(n: number): void {
    const abs = Math.abs(n);
    const asString = luaNumberToString(abs);
    if (asString.length < 7 && Number(asString) === abs && Number.isFinite(abs)) {
      this.floatString(asString, n < 0);
    } else {
      this.out.byte(T.NUM_FLOAT * 8);
      this.out.bytes(floatBytes(n));
    }
  }

  private floatString(s: string, negative: boolean): void {
    this.out.byte((negative ? 8 : 0) + T.NUM_FLOATSTR * 8);
    this.out.byte(s.length);
    this.out.bytes(utf8.encode(s));
  }

  private string(s: string): void {
    const ref = this.stringRefs.get(s);
    if (ref !== undefined) {
      this.reference(T.STRINGREF_8, ref);
      return;
    }
    const bytes = utf8.encode(s);
    this.counted(E.STRING, T.STR_8, bytes.length);
    this.out.bytes(bytes);
    if (bytes.length > 2) this.stringRefs.set(s, this.stringRefs.size + 1);
  }

  private reference(type8: number, ref: number): void {
    const size = countBytes(ref);
    this.out.byte((type8 + size - 1) * 8);
    this.out.int(ref, size);
  }

  /** A type with a count: embedded in the type byte when < 16, else `_8/_16/_24`. */
  private counted(embedded: number, type8: number, count: number): void {
    if (count < 16) {
      this.out.byte(count * 16 + embedded * 4 + 2);
    } else {
      const size = countBytes(count);
      this.out.byte((type8 + size - 1) * 8);
      this.out.int(count, size);
    }
  }

  private table(value: LuaValue[] | { [key: string]: LuaValue }): void {
    const ref = this.tableRefs.get(value);
    if (ref !== undefined) {
      this.reference(T.TABLEREF_8, ref);
      return;
    }
    // Registered before the contents, as LibSerialize does, so references stay in step.
    this.tableRefs.set(value, this.tableRefs.size + 1);
    if (Array.isArray(value)) this.array(value);
    else this.map(value);
  }

  private array(value: LuaValue[]): void {
    // Indexed loop, not .some(): sparse arrays have holes that iteration methods skip.
    for (let i = 0; i < value.length; i++) {
      if (value[i] === null || value[i] === undefined) {
        throw new SerializeError('Arrays cannot contain nil: Lua would truncate them');
      }
    }
    this.counted(E.ARRAY, T.ARRAY_8, value.length);
    for (const v of value) this.write(v);
  }

  /** String keys in sorted order (LibSerialize's `stable` option); an empty map is `{}`. */
  private map(value: { [key: string]: LuaValue }): void {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.length === 0) {
      this.counted(E.ARRAY, T.ARRAY_8, 0);
      return;
    }
    this.counted(E.TABLE, T.TABLE_8, entries.length);
    for (const [k, v] of entries) {
      this.write(k);
      this.write(v);
    }
  }
}

/** Serialize one value to LibSerialize bytes. Throws {@link SerializeError} on unsupported input. */
export function serialize(value: LuaValue): Uint8Array {
  return new Serializer().run(value);
}

// ── Reading ──────────────────────────────────────────────────────────────────

type Table = LuaValue[] | { [key: string]: LuaValue };

class Deserializer {
  private pos = 0;
  private depth = 0;
  private nodes = 0;
  private readonly stringRefs: string[] = [];
  private readonly tableRefs: Table[] = [];
  /** Expanded size of each finished table; a missing entry means "still being read". */
  private readonly weights = new WeakMap<Table, number>();

  constructor(
    private readonly input: Uint8Array,
    private readonly limits: DeserializeLimits,
  ) {}

  run(): LuaValue {
    const version = this.byte();
    if (version > DESERIALIZATION_VERSION) {
      throw new SerializeError(`Unknown serialization version ${version}`);
    }
    if (this.pos >= this.input.length) throw new SerializeError('No value serialized');
    const value = this.value();
    if (this.pos !== this.input.length) {
      throw new SerializeError('Expected exactly one serialized value');
    }
    return value;
  }

  private byte(): number {
    const b = this.input[this.pos];
    if (b === undefined) throw new SerializeError('Unexpected end of input');
    this.pos++;
    return b;
  }

  private int(size: number): number {
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + this.byte();
    return n;
  }

  private bytes(n: number): Uint8Array {
    if (this.pos + n > this.input.length) throw new SerializeError('Unexpected end of input');
    const out = this.input.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  private count(nodes: number): void {
    this.nodes += nodes;
    if (this.nodes > this.limits.maxNodes) {
      throw new SerializeError(`More than ${this.limits.maxNodes} values`);
    }
  }

  private value(): LuaValue {
    this.count(1);
    const b = this.byte();
    if (b % 2 === 1) return (b - 1) / 2;
    if (b % 4 === 2) return this.embedded((b - 2) / 4);
    if (b % 8 === 4) {
      const packed = this.byte() * 256 + b;
      return b % 16 === 12 ? -(packed - 12) / 16 : (packed - 4) / 16;
    }
    return this.typed(b / 8);
  }

  private embedded(typeAndCount: number): LuaValue {
    const type = typeAndCount % 4;
    const count = Math.floor(typeAndCount / 4);
    if (type === E.STRING) return this.string(count);
    if (type === E.TABLE) return this.table(0, count);
    if (type === E.ARRAY) return this.table(count, 0);
    return this.table((count % 4) + 1, Math.floor(count / 4) + 1);
  }

  private typed(type: number): LuaValue {
    if (type === T.NIL) return null;
    if (type >= T.NUM_16_POS && type <= T.NUM_64_NEG) {
      const size = [2, 3, 4, 7][Math.floor((type - 1) / 2)] ?? 0;
      const n = this.int(size);
      return type % 2 === 0 ? -n : n;
    }
    if (type === T.NUM_FLOAT) {
      const b = this.bytes(8);
      return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, false);
    }
    if (type === T.NUM_FLOATSTR || type === T.NUM_FLOATSTR_NEG) return this.floatString(type);
    if (type === T.BOOL_T || type === T.BOOL_F) return type === T.BOOL_T;
    return this.sized(type);
  }

  private floatString(type: number): number {
    const text = fromUtf8.decode(this.bytes(this.byte()));
    const n = Number(text.trim());
    if (text.trim() === '' || Number.isNaN(n)) {
      throw new SerializeError(`Bad number string "${text}"`);
    }
    return type === T.NUM_FLOATSTR_NEG ? -n : n;
  }

  /** `_8/_16/_24` families: strings, tables, arrays, mixed, and references. */
  private sized(type: number): LuaValue {
    const family = [T.STR_8, T.TABLE_8, T.ARRAY_8, T.MIXED_8, T.STRINGREF_8, T.TABLEREF_8].find(
      (base) => type >= base && type < base + 3,
    );
    if (family === undefined) throw new SerializeError(`Unknown type ${type}`);
    const size = type - family + 1;
    if (family === T.STR_8) return this.string(this.int(size));
    if (family === T.TABLE_8) return this.table(0, this.int(size));
    if (family === T.ARRAY_8) return this.table(this.int(size), 0);
    if (family === T.MIXED_8) return this.table(this.int(size), this.int(size));
    if (family === T.STRINGREF_8) return this.stringRef(this.int(size));
    return this.tableRef(this.int(size));
  }

  private string(len: number): string {
    const s = fromUtf8.decode(this.bytes(len));
    if (len > 2) this.stringRefs.push(s);
    return s;
  }

  private stringRef(ref: number): string {
    const s = this.stringRefs[ref - 1];
    if (s === undefined) throw new SerializeError(`Bad string reference ${ref}`);
    return s;
  }

  private tableRef(ref: number): Table {
    const t = this.tableRefs[ref - 1];
    if (t === undefined) throw new SerializeError(`Bad table reference ${ref}`);
    const weight = this.weights.get(t);
    if (weight === undefined) throw new SerializeError('Cyclic tables are not supported');
    // Count the referenced table as if it were repeated, so consumers that walk the
    // value (Zod, JSON) stay within maxNodes.
    this.count(weight - 1);
    return t;
  }

  private table(arrayCount: number, mapCount: number): Table {
    if (++this.depth > this.limits.maxDepth) {
      throw new SerializeError(`Tables nested deeper than ${this.limits.maxDepth}`);
    }
    const startNodes = this.nodes;
    const array: LuaValue[] = [];
    // The slot is claimed before the contents, as LibSerialize does, so later indexes line up.
    const slot = this.tableRefs.push(array) - 1;
    for (let i = 0; i < arrayCount; i++) array.push(this.value());
    const table = mapCount === 0 ? array : this.readMap(array, mapCount);
    this.tableRefs[slot] = table;
    this.depth--;
    this.weights.set(table, this.nodes - startNodes + 1);
    return table;
  }

  /** Map and mixed tables become objects; array-part keys become "1", "2", …. */
  private readMap(array: LuaValue[], mapCount: number): Table {
    const obj: { [key: string]: LuaValue } = {};
    array.forEach((v, i) => {
      define(obj, String(i + 1), v);
    });
    for (let i = 0; i < mapCount; i++) {
      const key = this.value();
      const v = this.value();
      if (typeof key !== 'string' && typeof key !== 'number') {
        throw new SerializeError(`Unsupported table key type ${typeof key}`);
      }
      if (v !== null) define(obj, String(key), v);
    }
    return obj;
  }
}

/** Own-property write that can't reach `Object.prototype` (a key may be "__proto__"). */
function define(obj: object, key: string, value: LuaValue): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Deserialize LibSerialize bytes holding exactly one value. Throws {@link SerializeError}. */
export function deserialize(
  input: Uint8Array,
  limits: DeserializeLimits = DEFAULT_DESERIALIZE_LIMITS,
): LuaValue {
  return new Deserializer(input, limits).run();
}
