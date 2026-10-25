import { describe, expect, it } from 'vitest';
import { resolveThemes } from './build';
import { CLASS_KEYS, checkContrast, QUALITY_KEYS, ROLE_KEYS, SIGNUP_KEYS } from './contrast';
import { discordColor, tokenValue } from './index';
import { NODES, THEMES } from './nodes';
import { flattenNode } from './resolve';

const themes = resolveThemes();
const declaredIn = (tier: string) =>
  new Set(
    Object.values(NODES)
      .flatMap(flattenNode)
      .filter((t) => t.tier === tier)
      .map((t) => t.id),
  );

describe('theme coverage', () => {
  it('exports dark (default) and parchment', () => {
    expect(THEMES.map((t) => [t.node, t.isDefault])).toEqual([
      ['vintage-dark', true],
      ['vintage-parchment', false],
    ]);
  });

  it.each(['semantic', 'component'])('every theme defines every %s token', (tier) => {
    const required = [...declaredIn(tier)];
    expect(required.length).toBeGreaterThan(0);
    for (const { theme, tokens } of themes) {
      const missing = required.filter((id) => tokens.get(id)?.tier !== tier);
      expect(missing, theme.node).toEqual([]);
    }
  });

  it('themes resolve the same token ids', () => {
    const [first, ...rest] = themes.map(({ tokens }) => [...tokens.keys()].sort());
    for (const ids of rest) expect(ids).toEqual(first);
  });
});

describe('WoW semantic tokens', () => {
  const dark = themes[0]!.tokens;
  const value = (id: string) => dark.get(id)?.resolved;

  it('uses Blizzard item quality colors', () => {
    expect(Object.fromEntries(QUALITY_KEYS.map((k) => [k, value(`color.quality.${k}`)]))).toEqual({
      poor: '#9d9d9d',
      common: '#ffffff',
      uncommon: '#1eff00',
      rare: '#0070dd',
      epic: '#a335ee',
      legendary: '#ff8000',
    });
  });

  it('uses Blizzard class colors', () => {
    expect(Object.fromEntries(CLASS_KEYS.map((k) => [k, value(`color.class.${k}`)]))).toEqual({
      warrior: '#c69b6d',
      paladin: '#f48cba',
      hunter: '#aad372',
      rogue: '#fff468',
      priest: '#ffffff',
      shaman: '#0070dd',
      mage: '#3fc7eb',
      warlock: '#8788ee',
      druid: '#ff7c0a',
    });
  });

  it.each([
    ['role', ROLE_KEYS],
    ['signup', SIGNUP_KEYS],
  ])('defines every %s color as semantic', (group, keys) => {
    for (const key of keys) {
      expect(dark.get(`color.${group}.${key}`)?.tier, key).toBe('semantic');
    }
  });

  it('keeps quality and class identical across themes', () => {
    for (const id of [...dark.keys()].filter((k) => /^color\.(quality|class)\./.test(k))) {
      const values = themes.map(({ tokens }) => tokens.get(id)?.resolved);
      expect(new Set(values).size, id).toBe(1);
    }
  });
});

describe('WCAG contrast', () => {
  it.each(themes.map((t) => [t.theme.node, t.tokens] as const))(
    '%s passes every text-on-surface pair',
    (_name, tokens) => {
      const failures = checkContrast(tokens)
        .filter((r) => !r.pass)
        .map((r) => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min}`);
      expect(failures).toEqual([]);
    },
  );

  it('fails a pair that misses AA', () => {
    const [result] = checkContrast(themes[0]!.tokens, [
      { fg: 'color.iron.700', bg: 'color.surface.canvas', min: 4.5 },
    ]);
    expect(result).toMatchObject({ pass: false });
  });
});

describe('TS helpers', () => {
  it('reads resolved values and Discord colors from the generated map', () => {
    expect(tokenValue('vintage-parchment', 'color.surface.canvas')).toBe('#f3ead7');
    expect(discordColor('color.quality.epic')).toBe(0xa335ee);
    expect(discordColor('color.signup.declined', 'vintage-parchment')).toBe(0x750a0e);
    expect(() => discordColor('font.weight.bold')).toThrowError(/not a color/);
  });
});
