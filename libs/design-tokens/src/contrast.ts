import { contrastRatio } from './color';
import type { ResolvedTokens } from './types';

export interface ContrastPair {
  fg: string;
  bg: string;
  /** WCAG 2.x minimum: 4.5 for body text (AA), 3 for large or bold text. */
  min: number;
}

const on = (fgs: string[], bgs: string[], min = 4.5): ContrastPair[] =>
  fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min })));

const group = (name: string, keys: string[]) => keys.map((k) => `color.${name}.${k}`);

const SURFACES = group('surface', ['canvas', 'raised', 'sunken']);
const PAGE = group('surface', ['canvas', 'raised']);
export const ROLE_KEYS = ['tank', 'healer', 'melee', 'ranged'];
export const SIGNUP_KEYS = ['accepted', 'late', 'tentative', 'bench', 'declined', 'no-response'];
export const QUALITY_KEYS = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
export const CLASS_KEYS = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
];

/**
 * Text-on-surface pairs every theme must pass. Blizzard's item quality and class colors are
 * fixed, so they are held to the large-text minimum (3:1) on the dark WoW frame they are
 * shown on; item and character names render bold.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...on(group('text', ['primary', 'secondary']), SURFACES),
  ...on(['color.text.accent'], PAGE),
  ...on(['color.text.inverse'], ['color.surface.inverse']),
  ...on(['color.accent.contrast'], ['color.accent.primary']),
  ...on(['color.accent.on-secondary'], ['color.accent.secondary']),
  ...on(group('feedback', ['danger', 'success']), PAGE),
  ...on(group('role', ROLE_KEYS), PAGE),
  ...on(group('signup', SIGNUP_KEYS), PAGE),
  ...on(['card.text'], ['card.bg']),
  ...on(['button.primary.text'], ['button.primary.bg']),
  ...on(['wow-frame.text'], ['wow-frame.bg']),
  ...on([...group('quality', QUALITY_KEYS), ...group('class', CLASS_KEYS)], ['wow-frame.bg'], 3),
];

export interface ContrastResult extends ContrastPair {
  ratio: number;
  pass: boolean;
}

/** Check every pair against a resolved theme. */
export function checkContrast(
  tokens: ResolvedTokens,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): ContrastResult[] {
  const color = (id: string) => {
    const token = tokens.get(id);
    if (token === undefined || token.type !== 'color') throw new Error(`no color token ${id}`);
    return String(token.resolved);
  };
  return pairs.map((pair) => {
    const ratio = contrastRatio(color(pair.fg), color(pair.bg));
    return { ...pair, ratio, pass: ratio >= pair.min };
  });
}
