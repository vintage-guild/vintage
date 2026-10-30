import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeBridge, decodeRaidExport, decodeRaidImport, encodeBridge } from './bridge';
import { DEFAULT_DECODE_LIMITS, encodeValue, PREFIX } from './envelope';
import type { BridgeErrorCode, BridgeResult } from './errors';
import { FIXTURES } from './fixtures';
import { serialize } from './libserialize';
import { encodeForPrint } from './print';
import type { RaidExport, RaidImport } from './schemas';

const raidImport = FIXTURES['raid-import.v1']?.payload as RaidImport;
const raidImportWithBench = FIXTURES['raid-import-bench.v1']?.payload as RaidImport;
const raidExport = FIXTURES['raid-export.v1']?.payload as RaidExport;
const raidExportWithStandby = FIXTURES['raid-export-standby.v1']?.payload as RaidExport;

function errorCode<T>(result: BridgeResult<T>): BridgeErrorCode | 'ok' {
  return result.ok ? 'ok' : result.error.code;
}

function encoded<T>(result: BridgeResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('encode and decode', () => {
  it('round-trips both kinds', () => {
    expect(decodeBridge(encoded(encodeBridge(raidImport)))).toEqual({
      ok: true,
      value: raidImport,
    });
    expect(decodeBridge(encoded(encodeBridge(raidExport)))).toEqual({
      ok: true,
      value: raidExport,
    });
  });

  it('starts every string with the envelope prefix', () => {
    expect(encoded(encodeBridge(raidExport)).startsWith(PREFIX)).toBe(true);
  });

  it('ignores whitespace around a pasted string', () => {
    const text = `\n  ${encoded(encodeBridge(raidExport))}  \r\n`;
    expect(errorCode(decodeBridge(text))).toBe('ok');
  });

  it('decodes by kind and refuses the other kind', () => {
    const exportText = encoded(encodeBridge(raidExport));
    const importText = encoded(encodeBridge(raidImport));
    expect(errorCode(decodeRaidExport(exportText))).toBe('ok');
    expect(errorCode(decodeRaidImport(importText))).toBe('ok');
    const wrong = decodeRaidImport(exportText);
    expect(wrong).toMatchObject({
      ok: false,
      error: { code: 'WRONG_KIND', details: { expected: 'raid-import', actual: 'raid-export' } },
    });
  });

  it('refuses to encode a payload that breaks its schema', () => {
    const bad = { ...raidExport, exporter: 'X' };
    expect(errorCode(encodeBridge(bad))).toBe('INVALID_PAYLOAD');
  });

  it('strips unknown fields when encoding', () => {
    const extra = { ...raidExport, debug: 'drop me' } as RaidExport;
    expect(decodeBridge(encoded(encodeBridge(extra)))).toEqual({ ok: true, value: raidExport });
  });
});

describe('typed errors, never throws', () => {
  it.each<[string, string, BridgeErrorCode]>([
    ['empty', '', 'NOT_A_BRIDGE_STRING'],
    ['another addon', '!WA:2!abcdef', 'NOT_A_BRIDGE_STRING'],
    ['newer envelope', '!VIN:2!abcdef', 'UNSUPPORTED_ENCODING'],
    ['bad characters', `${PREFIX}abc$def`, 'CORRUPT'],
    ['not deflate', `${PREFIX}${encodeForPrint(Uint8Array.from([0xff, 0xff, 0xff]))}`, 'CORRUPT'],
    ['nothing after the prefix', PREFIX, 'CORRUPT'],
  ])('%s → %s', (_, input, code) => {
    const result = decodeBridge(input);
    expect(errorCode(result)).toBe(code);
    if (!result.ok) expect(result.error.suggestion.length).toBeGreaterThan(0);
  });

  it('reports a truncated copy as corrupt', () => {
    const text = encoded(encodeBridge(raidImport));
    expect(errorCode(decodeBridge(text.slice(0, -20)))).toBe('CORRUPT');
  });

  it('reports deflated bytes that are not LibSerialize output as corrupt', () => {
    const text = PREFIX + encodeForPrint(deflateSync(Uint8Array.from([1, 0xd0, 9])));
    expect(errorCode(decodeBridge(text))).toBe('CORRUPT');
  });

  it('refuses a newer schema version with the versions in details', () => {
    const result = decodeBridge(encodeValue({ ...raidExport, v: 7 }));
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_VERSION', details: { version: 7, supported: 1 } },
    });
  });

  it.each([
    ['a bare string', 'hello'],
    ['an array', [1, 2]],
    ['no version', { kind: 'raid-export' }],
    ['a fractional version', { v: 1.5, kind: 'raid-export' }],
  ])('refuses %s as an invalid payload', (_, value) => {
    expect(errorCode(decodeBridge(encodeValue(value)))).toBe('INVALID_PAYLOAD');
  });

  it('refuses an unknown kind', () => {
    expect(errorCode(decodeBridge(encodeValue({ v: 1, kind: 'raid-teleport' })))).toBe(
      'UNKNOWN_KIND',
    );
  });

  it('lists schema issues with paths', () => {
    const result = decodeBridge(encodeValue({ ...raidExport, loot: [{ itemId: -1 }] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_PAYLOAD');
    const issues = (result.error.details?.issues ?? []) as { path: string }[];
    const paths = issues.map((i) => i.path);
    expect(paths).toContain('loot.0.itemId');
    expect(paths).toContain('loot.0.looter');
  });

  it('refuses strings over the length limit before decoding them', () => {
    const text = encoded(encodeBridge(raidImport));
    const limits = { ...DEFAULT_DECODE_LIMITS, maxEncodedLength: 50 };
    expect(errorCode(decodeBridge(text, limits))).toBe('TOO_LARGE');
  });

  it('stops a deflate bomb at the inflate limit', () => {
    // 16 MiB of zeros behind a LibSerialize string header compresses to ~16 KiB.
    const big = new Uint8Array(16 * 1024 * 1024);
    big.set([1, 0x80, 0xff, 0xff, 0xff]); // version 1, STR_24 of 16 MiB
    const text = PREFIX + encodeForPrint(deflateSync(big));
    expect(text.length).toBeLessThan(DEFAULT_DECODE_LIMITS.maxEncodedLength);
    expect(errorCode(decodeBridge(text))).toBe('TOO_LARGE');
  });
});

describe('import references', () => {
  it('refuses groups that name someone off the roster', () => {
    const bad = { ...raidImport, groups: [{ group: 1, characterIds: ['c_ghost'] }] };
    expect(errorCode(encodeBridge(bad))).toBe('INVALID_PAYLOAD');
  });

  it('refuses a character in two groups, or a group listed twice', () => {
    const twice = {
      ...raidImport,
      groups: [
        { group: 1, characterIds: ['c_aeryn'] },
        { group: 2, characterIds: ['c_aeryn'] },
      ],
    };
    const dupGroup = {
      ...raidImport,
      groups: [
        { group: 1, characterIds: ['c_aeryn'] },
        { group: 1, characterIds: ['c_brann'] },
      ],
    };
    expect(errorCode(encodeBridge(twice))).toBe('INVALID_PAYLOAD');
    expect(errorCode(encodeBridge(dupGroup))).toBe('INVALID_PAYLOAD');
  });

  it('refuses duplicate roster ids, candidate items, and ranked characters', () => {
    const [first] = raidImport.roster;
    const dupRoster = {
      ...raidImport,
      roster: [...raidImport.roster, { ...first!, name: 'Other' }],
    };
    const [item] = raidImport.candidates;
    const dupItem = { ...raidImport, candidates: [item!, item!] };
    const ranked = [
      { characterId: 'c_aeryn', reason: 'a' },
      { characterId: 'c_aeryn', reason: 'b' },
    ];
    const dupRanked = { ...raidImport, candidates: [{ itemId: 1, ranked }] };
    for (const bad of [dupRoster, dupItem, dupRanked]) {
      expect(errorCode(encodeBridge(bad))).toBe('INVALID_PAYLOAD');
    }
  });

  it('reports non-UTF-8 text as corrupt', () => {
    const text = PREFIX + encodeForPrint(deflateSync(Uint8Array.from([1, 0x22, 0xff, 0xfe])));
    expect(errorCode(decodeBridge(text))).toBe('CORRUPT');
  });

  it('refuses a bench character who is also rostered, or benched twice', () => {
    const [first] = raidImportWithBench.bench ?? [];
    const rostered = {
      ...raidImportWithBench,
      bench: [{ ...first!, characterId: 'c_brann' }],
    };
    const twice = {
      ...raidImportWithBench,
      bench: [first!, { ...first!, reason: 'queued' as const }],
    };
    const issuePaths = (payload: RaidImport) => {
      const result = encodeBridge(payload);
      const issues = (result.ok ? [] : (result.error.details?.issues ?? [])) as { path: string }[];
      return issues.map((i) => i.path);
    };
    expect(issuePaths(rostered)).toEqual(['bench.0.characterId']);
    expect(issuePaths(twice)).toEqual(['bench.1.characterId']);
  });

  it('decodes an import without a bench, as older strings are', () => {
    const { bench: _, ...withoutBench } = raidImportWithBench;
    const decoded = decodeRaidImport(encoded(encodeBridge(withoutBench)));
    expect(decoded).toEqual({ ok: true, value: withoutBench });
    expect(decoded.ok && 'bench' in decoded.value).toBe(false);
  });

  it('refuses a bench reason it does not know', () => {
    const [first] = raidImportWithBench.bench ?? [];
    const bad = { ...raidImportWithBench, bench: [{ ...first!, reason: 'late' }] };
    expect(errorCode(encodeBridge(bad as never))).toBe('INVALID_PAYLOAD');
  });

  it('decodes an export without a standby list, as older strings are', () => {
    const { standby: _, ...withoutStandby } = raidExportWithStandby;
    const decoded = decodeRaidExport(encoded(encodeBridge(withoutStandby)));
    expect(decoded).toEqual({ ok: true, value: withoutStandby });
    expect(decoded.ok && 'standby' in decoded.value).toBe(false);
  });

  it('refuses a standby entry with an unknown reason or no name', () => {
    const [first] = raidExportWithStandby.standby ?? [];
    const late = { ...raidExportWithStandby, standby: [{ ...first!, reason: 'late' }] };
    const nameless = { ...raidExportWithStandby, standby: [{ ...first!, name: 'G' }] };
    expect(errorCode(encodeBridge(late as never))).toBe('INVALID_PAYLOAD');
    expect(errorCode(encodeBridge(nameless))).toBe('INVALID_PAYLOAD');
  });

  it('refuses loot candidates who are not rostered', () => {
    const bad = {
      ...raidImport,
      candidates: [{ itemId: 1, ranked: [{ characterId: 'c_ghost', reason: '' }] }],
    };
    expect(errorCode(encodeBridge(bad))).toBe('INVALID_PAYLOAD');
  });
});

describe('size', () => {
  it('keeps a 40-person import with 100 items of candidates pasteable', () => {
    const roster = Array.from({ length: 40 }, (_, i) => ({
      characterId: `c_${i}`,
      name: `Raider${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
      class: 'mage' as const,
      role: 'ranged' as const,
    }));
    const payload: RaidImport = {
      ...raidImport,
      roster,
      groups: Array.from({ length: 8 }, (_, g) => ({
        group: g + 1,
        characterIds: roster.slice(g * 5, g * 5 + 5).map((r) => r.characterId),
      })),
      candidates: Array.from({ length: 100 }, (_, i) => ({
        itemId: 16_000 + i,
        ranked: roster.slice(0, 10).map((r, rank) => ({
          characterId: r.characterId,
          reason: `Prio ${rank + 1}, 3 raids attended`,
        })),
      })),
    };
    const text = encoded(encodeBridge(payload));
    expect(serialize(payload as never).length).toBeGreaterThan(text.length);
    expect(text.length).toBeLessThan(20_000);
    expect(decodeBridge(text)).toEqual({ ok: true, value: payload });
  });
});
