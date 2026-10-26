import { describe, expect, it } from 'vitest';
import { decodeBridge, encodeBridge } from './bridge';
import { encodeValue } from './envelope';
import { buildFixtures, FIXTURES } from './fixtures';

const committed = Object.fromEntries(
  Object.entries(
    import.meta.glob('../fixtures/*.json', { eager: true, query: '?raw', import: 'default' }),
  ).map(([path, text]) => [path.replace('../fixtures/', ''), text.replaceAll('\r\n', '\n')]),
);
const { 'lua-made.json': luaMadeText, ...fixtureFiles } = committed;
const luaMade = JSON.parse(luaMadeText ?? '{}') as { strings: Record<string, string> };

describe('golden fixtures', () => {
  it('are up to date (run pnpm fixtures:bridge)', () => {
    expect(fixtureFiles).toEqual(buildFixtures());
  });

  describe.each(Object.entries(FIXTURES))('%s', (name, fixture) => {
    const file = JSON.parse(fixtureFiles[`${name}.json`] ?? '{}') as { encoded: string };

    it('encodes to the committed string', () => {
      expect(encodeValue(fixture.payload)).toBe(file.encoded);
    });

    for (const [source, encoded] of [
      ['TS', file.encoded],
      ['Lua (LibSerialize + LibDeflate)', luaMade.strings[name]],
    ] as const) {
      it(`decodes the ${source}-made string`, () => {
        expect(encoded, `no ${source} string for ${name}`).toBeDefined();
        const decoded = decodeBridge(encoded ?? '');
        if (fixture.error) {
          expect(decoded.ok ? 'ok' : decoded.error.code).toBe(fixture.error);
        } else {
          expect(decoded).toEqual({ ok: true, value: fixture.payload });
        }
      });
    }

    if (!fixture.error) {
      it('passes its schema, so encodeBridge produces the same string', () => {
        const encoded = encodeBridge(fixture.payload as never);
        expect(encoded).toEqual({ ok: true, value: file.encoded });
      });
    }
  });

  it('every Lua-made string belongs to a fixture', () => {
    expect(Object.keys(luaMade.strings).sort()).toEqual(Object.keys(FIXTURES).sort());
  });
});
