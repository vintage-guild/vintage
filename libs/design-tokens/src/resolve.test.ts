import { describe, expect, it } from 'vitest';
import { NODES } from './nodes';
import { ancestry, flattenNode, redundantOverrides, resolveNode, TokenError } from './resolve';
import type { DtcgGroup, TokenNodeFile } from './types';

function node(
  name: string,
  parent: string | null,
  tiers: { global?: DtcgGroup; semantic?: DtcgGroup; component?: DtcgGroup },
): TokenNodeFile {
  return { $extensions: { 'dev.vintage.node': { name, parent } }, ...tiers };
}

const base = node('base', null, {
  global: {
    color: {
      $type: 'color',
      ink: { $value: '#111111' },
      paper: { $value: '#eeeeee' },
      gold: { $value: '#ffcc00' },
    },
  },
  semantic: {
    color: {
      $type: 'color',
      text: { $value: '{color.ink}', $description: 'Body text.' },
      bg: { $value: '{color.paper}' },
    },
  },
  component: { card: { $type: 'color', bg: { $value: '{color.bg}' } } },
});
const brand = node('brand', 'base', {
  global: { color: { ink: { $value: '#222222' } } },
});
const dark = node('dark', 'brand', {
  semantic: { color: { bg: { $value: '{color.ink}' }, text: { $value: '{color.paper}' } } },
});
const tree = { base, brand, dark };

describe('flattenNode', () => {
  it('flattens tiers into dotted ids and inherits group $type', () => {
    const tokens = flattenNode(base);
    expect(tokens.map((t) => `${t.tier}:${t.id}:${t.type}`)).toEqual([
      'global:color.ink:color',
      'global:color.paper:color',
      'global:color.gold:color',
      'semantic:color.text:color',
      'semantic:color.bg:color',
      'component:card.bg:color',
    ]);
  });

  it('leaves the type open on an override that does not restate it', () => {
    expect(flattenNode(brand)[0]).toMatchObject({ id: 'color.ink', type: undefined });
  });
});

describe('resolveNode inheritance', () => {
  it('walks the ancestry root first', () => {
    expect(ancestry('dark', tree)).toEqual(['base', 'brand', 'dark']);
  });

  it('lets a child override only what it declares and keeps the rest', () => {
    const resolved = resolveNode('brand', tree);
    expect(resolved.get('color.ink')).toMatchObject({
      resolved: '#222222',
      origin: 'brand',
      lineage: ['base', 'brand'],
      tier: 'global',
      type: 'color',
    });
    expect(resolved.get('color.paper')).toMatchObject({ resolved: '#eeeeee', origin: 'base' });
  });

  it('resolves aliases against the most derived values', () => {
    const resolved = resolveNode('dark', tree);
    // card.bg (base) → color.bg (overridden in dark) → color.ink (overridden in brand)
    expect(resolved.get('card.bg')).toMatchObject({
      value: '{color.bg}',
      alias: 'color.bg',
      resolved: '#222222',
    });
    expect(resolved.get('color.text')).toMatchObject({
      resolved: '#eeeeee',
      description: 'Body text.',
      lineage: ['base', 'dark'],
    });
  });

  it('does not let a child change its ancestors', () => {
    resolveNode('dark', tree);
    expect(resolveNode('base', tree).get('color.bg')?.resolved).toBe('#eeeeee');
  });

  it('resolves the real tree: dark surfaces flow into AFD component tokens', () => {
    const dark = resolveNode('vintage-dark', NODES);
    expect(dark.get('card.bg')).toMatchObject({ resolved: '#292526', origin: 'afd-site' });
    expect(dark.get('color.surface.raised')?.lineage).toEqual(['afd-site', 'vintage-dark']);
    expect(dark.get('font.family.display')?.origin).toBe('vintage');
    expect(dark.get('font.family.mono')?.origin).toBe('afd-site');
  });
});

describe('resolveNode errors', () => {
  const fails = (nodes: Record<string, TokenNodeFile>, name: string, message: RegExp) =>
    expect(() => resolveNode(name, nodes)).toThrowError(message);

  it('rejects an unknown alias', () => {
    const bad = node('bad', 'base', { semantic: { color: { bg: { $value: '{color.nope}' } } } });
    fails({ base, bad }, 'bad', /unknown token \{color\.nope\}/);
  });

  it('rejects an alias cycle', () => {
    const bad = node('bad', null, {
      global: { a: { $type: 'color', $value: '{b}' }, b: { $type: 'color', $value: '{a}' } },
    });
    fails({ bad }, 'bad', /alias cycle/);
  });

  it('rejects an alias across types', () => {
    const bad = node('bad', 'base', {
      global: { size: { $type: 'dimension', $value: '{color.ink}' } },
    });
    fails({ base, bad }, 'bad', /\(dimension\) references \{color\.ink\} \(color\)/);
  });

  it('rejects an override that changes type or tier', () => {
    const retyped = node('bad', 'base', {
      global: { color: { ink: { $type: 'string', $value: 'x' } } },
    });
    fails({ base, bad: retyped }, 'bad', /overrides keep the type/);
    const moved = node('bad', 'base', { semantic: { color: { ink: { $value: '#000000' } } } });
    fails({ base, bad: moved }, 'bad', /overrides keep the tier/);
  });

  it('rejects a new token without a type', () => {
    const bad = node('bad', 'base', { semantic: { extra: { $value: '#000000' } } });
    fails({ base, bad }, 'bad', /is new here and needs a \$type/);
  });

  it('rejects invalid literals', () => {
    const bad = node('bad', null, { global: { c: { $type: 'color', $value: 'red' } } });
    expect(() => flattenNode(bad)).toThrowError(TokenError);
    const upper = node('bad', null, { global: { c: { $type: 'color', $value: '#FFFFFF' } } });
    expect(() => flattenNode(upper)).toThrowError(/invalid color/);
  });

  it('rejects non-kebab segments and two ids with one CSS name', () => {
    const camel = node('bad', null, {
      global: { textColor: { $type: 'color', $value: '#000000' } },
    });
    expect(() => flattenNode(camel)).toThrowError(/kebab-case/);
    const clash = node('bad', null, {
      global: {
        $type: 'color',
        'a-b': { $value: '#000000' },
        a: { b: { $value: '#000000' } },
      },
    });
    fails({ bad: clash }, 'bad', /both map to --a-b/);
  });

  it('rejects broken inheritance', () => {
    fails({ base }, 'ghost', /unknown node "ghost"/);
    const orphan = node('orphan', 'ghost', {});
    fails({ orphan }, 'orphan', /unknown node "ghost"/);
    const a = node('a', 'b', {});
    const b = node('b', 'a', {});
    fails({ a, b }, 'a', /inheritance cycle/);
  });
});

describe('redundantOverrides', () => {
  it('flags an override that repeats the inherited value', () => {
    const lazy = node('lazy', 'base', { global: { color: { gold: { $value: '#ffcc00' } } } });
    expect(redundantOverrides('lazy', { base, lazy })).toEqual(['color.gold']);
  });

  it.each(Object.keys(NODES))('%s overrides only what changes', (name) => {
    expect(redundantOverrides(name, NODES)).toEqual([]);
  });
});
