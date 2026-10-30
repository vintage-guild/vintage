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
- An import's optional `bench` lists who could fill in (up to 80): roster entries for characters
  who are not on the roster, each with a `reason` (`standby`: they answered Standby; `queued`:
  waiting past the raid size; `benched`: the leader or the comp sat them out). A bench character
  is never also rostered, and is listed once. Imports without `bench` still decode, so it stays
  schema v1 (`raid-import-bench.v1` is the fixture; `raid-import.v1` keeps an import without one).
- An export's optional `standby` lists the bench people the leader confirms stood by (up to 80),
  each `{ characterId, name, reason }` from the import's bench. Who came in is in the attendance
  instead. Exports without it still decode (`raid-export-standby.v1` is the fixture;
  `raid-export.v1` keeps an export without one).
- An export's optional `encounters` lists every boss attempt in the raid (up to 200), each
  `{ encounterId?, name, startedAt, endedAt, killed, size? }`. The id is the game's encounter id,
  left out when the game kept it secret. Exports without it still decode
  (`raid-export-encounters.v1` is the fixture).

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
`fixtures/lua-made.json` holds the same payloads encoded by the addon's Lua codec (the real
LibSerialize and LibDeflate it ships), which the TS tests decode. The addon's busted suite fails
while a committed string differs from what its Lua encodes, so CI's Lua 5.1 run keeps the file
honest.

The Lua side is `addon/Vintage/Core/BridgeFormat` (codec and schemas, the same limits and error
codes, except that its inflated-size cap is checked after inflating). For every fixture it decodes `encoded` to `payload` (or fails with `error`), decodes the
Lua-made string the same way, and round-trips its own encoding. After changing a fixture:

1. `pnpm fixtures:bridge` (these JSON files, and `wow-data.json` with the class and role lists).
2. `python addon/Vintage/Tools/validate.py --write-fixtures` renders them as the Lua table the
   busted specs read (`Tests/fixtures/bridge_fixtures.lua`).
3. In `addon/Vintage`: `VINTAGE_WRITE_FIXTURES=1 busted Tests/core/bridge_codec_spec.lua`
   rewrites `lua-made.json` under Lua 5.1 (the comparisons with the old Lua-made strings skip in
   this run).
4. `--write-fixtures` again, so the Lua table carries the new Lua-made strings. The addon gate
   fails while that table is stale.
