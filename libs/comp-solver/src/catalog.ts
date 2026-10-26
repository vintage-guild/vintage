import type { CompTemplate, RaidSize, Requirement } from './types';

/**
 * Raid-wide buffs a template can require. A starting set: add entries as the guild
 * decides what it plans around.
 */
export const REQUIREMENTS = {
  'mark-of-the-wild': {
    id: 'mark-of-the-wild',
    label: 'Mark of the Wild',
    providers: [{ class: 'druid' }],
  },
  'power-word-fortitude': {
    id: 'power-word-fortitude',
    label: 'Power Word: Fortitude',
    providers: [{ class: 'priest' }],
  },
  'arcane-intellect': {
    id: 'arcane-intellect',
    label: 'Arcane Intellect',
    providers: [{ class: 'mage' }],
  },
} as const satisfies Record<string, Requirement>;

const DEFAULT_TARGETS: Record<RaidSize, CompTemplate['targets']> = {
  10: { tank: 2, healer: 3, dps: 5 },
  20: { tank: 3, healer: 5, dps: 12 },
  40: { tank: 4, healer: 10, dps: 26 },
};

/** A starting template per raid size; officers tune targets per schedule. */
export function defaultTemplate(raidSize: RaidSize): CompTemplate {
  return {
    targets: { ...DEFAULT_TARGETS[raidSize] },
    requirements: Object.values(REQUIREMENTS).map((r) => ({
      ...r,
      providers: r.providers.map((p) => ({ ...p })),
    })),
  };
}
