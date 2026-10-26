# @vintage/bridge-format

The paste strings the website and the `Vintage` addon trade (PLAN §3.5). Web → game: an
**import** with the roster, raid groups, loot settings, and precomputed loot candidates.
Game → web: an **export** with attendance snapshots, loot received, and item data the client
revealed. This package holds the TS side: Zod schemas, the codec, and the golden fixtures the
addon's Lua codec is tested against.

```ts
import { decodeRaidExport, encodeBridge } from '@vintage/bridge-format';

const text = encodeBridge(raidImport); // { ok: true, value: '!VIN:1!…' } or a BridgeError
const pasted = decodeRaidExport(input); // never throws
if (!pasted.ok) return pasted.error; // shaped like an AFD CommandError: code, message, suggestion
```

## The string

```
!VIN:1!  +  EncodeForPrint( Deflate( LibSerialize(payload) ) )
```

| Layer | What | Lua side |
|---|---|---|
| Prefix | `!VIN:<envelope>!`. Envelope 1 is the pipeline below | string match |
| Print encoding | LibDeflate's 64-character alphabet (`a–z A–Z 0–9 ( )`), 3 bytes → 4 chars, LSB first. Not base64 | `LibDeflate:DecodeForPrint` |
| Compression | Raw DEFLATE (RFC 1951) via [fflate](https://github.com/101arrowz/fflate) | `LibDeflate:DecompressDeflate` |
| Serialization | LibSerialize's wire format, serialization version 1, ported in `src/libserialize.ts` | `LibSerialize:Deserialize` |

Map keys are written in LibSerialize's `stable` order, so `SerializeEx({ stable = true }, v)` in
Lua produces the same serialized bytes as this package (checked against LibSerialize MINOR 7;
releases before it write `-0` as `0`, which decodes the same). The compressed bytes differ (fflate and
LibDeflate pick different matches), so compare decoded values, not encoded strings, across sides.

## Payload rules

- `v` is the schema version (`BRIDGE_SCHEMA_VERSION`, now 1) and `kind` is `raid-import` or
  `raid-export`. A newer `v` decodes to `UNSUPPORTED_VERSION`, never a guess.
- Changing a payload incompatibly bumps `v`, keeps the old schema decodable while the addon
  catches up, and updates the fixtures on both sides.
- Times are unix seconds (Lua `time()`). Only strings, integers, booleans, arrays, and
  string-keyed objects; no `null` (Lua tables can't hold nil).
- Every object has a required field: LibSerialize writes `{}` the same as an empty array.
- Inside an import, characters are referred to by `characterId`; groups and candidates must name
  rostered characters.

## Errors

`decodeBridge`, `decodeRaidImport`, `decodeRaidExport`, and `encodeBridge` return
`{ ok: true, value } | { ok: false, error }`. Codes: `NOT_A_BRIDGE_STRING`,
`UNSUPPORTED_ENCODING`, `TOO_LARGE`, `CORRUPT`, `UNSUPPORTED_VERSION`, `UNKNOWN_KIND`,
`WRONG_KIND`, `INVALID_PAYLOAD` (with Zod issue paths in `details.issues`).

Pasted strings are untrusted. `DEFAULT_DECODE_LIMITS` caps the string length (1M chars), the
inflated size (2 MiB, enforced while inflating), table nesting (32), and values after expanding
repeated table references (200k), and rejects cyclic tables.

## Fixtures

`fixtures/*.json` hold `{ description, payload, encoded, error? }`. Edit `src/fixtures.ts`, then
`pnpm fixtures:bridge`; the tests fail when a committed fixture is stale.
`fixtures/lua-made.json` holds the same payloads encoded by the real LibSerialize and
LibDeflate (Lua 5.4), which the TS tests decode. When you change a fixture payload, delete its
entry there until the addon's busted suite regenerates it.

The addon's Lua codec should, for every fixture: decode `encoded` to `payload` (or fail with
`error`), and decode its own encoding of `payload` back to `payload`.
